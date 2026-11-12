import { JOIN_GAS_LIMIT, kryphoTableAbi } from "@kryphochroma/abi";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, createPublicClient, createWalletClient, nonceManager } from "viem";
import { rpcTransport } from "../rpc.js";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { type KeeperAction, type PlannedAction, type TableView, nextKeeperAction, scheduleKeeper } from "./plan.js";
import { createTableBackoff } from "./backoff.js";
import { createTableScan } from "./scan.js";
import { type GasBudget, belowAlert, canSpend, rollBudget, spend, stopRequested } from "./safety.js";

const SETUP_GAS = 16_000_000n;
const DEAL_GAS = JOIN_GAS_LIMIT;
const REVEAL_GAS = JOIN_GAS_LIMIT;
const RECEIPT_POLL_MS = 1000;
const URGENT_PIPELINE = 4;
const BACKGROUND_PIPELINE = 8;
const ALERT_EVERY_MS = 600_000;
const DECRYPT_TRIES = 20;
const DECRYPT_RETRY_MS = 1500;

export interface KeeperConfig {
  readonly rpcUrl: string;
  readonly privateKey: Hex;
  readonly table: Hex;
  readonly dailyGasLimit: bigint;
  readonly alertBalance: bigint;
  readonly stopFile: string;
  readonly pollMs: number;
  readonly lane: KeeperLane;
  readonly poolOwner?: Hex;
}

export type KeeperLane = "urgent" | "background" | "both";

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function loadKeeperConfig(env: NodeJS.ProcessEnv): KeeperConfig {
  return {
    rpcUrl: required(env, "SEPOLIA_RPC_URL"),
    privateKey: required(env, "KEEPER_PRIVATE_KEY") as Hex,
    table: required(env, "TABLE_ADDRESS") as Hex,
    dailyGasLimit: BigInt(env.KEEPER_DAILY_GAS ?? "30000000000"),
    alertBalance: BigInt(env.KEEPER_ALERT_WEI ?? "10000000000000000"),
    stopFile: env.KEEPER_STOP_FILE ?? "/run/kryphochroma/keeper.stop",
    pollMs: Number(env.KEEPER_POLL_MS ?? "2000"),
    lane: "both",
  };
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);

