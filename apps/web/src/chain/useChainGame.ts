"use client";

import {
  ACTION_TYPES,
  type ChainSeat,
  type ChainTable,
  type SignedAction,
  actionDomain,
  fieldsFor,
  kryphoTableAbi,
  project,
  projectChain,
  stepAction,
} from "@kryphochroma/abi";
import { type Card, type GameState, type Move, initialState } from "@kryphochroma/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Hex, type Log, createPublicClient, createWalletClient, http, toEventSelector } from "viem";
import { sepolia } from "viem/chains";
import type { TableController } from "@/game/controller";
import { useTransitionQueue } from "@/game/useTransitionQueue";
import { loadBurner } from "./burner";
import { SEPOLIA_RPC_URL, TABLE_ADDRESS } from "./config";
import { toGameEvents } from "./events";

const POLL_MS = 2000;
const RELAYED_TOPICS = new Set([toEventSelector("ActionRelayed(uint256,uint8,uint32)"), toEventSelector("ActionRejected(uint256,uint8,uint32,bytes4)")]);

export interface ChainSnapshot {
  readonly table: ChainTable & { readonly setupStep: number; readonly creator: Hex };
  readonly seats: readonly (ChainSeat & { readonly player: Hex; readonly session: Hex })[];
  readonly me: number;
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
  readonly address: Hex;
  readonly error: string | null;
}

