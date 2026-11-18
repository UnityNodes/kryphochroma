import { type Card, colorOf, rankOf } from "@kryphochroma/rules";

export interface HandEntry {
  readonly card: Card;
  readonly slot: number;
}

/** The hand is shown by colour and rank with the cards still being decrypted last, whichever slots the contract keeps them in. Both table views read this one order, so the hidden buttons and the cards on the 3D table can never disagree. */
export function compareHand(a: HandEntry, b: HandEntry): number {
  return (a.card < 0 ? 1 : 0) - (b.card < 0 ? 1 : 0) || colorOf(a.card) - colorOf(b.card) || rankOf(a.card) - rankOf(b.card);
}

export function handOrder(hand: readonly (Card | null)[]): HandEntry[] {
  return hand
    .map((card, slot) => ({ card, slot }))
    .filter((entry): entry is HandEntry => entry.card !== null)
    .sort(compareHand);
}
