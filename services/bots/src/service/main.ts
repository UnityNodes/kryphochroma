import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { ACTION_TYPES, BOT_PROFILES, JOIN_GAS_LIMIT, NO_CARD, type Profile, STAND_IN_PROFILE, actionDomain, fillMessage, joinFields, kryphoTableAbi, profileMessage, toContractAction, validProfile } from "@kryphochroma/abi";
import { parseSignedAction, parseTableId } from "./parse.js";
import { type Hex, createPublicClient, createWalletClient, nonceManager, parseEther, parseEventLogs, recoverMessageAddress, recoverTypedDataAddress } from "viem";
import { rpcTransport } from "../rpc.js";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { loadKeeperConfig, runKeeper } from "../keeper/run.js";
import { createWaker } from "../keeper/waker.js";
import { createBot } from "../player/run.js";
import { type SignedAction } from "@kryphochroma/abi";
import { GAS_PRICE, createRelay, encodeMessage } from "../relay/hub.js";
import { type DripLedger, decideDrip, releaseDrip } from "./drip.js";
import { createTableScan } from "../keeper/scan.js";
import { type PoolTable, SPARE_BY_SEATS, pickBots, pickReady, planPool } from "./pool.js";
import { type ProfileStore, fromDisk, lookup, parseAddresses, putProfile, toDisk } from "./profiles.js";

const ACTIVE_STAGES = new Set([3, 4]);
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
const RECEIPT_POLL_MS = 1000;
const publicClient = createPublicClient({ chain: sepolia, transport: rpcTransport(rpcUrl), batch: { multicall: true }, pollingInterval: RECEIPT_POLL_MS });
const scan = createTableScan();
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
const keeperWaker = createWaker();
const relayAccount = privateKeyToAccount(env("RELAYER_PRIVATE_KEY", env("DEPLOYER_PRIVATE_KEY")) as Hex, { nonceManager });
const relayWallet = createWalletClient({ account: relayAccount, chain: sepolia, transport: rpcTransport(rpcUrl) });
const relay = createRelay({
  publicClient,
  relayer: relayWallet,
  table,
  rpcUrl,
  botKeys: env("BOT_KEYS").split(",") as Hex[],
  takeoverKey,
  dailyGas: BigInt(env("RELAY_DAILY_GAS", "2000000000")),
  tableDailyGas: BigInt(env("RELAY_TABLE_DAILY_GAS", "400000000")),
  log,
  onRelayed: () => keeperWaker.wake(),
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
  topCard: number;
  creator: string;
  config: { seats: number };
}

const POOL_SEATS = 4;
const POOL_TURN_TIMEOUT = 120;
const RESERVE_MS = 120_000;
/** Each pool table costs about 0.7 billion gas to shuffle, so the shuffler budget is sized for a hundred tables a day; the wallet balance stays the real ceiling. */
const SHUFFLER_DAILY_GAS = "80000000000";
const MAX_POOL_TABLES = 20;
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
  const views = await Promise.all(scan.ids(count).map(async (id) => ({ id, view: await readLobby(id) })));
  for (const { id, view } of views) scan.settle(id, Number(view.stage));
  return views.filter(({ view }) => Number(view.stage) === 0 && Number(view.config.seats) >= Number(view.joined) && view.creator.toLowerCase() === keeper.address.toLowerCase());
}

const botAddresses = new Set(bots.map((b) => b.address.toLowerCase()));
const OPEN_CACHE_MS = 6000;
const OPEN_FRESH_BLOCKS = 300n;
let openCache: { at: number; tables: { id: string; joined: number; seats: number; creator: string; setupStep: number }[] } = { at: 0, tables: [] };

/** A lobby nobody created or joined within the last hour is a tab that was closed, so it is not offered to strangers. */
async function recentLobbies(): Promise<Set<string>> {
  const head = await publicClient.getBlockNumber({ cacheTime: 0 });
  const logs = await publicClient.getLogs({ address: table, fromBlock: head > OPEN_FRESH_BLOCKS ? head - OPEN_FRESH_BLOCKS : 0n, toBlock: head });
  const events = parseEventLogs({ abi: kryphoTableAbi, logs }).filter((e) => e.eventName === "TableCreated" || e.eventName === "Joined");
  return new Set(events.map((e) => String((e.args as { id: bigint }).id)));
}

