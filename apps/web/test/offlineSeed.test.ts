import { HAND_START, legalMoves } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { HUMAN, newOfflineGame, withHandSize } from "@/game/offline";

describe("a practice round seeded with a long hand", () => {
  const dealt = newOfflineGame({ seats: 3, stackDrawTwo: false, seed: 5 }).state;

  it("moves cards from the deck into the hand and keeps the public counts true", () => {
    const state = withHandSize(dealt, HUMAN, 20);
    const hand = state.hands[HUMAN] ?? [];
    expect(hand.filter((card) => card !== null)).toHaveLength(20);
    expect(state.pub.seats[HUMAN]?.handSize).toBe(20);
    expect(state.pub.seats[HUMAN]?.slots.filter(Boolean)).toHaveLength(20);
    expect(state.deck).toHaveLength(dealt.deck.length - (20 - HAND_START));
    expect(state.pub.deckCount).toBe(state.deck.length);
    expect(state.hands[1]).toEqual(dealt.hands[1]);
    expect(() => legalMoves(state.pub, HUMAN, hand)).not.toThrow();
  });

  it("never shrinks a hand and stops at the last free slot", () => {
    expect(withHandSize(dealt, HUMAN, 3).pub.seats[HUMAN]?.handSize).toBe(HAND_START);
    expect(withHandSize(dealt, HUMAN, 99).pub.seats[HUMAN]?.handSize).toBe((dealt.hands[HUMAN] ?? []).length);
  });
});
