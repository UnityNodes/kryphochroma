import { describe, expect, it } from "vitest";
import type { GameState } from "../src/index.js";
import {
  DECK_SIZE,
  NEXT_CARDS,
  REFILL_CARDS,
  freshCards,
  RuleError,
  applyDraw,
  applyPass,
  applyPlay,
  fullDeck,
  initialState,
  isNumber,
  nextRound,
  validateConfig,
} from "../src/index.js";
import { B, G, R, WILD, WILD4, Y, config, deckWith, game, totalCards, types } from "./helpers.js";

const filler = (color: (n: number) => number) => [1, 2, 3, 4, 5, 6, 7].map(color);

function expectRule(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect((error as RuleError).code).toBe(code);
    return;
  }
  throw new Error(`expected RuleError ${code}`);
}

describe("setup", () => {
  it("rejects bad configs", () => {
    expectRule(() => validateConfig({ seats: 1, mode: "single", targetScore: 500, stackDrawTwo: false }), "BadConfig");
    expectRule(() => validateConfig({ seats: 5, mode: "single", targetScore: 500, stackDrawTwo: false }), "BadConfig");
    expectRule(() => validateConfig({ seats: 2, mode: "match", targetScore: 0, stackDrawTwo: false }), "BadConfig");
    expectRule(() => validateConfig({ seats: 2, mode: "match", targetScore: 10_001, stackDrawTwo: false }), "BadConfig");
  });

  it("rejects a deck of the wrong size or with an invalid card, and takes any valid draws", () => {
    expectRule(() => initialState(config(2), 1, fullDeck().slice(1)), "BadCard");
    const bad = fullDeck();
    bad[0] = 0xff;
    expectRule(() => initialState(config(2), 1, bad), "BadCard");
    const repeated = fullDeck().map(() => fullDeck()[3] as number);
    expect(() => initialState(config(2), 1, repeated)).not.toThrow();
  });

  it("draws every card on its own from the make up of a full deck", () => {
    const { items } = freshCards(7, 20_000);
    const wilds = items.filter((c) => c >= 0x5d).length / items.length;
    expect(wilds).toBeGreaterThan(0.045);
    expect(wilds).toBeLessThan(0.07);
    expect(items.every((c) => fullDeck().includes(c))).toBe(true);
  });

  it.each([2, 3, 4])("deals 7 cards each to %i seats and opens with a number card", (seats) => {
    const { state, events } = initialState(config(seats), 42);
    expect(state.pub.seats.every((s) => s.handSize === 7)).toBe(true);
    expect(isNumber(state.pub.topCard)).toBe(true);
    expect(state.pub.deckCount + state.pub.discard.length).toBe(DECK_SIZE - 7 * seats - NEXT_CARDS * seats);
    expect(state.queues?.every((q) => q.length === NEXT_CARDS)).toBe(true);
    expect(state.pub.turn).toBe(0);
    expect(totalCards(state)).toBe(DECK_SIZE);
    expect(types({ state, events })).toEqual(["Dealt"]);
  });

  it("moves non-number opening cards into the discard pile", () => {
    const state = game([filler(R), filler(Y)], [WILD4, B(10), G(5)]);
    expect(state.pub.topCard).toBe(G(5));
    expect(state.pub.color).toBe(2);
    expect(state.pub.discard).toEqual([WILD4, B(10), G(5)]);
    expect(state.pub.deckCount).toBe(DECK_SIZE - 14 - 2 * NEXT_CARDS - 3);
    expect(totalCards(state)).toBe(DECK_SIZE);
  });

  it("is deterministic for a seed", () => {
    expect(initialState(config(3), 9).state).toEqual(initialState(config(3), 9).state);
    expect(initialState(config(3), 9).state.deck).not.toEqual(initialState(config(3), 10).state.deck);
  });
});

