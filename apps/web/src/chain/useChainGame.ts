"use client";

import {
  ACTION_TYPES,
  type ChainSeat,
  type ChainTable,
  type SignedAction,
  actionDomain,
  decryptEach,
  fieldsFor,
  namesSlot,
  slotSettled,
  kryphoTableAbi,
  project,
  projectChain,
  stepAction,
} from "@kryphochroma/abi";
import { type Card, type GameState, type Move, initialState } from "@kryphochroma/rules";
import { type FheChain, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Hex, type Log, createPublicClient, createWalletClient, toEventSelector } from "viem";
import { sepolia } from "viem/chains";
import type { TableController } from "@/game/controller";
import { useTransitionQueue } from "@/game/useTransitionQueue";
import { loadBurner } from "./burner";
import { TABLE_ADDRESS } from "./config";
import { useProfiles } from "@/components/profile/useProfiles";
import { tableCode } from "@/lib/invite";
import { friendlyError } from "./errors";
import { RECEIPT_POLL_MS, RPC_PROXY_PATH, sepoliaTransport } from "./rpc";
import { toGameEvents } from "./events";

const POLL_MS = 2000;
const PERMIT_TIMEOUT_MS = 30_000;
const DECRYPT_TIMEOUT_MS = 8_000;
const DECRYPT_ROUND_MS = 20_000;
const POLL_FAILURES_SHOWN = 3;
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
  const handles = useRef<readonly Hex[]>([]);
  const lastBlock = useRef<bigint | null>(null);
  const chain = useRef<{ state: GameState; nonces: number[] } | null>(null);
  const actions = useRef<SignedAction[]>([]);
  const projected = useRef<GameState | null>(null);
  const permit = useRef<Promise<void> | null>(null);
  const inflight = useRef(new Set<Hex>());
  const wake = useRef<() => void>(() => undefined);
  const meRef = useRef(0);
  const settled = useRef<GameState["pub"]["lastResult"]>(null);
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
        if (e.type === "Peeked" && e.seat === meRef.current) pendingPeek.current = { seat: e.target, slot: e.slot };
        if (e.type === "Sonared" && e.seat === meRef.current) startSonar(e.target, e.color);
      }
      const projection = project(base.state, base.nonces, actions.current);
      setPendingMoves(projection.valid.length);
      const projectedState = projection.state;
      const over = projectedState.pub.stage === "RoundOver" || projectedState.pub.stage === "MatchOver";
      const target = over && settled.current ? { ...projectedState, pub: { ...projectedState.pub, lastResult: settled.current } } : projectedState;
      const previous = projected.current;
      projected.current = target;
      if (!previous) {
        reset(target);
        setReady(true);
      }
      else if (events.length > 0 || JSON.stringify(previous.pub) !== JSON.stringify(target.pub) || JSON.stringify(previous.hands[meRef.current]) !== JSON.stringify(target.hands[meRef.current])) {
        enqueue({ state: target, events });
      }
    },
    [enqueue, reset, startSonar],
  );

  const poll = useCallback(async () => {
    const { publicClient, sdk } = clients;
    const block = await publicClient.getBlockNumber({ cacheTime: 0 });
    if (lastBlock.current !== null && block < lastBlock.current) return;
    const read = (functionName: string, args: readonly unknown[]) =>
      publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainSnapshot["table"];
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as ChainSnapshot["seats"];
    const mine = burner.address.toLowerCase();
    const seat = watchOnly ? -1 : seats.findIndex((s) => s.session.toLowerCase() === mine || (s.player.toLowerCase() === mine && !s.abandoned));
    meRef.current = Math.max(seat, 0);
    setSnapshot({ table, seats, me: seat });
    if (seat >= 0 && !permit.current) {
      permit.current = sdk.permits.grantPermit([TABLE_ADDRESS]).catch((e: unknown) => {
        permit.current = null;
        throw e;
      });
      permit.current.catch(() => undefined);
    }
    if (Number(table.stage) < 3) {
      lastBlock.current = block;
      return;
    }
    const peekAt = pendingPeek.current;
    const zero = Promise.resolve(undefined);
    const [discardRaw, noncesRaw, ownRaw, secretRaw, peekRaw, pingRaw] = await Promise.all([
      read("discardOf", [id]),
      read("noncesOf", [id]),
      seat >= 0 ? read("handOf", [id, seat]) : zero,
      seat >= 0 ? read("secretOf", [id, seat]) : zero,
      seat >= 0 && peekAt ? read("handOf", [id, peekAt.seat]) : zero,
      seat >= 0 ? read("sonarOf", [id, seat]) : zero,
    ]);
    const discard = (discardRaw as readonly number[]).map(Number);
    const nonces = (noncesRaw as readonly number[]).map(Number);
    const known = new Map<number, readonly (Card | null)[]>();
    if (seat >= 0) {
      const slots = Number(seats[seat]?.slots ?? 0);
      const own = ownRaw as readonly Hex[];
      handles.current = own;
      const secret = secretRaw as Hex;
      const peekHandle = peekAt ? (peekRaw as readonly Hex[])[peekAt.slot] : undefined;
      const ping = pingRaw as Hex;
      const sonarAt = pendingSonar.current;
      const fresh = sonarAt && !/^0x0+$/.test(ping) && ping !== sonarAt.stale ? ping : undefined;
      if (!sonarAt) sonarHandle.current = ping;
      const extra = [secret, ...(peekHandle ? [peekHandle] : []), ...(fresh ? [fresh] : [])].filter((h) => !/^0x0+$/.test(h) && !plain.current.has(h));
      const missing = [...own.filter((h, i) => (slots & (1 << i)) !== 0 && !plain.current.has(h)), ...extra];
      const queued = missing.filter((h) => !inflight.current.has(h));
      if (queued.length > 0) {
        for (const h of queued) inflight.current.add(h);
        void (async () => {
          try {
            await withTimeout(permit.current ?? sdk.permits.grantPermit([TABLE_ADDRESS]), PERMIT_TIMEOUT_MS);
            const { values } = await withTimeout(
              decryptEach((batch) => sdk.decryption.decryptValues(batch.map((encryptedValue) => ({ encryptedValue, contractAddress: TABLE_ADDRESS })), { timeout: DECRYPT_TIMEOUT_MS }), queued),
              DECRYPT_ROUND_MS,
            );
            for (const [handle, value] of values) plain.current.set(handle, value);
            setHandError(null);
          } catch (e) {
            permit.current = null;
            setHandError(`Could not decrypt your cards, retrying: ${friendlyError(e)}`);
          }
        })().finally(() => {
          for (const h of queued) inflight.current.delete(h);
          wake.current();
        });
      }
      if (missing.length === 0) setHandError(null);
      known.set(seat, own.map((h, i) => ((slots & (1 << i)) !== 0 ? (plain.current.get(h) ?? null) : null)));
      setSecretColor(plain.current.get(secret) ?? null);
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
    const state = projectChain(table, seats, discard, known);
    if (!state) return;
    const from = lastBlock.current === null ? block : lastBlock.current + 1n;
    const logs = from <= block ? await publicClient.getLogs({ address: TABLE_ADDRESS, fromBlock: from, toBlock: block }) : [];
    lastBlock.current = block;
    chain.current = { state, nonces };
    actions.current = actions.current.filter((a) => a.nonce >= (nonces[a.seat] ?? 0));
    reconcile(toGameEvents(keeperLogs(logs), id));
  }, [clients, burner, id, reconcile, watchOnly]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let running = false;
    const loop = async () => {
      running = true;
      try {
        await poll();
        failures = 0;
        setError(null);
      } catch (e) {
        failures += 1;
        if (failures >= POLL_FAILURES_SHOWN) setError(friendlyError(e));
      }
      running = false;
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    wake.current = () => {
      if (running || stopped) return;
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
      for (const e of next.events) if (e.type === "Sonared" && e.seat === meRef.current) startSonar(e.target, e.color);
      for (const e of next.events) if (e.type === "Peeked" && e.seat === meRef.current) {
        pendingPeek.current = { seat: e.target, slot: e.slot };
        setPeek({ seat: e.target, slot: e.slot, card: null });
      }
      enqueue({ state: next.state, events: next.events });
    },
    [enqueue, reconcile, startSonar],
  );

  useEffect(() => {
    const source = new EventSource(`/api/stream?id=${id}`);
    source.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; action?: SignedAction & { table: string }; actions?: (SignedAction & { table: string })[] };
      if (message.type === "backlog" && message.actions) {
        actions.current = message.actions.map(parseAction);
        reconcile([]);
      } else if (message.type === "action" && message.action) {
        applyAction(parseAction(message.action));
      } else if (message.type === "chain") {
        wake.current();
      }
    };
    return () => source.close();
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
      if (namesSlot(move) && !slotSettled(base.state, queued.state, seat, move.slot)) {
        wake.current();
        return "That card is still on its way to Sepolia, pick it again in a moment";
      }
      const mineQueued = queued.valid.filter((a) => a.seat === seat).length;
      const fields = fieldsFor(id, seat, move, (base.nonces[seat] ?? 0) + mineQueued, handles.current);
      const signature = await burner.signTypedData({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...fields } });
      const res = await fetch("/api/act", { method: "POST", body: JSON.stringify({ ...fields, table: fields.table.toString(), signature }) });
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
  const catchSeat = useCallback((target: number) => void submit({ type: "catch", target }), [submit]);

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
    sync: snapshot ? { pendingMoves, chainStage: Number(snapshot.table.stage), revealPrepared: Number(snapshot.table.revealPrepared ?? 0), seats: Number(snapshot.table.joined) } : null,
    snapshot,
    ready,
    address: burner.address,
    error: error ?? handError,
  };
}
