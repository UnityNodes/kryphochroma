import { describe, expect, it } from "vitest";
import { type GameState, applyChallenge, applyMove, chooseMove, initialState } from "@kryphochroma/rules";
import { provisionalResult } from "@/game/provisional";

function revealing(): GameState {
  let state = initialState({ seats: 2, mode: "single", targetScore: 500, stackDrawTwo: false }, 3).state;
  for (let step = 0; step < 600 && state.pub.stage !== "Revealing"; step++) {
    if (state.pub.stage === "AwaitChallenge") {
      state = applyChallenge(state).state;
      continue;
    }
    const seat = state.pub.turn;
    const move = chooseMove(state.pub, seat, state.hands[seat] ?? []);
    if (!move) throw new Error("no move");
    state = applyMove(state, seat, move).state;
  }
  return state;
}

describe("provisional result", () => {
  const state = revealing();
  const bots = { round: state.pub.round, seats: [{ seat: 1, hand: state.hands[1] ?? [], secret: 2 }] };

  it("scores the round from the own hand and the revealed bots", () => {
    expect(state.pub.stage).toBe("Revealing");
    const result = provisionalResult(state, 0, 1, bots);
    expect(result?.pub.stage).toBe("MatchOver");
    expect(result?.pub.lastResult?.secrets).toEqual([1, 2]);
  });

  it("does not call a rival a liar because its last plays were projected over cards the browser can not see", () => {
    const blind = { ...state, honest: state.honest.map((h, seat) => (seat === 1 ? false : h)) };
    const result = provisionalResult(blind, 0, 1, bots);
    expect(result?.pub.lastResult?.cheaters).toEqual([]);
    expect(result?.pub.lastResult?.winner).toBe(provisionalResult(state, 0, 1, bots)?.pub.lastResult?.winner);
  });

  it("keeps the player's own lie, which the browser does know", () => {
    const lied = { ...state, honest: state.honest.map((h, seat) => (seat === 0 ? false : h)) };
    expect(provisionalResult(lied, 0, 1, bots)?.pub.lastResult?.cheaters).toEqual([0]);
  });

  it("waits while a hand or a secret is still unknown", () => {
    expect(provisionalResult(state, 0, null, bots)).toBeNull();
    expect(provisionalResult(state, 0, 1, { ...bots, seats: [] })).toBeNull();
    expect(provisionalResult(state, 0, 1, { ...bots, seats: [{ seat: 1, hand: [-1], secret: 2 }] })).toBeNull();
  });

  it("ignores bot hands from another round", () => {
    expect(provisionalResult(state, 0, 1, { ...bots, round: state.pub.round + 1 })).toBeNull();
  });
});
