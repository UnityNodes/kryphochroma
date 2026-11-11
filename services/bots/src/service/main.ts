import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fillMessage, kryphoTableAbi } from "@kryphochroma/abi";
import { parseSignedAction, parseTableId } from "./parse.js";
import { type Hex, createPublicClient, createWalletClient, nonceManager, parseEther, recoverMessageAddress } from "viem";
import { rpcTransport } from "../rpc.js";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { loadKeeperConfig, runKeeper } from "../keeper/run.js";
import { createBot } from "../player/run.js";
import { type SignedAction } from "@kryphochroma/abi";
import { createRelay, encodeMessage } from "../relay/hub.js";
import { type DripLedger, decideDrip, releaseDrip } from "./drip.js";
import { pickBots, planPool } from "./pool.js";

const ACTIVE_STAGES = new Set([3, 4]);
const WATCH_WINDOW = 20n;
const FLEET_POLL_MS = 1000;
const BOT_MIN_WEI = parseEther("0.005");
const BOT_TOPUP_WEI = parseEther("0.02");
const MAX_BODY_BYTES = 1024;
const HEALTH_STALE_MS = 90_000;
const beats = { relay: Date.now(), keeper: Date.now(), shuffler: Date.now() };
const SHUFFLER_MIN_WEI = parseEther("0.004");
const SHUFFLER_TOPUP_WEI = parseEther("0.006");
const SHUFFLER_TOPUP_CHECK_MS = 600_000;
const SHUFFLER_DAILY_TOPUPS = 5;
const DAY_MS = 86_400_000;

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);

/** The deployment record is rewritten by every deploy, an env value can be left over from the previous contract. */
function tableAddress(): Hex {
  try {
    const deployment = JSON.parse(readFileSync(new URL("../../../../deployments/sepolia.json", import.meta.url), "utf8")) as { KryphoTable?: Hex };
    if (deployment.KryphoTable) return deployment.KryphoTable;
  } catch (error) {
    log({ event: "deployment-record-missing", message: (error as Error).message.slice(0, 120) });
  }
  return env("TABLE_ADDRESS") as Hex;
}

const rpcUrl = env("SEPOLIA_RPC_URL");
const table = tableAddress();
const publicClient = createPublicClient({ chain: sepolia, transport: rpcTransport(rpcUrl) });
const keeper = privateKeyToAccount(env("KEEPER_PRIVATE_KEY") as Hex, { nonceManager });
const keeperWallet = createWalletClient({ account: keeper, chain: sepolia, transport: rpcTransport(rpcUrl) });
const bots = env("BOT_KEYS").split(",").map((key) => createBot(key as Hex, table, publicClient, rpcUrl));
const dripWei = BigInt(env("DRIP_WEI", parseEther("0.003").toString()));
const dripPolicy = { perAddressMs: Number(env("DRIP_PER_ADDRESS_MS", "21600000")), dailyCap: Number(env("DRIP_DAILY_CAP", "200")) };
let ledger: DripLedger = { lastByAddress: new Map(), dayStart: Date.now(), count: 0 };
let keeperBusy = Promise.resolve();
const takeoverKey = env("TAKEOVER_PRIVATE_KEY", env("RELAYER_PRIVATE_KEY", env("DEPLOYER_PRIVATE_KEY"))) as Hex;
const onChainTakeover = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "TAKEOVER" })) as Hex;
if (onChainTakeover.toLowerCase() !== privateKeyToAccount(takeoverKey).address.toLowerCase()) throw new Error(`takeover key does not match the contract TAKEOVER ${onChainTakeover}`);
const relayAccount = privateKeyToAccount(env("RELAYER_PRIVATE_KEY", env("DEPLOYER_PRIVATE_KEY")) as Hex, { nonceManager });
const relay = createRelay({
  publicClient,
  relayer: createWalletClient({ account: relayAccount, chain: sepolia, transport: rpcTransport(rpcUrl) }),
  table,
  rpcUrl,
  botKeys: env("BOT_KEYS").split(",") as Hex[],
  takeoverKey,
  dailyGas: BigInt(env("RELAY_DAILY_GAS", "2000000000")),
  tableDailyGas: BigInt(env("RELAY_TABLE_DAILY_GAS", "400000000")),
  log,
});

