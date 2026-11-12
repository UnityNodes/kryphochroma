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
  slotSettled,
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
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { type GasBudget, canSpend, rollBudget, spend } from "../keeper/safety.js";
import { sepolia } from "viem/chains";

const MAX_BATCH = 64;
const RELAY_GAS = JOIN_GAS_LIMIT;
const GAS_HEADROOM_PCT = 130n;
const ACTION_GAS_FLOOR = 200_000n;
const RELAY_BASE_GAS = 300_000n;
const GAS_PRICE = 5_000_000n;
const THINK_MS = [250, 600] as const;
const CATCH_DELAY_BLOCKS = 2n;

export type HubMessage =
  | { readonly type: "action"; readonly action: SignedAction; readonly events: readonly GameEvent[] }
  | { readonly type: "backlog"; readonly actions: readonly SignedAction[] }
  | { readonly type: "chain"; readonly block: string };

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
}

interface TableHub {
  chain: GameState | null;
  chainNonces: number[];
  sessions: string[];
  log: SignedAction[];
  signers: Map<string, string>;
  abandoned: boolean[];
  inflight: boolean;
  thinking: Set<number>;
  monoSeat: number;
  catchableAt: bigint | null;
  block: bigint;
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
      hub = { chain: null, chainNonces: [0, 0, 0, 0], sessions: [], log: [], signers: new Map(), abandoned: [], inflight: false, thinking: new Set(), monoSeat: 255, catchableAt: null, block: 0n, subscribers: new Set() };
      hubs.set(key, hub);
    }
    return hub;
  };

  const broadcast = (hub: TableHub, message: HubMessage) => {
    for (const send of hub.subscribers) send(message);
  };

  const projected = (hub: TableHub) => (hub.chain ? project(hub.chain, hub.chainNonces, hub.log) : null);

  async function decryptBotHand(bot: Bot, id: bigint, seat: number, slots: number, blockNumber: bigint): Promise<(Card | null)[]> {
    const handles = (await deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName: "handOf", args: [id, seat], blockNumber } as never)) as readonly Hex[];
    const missing = handles.filter((h, i) => (slots & (1 << i)) !== 0 && !bot.plain.has(h));
    if (missing.length > 0) {
      if (!bot.permitted) {
        await bot.sdk.permits.grantPermit([deps.table]);
        bot.permitted = true;
      }
      const { values, pending } = await decryptEach((batch) => bot.sdk.decryption.decryptValues(batch.map((encryptedValue) => ({ encryptedValue, contractAddress: deps.table }))), missing);
      for (const [handle, value] of values) bot.plain.set(handle, value);
      if (pending.length > 0) deps.log({ event: "bot-decrypt-pending", id, seat, pending: pending.length });
    }
    return handles.map((h, i) => ((slots & (1 << i)) !== 0 ? (bot.plain.get(h) ?? null) : null));
  }

  /** Every read pins one block: a relay batch mined between two reads would pair an old table with new nonces and every later action would fail with BadNonce. */
  async function refresh(id: bigint): Promise<void> {
    const hub = hubOf(id);
    const block = await deps.publicClient.getBlockNumber({ cacheTime: 0 });
    if (block < hub.block) return;
    const read = (functionName: string, args: readonly unknown[]) =>
      deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainTable & { joined: number; monoBlock: bigint };
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as (ChainSeat & { session: Hex })[];
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const nonces = ((await read("noncesOf", [id])) as readonly number[]).map(Number);
    const known = new Map<number, readonly (Card | null)[]>();
    for (const [seat, s] of seats.entries()) {
      const session = s.session.toLowerCase();
      const bot = session === takeover && !s.abandoned ? undefined : bots.find((b) => b.account.address.toLowerCase() === session);
      if (bot && Number(table.stage) >= 3) known.set(seat, await decryptBotHand(bot, id, seat, Number(s.slots), block));
    }
    if (block < hub.block) return;
    hub.block = block;
    hub.chain = projectChain(table, seats, discard, known);
    hub.chainNonces = nonces;
    hub.sessions = seats.map((s) => s.session.toLowerCase());
    hub.monoSeat = Number(table.monoWindow);
    hub.catchableAt = hub.monoSeat === 255 ? null : BigInt(table.monoBlock) + CATCH_DELAY_BLOCKS;
    hub.abandoned = seats.map((s) => Boolean(s.abandoned));
    hub.log = hub.log.filter((a) => a.nonce >= (nonces[a.seat] ?? 0) && hub.signers.get(actionKey(a)) === hub.sessions[a.seat]);
    const kept = new Set(hub.log.map(actionKey));
    for (const key of [...hub.signers.keys()]) if (!kept.has(key)) hub.signers.delete(key);
    driveBots(id, hub);
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
    broadcast(hub, { type: "action", action, events: next.events });
    driveBots(action.table, hub);
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
          if (namesSlot(again) && !slotSettled(hub.chain, now.state, seat, again.slot)) return;
          const nonce = (hub.chainNonces[seat] ?? 0) + now.valid.filter((a) => a.seat === seat).length;
          const handles = (await deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName: "handOf", args: [id, seat], blockNumber: hub.block } as never)) as readonly Hex[];
          const fields = fieldsFor(id, seat, again, nonce, handles);
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
  function endsRound(id: bigint, batch: readonly SignedAction[]): boolean {
    const hub = hubOf(id);
    if (!hub.chain) return false;
    return project(hub.chain, hub.chainNonces, [...batch]).state.pub.stage === "Revealing";
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

  async function submit(id: bigint): Promise<void> {
    const hub = hubOf(id);
    if (hub.inflight || !hub.chain) return;
    const pending = project(hub.chain, hub.chainNonces, hub.log).valid;
    if (pending.length === 0) return;
    budget = rollBudget(budget, Date.now());
    const perTable = tableBudget(id);
    if (!canSpend(budget, RELAY_GAS) || !canSpend(perTable, RELAY_GAS)) {
      deps.log({ event: "relay-budget-exhausted", id, spent: budget.spent, tableSpent: perTable.spent });
      return;
    }
    hub.inflight = true;
    try {
      const { batch, gas } = await sizedBatch(id, pending);
      const hash = await deps.relayer.writeContract({
        address: deps.table,
        abi: kryphoTableAbi,
        functionName: "relay",
        args: [id, batch.map(toContractAction)],
        gas,
        gasPrice: GAS_PRICE,
        chain: sepolia,
        account: deps.relayer.account ?? null,
      } as never);
      const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
      budget = spend(budget, receipt.gasUsed);
      tableBudgets.set(id.toString(), spend(tableBudget(id), receipt.gasUsed));
      deps.log({ event: "relay", id, actions: batch.length, backlog: pending.length, hash, status: receipt.status, gas: receipt.gasUsed });
      const rejected = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "ActionRejected" });
      if (rejected.length > 0) deps.log({ event: "relay-rejected", id, actions: rejected.map((e) => e.args) });
      deps.onRelayed?.(id);
    } catch (error) {
      deps.log({ event: "relay-error", id, message: (error as Error).message.slice(0, 200) });
    } finally {
      hub.inflight = false;
      await refresh(id).catch(() => undefined);
    }
  }

  function subscribe(id: bigint, send: (message: HubMessage) => void): () => void {
    const hub = hubOf(id);
    hub.subscribers.add(send);
    const current = projected(hub);
    send({ type: "backlog", actions: current?.valid ?? [] });
    return () => hub.subscribers.delete(send);
  }

  function forget(id: bigint): void {
    const hub = hubs.get(id.toString());
    if (hub && hub.subscribers.size === 0 && hub.log.length === 0) hubs.delete(id.toString());
  }

  return { refresh, accept, submit, subscribe, forget, active: () => [...hubs.keys()].map(BigInt) };
}
