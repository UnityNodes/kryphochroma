import type { Card, Color, GameEvent, GameState, Move } from "@kryphochroma/rules";
import { HAND_SLOTS, RuleError, WILD_COLOR, applyCatch, applyMove, colorOf, isSpyglass } from "@kryphochroma/rules";
import { type ChainSeat, type ChainTable, toPublicState } from "./view.js";

export const UNKNOWN_CARD = -1;
export const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;

export const ACTION_KIND = { play: 0, draw: 1, pass: 2, take: 3, mono: 4, accept: 5, challenge: 6, catch: 7, veil: 8, doubt: 9, sonar: 10 } as const;
export const PEEK_SEAT_SHIFT = 5;
const PEEK_SLOT_MASK = 31;

export function peekField(seat: number, slot: number): number {
  return (seat << PEEK_SEAT_SHIFT) | slot;
}

export const ACTION_TYPES = {
  Action: [
    { name: "table", type: "uint256" },
    { name: "seat", type: "uint8" },
    { name: "kind", type: "uint8" },
    { name: "slot", type: "uint8" },
    { name: "card", type: "uint8" },
    { name: "color", type: "uint8" },
    { name: "seenHandle", type: "bytes32" },
    { name: "nonce", type: "uint32" },
  ],
} as const;

export function actionDomain(chainId: number, verifyingContract: `0x${string}`) {
  return { name: "Kryphochroma", version: "1", chainId, verifyingContract } as const;
}

export interface ActionFields {
  readonly table: bigint;
  readonly seat: number;
  readonly kind: number;
  readonly slot: number;
  readonly card: number;
  readonly color: number;
  readonly seenHandle: `0x${string}`;
  readonly nonce: number;
}

export interface SignedAction extends ActionFields {
  readonly signature: `0x${string}`;
}

export function fieldsFor(table: bigint, seat: number, move: Move | { readonly type: "catch"; readonly target: number }, nonce: number, handles: readonly `0x${string}`[]): ActionFields {
  const base = { table, seat, slot: 0, card: 0, color: 0, seenHandle: ZERO_HANDLE as `0x${string}`, nonce };
  switch (move.type) {
    case "play":
      return {
        ...base,
        kind: ACTION_KIND.play,
        slot: move.slot,
        card: move.card,
        color: move.peek ? peekField(move.peek.seat, move.peek.slot) : (move.color ?? 0),
        seenHandle: handles[move.slot] ?? ZERO_HANDLE,
      };
    case "veil":
      return { ...base, kind: ACTION_KIND.veil, slot: move.slot, card: move.claim, seenHandle: handles[move.slot] ?? ZERO_HANDLE };
    case "catch":
      return { ...base, kind: ACTION_KIND.catch, slot: move.target };
    case "sonar":
      return { ...base, kind: ACTION_KIND.sonar, slot: move.target, color: move.color };
    default:
      return { ...base, kind: ACTION_KIND[move.type] };
  }
}

export function moveOf(action: ActionFields): Move | { readonly type: "catch"; readonly target: number } | null {
  switch (action.kind) {
    case ACTION_KIND.play:
      if (isSpyglass(action.card)) return { type: "play", slot: action.slot, card: action.card, peek: { seat: action.color >> PEEK_SEAT_SHIFT, slot: action.color & PEEK_SLOT_MASK } };
      return { type: "play", slot: action.slot, card: action.card, ...(colorOf(action.card) === WILD_COLOR ? { color: action.color as Color } : {}) };
    case ACTION_KIND.veil:
      return { type: "veil", slot: action.slot, claim: action.card };
    case ACTION_KIND.doubt:
      return { type: "doubt" };
    case ACTION_KIND.draw:
      return { type: "draw" };
    case ACTION_KIND.pass:
      return { type: "pass" };
    case ACTION_KIND.take:
      return { type: "take" };
    case ACTION_KIND.mono:
      return { type: "mono" };
    case ACTION_KIND.accept:
      return { type: "accept" };
    case ACTION_KIND.challenge:
      return { type: "challenge" };
    case ACTION_KIND.catch:
      return { type: "catch", target: action.slot };
    case ACTION_KIND.sonar:
      return { type: "sonar", target: action.slot, color: action.color as Color };
    default:
      return null;
  }
}