async function openTables(): Promise<typeof openCache.tables> {
  if (Date.now() - openCache.at < OPEN_CACHE_MS) return openCache.tables;
  const count = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
  const fresh = await recentLobbies();
  const tables: typeof openCache.tables = [];
  for (const id of scan.ids(count)) {
    if (!fresh.has(id.toString())) continue;
    const view = await readLobby(id);
    const free = Number(view.config.seats) - Number(view.joined);
    if (Number(view.stage) !== 0 || free < 1 || Number(view.joined) === 0) continue;
    const players = await seatedPlayers(id, Number(view.joined));
    if (players.some((p) => botAddresses.has(p.toLowerCase()))) continue;
    const host = view.creator.toLowerCase() === keeper.address.toLowerCase() ? (players[0] ?? view.creator) : view.creator;
    tables.push({ id: id.toString(), joined: Number(view.joined), seats: Number(view.config.seats), creator: host, setupStep: Number(view.setupStep) });
  }
  openCache = { at: Date.now(), tables: tables.reverse() };
  return openCache.tables;
}

async function createPoolTable(seats: number): Promise<void> {
  const created = await withKeeperWallet(async () => {
    const hash = await keeperWallet.writeContract({
      address: table,
      abi: kryphoTableAbi,
      functionName: "createTable",
      args: [{ seats, turnTimeout: POOL_TURN_TIMEOUT, targetScore: 500, singleRound: true, stackDrawTwo: false }],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    log({ event: "pool-table", hash });
    return parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "TableCreated" })[0]?.args.id;
  });
  if (created !== undefined) log({ event: "pool-ready", id: created, seats });
}

async function ensurePool(): Promise<void> {
  if (poolCreating) return;
  poolCreating = true;
  try {
    const plan = planPool(await poolView(), MAX_POOL_TABLES);
    for (const seats of plan.create) await createPoolTable(seats);
  } finally {
    poolCreating = false;
  }
}

async function poolView(): Promise<PoolTable[]> {
  return (await poolTables()).map((p) => ({ id: p.id, seats: Number(p.view.config.seats), joined: Number(p.view.joined), reserved: isReserved(p.id), setupStep: Number(p.view.setupStep), starter: Number(p.view.topCard) !== NO_CARD }));
}

async function reserveReady(seats: number): Promise<{ id?: string; warming?: number }> {
  const tables = await poolView();
  const ready = pickReady(tables, seats);
  void ensurePool().catch(() => undefined);
  if (!ready) return { warming: Math.max(0, ...tables.filter((p) => p.seats === seats).map((p) => p.setupStep)) };
  reserved.set(ready.id.toString(), Date.now() + RESERVE_MS);
  return { id: ready.id.toString() };
}

async function quick(): Promise<{ id?: string; warming?: number }> {
  const result = await reserveReady(POOL_SEATS);
  if (result.id) {
    const id = BigInt(result.id);
    void topUpBots()
      .then(() => seatBots(id, POOL_SEATS - 1))
      .then((count) => log({ event: "pool-seated", id, bots: count }))
      .catch((e: Error) => log({ event: "pool-seat-failed", id, message: e.message.slice(0, 160) }));
  }
  return result;
}

async function friends(seats: number): Promise<{ id?: string; warming?: number }> {
  if (!Number.isInteger(seats) || !(seats in SPARE_BY_SEATS)) return { warming: 0 };
  return reserveReady(seats);
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

function signatureOf(raw: unknown): Hex {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(raw)) throw new Error("bad signature");
  return raw as Hex;
}

/** The relayer submits a guest's signed join, so taking a seat costs the guest one block instead of a faucet top up and then a block of its own. */
async function relaySeat(id: bigint, signature: Hex): Promise<{ ok: boolean; seated?: boolean; hash?: Hex; error?: string }> {
  const fields = joinFields(id);
  const session = (await recoverTypedDataAddress({ domain: actionDomain(sepolia.id, table), types: ACTION_TYPES, primaryType: "Action", message: { ...fields }, signature })).toLowerCase();
  const view = await readLobby(id);
  const sessions = (await seatedPlayers(id, Number(view.joined))).map((p) => p.toLowerCase());
  if (sessions.includes(session)) return { ok: true, seated: true };
  if (Number(view.stage) !== 0 || Number(view.joined) >= Number(view.config.seats)) return { ok: false, error: "This table is already full" };
  const hash = await relayWallet.writeContract({ address: table, abi: kryphoTableAbi, functionName: "relayJoin", args: [id, toContractAction({ ...fields, signature })], gas: JOIN_GAS_LIMIT, gasPrice: GAS_PRICE, chain: sepolia, account: relayAccount } as never);
  log({ event: "relay-seat", id, session, hash });
  void publicClient
    .waitForTransactionReceipt({ hash })
    .then((receipt) => log({ event: "relay-seat-mined", id, status: receipt.status, gas: receipt.gasUsed }))
    .catch((error: Error) => log({ event: "relay-seat-error", id, message: error.message.slice(0, 200) }));
  return { ok: true, hash };
}

