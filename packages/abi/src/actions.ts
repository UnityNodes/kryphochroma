import type { Card, Color, GameEvent, GameState, Move } from "@kryphochroma/rules";
import { HAND_SLOTS, RuleError, applyCatch, applyMove } from "@kryphochroma/rules";
import { type ChainSeat, type ChainTable, toPublicState } from "./view.js";

export const UNKNOWN_CARD = -1;
export const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;

export const ACTION_KIND = { play: 0, draw: 1, pass: 2, take: 3, mono: 4, accept: 5, challenge: 6, catch: 7 } as const;

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
      return { ...base, kind: ACTION_KIND.play, slot: move.slot, card: move.card, color: move.color ?? 0, seenHandle: handles[move.slot] ?? ZERO_HANDLE };
    case "catch":
      return { ...base, kind: ACTION_KIND.catch, slot: move.target };
    default:
      return { ...base, kind: ACTION_KIND[move.type] };
  }
}

export function moveOf(action: ActionFields): Move | { readonly type: "catch"; readonly target: number } | null {
  switch (action.kind) {
    case ACTION_KIND.play:
      return { type: "play", slot: action.slot, card: action.card, ...(action.card >> 4 === 4 ? { color: action.color as Color } : {}) };
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
): GameState | null {
  const pub = toPublicState(table, seats, discard);
  if (!pub) return null;
  const hands = pub.seats.map((seat, i) =>
    Array.from({ length: HAND_SLOTS }, (_, slot) => (seat.slots[slot] ? (known.get(i)?.[slot] ?? UNKNOWN_CARD) : null)),
  );
  return { pub, deck: Array.from({ length: pub.deckCount }, () => UNKNOWN_CARD), hands, honest: pub.seats.map(() => true), hadColor: null, rng: 1 };
}

export function project(chain: GameState, chainNonces: readonly number[], log: readonly SignedAction[]): { state: GameState; valid: SignedAction[] } {
  let state = chain;
  const valid: SignedAction[] = [];
  const expected = [...chainNonces];
  for (const action of log) {
    if (action.nonce < (chainNonces[action.seat] ?? 0)) continue;
    if (action.nonce !== expected[action.seat]) continue;
    const next = stepAction(state, action);
    if (!next) continue;
    state = next.state;
    expected[action.seat] = action.nonce + 1;
    valid.push(action);
  }
  return { state, valid };
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

