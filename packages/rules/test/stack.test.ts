import { describe, expect, it } from "vitest";
import {
  RuleError,
  applyDraw,
  applyPass,
  applyPlay,
  applyTakeDraws,
  applyTimeout,
  chooseMove,
  legalMoves,
  validateConfig,
} from "../src/index.js";
import { B, G, R, Y, game, types } from "./helpers.js";

function expectRule(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect((error as RuleError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

const hands = () => [
  [R(12), B(1), B(2), B(3), B(4), B(5), B(6)],
  [Y(12), Y(1), Y(2), Y(3), Y(4), Y(5), Y(6)],
  [G(1), G(2), G(3), G(4), G(5), G(6), G(7)],
];
const stacked = () => game(hands(), R(5), "single", [], true);

describe("draw two stacking", () => {
  it("needs a boolean flag", () => {
    expectRule(() => validateConfig({ seats: 2, mode: "single", targetScore: 500, stackDrawTwo: "yes" as unknown as boolean }), "BadConfig");
  });

  it("passes the pending draw to the next seat instead of drawing at once", () => {
    const { state } = applyPlay(stacked(), 0, 0, R(12));
    expect(state.pub.pendingDraw).toBe(2);
    expect(state.pub.turn).toBe(1);
    expect(state.pub.seats[1]?.handSize).toBe(7);
    expect(legalMoves(state.pub, 1, state.hands[1] ?? [])).toEqual([{ type: "play", slot: 0, card: Y(12) }, { type: "take" }]);
  });

  it("stacks another draw two and blocks other moves", () => {
    const one = applyPlay(stacked(), 0, 0, R(12)).state;
    expectRule(() => applyPlay(one, 1, 1, Y(1)), "MustStackOrTake");
    expectRule(() => applyDraw(one, 1), "DrawPending");
    expectRule(() => applyPass(one, 1), "DrawPending");
    const two = applyPlay(one, 1, 0, Y(12)).state;
    expect(two.pub.pendingDraw).toBe(4);
    expect(two.pub.turn).toBe(2);
    expect(legalMoves(two.pub, 2, two.hands[2] ?? [])).toEqual([{ type: "take" }]);
    expect(chooseMove(two.pub, 2, two.hands[2] ?? [])).toEqual({ type: "take" });
    const taken = applyTakeDraws(two, 2);
    expect(types(taken)[0]).toBe("DrawsTaken");
    expect(taken.state.pub.seats[2]?.handSize).toBe(11);
    expect(taken.state.pub.pendingDraw).toBe(0);
    expect(taken.state.pub.turn).toBe(0);
    expectRule(() => applyTakeDraws(taken.state, 0), "NoPendingDraw");
  });

  it("a bot stacks when it can", () => {
    const one = applyPlay(stacked(), 0, 0, R(12)).state;
    expect(chooseMove(one.pub, 1, one.hands[1] ?? [])).toEqual({ type: "play", slot: 0, card: Y(12) });
  });

  it("a timeout takes the whole stack", () => {
    const one = applyPlay(stacked(), 0, 0, R(12)).state;
    const { state } = applyTimeout(one);
    expect(state.pub.seats[1]?.handSize).toBe(9);
    expect(state.pub.pendingDraw).toBe(0);
    expect(state.pub.turn).toBe(2);
  });

  it("keeps the official rule when the option is off", () => {
    const { state } = applyPlay(game(hands(), R(5)), 0, 0, R(12));
    expect(state.pub.pendingDraw).toBe(0);
    expect(state.pub.seats[1]?.handSize).toBe(9);
    expect(state.pub.turn).toBe(2);
  });
});