function parseAction(raw: Record<string, unknown>): SignedAction {
  return parseSignedAction(raw, knownTables);
}

const PROFILE_FILE = process.env.PROFILE_FILE ?? new URL("../../profiles.json", import.meta.url).pathname;
const PROFILE_SAVE_MS = 2000;
const fixedProfiles = new Map<string, Profile>([
  ...bots.map((b, i): [string, Profile] => [b.address.toLowerCase(), BOT_PROFILES[i % BOT_PROFILES.length] ?? { name: "Bot", avatar: "moon-1" }]),
  [privateKeyToAccount(takeoverKey).address.toLowerCase(), STAND_IN_PROFILE],
]);
let profiles: ProfileStore = (() => {
  try {
    return fromDisk(readFileSync(PROFILE_FILE, "utf8"));
  } catch {
    return fromDisk("[]");
  }
})();
let profileSave: ReturnType<typeof setTimeout> | null = null;

async function saveProfile(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const profile = validProfile(body);
  const signature = String(body.signature ?? "");
  if (!profile || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return { ok: false, error: "bad profile" };
  const address = await recoverMessageAddress({ message: profileMessage(profile), signature: signature as Hex });
  if (fixedProfiles.has(address.toLowerCase())) return { ok: false, error: "reserved" };
  profiles = putProfile(profiles, address, profile, Date.now());
  profileSave ??= setTimeout(() => {
    profileSave = null;
    try {
      writeFileSync(PROFILE_FILE, toDisk(profiles));
    } catch (error) {
      log({ event: "profile-save-failed", message: (error as Error).message.slice(0, 120) });
    }
  }, PROFILE_SAVE_MS);
  return { ok: true };
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
    if (req.method === "GET" && url.pathname === "/profiles") return reply(res, 200, { profiles: lookup(profiles, fixedProfiles, parseAddresses(url.searchParams.get("ids"))) });
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
    if (url.pathname === "/profile") {
      const result = await saveProfile(body);
      return reply(res, result.ok ? 200 : 400, result);
    }
    if (url.pathname === "/drip") return reply(res, 200, await drip(String(body.address ?? "")));
    if (url.pathname === "/quick") return reply(res, 200, await quick());
    if (url.pathname === "/friends") return reply(res, 200, await friends(Number(body.seats)));
    if (url.pathname === "/seat") return reply(res, 200, await relaySeat(tableId(body.table), signatureOf(body.signature)));
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
      const ids = scan.ids(count);
      const views = await Promise.all(ids.map((id) => publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] }) as Promise<{ stage: number }>));
      const active: bigint[] = [];
      for (const [i, id] of ids.entries()) {
        const view = views[i] as { stage: number };
        scan.settle(id, Number(view.stage));
        if (ACTIVE_STAGES.has(Number(view.stage))) active.push(id);
        else relay.forget(id);
      }
      const fresh = block !== lastBlock;
      await Promise.all(
        active.map(async (id) => {
          if (fresh) await relay.refresh(id);
          await relay.submit(id);
        }),
      );
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
  void runKeeper({ ...keeperConfig, privateKey: shufflerKey, lane: "background", poolOwner: keeper.address, dailyGasLimit: BigInt(env("SHUFFLER_DAILY_GAS", SHUFFLER_DAILY_GAS)) }, process.env, beat("shuffler"));
  await runKeeper({ ...keeperConfig, lane: "urgent", waker: keeperWaker }, process.env, beat("keeper"));
} else {
  beats.shuffler = Number.POSITIVE_INFINITY;
  await runKeeper({ ...keeperConfig, waker: keeperWaker }, process.env, beat("keeper"));
}
