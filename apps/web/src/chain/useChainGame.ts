"use client";

import {
  ACTION_TYPES,
  FILL_CHUNK,
  type ChainSeat,
  type ChainTable,
  type SignedAction,
  actionDomain,
  decryptEach,
  fieldsFor,
  namesSlot,
  seatHandles,
  slotReady,
  kryphoTableAbi,
  project,
  projectChain,
  stepAction,
  ZERO_HANDLE,
} from "@kryphochroma/abi";
import { type Card, type GameState, type Move, initialState } from "@kryphochroma/rules";
import { type FheChain, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Hex, type Log, createPublicClient, createWalletClient, decodeFunctionData, parseAbiItem, parseEventLogs, toEventSelector } from "viem";
import { toast } from "sonner";
import { sepolia } from "viem/chains";
import type { TableController } from "@/game/controller";
import { useTransitionQueue } from "@/game/useTransitionQueue";
import { loadBurner } from "./burner";
import { TABLE_ADDRESS } from "./config";
import { bitCount, revealedSecrets } from "./secrets";
import { useProfiles } from "@/components/profile/useProfiles";
import { tableCode } from "@/lib/invite";
import { friendlyError } from "./errors";
import { RECEIPT_POLL_MS, RPC_PROXY_PATH, sepoliaTransport } from "./rpc";
import { toGameEvents } from "./events";
import { type RevealedBots, provisionalResult } from "@/game/provisional";

const POLL_MS = 2000;
const PERMIT_TIMEOUT_MS = 30_000;
const DECRYPT_TIMEOUT_MS = 8_000;
const DECRYPT_ROUND_MS = 20_000;
const DECRYPT_RETRY_MS = 2000;
const DECRYPT_RETRY_MAX_MS = 15_000;
const DECRYPT_TRIES_SHOWN = 3;
const RESULT_LOOKBACK_BLOCKS = 5000n;
const STREAM_RETRY_MS = 3000;
const POLL_FAILURES_SHOWN = 3;
const SETTLED_EVENT = parseAbiItem("event RoundSettled(uint256 indexed id, int8 winner, uint16 points, uint8 cheaters, bool bonus)");
const RELAYED_TOPICS = new Set([toEventSelector("ActionRelayed(uint256,uint8,uint32)"), toEventSelector("ActionRejected(uint256,uint8,uint32,bytes4)")]);

export interface ChainSnapshot {
  readonly table: ChainTable & { readonly setupStep: number; readonly creator: Hex; readonly revealPrepared?: number };
  readonly seats: readonly (ChainSeat & { readonly player: Hex; readonly session: Hex })[];
  readonly me: number;
}

/** The SDK can stall before it reaches the relayer, where its own request timeout does not apply, and a stalled decrypt would keep its cards marked in flight forever. */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The Zama relayer took too long to answer")), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

function refillProgress(table: { readonly refillSize?: number | bigint; readonly refillStep?: number | bigint }): { refillStep: number; refillTotal: number } {
  const size = Number(table.refillSize ?? 0);
  return { refillStep: Number(table.refillStep ?? 0), refillTotal: size > 0 ? Math.ceil(size / FILL_CHUNK) : 0 };
}

function placeholder(seats: number): GameState {
  return initialState({ seats: Math.max(2, Math.min(4, seats)), mode: "single", targetScore: 500, stackDrawTwo: false }, 1).state;
}

function keeperLogs(logs: readonly Log[]): Log[] {
  const relayed = new Set(logs.filter((l) => l.topics[0] && RELAYED_TOPICS.has(l.topics[0])).map((l) => l.transactionHash));
  return logs.filter((l) => !relayed.has(l.transactionHash));
}

function parseAction(raw: SignedAction & { table: string | bigint }): SignedAction {
  return { ...raw, table: BigInt(raw.table) };
}

export interface ChainGame extends TableController {
  readonly snapshot: ChainSnapshot | null;
  readonly ready: boolean;
  readonly address: Hex;
  readonly error: string | null;
}

