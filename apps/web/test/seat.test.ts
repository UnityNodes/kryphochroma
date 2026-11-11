import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, type PublicClient, type WalletClient, encodeAbiParameters, encodeEventTopics } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const burnerWrites: Record<string, unknown>[] = [];
const lagging = { left: 0 };
const flaky = { left: 0 };
vi.mock("viem", async (original) => {
  const viem = await original<typeof import("viem")>();
  const { kryphoTableAbi } = await import("@kryphochroma/abi");
  return {
    ...viem,
    createWalletClient: () => ({
      sendRawTransaction: async ({ serializedTransaction }: { serializedTransaction: Hex }) => {
        if (lagging.left > 0) {
          lagging.left--;
          throw new viem.InsufficientFundsError();
        }
        const tx = viem.parseTransaction(serializedTransaction);
        burnerWrites.push({ ...tx, args: viem.decodeFunctionData({ abi: kryphoTableAbi, data: tx.data ?? "0x" }).args });
        if (flaky.left > 0) {
          flaky.left--;
          throw new viem.RpcRequestError({ body: {}, error: { code: -32000, message: "already known" }, url: "https://node" });
        }
        return viem.keccak256(serializedTransaction);
      },
    }),
  };
});

const { fundBurner, takeSeat, WALLET_CRUMB, MIN_BURNER_BALANCE } = await import("@/chain/seat");

const burner = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const player = "0x00000000000000000000000000000000000000aa" as Hex;

function joinedLog(session: Hex) {
  return {
    address: "0x0",
    topics: encodeEventTopics({ abi: kryphoTableAbi, eventName: "Joined", args: { id: 7n, player } }),
    data: encodeAbiParameters([{ type: "uint8" }, { type: "address" }], [0, session]),
  };
}

function client(balance: bigint, session: Hex = burner.address): PublicClient {
  return {
    getBalance: async () => balance,
    getTransactionCount: async () => 0,
    getTransaction: async ({ hash }: { hash: Hex }) => ({ hash }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ transactionHash: hash, status: "success", logs: [joinedLog(session)] }),
  } as unknown as PublicClient;
}

function wallet() {
  const calls: { kind: string; request: Record<string, unknown> }[] = [];
  const w = {
    writeContract: async (request: Record<string, unknown>) => {
      calls.push({ kind: "write", request });
      return "0xwallet" as Hex;
    },
    sendTransaction: async (request: Record<string, unknown>) => {
      calls.push({ kind: "send", request });
      return "0xsend" as Hex;
    },
  } as unknown as WalletClient;
  return { w, calls };
}

function slowClient(seatedSession: Hex | null): PublicClient {
  return {
    getBalance: async () => MIN_BURNER_BALANCE,
    getTransactionCount: async () => 0,
    waitForTransactionReceipt: async () => {
      throw new Error("Timed out while waiting for transaction");
    },
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "getTable" ? { joined: seatedSession ? 2 : 1 } : { player, session: functionName === "getSeat" && seatedSession ? seatedSession : player },
  } as unknown as PublicClient;
}

describe("taking a seat", () => {
  beforeEach(() => burnerWrites.splice(0));

  it("trusts the chain when the receipt is slow but the session already sits at the table", async () => {
    await expect(takeSeat({ publicClient: slowClient(burner.address), burner, funder: { kind: "guest" }, drip: async () => true }, 7n)).resolves.toBeUndefined();
  });

  it("still fails when the receipt is slow and the session is not seated", async () => {
    await expect(takeSeat({ publicClient: slowClient(null), burner, funder: { kind: "guest" }, drip: async () => true }, 7n)).rejects.toThrow(/Timed out/);
  });

  it("retries a join while the node has not seen the faucet top-up yet", async () => {
    vi.useFakeTimers();
    lagging.left = 2;
    const done = takeSeat({ publicClient: client(MIN_BURNER_BALANCE), burner, funder: { kind: "guest" }, drip: async () => true }, 7n);
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(lagging.left).toBe(0);
    expect(burnerWrites).toHaveLength(1);
  });

  it("keeps a join that reached the chain even when the node answers with an error", async () => {
    flaky.left = 1;
    await takeSeat({ publicClient: client(MIN_BURNER_BALANCE), burner, funder: { kind: "guest" }, drip: async () => true }, 7n);
    expect(flaky.left).toBe(0);
    expect(burnerWrites).toHaveLength(1);
  });

  it("joins as a guest with the session key itself", async () => {
    await takeSeat({ publicClient: client(MIN_BURNER_BALANCE), burner, funder: { kind: "guest" }, drip: async () => true }, 7n);
    expect(burnerWrites).toHaveLength(1);
    expect(burnerWrites[0]?.args).toEqual([7n, burner.address]);
  });

  it("lets the wallet join for the session key and send it gas in the same call", async () => {
    const { w, calls } = wallet();
    await takeSeat({ publicClient: client(0n), burner, funder: { kind: "wallet", wallet: w, address: player }, drip: async () => false }, 7n);
    expect(burnerWrites).toHaveLength(0);
    expect(calls[0]?.request.args).toEqual([7n, burner.address]);
    expect(calls[0]?.request.value).toBe(WALLET_CRUMB);
    expect(calls[0]?.request.account).toBe(player);
  });

  it("does not send gas the session key already has", async () => {
    const { w, calls } = wallet();
    await takeSeat({ publicClient: client(MIN_BURNER_BALANCE), burner, funder: { kind: "wallet", wallet: w, address: player }, drip: async () => false }, 7n);
    expect(calls[0]?.request.value).toBe(0n);
  });

  it("fails when the seat went to another session", async () => {
    const other = "0x00000000000000000000000000000000000000bb" as Hex;
    await expect(takeSeat({ publicClient: client(MIN_BURNER_BALANCE, other), burner, funder: { kind: "guest" }, drip: async () => true }, 7n)).rejects.toThrow("Could not take a seat");
  });
});

describe("funding the session key", () => {
  it("uses the wallet instead of the faucet", async () => {
    const { w, calls } = wallet();
    const drip = vi.fn(async () => true);
    await fundBurner({ publicClient: client(0n), burner, funder: { kind: "wallet", wallet: w, address: player }, drip });
    expect(calls).toEqual([{ kind: "send", request: expect.objectContaining({ to: burner.address, value: WALLET_CRUMB }) }]);
    expect(drip).not.toHaveBeenCalled();
  });

  it("shares one top-up between a page load and a click that come at the same time", async () => {
    let drips = 0;
    let balance = 0n;
    const publicClient = { getBalance: async () => balance } as unknown as PublicClient;
    const drip = async () => {
      drips++;
      balance = MIN_BURNER_BALANCE;
      return true;
    };
    const deps = { publicClient, burner, funder: { kind: "guest" as const }, drip };
    await Promise.all([fundBurner(deps), fundBurner(deps)]);
    expect(drips).toBe(1);
  });

  it("reports a busy faucet for guests", async () => {
    await expect(fundBurner({ publicClient: client(0n), burner, funder: { kind: "guest" }, drip: async () => false })).rejects.toThrow("faucet is busy");
  });

  it("skips funding when the key has gas", async () => {
    const drip = vi.fn(async () => true);
    await fundBurner({ publicClient: client(MIN_BURNER_BALANCE), burner, funder: { kind: "guest" }, drip });
    expect(drip).not.toHaveBeenCalled();
  });
});
