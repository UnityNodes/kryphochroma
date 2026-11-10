"use client";

import { type ChainSeat, type ChainTable, kryphoTableAbi, toPublicState } from "@kryphochroma/abi";
import { type GameState, HAND_SLOTS, type Move, initialState } from "@kryphochroma/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Hex, createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { TableController } from "@/game/controller";
import { useTransitionQueue } from "@/game/useTransitionQueue";
import { loadBurner } from "./burner";
import { BURNER_GAS_LIMIT, BURNER_GAS_PRICE, SEPOLIA_RPC_URL, TABLE_ADDRESS } from "./config";
import { toGameEvents } from "./events";

const POLL_MS = 2000;

export interface ChainSnapshot {
  readonly table: ChainTable & { readonly setupStep: number; readonly creator: Hex };
  readonly seats: readonly (ChainSeat & { readonly player: Hex; readonly session: Hex })[];
  readonly me: number;
}

function placeholder(seats: number): GameState {
  return initialState({ seats: Math.max(2, Math.min(4, seats)), mode: "single", targetScore: 500, stackDrawTwo: false }, 1).state;
}

function revertName(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage;
    return error.shortMessage;
  }
  return "Transaction failed";
}

function contractCall(move: Move, seat: number, handles: readonly Hex[]): { functionName: string; args: readonly unknown[] } {
  switch (move.type) {
    case "play":
      return { functionName: "play", args: [move.slot, move.card, move.color ?? 0, handles[move.slot]] };
    case "draw":
      return { functionName: "draw", args: [] };
    case "pass":
      return { functionName: "pass", args: [] };
    case "take":
      return { functionName: "takeDraws", args: [] };
    case "mono":
      return { functionName: "sayMono", args: [seat] };
    case "accept":
      return { functionName: "acceptDrawFour", args: [] };
    case "challenge":
      return { functionName: "challengeDrawFour", args: [] };
  }
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
    return { publicClient, walletClient, sdk };
  }, [burner]);

  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const me = snapshot?.me ?? 0;
  const names = useMemo(() => (snapshot?.seats ?? []).map((s, i) => (i === me ? "You" : `Seat ${i + 1} · ${s.player.slice(2, 6)}`)), [snapshot, me]);
  const queue = useTransitionQueue(placeholder(snapshot?.table.joined ?? 2), me, names, colorBlind);
  const { enqueue, reset } = queue;

  const plain = useRef(new Map<Hex, number>());
  const handles = useRef<readonly Hex[]>([]);
  const minBlock = useRef(0n);
  const lastBlock = useRef<bigint | null>(null);
  const lastState = useRef<GameState | null>(null);
  const permitted = useRef(false);

  const poll = useCallback(async () => {
    const { publicClient, sdk } = clients;
    const block = await publicClient.getBlockNumber({ cacheTime: 0 });
    if (block < minBlock.current) return;
    const read = (functionName: string, args: readonly unknown[]) =>
      publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName, args, blockNumber: block } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainSnapshot["table"];
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as ChainSnapshot["seats"];
    const mine = burner.address.toLowerCase();
    const seat = seats.findIndex((s) => s.player.toLowerCase() === mine || s.session.toLowerCase() === mine);
    setSnapshot({ table, seats, me: Math.max(seat, 0) });
    if (Number(table.stage) < 3) {
      lastBlock.current = block;
      return;
    }
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const pub = toPublicState(table, seats, discard);
    if (!pub) return;
    let hand: (number | null)[] = Array.from({ length: HAND_SLOTS }, () => null);
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
        const values = await sdk.decryption.decryptValues(missing.map((encryptedValue) => ({ encryptedValue, contractAddress: TABLE_ADDRESS })));
        for (const [handle, value] of Object.entries(values)) plain.current.set(handle as Hex, Number(value));
      }
      hand = own.map((h, i) => ((slots & (1 << i)) !== 0 ? (plain.current.get(h) ?? null) : null));
    }
    const hands = pub.seats.map((_, i) => (i === seat ? hand : Array.from({ length: HAND_SLOTS }, () => null)));
    const next: GameState = { pub, deck: [], hands, honest: pub.seats.map(() => true), hadColor: null, rng: 0 };
    const from = lastBlock.current === null ? block : lastBlock.current + 1n;
    const logs = from <= block ? await publicClient.getLogs({ address: TABLE_ADDRESS, fromBlock: from, toBlock: block }) : [];
    const events = toGameEvents(logs, id);
    lastBlock.current = block;
    const previous = lastState.current;
    lastState.current = next;
    if (!previous) reset(next);
    else if (events.length > 0 || JSON.stringify(previous.pub) !== JSON.stringify(next.pub) || JSON.stringify(previous.hands[seat]) !== JSON.stringify(hand)) {
      enqueue({ state: next, events });
    }
  }, [clients, burner, id, enqueue, reset]);

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

  const send = useCallback(
    async (functionName: string, args: readonly unknown[]): Promise<string | null> => {
      const { publicClient, walletClient } = clients;
      const request = { address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName, args: [id, ...args], account: burner, chain: sepolia } as never;
      setPending(true);
      try {
        await publicClient.simulateContract(request);
        const hash = await walletClient.writeContract({ ...(request as object), gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT } as never);
        queue.note({ icon: "lock", text: "Transaction sent", sub: `${hash.slice(0, 10)}…` });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        minBlock.current = receipt.blockNumber;
        return receipt.status === "success" ? null : "Reverted";
      } catch (e) {
        return revertName(e);
      } finally {
        setPending(false);
      }
    },
    [clients, burner, id, queue],
  );

  const act = useCallback(
    async (move: Move) => {
      const call = contractCall(move, me, handles.current);
      return send(call.functionName, call.args);
    },
    [me, send],
  );

  const catchSeat = useCallback((target: number) => void send("catchMono", [target]), [send]);

  return {
    mode: "chain",
    state: queue.shown,
    me,
    names,
    busy: queue.busy || pending,
    feed: queue.feed,
    anchors: queue.anchors,
    act,
    catchSeat,
    chips: [`Table #${id}`],
    snapshot,
    address: burner.address,
    error,
  };
}
