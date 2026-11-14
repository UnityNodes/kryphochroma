import {
  ACTION_TYPES,
  JOIN_GAS_LIMIT,
  type ChainSeat,
  type ChainTable,
  type SignedAction,
  actionDomain,
  decryptEach,
  fieldsFor,
  namesSlot,
  seatHandles,
  slotReady,
  ZERO_HANDLE,
  kryphoTableAbi,
  stepAction,
  project,
  projectChain,
  toContractAction,
} from "@kryphochroma/abi";
import { type Card, type GameEvent, type GameState, type Move, botCatchTarget, chooseMove } from "@kryphochroma/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, type PublicClient, type WalletClient, createWalletClient, parseEventLogs, recoverTypedDataAddress } from "viem";
import { rpcTransport } from "../rpc.js";
import { nextBatch, pipeKey, pipelinedGas } from "./pipeline.js";
import { type RevealedSeat, botReveal, sealed } from "./reveal.js";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { type GasBudget, canSpend, rollBudget, spend } from "../keeper/safety.js";
import { sepolia } from "viem/chains";

const MAX_BATCH = 64;
const RELAY_GAS = JOIN_GAS_LIMIT;
const GAS_HEADROOM_PCT = 130n;
const ACTION_GAS_FLOOR = 200_000n;
const RELAY_BASE_GAS = 300_000n;
export const GAS_PRICE = 5_000_000n;
const THINK_MS = [250, 600] as const;
const CATCH_DELAY_BLOCKS = 2n;
const DECRYPT_RETRY_MS = 3000;
const BOT_DECRYPT_TIMEOUT_MS = 20_000;
const RECEIPT_TIMEOUT_MS = 90_000;

export type HubMessage =
  | { readonly type: "action"; readonly action: SignedAction; readonly events: readonly GameEvent[] }
  | { readonly type: "backlog"; readonly actions: readonly SignedAction[] }
  | { readonly type: "chain"; readonly block: string }
  | { readonly type: "reveal"; readonly round: number; readonly seats: readonly RevealedSeat[] };

interface Bot {
  readonly account: PrivateKeyAccount;
  readonly sdk: ZamaSDK;
  readonly plain: Map<Hex, number>;
  permitted: boolean;
}

export interface RelayDeps {
  readonly publicClient: PublicClient;
  readonly relayer: WalletClient;
  readonly table: Hex;
  readonly rpcUrl: string;
  readonly botKeys: readonly Hex[];
  readonly takeoverKey?: Hex;
  readonly dailyGas?: bigint;
  readonly tableDailyGas?: bigint;
  readonly log: (entry: Record<string, unknown>) => void;
  readonly onRelayed?: (id: bigint) => void;
  readonly gasPrice?: () => bigint;
}

interface TableHub {
  chain: GameState | null;
  chainNonces: number[];
  sessions: string[];
  log: SignedAction[];
  signers: Map<string, string>;
  abandoned: boolean[];
  sending: boolean;
  pipes: number;
  sent: Set<string>;
  thinking: Set<number>;
  monoSeat: number;
  catchableAt: bigint | null;
  block: bigint;
  hands: (readonly Hex[])[];
  reveal: (HubMessage & { readonly type: "reveal" }) | null;
  botSecrets: Map<number, number>;
  queues: (readonly Hex[])[];
  subscribers: Set<(message: HubMessage) => void>;
}

const actionKey = (action: SignedAction): string => `${action.seat}:${action.nonce}`;
const json = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export const encodeMessage = (message: HubMessage): string => json(message);