/** The SDK default network RPC is a public node that some resolvers block, which leaves the hand sealed, so the relayer reads Sepolia through our own proxy. */
function relayerChain(): FheChain<typeof zamaSepolia.id> {
  return { ...zamaSepolia, network: new URL(RPC_PROXY_PATH, window.location.origin).toString() };
}

export function useChainGame(id: bigint, colorBlind: boolean, watchOnly = false): ChainGame {
  const burner = useMemo(() => loadBurner(window.sessionStorage), []);
  const clients = useMemo(() => {
    const transport = sepoliaTransport();
    const publicClient = createPublicClient({ chain: sepolia, transport, batch: { multicall: true }, pollingInterval: RECEIPT_POLL_MS });
    const walletClient = createWalletClient({ account: burner, chain: sepolia, transport });
    const sdk = new ZamaSDK(createConfig({ chains: [relayerChain()], publicClient, walletClient, relayers: { [zamaSepolia.id]: web() } }));
    return { publicClient, sdk };
  }, [burner]);
  const domain = useMemo(() => actionDomain(sepolia.id, TABLE_ADDRESS), []);

  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handError, setHandError] = useState<string | null>(null);
  const seated = (snapshot?.me ?? -1) >= 0;
  const me = Math.max(snapshot?.me ?? 0, 0);
  const sessions = useMemo(() => (snapshot?.seats ?? []).map((s) => s.session), [snapshot]);
  const profiles = useProfiles(sessions);
  const names = useMemo(
    () => (snapshot?.seats ?? []).map((s, i) => (seated && i === me ? "You" : (profiles[s.session.toLowerCase()]?.name ?? `Seat ${i + 1} · ${s.player.slice(2, 6)}`))),
    [snapshot, me, seated, profiles],
  );
  const avatars = useMemo(() => sessions.map((s) => profiles[s.toLowerCase()]?.avatar ?? null), [sessions, profiles]);
  const queue = useTransitionQueue(placeholder(snapshot?.table.joined ?? 2), seated ? me : -1, names, colorBlind);
  const { enqueue, reset } = queue;

  const plain = useRef(new Map<Hex, number>());
  const lastBlock = useRef<bigint | null>(null);
  const chain = useRef<{ state: GameState; nonces: number[]; hand: readonly Hex[]; queue: readonly Hex[] } | null>(null);
  const actions = useRef<SignedAction[]>([]);
  const projected = useRef<GameState | null>(null);
  const permit = useRef<Promise<void> | null>(null);
  const inflight = useRef(new Set<Hex>());
  const retry = useRef(new Map<Hex, { at: number; tries: number }>());
  const recovered = useRef(false);
  const wake = useRef<() => void>(() => undefined);
  const meRef = useRef(0);
  const mySeat = useRef(-1);
  const settled = useRef<GameState["pub"]["lastResult"]>(null);
  const revealedBots = useRef<RevealedBots | null>(null);
  const ownSecret = useRef<Hex | null>(null);
  const shownSecrets = useRef<readonly number[] | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const pendingPeek = useRef<{ seat: number; slot: number } | null>(null);
  const [secretColor, setSecretColor] = useState<number | null>(null);
  const [peek, setPeek] = useState<TableController["peek"]>(null);
  const [sonar, setSonar] = useState<TableController["sonar"]>(null);
  const sonarHandle = useRef<Hex | null>(null);
  const pendingSonar = useRef<{ readonly target: number; readonly color: number; readonly stale: Hex | null } | null>(null);
  const startSonar = useCallback((target: number, color: number) => {
    if (pendingSonar.current) return;
    pendingSonar.current = { target, color, stale: sonarHandle.current };
    setSonar({ target, color, count: null });
  }, []);
  const [sending, setSending] = useState(false);
  const [pendingMoves, setPendingMoves] = useState(0);
  const [ready, setReady] = useState(false);

  const reconcile = useCallback(
    (events: Parameters<typeof enqueue>[0]["events"]) => {
      const base = chain.current;
      if (!base) return;
      for (const e of events) {
        if (e.type === "RoundSettled") settled.current = { winner: e.winner, points: e.points, cheaters: e.cheaters, bonus: e.bonus };
        if (e.type === "Peeked" && e.seat === mySeat.current) pendingPeek.current = { seat: e.target, slot: e.slot };
        if (e.type === "Sonared" && e.seat === mySeat.current) startSonar(e.target, e.color);
      }
      const projection = project(base.state, base.nonces, actions.current);
      setPendingMoves(projection.valid.length);
      const secret = ownSecret.current ? (plain.current.get(ownSecret.current) ?? null) : null;
      const provisional = settled.current ? null : provisionalResult(projection.state, mySeat.current, secret, revealedBots.current);
      if (provisional?.pub.lastResult?.secrets) shownSecrets.current = provisional.pub.lastResult.secrets;
      setVerifying(provisional !== null);
      const projectedState = provisional ?? projection.state;
      const over = projectedState.pub.stage === "RoundOver" || projectedState.pub.stage === "MatchOver";
      const target = over && settled.current ? { ...projectedState, pub: { ...projectedState.pub, lastResult: { ...settled.current, secrets: settled.current.secrets ?? shownSecrets.current } } } : projectedState;
      const previous = projected.current;
      projected.current = target;
      if (!previous) {
        reset(target);
        setReady(true);
      }
      else if (events.length > 0 || JSON.stringify(previous.pub) !== JSON.stringify(target.pub) || JSON.stringify(previous.hands[meRef.current]) !== JSON.stringify(target.hands[meRef.current]) || JSON.stringify(previous.queues?.[meRef.current]) !== JSON.stringify(target.queues?.[meRef.current])) {
        enqueue({ state: target, events });
      }
    },
    [enqueue, reset, startSonar],
  );

  const ensurePermit = useCallback((): Promise<void> => {
    if (!permit.current) {
      permit.current = clients.sdk.permits.grantPermit([TABLE_ADDRESS]).catch((e: unknown) => {
        permit.current = null;
        throw e;
      });
      permit.current.catch(() => undefined);
    }
    return permit.current;
  }, [clients]);

  /** The relayer answers per handle and one slow answer used to hold the whole hand sealed, so each card is decrypted on its own and shown as soon as it lands. A card the KMS can not open yet comes back without a value and without an error; it is tried again after a growing pause, never at once, or a fresh card turns into a tight loop of requests against the relayer. */
  const decryptOwn = useCallback(
    async (queued: readonly Hex[]) => {
      const { sdk } = clients;
      try {
        await withTimeout(ensurePermit(), PERMIT_TIMEOUT_MS);
      } catch (e) {
        permit.current = null;
        setHandError(`Could not decrypt your cards, retrying: ${friendlyError(e)}`);
        for (const h of queued) inflight.current.delete(h);
        setTimeout(() => wake.current(), DECRYPT_RETRY_MS);
        return;
      }
      const opened = await Promise.all(
        queued.map(async (handle) => {
          let error: unknown = null;
          try {
            const { values } = await withTimeout(
              decryptEach((batch) => sdk.decryption.decryptValues(batch.map((encryptedValue) => ({ encryptedValue, contractAddress: TABLE_ADDRESS })), { timeout: DECRYPT_TIMEOUT_MS }), [handle]),
              DECRYPT_ROUND_MS,
            );
            for (const [h, value] of values) plain.current.set(h, value);
          } catch (e) {
            error = e;
          }
          inflight.current.delete(handle);
          if (plain.current.has(handle)) {
            retry.current.delete(handle);
            wake.current();
            return true;
          }
          const tries = (retry.current.get(handle)?.tries ?? 0) + 1;
          const pause = Math.min(DECRYPT_RETRY_MS * 2 ** (tries - 1), DECRYPT_RETRY_MAX_MS);
          retry.current.set(handle, { at: Date.now() + pause, tries });
          setTimeout(() => wake.current(), pause);
          if (tries >= DECRYPT_TRIES_SHOWN) setHandError(error ? `Could not decrypt your cards, retrying: ${friendlyError(error)}` : "Zama KMS has not opened a card yet, still trying");
          return false;
        }),
      );
      if (opened.every(Boolean)) setHandError(null);
      else if (opened.every((ok) => !ok) && queued.some((h) => (retry.current.get(h)?.tries ?? 0) >= DECRYPT_TRIES_SHOWN)) permit.current = null;
    },
    [clients, ensurePermit],
  );

  useEffect(() => {
    if (!watchOnly) void ensurePermit().catch(() => undefined);
  }, [ensurePermit, watchOnly]);

  /** A tab opened after the round was settled never saw the result event, and used to name seat 0 the winner; the event is looked up once in the recent blocks instead. */
  const earlierResult = useCallback(
    async (block: bigint): Promise<Log[]> => {
      recovered.current = true;
      const fromBlock = block > RESULT_LOOKBACK_BLOCKS ? block - RESULT_LOOKBACK_BLOCKS : 0n;
      try {
        return await clients.publicClient.getLogs({ address: TABLE_ADDRESS, event: SETTLED_EVENT, fromBlock, toBlock: block });
      } catch {
        return [];
      }
    },
    [clients],
  );

  const readSecrets = useCallback(
    (logs: readonly Log[], seats: ChainSnapshot["seats"]) => {
      const settledLog = parseEventLogs({ abi: kryphoTableAbi, logs: [...logs], eventName: "RoundSettled" }).find((l) => l.args.id === id);
      if (!settledLog?.transactionHash || shownSecrets.current) return;
      void clients.publicClient
        .getTransaction({ hash: settledLog.transactionHash })
        .then((tx) => {
          const call = decodeFunctionData({ abi: kryphoTableAbi, data: tx.input });
          if (call.functionName !== "finishReveal") return;
          const secrets = revealedSecrets(call.args[1], seats.map((s) => bitCount(Number(s.slots))));
          if (!secrets) return;
          shownSecrets.current = secrets;
          reconcile([]);
        })
        .catch(() => undefined);
    },
    [clients, id, reconcile],
  );

  const poll = useCallback(async () => {
    const { publicClient } = clients;
    const block = await publicClient.getBlockNumber({ cacheTime: 0 });
    if (lastBlock.current !== null && block < lastBlock.current) return;
    const read = (functionName: string, args: readonly unknown[]) =>
      publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainSnapshot["table"];
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as ChainSnapshot["seats"];
    const mine = burner.address.toLowerCase();
    const seat = watchOnly ? -1 : seats.findIndex((s) => s.session.toLowerCase() === mine || (s.player.toLowerCase() === mine && !s.abandoned));
    meRef.current = Math.max(seat, 0);
    mySeat.current = seat;
    setSnapshot({ table, seats, me: seat });
    if (seat >= 0) ensurePermit();
    if (Number(table.stage) < 3) {
      lastBlock.current = block;
      return;
    }
    const peekAt = pendingPeek.current;
    const zero = Promise.resolve(undefined);
    const [discardRaw, noncesRaw, ownRaw, secretRaw, peekRaw, pingRaw, queuesRaw] = await Promise.all([
      read("discardOf", [id]),
      read("noncesOf", [id]),
      seat >= 0 ? read("handOf", [id, seat]) : zero,
      seat >= 0 ? read("secretOf", [id, seat]) : zero,
      seat >= 0 && peekAt ? read("handOf", [id, peekAt.seat]) : zero,
      seat >= 0 ? read("sonarOf", [id, seat]) : zero,
      Promise.all(seats.map((_, i) => read("queueOf", [id, i]))),
    ]);
    const discard = (discardRaw as readonly number[]).map(Number);
    const nonces = (noncesRaw as readonly number[]).map(Number);
    const queueHandles = (queuesRaw as Hex[][]).map((q) => q.filter((h) => !/^0x0+$/.test(h)));
    const myQueue = seat >= 0 ? (queueHandles[seat] ?? []) : [];
    const known = new Map<number, readonly (Card | null)[]>();
    if (seat >= 0) {
      const slots = Number(seats[seat]?.slots ?? 0);
      const own = ownRaw as readonly Hex[];
      const secret = secretRaw as Hex;
      const peekHandle = peekAt ? (peekRaw as readonly Hex[])[peekAt.slot] : undefined;
      const ping = pingRaw as Hex;
      const sonarAt = pendingSonar.current;
      const fresh = sonarAt && !/^0x0+$/.test(ping) && ping !== sonarAt.stale ? ping : undefined;
      if (!sonarAt) sonarHandle.current = ping;
      const extra = [secret, ...(peekHandle ? [peekHandle] : []), ...(fresh ? [fresh] : [])].filter((h) => !/^0x0+$/.test(h) && !plain.current.has(h));
      const missing = [...own.filter((h, i) => (slots & (1 << i)) !== 0 && !plain.current.has(h)), ...myQueue.filter((h) => !plain.current.has(h)), ...extra];
      const now = Date.now();
      const queued = missing.filter((h) => !inflight.current.has(h) && (retry.current.get(h)?.at ?? 0) <= now);
      if (queued.length > 0) {
        for (const h of queued) inflight.current.add(h);
        void decryptOwn(queued);
      }
      if (missing.length === 0) setHandError(null);
      known.set(seat, own.map((h, i) => ((slots & (1 << i)) !== 0 ? (plain.current.get(h) ?? null) : null)));
      setSecretColor(plain.current.get(secret) ?? null);
      ownSecret.current = secret;
      if (sonarAt && fresh && plain.current.has(fresh)) {
        setSonar({ target: sonarAt.target, color: sonarAt.color, count: Number(plain.current.get(fresh)) });
        sonarHandle.current = fresh;
        pendingSonar.current = null;
      }
      if (peekAt && peekHandle && plain.current.has(peekHandle)) {
        setPeek({ ...peekAt, card: plain.current.get(peekHandle) ?? null });
        pendingPeek.current = null;
      }
    }
    const queues = queueHandles.map((q, i) => q.map((h) => (i === seat ? (plain.current.get(h) ?? null) : null)));
    const state = projectChain(table, seats, discard, known, queues);
    if (!state) return;
    const from = lastBlock.current === null ? block : lastBlock.current + 1n;
    const logs = from <= block ? await publicClient.getLogs({ address: TABLE_ADDRESS, fromBlock: from, toBlock: block }) : [];
    const past = Number(table.stage) >= 6 && !settled.current && !recovered.current ? await earlierResult(block) : [];
    lastBlock.current = block;
    readSecrets([...past, ...logs], seats);
    chain.current = { state, nonces, hand: seat >= 0 ? (ownRaw as readonly Hex[]) : [], queue: myQueue };
    actions.current = actions.current.filter((a) => a.nonce >= (nonces[a.seat] ?? 0));
    reconcile(toGameEvents(keeperLogs([...past, ...logs]), id));
  }, [clients, burner, id, reconcile, watchOnly, ensurePermit, decryptOwn, earlierResult, readSecrets]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let running = false;
    let again = false;
    const loop = async () => {
      running = true;
      again = false;
      try {
        await poll();
        failures = 0;
        setError(null);
      } catch (e) {
        failures += 1;
        if (failures >= POLL_FAILURES_SHOWN) setError(friendlyError(e));
      }
      running = false;
      if (!stopped) timer = setTimeout(loop, again ? 0 : POLL_MS);
    };
    wake.current = () => {
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      if (timer) clearTimeout(timer);
      void loop();
    };
    void loop();
    return () => {
      stopped = true;
      wake.current = () => undefined;
      if (timer) clearTimeout(timer);
    };
  }, [poll]);

  /** The hub echoes an accepted move over the stream, but a dropped stream would leave the table on the old turn and a second click would reuse the nonce, so the sender applies its own move at once and the echo is skipped. */
  const applyAction = useCallback(
    (action: SignedAction) => {
      if (actions.current.some((a) => a.seat === action.seat && a.nonce === action.nonce)) return;
      actions.current = [...actions.current, action];
      setPendingMoves((n) => n + 1);
      const current = projected.current;
      const next = current ? stepAction(current, action) : null;
      if (!next) {
        reconcile([]);
        return;
      }
      projected.current = next.state;
      for (const e of next.events) if (e.type === "Sonared" && e.seat === mySeat.current) startSonar(e.target, e.color);
      for (const e of next.events) if (e.type === "Peeked" && e.seat === mySeat.current) {
        pendingPeek.current = { seat: e.target, slot: e.slot };
        setPeek({ seat: e.target, slot: e.slot, card: null });
      }
      enqueue({ state: next.state, events: next.events });
    },
    [enqueue, reconcile, startSonar],
  );

  /** A stream that fails on its first request, a 429 or a 503 while the table server restarts, is closed for good by the browser, so it is opened again after a pause; without it rival moves only show after their block. */
  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const onMessage = (event: MessageEvent) => {
      let message: { type: string; action?: SignedAction & { table: string }; actions?: (SignedAction & { table: string })[]; round?: number; seats?: RevealedBots["seats"] };
      try {
        message = JSON.parse(event.data as string) as typeof message;
      } catch {
        return;
      }
      if (message.type === "backlog" && message.actions) {
        actions.current = message.actions.map(parseAction);
        reconcile([]);
      } else if (message.type === "action" && message.action) {
        applyAction(parseAction(message.action));
      } else if (message.type === "chain") {
        wake.current();
      } else if (message.type === "reveal" && message.seats) {
        revealedBots.current = { round: message.round ?? 0, seats: message.seats };
        reconcile([]);
      }
    };
    const open = () => {
      if (stopped) return;
      source = new EventSource(`/api/stream?id=${id}`);
      source.onmessage = onMessage;
      source.onerror = () => {
        if (!source || source.readyState !== EventSource.CLOSED) return;
        source.close();
        timer = setTimeout(open, STREAM_RETRY_MS);
      };
    };
    open();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [id, reconcile, applyAction]);

  const submit = useCallback(
    async (move: Move | { readonly type: "catch"; readonly target: number }): Promise<string | null> => {
      if (!seated) return "You are watching this table";
      if (sending) return "Wait for the table";
      const base = chain.current;
      if (!base) return "Still reading the table from Sepolia, try again in a second";
      setSending(true);
      try {
      const seat = meRef.current;
      const queued = project(base.state, base.nonces, actions.current);
      const handles = seatHandles(base.hand, base.queue, queued.events, seat);
      if (namesSlot(move) && !slotReady(handles, move.slot)) {
        wake.current();
        return "That card is still on its way to Sepolia, pick it again in a moment";
      }
      const mineQueued = queued.valid.filter((a) => a.seat === seat).length;
      const fields = fieldsFor(id, seat, move, (base.nonces[seat] ?? 0) + mineQueued, handles.map((h) => h ?? ZERO_HANDLE));
      const signature = await burner.signTypedData({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...fields } });
      const res = await fetch("/api/act", { method: "POST", body: JSON.stringify({ ...fields, table: fields.table.toString(), signature }) }).catch(() => null);
      if (!res) return "Your move did not reach the table server, check the connection and try again";
      if (res.ok) {
        applyAction({ ...fields, signature });
        return null;
      }
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      if (body.reason === "BadNonce") {
        wake.current();
        return "The table moved on, try again in a second";
      }
      return body.reason ?? body.error ?? "Move refused";
      } finally {
        setSending(false);
      }
    },
    [burner, domain, id, seated, sending, applyAction],
  );

  const act = useCallback((move: Move) => submit(move), [submit]);
  const catchSeat = useCallback(
    (target: number) =>
      void submit({ type: "catch", target }).then((error) => {
        if (error) toast.error(error);
      }),
    [submit],
  );

  return {
    mode: "chain",
    state: queue.shown,
    me,
    names,
    avatars,
    busy: queue.busy || sending,
    feed: queue.feed,
    anchors: queue.anchors,
    act,
    catchSeat,
    chips: seated ? [tableCode(id)] : [tableCode(id), "Watching"],
    watching: !seated,
    secretColor: seated ? secretColor : undefined,
    peek,
    clearPeek: () => setPeek(null),
    sonar,
    clearSonar: () => setSonar(null),
    sync: snapshot ? { pendingMoves, chainStage: Number(snapshot.table.stage), revealPrepared: Number(snapshot.table.revealPrepared ?? 0), seats: Number(snapshot.table.joined), ...refillProgress(snapshot.table) } : null,
    snapshot,
    ready,
    verifying,
    address: burner.address,
    error: error ?? handError,
  };
}