export function splitSignature(signature: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const raw = signature.slice(2);
  const v = Number.parseInt(raw.slice(128, 130), 16);
  return { r: `0x${raw.slice(0, 64)}`, s: `0x${raw.slice(64, 128)}`, v: v < 27 ? v + 27 : v };
}

export function toContractAction(action: SignedAction) {
  const { v, r, s } = splitSignature(action.signature);
  return { seat: action.seat, kind: action.kind, slot: action.slot, card: action.card, color: action.color, seenHandle: action.seenHandle, nonce: action.nonce, v, r, s };
}

export function projectChain(
  table: ChainTable,
  seats: readonly ChainSeat[],
  discard: readonly number[],
  known: ReadonlyMap<number, readonly (Card | null)[]>,
  queues?: readonly (readonly (Card | null)[])[],
): GameState | null {
  const pub = toPublicState(table, seats, discard);
  if (!pub) return null;
  const hands = pub.seats.map((seat, i) =>
    Array.from({ length: HAND_SLOTS }, (_, slot) => (seat.slots[slot] ? (known.get(i)?.[slot] ?? UNKNOWN_CARD) : null)),
  );
  return {
    pub,
    deck: Array.from({ length: pub.deckCount }, () => UNKNOWN_CARD),
    hands,
    honest: pub.seats.map(() => true),
    hadColor: null,
    veilTrue: null,
    secrets: pub.seats.map(() => UNKNOWN_CARD),
    rng: 1,
    ...(queues ? { queues: pub.seats.map((_, i) => (queues[i] ?? []).map((card) => card ?? UNKNOWN_CARD)) } : {}),
  };
}

export function project(chain: GameState, chainNonces: readonly number[], log: readonly SignedAction[]): { state: GameState; valid: SignedAction[]; events: GameEvent[] } {
  let state = chain;
  const valid: SignedAction[] = [];
  const events: GameEvent[] = [];
  const expected = [...chainNonces];
  for (const action of log) {
    if (action.nonce < (chainNonces[action.seat] ?? 0)) continue;
    if (action.nonce !== expected[action.seat]) continue;
    const next = stepAction(state, action);
    if (!next) continue;
    state = next.state;
    expected[action.seat] = action.nonce + 1;
    valid.push(action);
    events.push(...next.events);
  }
  return { state, valid, events };
}

export function stepAction(state: GameState, action: ActionFields): { state: GameState; events: readonly GameEvent[] } | null {
  const move = moveOf(action);
  if (!move) return null;
  try {
    return move.type === "catch" ? applyCatch(state, move.target) : applyMove(state, action.seat, move);
  } catch (error) {
    if (error instanceof RuleError) return null;
    throw error;
  }
}

export function fillMessage(table: bigint): string {
  return `Kryphochroma: seat bots at table ${table.toString()}`;
}

/** A play or a veil names the handle that sits in its slot on chain. A card drawn by a move still waiting for the relay is the head of the seat's queue, whose handle is already public, so the hand is replayed over the pending moves; a slot whose handle cannot be known yet comes back null and that move has to wait, or the contract rejects it as StaleHand. */
export function seatHandles(chainHand: readonly `0x${string}`[], chainQueue: readonly `0x${string}`[], events: readonly GameEvent[], seat: number): (`0x${string}` | null)[] {
  const hand: (`0x${string}` | null)[] = [...chainHand];
  const queue = chainQueue.filter((h) => h !== ZERO_HANDLE);
  let next = 0;
  for (const event of events) {
    if (!("seat" in event) || event.seat !== seat) continue;
    if (event.type === "Played" || event.type === "Veiled") hand[event.slot] = null;
    else if (event.type === "Drew") hand[event.slot] = queue[next++] ?? null;
  }
  return hand;
}

export function slotReady(handles: readonly (`0x${string}` | null)[], slot: number): boolean {
  const handle = handles[slot] ?? null;
  return handle !== null && handle !== ZERO_HANDLE;
}

export function namesSlot(move: Move | { readonly type: "catch"; readonly target: number }): move is Extract<Move, { readonly type: "play" | "veil" }> {
  return move.type === "play" || move.type === "veil";
}