export function createRelay(deps: RelayDeps) {
  const hubs = new Map<string, TableHub>();
  let budget: GasBudget = { dayStart: Date.now(), spent: 0n, limit: deps.dailyGas ?? RELAY_GAS * 1000n };
  const tableBudgets = new Map<string, GasBudget>();
  const tableBudget = (id: bigint): GasBudget => rollBudget(tableBudgets.get(id.toString()) ?? { dayStart: Date.now(), spent: 0n, limit: deps.tableDailyGas ?? RELAY_GAS * 50n }, Date.now());
  const domain = actionDomain(sepolia.id, deps.table);
  const takeover = deps.takeoverKey ? privateKeyToAccount(deps.takeoverKey).address.toLowerCase() : null;
  const keys = deps.takeoverKey && !deps.botKeys.includes(deps.takeoverKey) ? [...deps.botKeys, deps.takeoverKey] : deps.botKeys;
  const bots: Bot[] = keys.map((key) => {
    const account = privateKeyToAccount(key);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: rpcTransport(deps.rpcUrl) });
    const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient: deps.publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } }));
    return { account, sdk, plain: new Map(), permitted: false };
  });

  const hubOf = (id: bigint): TableHub => {
    const key = id.toString();
    let hub = hubs.get(key);
    if (!hub) {
      hub = { chain: null, chainNonces: [0, 0, 0, 0], sessions: [], log: [], signers: new Map(), abandoned: [], sending: false, pipes: 0, sent: new Set(), thinking: new Set(), monoSeat: 255, catchableAt: null, block: 0n, hands: [], queues: [], reveal: null, botSecrets: new Map(), subscribers: new Set() };
      hubs.set(key, hub);
    }
    return hub;
  };

  const broadcast = (hub: TableHub, message: HubMessage) => {
    for (const send of hub.subscribers) send(message);
  };

  const projected = (hub: TableHub) => (hub.chain ? project(hub.chain, hub.chainNonces, hub.log) : null);

  async function decryptFor(bot: Bot, id: bigint, seat: number, handles: readonly Hex[]): Promise<number> {
    const missing = handles.filter((h) => h !== ZERO_HANDLE && !bot.plain.has(h));
    if (missing.length === 0) return 0;
    if (!bot.permitted) {
      await bot.sdk.permits.grantPermit([deps.table]);
      bot.permitted = true;
    }
    const { values, pending } = await decryptEach((batch) => bot.sdk.decryption.decryptValues(batch.map((encryptedValue) => ({ encryptedValue, contractAddress: deps.table })), { timeout: BOT_DECRYPT_TIMEOUT_MS }), missing);
    for (const [handle, value] of values) bot.plain.set(handle, value);
    if (pending.length > 0) deps.log({ event: "bot-decrypt-pending", id, seat, pending: pending.length });
    return values.size;
  }


  /** Every read pins one block: a relay batch mined between two reads would pair an old table with new nonces and every later action would fail with BadNonce. */
  async function refresh(id: bigint, atLeast = 0n): Promise<void> {
    const hub = hubOf(id);
    const latest = await deps.publicClient.getBlockNumber({ cacheTime: 0 });
    const block = latest > atLeast ? latest : atLeast;
    if (block < hub.block) return;
    if (block > hub.block) broadcast(hub, { type: "chain", block: block.toString() });
    const read = (functionName: string, args: readonly unknown[]) =>
      deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainTable & { joined: number; monoBlock: bigint };
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as (ChainSeat & { session: Hex })[];
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const nonces = ((await read("noncesOf", [id])) as readonly number[]).map(Number);
    const dealt = Number(table.stage) >= 3;
    const [hands, queues] = dealt
      ? await Promise.all([Promise.all(seats.map((_, i) => read("handOf", [id, i]))), Promise.all(seats.map((_, i) => read("queueOf", [id, i])))]) as [Hex[][], Hex[][]]
      : [[], []];
    const known = new Map<number, readonly (Card | null)[]>();
    const queued: (Card | null)[][] = [];
    const secrets = new Map<number, number>();
    for (const [seat, s] of seats.entries()) {
      const session = s.session.toLowerCase();
      const bot = session === takeover && !s.abandoned ? undefined : bots.find((b) => b.account.address.toLowerCase() === session);
      const slots = Number(s.slots);
      const hand = hands[seat] ?? [];
      const queue = (queues[seat] ?? []).filter((h) => h !== ZERO_HANDLE);
      if (bot && dealt) {
        const secret = (await read("secretOf", [id, seat])) as Hex;
        decryptInBackground(bot, id, seat, [...hand.filter((_, i) => (slots & (1 << i)) !== 0), ...queue, secret]);
        const value = bot.plain.get(secret);
        if (value !== undefined) secrets.set(seat, value);
        known.set(seat, hand.map((h, i) => ((slots & (1 << i)) !== 0 ? (bot.plain.get(h) ?? null) : null)));
      }
      queued.push(queue.map((h) => (bot ? (bot.plain.get(h) ?? null) : null)));
    }
    if (block < hub.block) return;
    hub.block = block;
    hub.chain = projectChain(table, seats, discard, known, dealt ? queued : undefined);
    hub.hands = hands;
    hub.queues = queues;
    hub.chainNonces = nonces;
    hub.sessions = seats.map((s) => s.session.toLowerCase());
    hub.botSecrets = secrets;
    if (hub.reveal && hub.reveal.round !== hub.chain?.pub.round) hub.reveal = null;
    if (hub.chain) revealBots(hub, hub.chain);
    hub.monoSeat = Number(table.monoWindow);
    hub.catchableAt = hub.monoSeat === 255 ? null : BigInt(table.monoBlock) + CATCH_DELAY_BLOCKS;
    hub.abandoned = seats.map((s) => Boolean(s.abandoned));
    hub.log = hub.log.filter((a) => a.nonce >= (nonces[a.seat] ?? 0) && hub.signers.get(actionKey(a)) === hub.sessions[a.seat]);
    const kept = new Set(hub.log.map(actionKey));
    for (const key of [...hub.signers.keys()]) if (!kept.has(key)) hub.signers.delete(key);
    driveBots(id, hub);
  }

  const decrypting = new Set<Hex>();
  const retryAt = new Map<Hex, number>();

  /** A fresh card is not decryptable until the KMS sees its grant, which can take seconds; waiting for it inside the refresh held every relay batch back by a block, so bot hands decrypt beside the relay and the table refreshes when they land. */
  function decryptInBackground(bot: Bot, id: bigint, seat: number, handles: readonly Hex[]): void {
    const now = Date.now();
    const missing = handles.filter((h) => h !== ZERO_HANDLE && !bot.plain.has(h) && !decrypting.has(h) && (retryAt.get(h) ?? 0) <= now);
    if (missing.length === 0) return;
    for (const h of missing) decrypting.add(h);
    void decryptFor(bot, id, seat, missing)
      .catch((error: Error) => {
        deps.log({ event: "bot-decrypt-error", id, seat, message: error.message.slice(0, 160) });
        return 0;
      })
      .then((gained) => {
        for (const h of missing) {
          decrypting.delete(h);
          if (bot.plain.has(h)) retryAt.delete(h);
          else retryAt.set(h, Date.now() + DECRYPT_RETRY_MS);
        }
        if (gained > 0) void refresh(id).catch(() => undefined);
      });
  }

  /** Every hand becomes public at the reveal, so once the chain itself has reached it the bot hands go to the table and players see the scores before the KMS proof. It never fires from the hub's own projection: a player can sign a move here and land a different one on chain first, so a round that only the pending moves end may still go on, with the bots' hands already handed out. */
  function revealBots(hub: TableHub, chain: GameState): void {
    if (hub.reveal) return;
    const seats = botReveal(chain, (seat) => botFor(hub, seat) !== undefined, hub.botSecrets);
    if (!seats) return;
    hub.reveal = { type: "reveal", round: chain.pub.round, seats };
    broadcast(hub, hub.reveal);
  }

  async function accept(action: SignedAction): Promise<{ ok: true } | { ok: false; reason: string; expected?: number; chainNonce?: number; queued?: string[] }> {
    const hub = hubOf(action.table);
    if (!hub.chain) await refresh(action.table);
    const signer = await recoverTypedDataAddress({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...action }, signature: action.signature });
    if (signer.toLowerCase() !== hub.sessions[action.seat]) return { ok: false, reason: "BadSignature" };
    const current = projected(hub);
    if (!current) return { ok: false, reason: "WrongStage" };
    const expected = (hub.chainNonces[action.seat] ?? 0) + current.valid.filter((a) => a.seat === action.seat).length;
    if (action.nonce !== expected) return { ok: false, reason: "BadNonce", expected, chainNonce: hub.chainNonces[action.seat] ?? 0, queued: current.valid.filter((a) => a.seat === action.seat).map((a) => `${a.nonce}:${a.kind}:${a.slot}`) };
    const next = stepAction(current.state, action);
    if (!next) return { ok: false, reason: "IllegalMove" };
    hub.log.push(action);
    hub.signers.set(actionKey(action), signer.toLowerCase());
    broadcast(hub, { type: "action", action, events: next.events.map(sealed) });
    driveBots(action.table, hub);
    if (!botFor(hub, action.seat)) void submit(action.table);
    return { ok: true };
  }

  const botFor = (hub: TableHub, seat: number): Bot | undefined => {
    const session = hub.sessions[seat];
    if (session === takeover && !hub.abandoned[seat]) return undefined;
    return bots.find((b) => b.account.address.toLowerCase() === session);
  };

  function decide(hub: TableHub, state: GameState, seat: number): Move | { readonly type: "catch"; readonly target: number } | null {
    const target = botCatchTarget(state.pub, seat);
    const confirmed = target !== null && target === hub.monoSeat && hub.catchableAt !== null && hub.block >= hub.catchableAt;
    if (confirmed) return { type: "catch", target };
    return chooseMove(state.pub, seat, state.hands[seat] ?? []);
  }

  function driveBots(id: bigint, hub: TableHub) {
    const current = projected(hub);
    if (!current || current.state.pub.stage !== "Playing") return;
    for (const seat of hub.sessions.keys()) {
      const bot = botFor(hub, seat);
      if (!bot || hub.thinking.has(seat) || !decide(hub, current.state, seat)) continue;
      hub.thinking.add(seat);
      setTimeout(async () => {
        try {
          const now = projected(hub);
          if (!now || now.state.pub.stage !== "Playing") return;
          const again = decide(hub, now.state, seat);
          if (!again || !hub.chain) return;
          const handles = seatHandles(hub.hands[seat] ?? [], hub.queues[seat] ?? [], now.events, seat);
          if (namesSlot(again) && !slotReady(handles, again.slot)) return;
          const nonce = (hub.chainNonces[seat] ?? 0) + now.valid.filter((a) => a.seat === seat).length;
          const fields = fieldsFor(id, seat, again, nonce, handles.map((h) => h ?? ZERO_HANDLE));
          const signature = await bot.account.signTypedData({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...fields } });
          const result = await accept({ ...fields, signature });
          if (!result.ok) deps.log({ event: "bot-action-refused", id, seat, reason: result.reason });
        } catch (error) {
          deps.log({ event: "bot-error", id, seat, message: (error as Error).message.slice(0, 200) });
        } finally {
          hub.thinking.delete(seat);
          driveBots(id, hub);
        }
      }, THINK_MS[0] + Math.random() * (THINK_MS[1] - THINK_MS[0]));
    }
  }

  /** The contract opens the hands inside the batch that ends a round only while gas is left, and an estimate finds the cheapest path that skips them, so that batch always gets the full limit. */
  function endsRound(id: bigint, upTo: readonly SignedAction[]): boolean {
    const hub = hubOf(id);
    if (!hub.chain) return false;
    return project(hub.chain, hub.chainNonces, [...upTo]).state.pub.stage === "Revealing";
  }

  /** A long backlog goes out in one transaction when it fits under the gas cap, so the chain catches up with the table in a block instead of one block per dozen moves. */
  async function sizedBatch(id: bigint, pending: readonly SignedAction[]): Promise<{ readonly batch: readonly SignedAction[]; readonly gas: bigint }> {
    for (let size = Math.min(pending.length, MAX_BATCH); ; size = Math.floor(size / 2)) {
      const batch = pending.slice(0, size);
      try {
        const estimate = await deps.publicClient.estimateContractGas({
          address: deps.table,
          abi: kryphoTableAbi,
          functionName: "relay",
          args: [id, batch.map(toContractAction)],
          account: deps.relayer.account ?? null,
          blockNumber: hubOf(id).block,
        } as never);
        const floor = BigInt(batch.length) * ACTION_GAS_FLOOR + RELAY_BASE_GAS;
        const scaled = (estimate * GAS_HEADROOM_PCT) / 100n;
        const gas = scaled > floor ? scaled : floor;
        if (gas > RELAY_GAS && size > 1) continue;
        return { batch, gas: endsRound(id, batch) || gas > RELAY_GAS ? RELAY_GAS : gas };
      } catch (error) {
        if (size === 1) throw error;
      }
    }
  }

  async function send(id: bigint, batch: readonly SignedAction[], gas: bigint): Promise<Hex> {
    return deps.relayer.writeContract({
      address: deps.table,
      abi: kryphoTableAbi,
      functionName: "relay",
      args: [id, batch.map(toContractAction)],
      gas,
      gasPrice: deps.gasPrice?.() ?? GAS_PRICE,
      chain: sepolia,
      account: deps.relayer.account ?? null,
    } as never);
  }

  async function prepare(id: bigint, pending: readonly SignedAction[]): Promise<{ readonly batch: readonly SignedAction[]; readonly gas: bigint } | null> {
    const hub = hubOf(id);
    const batch = nextBatch(pending, hub.sent, hub.pipes, MAX_BATCH);
    if (batch.length === 0) return null;
    if (hub.pipes === 0) return sizedBatch(id, batch);
    const first = pending.indexOf(batch[0] as SignedAction);
    const end = first + batch.length;
    const dealt = (upTo: number) => project(hub.chain as GameState, hub.chainNonces, pending.slice(0, upTo)).events.filter((e) => e.type === "Drew").length;
    return { batch, gas: pipelinedGas(batch.length, dealt(end) - dealt(first), endsRound(id, pending.slice(0, end)), RELAY_GAS) };
  }

  async function settle(id: bigint, hash: Hex, batch: readonly SignedAction[]): Promise<void> {
    const hub = hubOf(id);
    let mined = 0n;
    try {
      const receipt = await deps.publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      mined = receipt.blockNumber;
      budget = spend(budget, receipt.gasUsed);
      tableBudgets.set(id.toString(), spend(tableBudget(id), receipt.gasUsed));
      deps.log({ event: "relay", id, actions: batch.length, pipes: hub.pipes, hash, status: receipt.status, gas: receipt.gasUsed });
      const rejected = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "ActionRejected" });
      if (rejected.length > 0) deps.log({ event: "relay-rejected", id, actions: rejected.map((e) => e.args) });
      deps.onRelayed?.(id);
    } catch (error) {
      deps.log({ event: "relay-error", id, message: (error as Error).message.slice(0, 200) });
    } finally {
      await refresh(id, mined).catch(() => undefined);
      for (const action of batch) hub.sent.delete(pipeKey(action));
      hub.pipes -= 1;
    }
  }

  async function submit(id: bigint): Promise<void> {
    const hub = hubOf(id);
    if (hub.sending || !hub.chain) return;
    const pending = project(hub.chain, hub.chainNonces, hub.log).valid;
    if (pending.length === 0) return;
    budget = rollBudget(budget, Date.now());
    const perTable = tableBudget(id);
    if (!canSpend(budget, RELAY_GAS) || !canSpend(perTable, RELAY_GAS)) {
      deps.log({ event: "relay-budget-exhausted", id, spent: budget.spent, tableSpent: perTable.spent });
      return;
    }
    hub.sending = true;
    try {
      const next = await prepare(id, pending);
      if (!next) return;
      const hash = await send(id, next.batch, next.gas);
      for (const action of next.batch) hub.sent.add(pipeKey(action));
      hub.pipes += 1;
      void settle(id, hash, next.batch);
    } catch (error) {
      deps.log({ event: "relay-error", id, message: (error as Error).message.slice(0, 200) });
    } finally {
      hub.sending = false;
    }
  }

  function subscribe(id: bigint, send: (message: HubMessage) => void): () => void {
    const hub = hubOf(id);
    hub.subscribers.add(send);
    const current = projected(hub);
    send({ type: "backlog", actions: current?.valid ?? [] });
    if (hub.reveal) send(hub.reveal);
    return () => hub.subscribers.delete(send);
  }

  function forget(id: bigint): void {
    const hub = hubs.get(id.toString());
    if (hub && hub.subscribers.size === 0 && hub.log.length === 0) hubs.delete(id.toString());
  }

  return { refresh, accept, submit, subscribe, forget, active: () => [...hubs.keys()].map(BigInt) };
}