describe("play", () => {
  const base = () => game([[R(1), R(10), R(11), R(12), WILD, WILD4, B(9)], filler(Y), filler(G)], R(5));

  it("plays a matching number and passes the turn", () => {
    const { state, events } = applyPlay(base(), 0, 0, R(1));
    expect(state.pub.topCard).toBe(R(1));
    expect(state.pub.turn).toBe(1);
    expect(state.pub.seats[0]?.handSize).toBe(6);
    expect(state.pub.seats[0]?.slots[0]).toBe(false);
    expect(state.hands[0]?.[0]).toBeNull();
    expect(events).toEqual([{ type: "Played", seat: 0, slot: 0, card: R(1), color: 0 }]);
  });

  it("validates turn, slot, card and color", () => {
    const s = base();
    expectRule(() => applyPlay(s, 1, 0, Y(1)), "NotYourTurn");
    expectRule(() => applyPlay(s, 9, 0, Y(1)), "BadSlot");
    expectRule(() => applyPlay(s, 0, 7, R(1)), "BadSlot");
    expectRule(() => applyPlay(s, 0, 30, R(1)), "BadSlot");
    expectRule(() => applyPlay(s, 0, 6, B(9)), "IllegalCard");
    expectRule(() => applyPlay(s, 0, 0, 0x5f), "BadCard");
    expectRule(() => applyPlay(s, 0, 4, WILD), "BadColor");
    expectRule(() => applyPlay(s, 0, 4, WILD, 5), "BadColor");
  });

  it("skip jumps over the next seat", () => {
    expect(applyPlay(base(), 0, 1, R(10)).state.pub.turn).toBe(2);
  });

  it("reverse flips direction with 3 seats", () => {
    const { state } = applyPlay(base(), 0, 2, R(11));
    expect(state.pub.dir).toBe(-1);
    expect(state.pub.turn).toBe(2);
  });

  it("reverse acts as skip with 2 seats", () => {
    const two = game([[R(11), ...filler(B).slice(0, 6)], filler(Y)], R(5));
    const { state } = applyPlay(two, 0, 0, R(11));
    expect(state.pub.turn).toBe(0);
  });

  it("draw two makes the next seat draw 2 and skip", () => {
    const { state, events } = applyPlay(base(), 0, 3, R(12));
    expect(state.pub.seats[1]?.handSize).toBe(9);
    expect(state.pub.turn).toBe(2);
    expect(types({ state, events })).toEqual(["Played", "Drew", "Drew"]);
  });

  it("wild sets the chosen color", () => {
    const { state } = applyPlay(base(), 0, 4, WILD, 3);
    expect(state.pub.color).toBe(3);
    expect(state.pub.turn).toBe(1);
  });

  it("flags a seat that lies about its card", () => {
    const { state } = applyPlay(base(), 0, 6, R(3));
    expect(state.honest[0]).toBe(false);
    expect(state.pub.topCard).toBe(R(3));
    expect(totalCards(state)).toBe(DECK_SIZE);
  });

  it("does not mutate the input state", () => {
    const s = base();
    const snapshot = structuredClone(s);
    applyPlay(s, 0, 0, R(1));
    expect(s).toEqual(snapshot);
  });
});

