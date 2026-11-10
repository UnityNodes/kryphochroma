export type Card = number;
export type Color = 0 | 1 | 2 | 3;

export const COLOR = { red: 0, sun: 1, teal: 2, blue: 3 } as const;
export const WILD_COLOR = 4;
export const PLAYABLE_COLORS: readonly Color[] = [0, 1, 2, 3];
export const COLOR_NAMES = ["Red", "Sun", "Teal", "Blue"] as const;

export const RANK = {
  skip: 10,
  reverse: 11,
  drawTwo: 12,
  wild: 13,
  wildDrawFour: 14,
} as const;

export const DECK_SIZE = 108;
export const ACTION_POINTS = 20;
export const WILD_POINTS = 50;

export const cardOf = (color: number, rank: number): Card => color * 16 + rank;
export const colorOf = (card: Card): number => card >> 4;
export const rankOf = (card: Card): number => card & 15;
export const isWild = (card: Card): boolean => colorOf(card) === WILD_COLOR;
export const isNumber = (card: Card): boolean => !isWild(card) && rankOf(card) <= 9;
export const isAction = (card: Card): boolean => !isWild(card) && rankOf(card) >= RANK.skip;
export const isDrawFour = (card: Card): boolean => card === cardOf(WILD_COLOR, RANK.wildDrawFour);
export const isColor = (value: number): value is Color =>
  Number.isInteger(value) && value >= 0 && value <= 3;

export function isValidCard(card: number): boolean {
  if (!Number.isInteger(card) || card < 0 || card > 255) return false;
  const color = colorOf(card);
  const rank = rankOf(card);
  if (color === WILD_COLOR) return rank === RANK.wild || rank === RANK.wildDrawFour;
  return color <= 3 && rank <= RANK.drawTwo;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of PLAYABLE_COLORS) {
    deck.push(cardOf(color, 0));
    for (let rank = 1; rank <= RANK.drawTwo; rank++) {
      deck.push(cardOf(color, rank), cardOf(color, rank));
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(cardOf(WILD_COLOR, RANK.wild), cardOf(WILD_COLOR, RANK.wildDrawFour));
  }
  return deck;
}

export function points(card: Card): number {
  if (isWild(card)) return WILD_POINTS;
  if (isAction(card)) return ACTION_POINTS;
  return rankOf(card);
}

export function matches(card: Card, topCard: Card, color: number): boolean {
  if (isWild(card)) return true;
  return colorOf(card) === color || rankOf(card) === rankOf(topCard);
}

const RANK_LABELS: Record<number, string> = {
  [RANK.skip]: "skip",
  [RANK.reverse]: "reverse",
  [RANK.drawTwo]: "draw two",
};

export function cardLabel(card: Card): string {
  if (card === cardOf(WILD_COLOR, RANK.wild)) return "Wild";
  if (isDrawFour(card)) return "Wild draw four";
  const colorName = COLOR_NAMES[colorOf(card)] ?? "Unknown";
  return `${colorName} ${RANK_LABELS[rankOf(card)] ?? String(rankOf(card))}`;
}
