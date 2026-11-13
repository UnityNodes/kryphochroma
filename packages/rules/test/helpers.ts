import {
  type Card,
  type GameState,
  type TableConfig,
  type Transition,
  cardOf,
  fullDeck,
  initialState,
} from "../src/index.js";

export const R = (rank: number): Card => cardOf(0, rank);
export const Y = (rank: number): Card => cardOf(1, rank);
export const G = (rank: number): Card => cardOf(2, rank);
export const B = (rank: number): Card => cardOf(3, rank);
export const V = (rank: number): Card => cardOf(4, rank);
export const WILD = cardOf(5, 13);
export const WILD4 = cardOf(5, 14);

export function config(seats: number, mode: TableConfig["mode"] = "single", stackDrawTwo = false): TableConfig {
  return { seats, mode, targetScore: 500, stackDrawTwo };
}

export function deckWith(prefix: readonly Card[], tops: readonly Card[] = []): Card[] {
  const rest = fullDeck();
  for (const card of [...prefix, ...tops]) {
    const i = rest.indexOf(card);
    if (i < 0) throw new Error(`card ${card} exhausted`);
    rest.splice(i, 1);
  }
  return [...prefix, ...rest, ...[...tops].reverse()];
}

export function dealPrefix(hands: readonly (readonly Card[])[]): Card[] {
  const prefix: Card[] = [];
  for (let i = 0; i < 7; i++) {
    for (const hand of hands) {
      const card = hand[i];
      if (card === undefined) throw new Error("each hand needs 7 cards");
      prefix.push(card);
    }
  }
  return prefix;
}

export function game(
  hands: readonly (readonly Card[])[],
  top: Card | readonly Card[],
  mode: TableConfig["mode"] = "single",
  after: readonly Card[] = [],
  stackDrawTwo = false,
): GameState {
  const tops = Array.isArray(top) ? top : [top as Card];
  return initialState(config(hands.length, mode, stackDrawTwo), 7, deckWith([...dealPrefix(hands), ...after], tops)).state;
}

export function totalCards(state: GameState): number {
  const inHands = state.hands.reduce((sum, hand) => sum + hand.filter((c) => c !== null).length, 0);
  return state.deck.length + inHands + state.pub.discard.length + (state.queues ?? []).reduce((sum, q) => sum + q.length, 0);
}

export function types(t: Transition): string[] {
  return t.events.map((e) => e.type);
}