describe("draw and pass", () => {
  const base = () => game([filler(B), filler(Y)], R(5), "single", [R(9)]);

  it("draws one card into the first free slot", () => {
    const { state, events } = applyDraw(base(), 0);
    expect(state.pub.drawnSlot).toBe(7);
    expect(state.hands[0]?.[7]).toBe(R(9));
    expect(events).toEqual([{ type: "Drew", seat: 0, slot: 7 }]);
  });

  it("allows only the drawn card after a draw", () => {
    const drawn = applyDraw(base(), 0).state;
    expectRule(() => applyDraw(drawn, 0), "AlreadyDrew");
    expectRule(() => applyPlay(drawn, 0, 0, B(1)), "MustPlayDrawnCard");
    expect(applyPlay(drawn, 0, 7, R(9)).state.pub.topCard).toBe(R(9));
  });

  it("passes only after drawing", () => {
    expectRule(() => applyPass(base(), 0), "CannotPass");
    const { state } = applyPass(applyDraw(base(), 0).state, 0);
    expect(state.pub.turn).toBe(1);
    expect(state.pub.drawnSlot).toBeNull();
  });

  it("draws fresh cards when the deck runs out and leaves the discard pile alone", () => {
    let s = initialState(config(2), 3).state;
    s = { ...s, deck: [], pub: { ...s.pub, deckCount: 0, discard: [R(1), R(2), s.pub.topCard] } };
    const { state, events } = applyDraw(s, 0);
    expect(types({ state, events })).toEqual(["Reshuffled", "Drew"]);
    expect(state.pub.discard).toHaveLength(3);
    expect(state.deck).toHaveLength(REFILL_CARDS - 1);
  });

  it("waits for the chain reshuffle instead of recycling when recycles is off", () => {
    let s = initialState(config(2), 3).state;
    s = { ...s, deck: [], pub: { ...s.pub, deckCount: 0, discard: [R(1), R(2), s.pub.topCard], recycles: false } };
    expectRule(() => applyDraw(s, 0), "CannotDraw");
    expect(applyPass(s, 0).state.pub.discard).toHaveLength(3);
  });

  it("allows pass without drawing when nothing can be drawn", () => {
    let s = initialState(config(2), 3).state;
    s = { ...s, deck: [], pub: { ...s.pub, deckCount: 0, discard: [s.pub.topCard], recycles: false } };
    expectRule(() => applyDraw(s, 0), "CannotDraw");
    expect(applyPass(s, 0).state.pub.turn).toBe(1);
  });
});

describe("round end", () => {
  it("next round keeps scores and rotates the first seat", () => {
    const s = game([[R(1), ...filler(B).slice(0, 6)], filler(Y)], R(5), "match");
    expectRule(() => nextRound(s), "WrongStage");
    const over = { ...s, pub: { ...s.pub, stage: "RoundOver" as const, seats: s.pub.seats.map((x, i) => ({ ...x, score: i * 10 })) } };
    const { state } = nextRound(over);
    expect(state.pub.round).toBe(1);
    expect(state.pub.turn).toBe(1);
    expect(state.pub.seats.map((x) => x.score)).toEqual([0, 10]);
    expect(state.pub.seats.every((x) => x.handSize === 7)).toBe(true);
    const fixed = nextRound(over, deckWith([])).state;
    expect(fixed.pub.round).toBe(1);
  });
});

describe("personal draw queue", () => {
  it("deals each seat its next cards after the hands, in seat order", () => {
    const deck = fullDeck();
    const { state } = initialState(config(2), 1, deck);
    expect(state.queues).toEqual([deck.slice(14, 16), deck.slice(16, 18)]);
  });

  it("draws the head of the seat's own queue and tops it up from the deck", () => {
    const deck = fullDeck();
    const { state } = initialState(config(2), 1, deck);
    const head = state.queues?.[0]?.[0];
    const second = state.queues?.[0]?.[1];
    const top = state.deck[0];
    const drawn = applyDraw(state, 0).state;
    expect(drawn.hands[0]?.[7]).toBe(head);
    expect(drawn.queues?.[0]).toEqual([second, top]);
    expect(drawn.queues?.[1]).toEqual(state.queues?.[1]);
    expect(drawn.pub.deckCount).toBe(state.pub.deckCount - 1);
    expect(totalCards(drawn)).toBe(DECK_SIZE);
  });

  it("draws straight from the deck for a state without queues", () => {
    const { state } = initialState(config(2), 1, fullDeck());
    const bare: GameState = { pub: state.pub, deck: state.deck, hands: state.hands, honest: state.honest, hadColor: state.hadColor, veilTrue: state.veilTrue, secrets: state.secrets, rng: state.rng };
    const top = state.deck[0];
    expect(applyDraw(bare, 0).state.hands[0]?.[7]).toBe(top);
  });

  it("keeps NEXT_CARDS at two so the contract and the engine agree", () => {
    expect(NEXT_CARDS).toBe(2);
  });
});
