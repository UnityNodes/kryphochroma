import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, createPublicClient, createWalletClient, http, nonceManager, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { loadKeeperConfig, runKeeper } from "../keeper/run.js";
import { createBot } from "../player/run.js";
import { type DripLedger, decideDrip } from "./drip.js";

const ACTIVE_STAGES = new Set([3, 4]);
const WATCH_WINDOW = 20n;
const FLEET_POLL_MS = 2500;
const BOT_MIN_WEI = parseEther("0.005");
const BOT_TOPUP_WEI = parseEther("0.02");
const MAX_BODY_BYTES = 1024;

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);

function tableAddress(): Hex {
  const fromEnv = process.env.TABLE_ADDRESS;
  if (fromEnv) return fromEnv as Hex;
  const deployment = JSON.parse(readFileSync(new URL("../../../../deployments/sepolia.json", import.meta.url), "utf8")) as { KryphoTable: Hex };
  return deployment.KryphoTable;
}

const rpcUrl = env("SEPOLIA_RPC_URL");
const table = tableAddress();
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const keeper = privateKeyToAccount(env("KEEPER_PRIVATE_KEY") as Hex, { nonceManager });
const keeperWallet = createWalletClient({ account: keeper, chain: sepolia, transport: http(rpcUrl) });
const bots = env("BOT_KEYS").split(",").map((key) => createBot(key as Hex, table, publicClient, rpcUrl));
const dripWei = BigInt(env("DRIP_WEI", parseEther("0.003").toString()));
const dripPolicy = { perAddressMs: Number(env("DRIP_PER_ADDRESS_MS", "21600000")), dailyCap: Number(env("DRIP_DAILY_CAP", "200")) };
let ledger: DripLedger = { lastByAddress: new Map(), dayStart: Date.now(), count: 0 };
let keeperBusy = Promise.resolve();

function withKeeperWallet<T>(task: () => Promise<T>): Promise<T> {
  const run = keeperBusy.then(task, task);
  keeperBusy = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function topUpBots(): Promise<void> {
  for (const bot of bots) {
    const balance = await publicClient.getBalance({ address: bot.address });
    if (balance >= BOT_MIN_WEI) continue;
    await withKeeperWallet(async () => {
      const hash = await keeperWallet.sendTransaction({ to: bot.address, value: BOT_TOPUP_WEI });
      await publicClient.waitForTransactionReceipt({ hash });
      log({ event: "bot-topup", bot: bot.address, hash });
    });
  }
}

async function fill(id: bigint): Promise<{ joined: number }> {
  await topUpBots();
  let joined = 0;
  for (const bot of bots) {
    const view = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as {
      stage: number;
      joined: number;
      config: { seats: number };
    };
    if (view.stage !== 0 || view.joined >= view.config.seats) break;
    if (await bot.join(id)) joined++;
  }
  log({ event: "fill", id, joined });
  return { joined };
}

async function drip(address: string): Promise<{ ok: boolean; reason?: string; hash?: Hex }> {
  const decision = decideDrip(ledger, address, Date.now(), dripPolicy);
  if (!decision.ok) return { ok: false, reason: decision.reason };
  const balance = await publicClient.getBalance({ address: address as Hex });
  if (balance >= dripWei / 2n) return { ok: true, reason: "funded" };
  ledger = decision.ledger;
  const hash = await withKeeperWallet(async () => {
    const tx = await keeperWallet.sendTransaction({ to: address as Hex, value: dripWei });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    return tx;
  });
  log({ event: "drip", address, hash });
  return { ok: true, hash };
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error("body too large");
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function reply(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "POST") return reply(res, 405, { error: "method" });
    const body = await readBody(req);
    if (req.url === "/fill") {
      const id = BigInt(String(body.id ?? ""));
      return reply(res, 200, await fill(id));
    }
    if (req.url === "/drip") return reply(res, 200, await drip(String(body.address ?? "")));
    return reply(res, 404, { error: "not found" });
  } catch (error) {
    log({ event: "http-error", url: req.url, message: (error as Error).message.slice(0, 200) });
    return reply(res, 400, { error: "bad request" });
  }
});

async function fleet(): Promise<void> {
  for (;;) {
    try {
      const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
      for (let id = count > WATCH_WINDOW ? count - WATCH_WINDOW + 1n : 1n; id <= count; id++) {
        const view = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as { stage: number };
        if (!ACTIVE_STAGES.has(view.stage)) continue;
        for (const bot of bots) await bot.act(id);
      }
    } catch (error) {
      log({ event: "fleet-error", message: (error as Error).message.slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, FLEET_POLL_MS));
  }
}

server.listen(Number(env("BOTS_PORT", "3320")), "127.0.0.1", () => log({ event: "listening", table }));
void fleet();
await runKeeper({ ...loadKeeperConfig({ ...process.env, TABLE_ADDRESS: table }) }, process.env);
