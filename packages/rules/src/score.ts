import { type Card, points } from "./cards.js";
import type { RoundResult } from "./types.js";

export type RevealedHand = readonly (Card | null)[];

export function handPoints(hand: RevealedHand): number {
  return hand.reduce<number>((sum, card) => (card === null ? sum : sum + points(card)), 0);
}

export function scoreRound(
  hands: readonly RevealedHand[],
  honest: readonly boolean[],
  candidate: number,
): RoundResult {
  const cheaters = honest.flatMap((ok, seat) => (ok ? [] : [seat]));
  const winner = pickWinner(hands, honest, candidate);
  if (winner === null) return { winner, points: 0, cheaters };
  const total = hands.reduce<number>((sum, hand, seat) => (seat === winner ? sum : sum + handPoints(hand)), 0);
  return { winner, points: total, cheaters };
}

function pickWinner(hands: readonly RevealedHand[], honest: readonly boolean[], candidate: number): number | null {
  if (honest[candidate]) return candidate;
  let best: number | null = null;
  let bestPoints = Number.POSITIVE_INFINITY;
  hands.forEach((hand, seat) => {
    if (!honest[seat]) return;
    const value = handPoints(hand);
    if (value < bestPoints) {
      best = seat;
      bestPoints = value;
    }
  });
  return best;
}
