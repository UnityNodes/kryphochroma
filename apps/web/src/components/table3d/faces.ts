import { COLOR_NAMES, type Card, RANK, colorOf, isDrawFour, isWild, rankOf } from "@kryphochroma/rules";

const CARD_DIR = "/cards";
const RANK_NAMES: Readonly<Record<number, string>> = { [RANK.skip]: "skip", [RANK.reverse]: "reverse", [RANK.drawTwo]: "draw2", [RANK.spyglass]: "spyglass" };

export const BACK_URL = `${CARD_DIR}/back.webp`;

/** The images in public/cards are written by scripts/render-cards.mjs under these names, so both sides must agree on them. */
export function faceName(card: Card): string {
  if (isWild(card)) return isDrawFour(card) ? "wild-draw4" : "wild";
  const colour = (COLOR_NAMES[colorOf(card)] ?? "").toLowerCase();
  return `${colour}-${RANK_NAMES[rankOf(card)] ?? String(rankOf(card))}`;
}

export function faceUrl(card: Card, shapes: boolean): string {
  return shapes && !isWild(card) ? `${CARD_DIR}/shapes/${faceName(card)}.webp` : `${CARD_DIR}/${faceName(card)}.webp`;
}