function withKeeperWallet<T>(task: () => Promise<T>): Promise<T> {
  const run = keeperBusy.then(task, task);
  keeperBusy = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function topUp(address: Hex, min: bigint, amount: bigint, event: string): Promise<void> {
  const balance = await publicClient.getBalance({ address });
  if (balance >= min) return;
  await withKeeperWallet(async () => {
    const hash = await keeperWallet.sendTransaction({ to: address, value: amount });
    await publicClient.waitForTransactionReceipt({ hash });
    log({ event, address, hash });
  });
}

async function topUpBots(): Promise<void> {
  for (const bot of bots) await topUp(bot.address, BOT_MIN_WEI, BOT_TOPUP_WEI, "bot-topup");
}

interface LobbyView {
  stage: number;
  joined: number;
  setupStep: number;
  creator: string;
  config: { seats: number };
}

const POOL_SEATS = 4;
const POOL_TURN_TIMEOUT = 120;
const RESERVE_MS = 120_000;
const MAX_POOL_TABLES = 3;
const FILL_SEAT_TRIES = 5;
const FILL_SEAT_WAIT_MS = 3000;
const STREAM_REFRESH_MS = 2000;
let knownTables = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
const lastStreamRefresh = new Map<string, number>();
const reserved = new Map<string, number>();
const isReserved = (id: bigint): boolean => (reserved.get(id.toString()) ?? 0) > Date.now();
let poolCreating = false;

async function seatedPlayers(id: bigint, joined: number): Promise<string[]> {
  const players: string[] = [];
  for (let seat = 0; seat < joined; seat++) {
    const s = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getSeat", args: [id, seat] })) as { player: string };
    players.push(s.player);
  }
  return players;
}

async function seatsTakenByBots(id: bigint, joined: number): Promise<number> {
  const players = await seatedPlayers(id, joined);
  return bots.length - pickBots(bots.map((b) => b.address), players, bots.length).length;
}

async function readLobby(id: bigint): Promise<LobbyView> {
  return (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as LobbyView;
}

async function poolTables(): Promise<{ id: bigint; view: LobbyView }[]> {
  const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
  const found: { id: bigint; view: LobbyView }[] = [];
  for (let id = count > WATCH_WINDOW ? count - WATCH_WINDOW + 1n : 1n; id <= count; id++) {
    const view = await readLobby(id);
    const open = Number(view.config.seats) - Number(view.joined);
    if (Number(view.stage) === 0 && open >= 0 && view.creator.toLowerCase() === keeper.address.toLowerCase()) found.push({ id, view });
  }
  return found;
}

const OPEN_CACHE_MS = 6000;
let openCache: { at: number; tables: { id: string; joined: number; seats: number; creator: string; setupStep: number }[] } = { at: 0, tables: [] };

async function openTables(): Promise<typeof openCache.tables> {
  if (Date.now() - openCache.at < OPEN_CACHE_MS) return openCache.tables;
  const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
  const tables: typeof openCache.tables = [];
  for (let id = count > WATCH_WINDOW ? count - WATCH_WINDOW + 1n : 1n; id <= count; id++) {
    const view = await readLobby(id);
    const free = Number(view.config.seats) - Number(view.joined);
    if (Number(view.stage) !== 0 || free < 1 || Number(view.joined) === 0 || view.creator.toLowerCase() === keeper.address.toLowerCase()) continue;
    tables.push({ id: id.toString(), joined: Number(view.joined), seats: Number(view.config.seats), creator: view.creator, setupStep: Number(view.setupStep) });
  }
  openCache = { at: Date.now(), tables: tables.reverse() };
  return openCache.tables;
}

async function startPoolTable(id: bigint): Promise<void> {
  await withKeeperWallet(async () => {
    const view = await readLobby(id);
    if (Number(view.stage) !== 0 || Number(view.joined) !== Number(view.config.seats)) return;
    const hash = await keeperWallet.writeContract({ address: table, abi: kryphoTableAbi, functionName: "start", args: [id], gas: 1_000_000n });
    await publicClient.waitForTransactionReceipt({ hash });
    log({ event: "pool-start", id, hash });
  });
}

async function createPoolTable(): Promise<void> {
  await withKeeperWallet(async () => {
    const hash = await keeperWallet.writeContract({
      address: table,
      abi: kryphoTableAbi,
      functionName: "createTable",
      args: [{ seats: POOL_SEATS, turnTimeout: POOL_TURN_TIMEOUT, targetScore: 500, singleRound: true, stackDrawTwo: false }],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    log({ event: "pool-table", hash });
  });
  await topUpBots();
  const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
  log({ event: "pool-seated", id: count, bots: await seatBots(count, POOL_SEATS - 1) });
}

async function ensurePool(): Promise<void> {
  if (poolCreating) return;
  poolCreating = true;
  try {
    const tables = (await poolTables()).map((p) => ({ id: p.id, seats: Number(p.view.config.seats), joined: Number(p.view.joined), reserved: isReserved(p.id) }));
    const plan = planPool(tables, MAX_POOL_TABLES);
    for (const id of plan.start) await startPoolTable(id).catch((e: Error) => log({ event: "pool-start-failed", id, message: e.message.slice(0, 200) }));
    for (const { id, count } of plan.seat) log({ event: "pool-seated", id, bots: await seatBots(id, count) });
    if (plan.create) await createPoolTable();
  } finally {
    poolCreating = false;
  }
}

async function quick(): Promise<{ id?: string; warming?: number }> {
  const ready = (await poolTables()).filter((p) => !isReserved(p.id) && Number(p.view.config.seats) > Number(p.view.joined));
  const shuffled = ready.find((p) => Number(p.view.setupStep) >= 60 && Number(p.view.config.seats) - Number(p.view.joined) === 1);
  if (!shuffled) return { warming: Math.max(0, ...ready.map((p) => Number(p.view.setupStep))) };
  reserved.set(shuffled.id.toString(), Date.now() + RESERVE_MS);
  void ensurePool().catch(() => undefined);
  return { id: shuffled.id.toString() };
}

async function seatBots(id: bigint, free: number): Promise<number> {
  const players = await seatedPlayers(id, Number((await readLobby(id)).joined));
  const picked = new Set(pickBots(bots.map((b) => b.address), players, free));
  const results = await Promise.all(bots.filter((b) => picked.has(b.address)).map((bot) => bot.join(id).catch(() => false)));
  return results.filter(Boolean).length;
}

async function seatedSigner(id: bigint, signature: Hex, joined: number): Promise<boolean> {
  const signer = (await recoverMessageAddress({ message: fillMessage(id), signature })).toLowerCase();
  for (let seat = 0; seat < joined; seat++) {
    const s = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getSeat", args: [id, seat] })) as { player: string; session: string };
    if (s.player.toLowerCase() === signer || s.session.toLowerCase() === signer) return true;
  }
  return false;
}

/** Public RPC nodes behind one URL lag each other by a block or two, so a join the player just confirmed may not be visible on the node we hit yet. */
async function seatedSignerSoon(id: bigint, signature: Hex): Promise<boolean> {
  for (let attempt = 0; attempt < FILL_SEAT_TRIES; attempt++) {
    if (await seatedSigner(id, signature, Number((await readLobby(id)).joined))) return true;
    await new Promise((r) => setTimeout(r, FILL_SEAT_WAIT_MS));
  }
  return false;
}

async function fill(id: bigint, signature: Hex): Promise<{ joined: number } | { error: string }> {
  if (!(await seatedSignerSoon(id, signature))) return { error: "only a seated player can call the bots" };
  const view = await readLobby(id);
  await topUpBots();
  const seatedBots = await seatsTakenByBots(id, Number(view.joined));
  const free = Number(view.stage) === 0 ? Math.min(Number(view.config.seats) - Number(view.joined), bots.length - seatedBots) : 0;
  const joined = free > 0 ? await seatBots(id, free) : 0;
  log({ event: "fill", id, joined });
  const after = await readLobby(id);
  if (Number(after.stage) === 0 && Number(after.joined) === Number(after.config.seats) && after.creator.toLowerCase() === keeper.address.toLowerCase()) await startPoolTable(id);
  return { joined };
}

async function drip(address: string): Promise<{ ok: boolean; reason?: string; hash?: Hex }> {
  const before = ledger;
  const decision = decideDrip(before, address, Date.now(), dripPolicy);
  if (!decision.ok) return { ok: false, reason: decision.reason };
  ledger = decision.ledger;
  try {
    const balance = await publicClient.getBalance({ address: address as Hex });
    if (balance >= dripWei / 2n) return { ok: true, reason: "funded" };
    const hash = await withKeeperWallet(async () => {
      const tx = await keeperWallet.sendTransaction({ to: address as Hex, value: dripWei });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      return tx;
    });
    log({ event: "drip", address, hash });
    return { ok: true, hash };
  } catch (error) {
    ledger = releaseDrip(ledger, address);
    throw error;
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    if (bytes > MAX_BODY_BYTES) throw new Error("body too large");
    body += chunk;
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function reply(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

function tableId(raw: unknown): bigint {
  return parseTableId(raw, knownTables);
}

function parseAction(raw: Record<string, unknown>): SignedAction {
  return parseSignedAction(raw, knownTables);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://local");
    if (req.method === "GET" && url.pathname === "/stream") {
      const id = tableId(url.searchParams.get("id"));
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const unsubscribe = relay.subscribe(id, (message) => res.write(`data: ${encodeMessage(message)}\n\n`));
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        unsubscribe();
      });
      const key = id.toString();
      if (Date.now() - (lastStreamRefresh.get(key) ?? 0) > STREAM_REFRESH_MS) {
        lastStreamRefresh.set(key, Date.now());
        void relay.refresh(id).catch(() => undefined);
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/open") return reply(res, 200, { tables: await openTables() });
    if (req.method === "GET" && url.pathname === "/health") {
      const now = Date.now();
      const ages = { relayMs: now - beats.relay, keeperMs: now - beats.keeper, shufflerMs: Number.isFinite(beats.shuffler) ? now - beats.shuffler : null };
      const healthy = ages.relayMs < HEALTH_STALE_MS && ages.keeperMs < HEALTH_STALE_MS && (ages.shufflerMs === null || ages.shufflerMs < HEALTH_STALE_MS);
      return reply(res, healthy ? 200 : 503, { ok: healthy, table, ...ages });
    }
    if (req.method !== "POST") return reply(res, 405, { error: "method" });
    const body = await readBody(req);
    if (url.pathname === "/fill") {
      const signature = String(body.signature ?? "");
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return reply(res, 400, { error: "bad signature" });
      const result = await fill(tableId(body.id), signature as Hex);
      if ("error" in result) log({ event: "fill-refused", id: String(body.id), reason: result.error });
      return reply(res, "error" in result ? 403 : 200, result);
    }
    if (url.pathname === "/drip") return reply(res, 200, await drip(String(body.address ?? "")));
    if (url.pathname === "/quick") return reply(res, 200, await quick());
    if (url.pathname === "/act") {
      const action = parseAction(body);
      const result = await relay.accept(action);
      if (!result.ok) log({ event: "act-rejected", id: action.table, seat: action.seat, kind: action.kind, slot: action.slot, card: action.card, color: action.color, nonce: action.nonce, ...result });
      return reply(res, result.ok ? 200 : 409, result);
    }
    return reply(res, 404, { error: "not found" });
  } catch (error) {
    log({ event: "http-error", url: req.url, message: (error as Error).message.slice(0, 200) });
    return reply(res, 400, { error: "bad request" });
  }
});

async function relayLoop(): Promise<void> {
  let lastBlock = 0n;
  for (;;) {
    try {
      const block = await publicClient.getBlockNumber({ cacheTime: 0 });
      const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
      knownTables = count;
      for (let id = count > WATCH_WINDOW ? count - WATCH_WINDOW + 1n : 1n; id <= count; id++) {
        const view = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as { stage: number };
        if (!ACTIVE_STAGES.has(Number(view.stage))) {
          relay.forget(id);
          continue;
        }
        if (block !== lastBlock) await relay.refresh(id);
        await relay.submit(id);
      }
      if (block !== lastBlock && block % 5n === 0n) await ensurePool();
      lastBlock = block;
      beats.relay = Date.now();
    } catch (error) {
      log({ event: "relay-loop-error", message: (error as Error).message.slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, FLEET_POLL_MS));
  }
}

server.listen(Number(env("BOTS_PORT", "3320")), "127.0.0.1", () => log({ event: "listening", table }));
void relayLoop();
const keeperConfig = loadKeeperConfig({ ...process.env, TABLE_ADDRESS: table });
const shufflerKey = process.env.SHUFFLER_PRIVATE_KEY as Hex | undefined;
const beat = (lane: "keeper" | "shuffler") => async () => {
  beats[lane] = Date.now();
  return false;
};
if (shufflerKey) {
  const shuffler = privateKeyToAccount(shufflerKey);
  let topUps = { day: Math.floor(Date.now() / DAY_MS), count: 0 };
  const fundShuffler = async () => {
    const day = Math.floor(Date.now() / DAY_MS);
    if (day !== topUps.day) topUps = { day, count: 0 };
    if (topUps.count >= SHUFFLER_DAILY_TOPUPS) return log({ event: "shuffler-topup-capped" });
    const before = await publicClient.getBalance({ address: shuffler.address });
    await topUp(shuffler.address, SHUFFLER_MIN_WEI, SHUFFLER_TOPUP_WEI, "shuffler-topup").catch((error: unknown) => log({ event: "shuffler-topup-failed", message: (error as Error).message.split("\n")[0] }));
    if (before < SHUFFLER_MIN_WEI) topUps = { ...topUps, count: topUps.count + 1 };
  };
  await fundShuffler();
  setInterval(() => void fundShuffler(), SHUFFLER_TOPUP_CHECK_MS);
  void runKeeper({ ...keeperConfig, privateKey: shufflerKey, lane: "background", poolOwner: keeper.address }, process.env, beat("shuffler"));
  await runKeeper({ ...keeperConfig, lane: "urgent" }, process.env, beat("keeper"));
} else {
  beats.shuffler = Number.POSITIVE_INFINITY;
  await runKeeper(keeperConfig, process.env, beat("keeper"));
}