export function useChainGame(id: bigint, colorBlind: boolean): ChainGame {
  const burner = useMemo(() => loadBurner(window.sessionStorage), []);
  const clients = useMemo(() => {
    const transport = http(SEPOLIA_RPC_URL);
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const walletClient = createWalletClient({ account: burner, chain: sepolia, transport });
    const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient, walletClient, relayers: { [zamaSepolia.id]: web() } }));
    return { publicClient, sdk };
  }, [burner]);
  const domain = useMemo(() => actionDomain(sepolia.id, TABLE_ADDRESS), []);

  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seated = (snapshot?.me ?? -1) >= 0;
  const me = Math.max(snapshot?.me ?? 0, 0);
  const names = useMemo(() => (snapshot?.seats ?? []).map((s, i) => (seated && i === me ? "You" : `Seat ${i + 1} · ${s.player.slice(2, 6)}`)), [snapshot, me, seated]);
  const queue = useTransitionQueue(placeholder(snapshot?.table.joined ?? 2), me, names, colorBlind);
  const { enqueue, reset } = queue;

  const plain = useRef(new Map<Hex, number>());
  const handles = useRef<readonly Hex[]>([]);
  const lastBlock = useRef<bigint | null>(null);
  const chain = useRef<{ state: GameState; nonces: number[] } | null>(null);
  const actions = useRef<SignedAction[]>([]);
  const projected = useRef<GameState | null>(null);
  const permitted = useRef(false);
  const meRef = useRef(0);
  const settled = useRef<GameState["pub"]["lastResult"]>(null);
  const [sending, setSending] = useState(false);

  const reconcile = useCallback(
    (events: Parameters<typeof enqueue>[0]["events"]) => {
      const base = chain.current;
      if (!base) return;
      for (const e of events) if (e.type === "RoundSettled") settled.current = { winner: e.winner, points: e.points, cheaters: e.cheaters };
      const projectedState = project(base.state, base.nonces, actions.current).state;
      const over = projectedState.pub.stage === "RoundOver" || projectedState.pub.stage === "MatchOver";
      const target = over && settled.current ? { ...projectedState, pub: { ...projectedState.pub, lastResult: settled.current } } : projectedState;
      const previous = projected.current;
      projected.current = target;
      if (!previous) reset(target);
      else if (events.length > 0 || JSON.stringify(previous.pub) !== JSON.stringify(target.pub) || JSON.stringify(previous.hands[meRef.current]) !== JSON.stringify(target.hands[meRef.current])) {
        enqueue({ state: target, events });
      }
    },
    [enqueue, reset],
  );

  const poll = useCallback(async () => {
    const { publicClient, sdk } = clients;
    const block = await publicClient.getBlockNumber({ cacheTime: 0 });
    const read = (functionName: string, args: readonly unknown[]) =>
      publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainSnapshot["table"];
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as ChainSnapshot["seats"];
    const mine = burner.address.toLowerCase();
    const seat = seats.findIndex((s) => s.session.toLowerCase() === mine || (s.player.toLowerCase() === mine && !s.abandoned));
    meRef.current = Math.max(seat, 0);
    setSnapshot({ table, seats, me: seat });
    if (Number(table.stage) < 3) {
      lastBlock.current = block;
      return;
    }
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const nonces = ((await read("noncesOf", [id])) as readonly number[]).map(Number);
    const known = new Map<number, readonly (Card | null)[]>();
    if (seat >= 0) {
      const slots = Number(seats[seat]?.slots ?? 0);
      const own = (await read("handOf", [id, seat])) as readonly Hex[];
      handles.current = own;
      const missing = own.filter((h, i) => (slots & (1 << i)) !== 0 && !plain.current.has(h));
      if (missing.length > 0) {
        if (!permitted.current) {
          await sdk.permits.grantPermit([TABLE_ADDRESS]);
          permitted.current = true;
        }
        try {
          const values = await sdk.decryption.decryptValues(missing.map((encryptedValue) => ({ encryptedValue, contractAddress: TABLE_ADDRESS })));
          for (const [handle, value] of Object.entries(values)) plain.current.set(handle as Hex, Number(value));
        } catch {
          setError("Waiting for your new card to be decryptable");
        }
      }
      known.set(seat, own.map((h, i) => ((slots & (1 << i)) !== 0 ? (plain.current.get(h) ?? null) : null)));
    }
    const state = projectChain(table, seats, discard, known);
    if (!state) return;
    const from = lastBlock.current === null ? block : lastBlock.current + 1n;
    const logs = from <= block ? await publicClient.getLogs({ address: TABLE_ADDRESS, fromBlock: from, toBlock: block }) : [];
    lastBlock.current = block;
    chain.current = { state, nonces };
    actions.current = actions.current.filter((a) => a.nonce >= (nonces[a.seat] ?? 0));
    reconcile(toGameEvents(keeperLogs(logs), id));
  }, [clients, burner, id, reconcile]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      try {
        await poll();
        setError(null);
      } catch (e) {
        setError((e as Error).message.slice(0, 160));
      }
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [poll]);

  useEffect(() => {
    const source = new EventSource(`/api/stream?id=${id}`);
    source.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; action?: SignedAction & { table: string }; actions?: (SignedAction & { table: string })[] };
      if (message.type === "backlog" && message.actions) {
        actions.current = message.actions.map(parseAction);
        reconcile([]);
      } else if (message.type === "action" && message.action) {
        const action = parseAction(message.action);
        actions.current = [...actions.current, action];
        const current = projected.current;
        const next = current ? stepAction(current, action) : null;
        if (next) {
          projected.current = next.state;
          enqueue({ state: next.state, events: next.events });
        } else {
          reconcile([]);
        }
      }
    };
    return () => source.close();
  }, [id, enqueue, reconcile]);

  const submit = useCallback(
    async (move: Move | { readonly type: "catch"; readonly target: number }): Promise<string | null> => {
      if (!seated) return "You are watching this table";
      if (sending) return "Wait for the table";
      const base = chain.current;
      if (!base) return "Table not ready";
      setSending(true);
      try {
      const seat = meRef.current;
      const mineQueued = project(base.state, base.nonces, actions.current).valid.filter((a) => a.seat === seat).length;
      const fields = fieldsFor(id, seat, move, (base.nonces[seat] ?? 0) + mineQueued, handles.current);
      const signature = await burner.signTypedData({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...fields } });
      const res = await fetch("/api/act", { method: "POST", body: JSON.stringify({ ...fields, table: fields.table.toString(), signature }) });
      if (res.ok) return null;
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      return body.reason ?? body.error ?? "Move refused";
      } finally {
        setSending(false);
      }
    },
    [burner, domain, id, seated, sending],
  );

  const act = useCallback((move: Move) => submit(move), [submit]);
  const catchSeat = useCallback((target: number) => void submit({ type: "catch", target }), [submit]);

  return {
    mode: "chain",
    state: queue.shown,
    me,
    names,
    busy: queue.busy || sending,
    feed: queue.feed,
    anchors: queue.anchors,
    act,
    catchSeat,
    chips: seated ? [`Table #${id}`] : [`Table #${id}`, "Watching"],
    watching: !seated,
    snapshot,
    address: burner.address,
    error,
  };
}
