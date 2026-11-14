import { type Hand, type PublicState, legalMoves } from "@kryphochroma/rules";

export const AUTO_PASS_MS = 900;

/** After a draw only the drawn card may be played, so when it does not fit the one thing left is to pass. Asking the player to find a button for a move with no alternative read as a frozen table. The key names the draw, so a pass the table refused is not sent again in a loop. */
export function autoPassKey(pub: PublicState, seat: number, hand: Hand): string | null {
  if (pub.stage !== "Playing" || pub.turn !== seat || pub.drawnSlot === null) return null;
  const drawn = hand[pub.drawnSlot];
  if (drawn === null || drawn === undefined || drawn < 0) return null;
  const moves = legalMoves(pub, seat, hand);
  if (moves.some((move) => move.type === "play") || !moves.some((move) => move.type === "pass")) return null;
  return `${pub.round}:${pub.discard.length}:${pub.deckCount}:${pub.drawnSlot}`;
}
