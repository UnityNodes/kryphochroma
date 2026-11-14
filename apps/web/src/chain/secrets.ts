import type { Hex } from "viem";

const WORD = 64;
const SEAT_HEADER = 2;

/** The reveal proof lists, seat by seat, the honesty bit, the secret colour and then every card left in the hand, one 32 byte word each; the colours are read back from it so a table of people shows them too, not only tables where the server knows the bots. */
export function revealedSecrets(cleartexts: Hex, cardsLeft: readonly number[]): number[] | null {
  const words = cleartexts.slice(2);
  const secrets: number[] = [];
  let at = 0;
  for (const cards of cardsLeft) {
    const start = (at + 1) * WORD;
    if (words.length < start + WORD) return null;
    secrets.push(Number.parseInt(words.slice(start + WORD - 2, start + WORD), 16));
    at += SEAT_HEADER + cards;
  }
  return words.length === at * WORD ? secrets : null;
}

export function bitCount(mask: number): number {
  let count = 0;
  for (let bits = mask >>> 0; bits > 0; bits >>>= 1) count += bits & 1;
  return count;
}