export async function runKeeper(config: KeeperConfig, env: NodeJS.ProcessEnv, until: () => Promise<boolean> = async () => false): Promise<void> {
  const transport = rpcTransport(config.rpcUrl);
  const account = privateKeyToAccount(config.privateKey, { nonceManager });
  const publicClient = createPublicClient({ chain: sepolia, transport, batch: { multicall: true }, pollingInterval: RECEIPT_POLL_MS });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const scan = createTableScan();
  const backoff = createTableBackoff();
  const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } }));
  const address = config.table;
  let budget: GasBudget = { dayStart: Date.now(), spent: 0n, limit: config.dailyGasLimit };
  let minBlock = 0n;
  let lastAlert = 0;
  let snapshot = 0n;

  const read = async (functionName: string, args: readonly unknown[]) =>
    publicClient.readContract({ address, abi: kryphoTableAbi, functionName, args, blockNumber: snapshot } as never) as Promise<unknown>;

  async function send(functionName: string, args: readonly unknown[], gas?: bigint): Promise<void> {
    const request = { address, abi: kryphoTableAbi, functionName, args, account, chain: sepolia } as never;
    const estimate = gas ?? ((await publicClient.estimateContractGas(request)) * 3n) / 2n + 100_000n;
    if (!canSpend(budget, estimate)) throw new Error("daily gas budget exhausted");
    await publicClient.simulateContract({ ...(request as object), blockNumber: snapshot } as never);
    const hash = await walletClient.writeContract({ ...(request as object), gas: estimate } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    minBlock = receipt.blockNumber;
    budget = spend(budget, receipt.gasUsed);
    log({ event: "tx", functionName, args, hash, gas: receipt.gasUsed, status: receipt.status });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted on chain in ${hash}, gas used ${receipt.gasUsed} of ${estimate}`);
  }

  async function pipelineSetup(id: bigint, remaining: number, functionName = "setupStep", gas = SETUP_GAS): Promise<void> {
    const count = Math.min(remaining, config.lane === "background" ? BACKGROUND_PIPELINE : URGENT_PIPELINE);
    if (!canSpend(budget, gas * BigInt(count))) throw new Error("daily gas budget exhausted");
    const request = { address, abi: kryphoTableAbi, functionName, args: [id], account, chain: sepolia } as never;
    await publicClient.simulateContract({ ...(request as object), blockNumber: snapshot } as never);
    const hashes: Hex[] = [];
    for (let i = 0; i < count; i++) {
      hashes.push(await walletClient.writeContract({ ...(request as object), gas } as never));
    }
    const reverted: Hex[] = [];
    for (const hash of hashes) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      minBlock = receipt.blockNumber > minBlock ? receipt.blockNumber : minBlock;
      budget = spend(budget, receipt.gasUsed);
      if (receipt.status !== "success") reverted.push(hash);
    }
    log({ event: functionName, id, sent: count, remaining: remaining - count, reverted: reverted.length });
    if (reverted.length > 0) throw new Error(`${reverted.length} of ${count} ${functionName} reverted on chain, first ${reverted[0]}`);
  }

  /** A handle made public in the last block is often not decryptable yet, so the KMS is asked again for a short while instead of waiting a whole backoff. */
  async function decryptPublic(handles: readonly Hex[]) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await sdk.decryption.decryptPublicValues([...handles]);
      } catch (error) {
        if (attempt >= DECRYPT_TRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, DECRYPT_RETRY_MS));
      }
    }
  }

  async function revealAndSend(functionName: string, id: bigint, handles: readonly Hex[]): Promise<void> {
    const result = await decryptPublic(handles);
    await send(functionName, [id, result.abiEncodedClearValues, result.decryptionProof]);
  }

  /** Each prepareReveal exposes the next seat by the stored counter, so every seat goes out in one block, and the settle follows without waiting for another loop. */
  async function prepareAndFinish(id: bigint, remaining: number): Promise<void> {
    await pipelineSetup(id, remaining, "prepareReveal", REVEAL_GAS);
    const handles = (await publicClient.readContract({ address, abi: kryphoTableAbi, functionName: "revealHandles", args: [id], blockNumber: minBlock } as never)) as Hex[];
    await revealAndSend("finishReveal", id, handles);
  }

  /** Dealing and the starter reveal are independent, so the KMS round trip runs while the deal transaction is mined. */
  async function dealAndReveal(id: bigint, reveal: boolean): Promise<void> {
    const handles = reveal ? ((await read("starterHandles", [id])) as Hex[]) : null;
    const starter = handles
      ? decryptPublic(handles).then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        )
      : null;
    await send("deal", [id], DEAL_GAS);
    if (!starter) return;
    const outcome = await starter;
    if ("error" in outcome) throw outcome.error;
    await send("setStarter", [id, outcome.result.abiEncodedClearValues, outcome.result.decryptionProof]);
  }

  async function act(id: bigint, action: KeeperAction): Promise<void> {
    switch (action.kind) {
      case "setupStep":
        return pipelineSetup(id, action.remaining);
      case "deal":
        return dealAndReveal(id, action.reveal);
      case "revealStarter":
        return revealAndSend("setStarter", id, (await read("starterHandles", [id])) as Hex[]);
      case "resolveChallenge":
        return revealAndSend("resolveChallenge", id, [(await read("hadColorOf", [id])) as Hex]);
      case "prepareReveal":
        return prepareAndFinish(id, action.remaining);
      case "finishReveal":
        return revealAndSend("finishReveal", id, (await read("revealHandles", [id])) as Hex[]);
      case "forceTimeout":
        return send("forceTimeout", [id]);
      case "reshuffleStep":
        return pipelineSetup(id, action.remaining, "reshuffleStep");
      case "idle":
        return;
    }
  }

  log({ event: "start", keeper: account.address, lane: config.lane, table: address });
  for (;;) {
    if (stopRequested(env, config.stopFile) || (await until())) {
      log({ event: "stopped" });
      return;
    }
    try {
      budget = rollBudget(budget, Date.now());
      const balance = await publicClient.getBalance({ address: account.address });
      if (belowAlert(balance, config.alertBalance) && Date.now() - lastAlert > ALERT_EVERY_MS) {
        lastAlert = Date.now();
        log({ event: "low-balance", lane: config.lane, balance });
      }
      const latest = await publicClient.getBlock({ blockTag: "latest" });
      if (latest.number < minBlock) throw new Error("rpc behind own transactions");
      snapshot = latest.number;
      const count = (await read("tableCount", [])) as bigint;
      const now = latest.timestamp;
      const planned: PlannedAction[] = await Promise.all(
        scan.ids(count).map(async (id) => {
          const table = (await read("getTable", [id])) as TableView;
          scan.settle(id, Number(table.stage));
          const view = table.stage === 3 ? { ...table, spare: ((await read("discardOf", [id])) as readonly number[]).length - 1 } : table;
          return { id, stage: Number(table.stage), action: nextKeeperAction(view, now, config.poolOwner ?? account.address) };
        }),
      );
      const { urgent, background } = scheduleKeeper(planned);
      const lanes = { urgent, background, both: [...urgent, ...background.slice(0, 1)] };
      for (const entry of lanes[config.lane]) {
        if (!backoff.ready(entry.id, Date.now())) continue;
        try {
          await act(entry.id, entry.action);
          backoff.clear(entry.id);
        } catch (error) {
          const wait = backoff.fail(entry.id, Date.now());
          log({ event: "error", id: entry.id, action: entry.action.kind, retryInMs: wait, message: (error as Error).message.slice(0, 300) });
        }
      }
    } catch (error) {
      log({ event: "loop-error", message: (error as Error).message.slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollMs));
  }
}
