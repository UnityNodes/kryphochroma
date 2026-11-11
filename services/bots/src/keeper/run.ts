import { kryphoTableAbi } from "@kryphochroma/abi";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, createPublicClient, createWalletClient, http, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { type KeeperAction, type PlannedAction, type TableView, nextKeeperAction, scheduleKeeper } from "./plan.js";
import { type GasBudget, belowAlert, canSpend, rollBudget, spend, stopRequested } from "./safety.js";

const SETUP_GAS = 16_000_000n;
const DEAL_GAS = 8_000_000n;
const URGENT_PIPELINE = 4;
const BACKGROUND_PIPELINE = 8;
const ALERT_EVERY_MS = 600_000;
const WATCH_WINDOW = 20n;

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
    dailyGasLimit: BigInt(env.KEEPER_DAILY_GAS ?? "3000000000"),
    alertBalance: BigInt(env.KEEPER_ALERT_WEI ?? "10000000000000000"),
    stopFile: env.KEEPER_STOP_FILE ?? "/run/kryphochroma/keeper.stop",
    pollMs: Number(env.KEEPER_POLL_MS ?? "4000"),
    lane: "both",
  };
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);

export async function runKeeper(config: KeeperConfig, env: NodeJS.ProcessEnv, until: () => Promise<boolean> = async () => false): Promise<void> {
  const transport = http(config.rpcUrl);
  const account = privateKeyToAccount(config.privateKey, { nonceManager });
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
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
  }

  async function pipelineSetup(id: bigint, remaining: number, functionName = "setupStep"): Promise<void> {
    const count = Math.min(remaining, config.lane === "background" ? BACKGROUND_PIPELINE : URGENT_PIPELINE);
    if (!canSpend(budget, SETUP_GAS * BigInt(count))) throw new Error("daily gas budget exhausted");
    const request = { address, abi: kryphoTableAbi, functionName, args: [id], account, chain: sepolia } as never;
    await publicClient.simulateContract({ ...(request as object), blockNumber: snapshot } as never);
    const hashes: Hex[] = [];
    for (let i = 0; i < count; i++) {
      hashes.push(await walletClient.writeContract({ ...(request as object), gas: SETUP_GAS } as never));
    }
    for (const hash of hashes) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      minBlock = receipt.blockNumber > minBlock ? receipt.blockNumber : minBlock;
      budget = spend(budget, receipt.gasUsed);
    }
    log({ event: functionName, id, sent: count, remaining: remaining - count });
  }

  async function pipelineDeals(id: bigint, seats: readonly number[]): Promise<void> {
    const hashes: Hex[] = [];
    for (const seat of seats) {
      const request = { address, abi: kryphoTableAbi, functionName: "dealSeat", args: [id, seat], account, chain: sepolia, gas: DEAL_GAS } as never;
      hashes.push(await walletClient.writeContract(request));
    }
    for (const hash of hashes) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      minBlock = receipt.blockNumber > minBlock ? receipt.blockNumber : minBlock;
      budget = spend(budget, receipt.gasUsed);
    }
    log({ event: "deal", id, seats });
  }

  async function revealAndSend(functionName: string, id: bigint, handles: readonly Hex[]): Promise<void> {
    const result = await sdk.decryption.decryptPublicValues([...handles]);
    await send(functionName, [id, result.abiEncodedClearValues, result.decryptionProof]);
  }

  async function act(id: bigint, action: KeeperAction): Promise<void> {
    switch (action.kind) {
      case "setupStep":
        return pipelineSetup(id, action.remaining);
      case "dealSeat":
        return pipelineDeals(id, action.seats);
      case "revealStarter":
        return revealAndSend("setStarter", id, (await read("starterHandles", [id])) as Hex[]);
      case "resolveChallenge":
        return revealAndSend("resolveChallenge", id, [(await read("hadColorOf", [id])) as Hex]);
      case "prepareReveal":
        return send("prepareReveal", [id]);
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
      const planned: PlannedAction[] = [];
      for (let id = count > WATCH_WINDOW ? count - WATCH_WINDOW + 1n : 1n; id <= count; id++) {
        const table = (await read("getTable", [id])) as TableView;
        const view = table.stage === 3 ? { ...table, spare: ((await read("discardOf", [id])) as readonly number[]).length - 1 } : table;
        planned.push({ id, stage: Number(table.stage), action: nextKeeperAction(view, now, config.poolOwner ?? account.address) });
      }
      const { urgent, background } = scheduleKeeper(planned);
      const lanes = { urgent, background: background ? [background] : [], both: background ? [...urgent, background] : urgent };
      for (const entry of lanes[config.lane]) {
        try {
          await act(entry.id, entry.action);
        } catch (error) {
          log({ event: "error", id: entry.id, action: entry.action.kind, message: (error as Error).message.slice(0, 300) });
        }
      }
    } catch (error) {
      log({ event: "loop-error", message: (error as Error).message.slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollMs));
  }
}
