import { type SignedAction, fieldsFor } from "@kryphochroma/abi";
import { chooseMove, initialState } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { project, stepAction as step } from "@kryphochroma/abi";

const sig = `0x${"11".repeat(65)}` as const;
const handles = Array.from({ length: 24 }, () => `0x${"00".repeat(32)}` as const);

describe("relay projection", () => {
  const { state } = initialState({ seats: 2, mode: "single", targetScore: 500, stackDrawTwo: false }, 11);

  it("applies in-order actions and skips stale or out-of-order nonces", () => {
    const seat = state.pub.turn;
    const move = chooseMove(state.pub, seat, state.hands[seat] ?? []);
    if (!move) throw new Error("no move");
    const first: SignedAction = { ...fieldsFor(1n, seat, move, 0, handles), signature: sig };
    const stale: SignedAction = { ...fieldsFor(1n, seat, move, 0, handles), signature: sig };
    const gap: SignedAction = { ...fieldsFor(1n, seat, { type: "pass" }, 5, handles), signature: sig };
    const { state: next, valid } = project(state, [0, 0], [first, stale, gap]);
    expect(valid).toEqual([first]);
    expect(next.pub.discard.length + next.pub.deckCount).toBeGreaterThan(0);
    expect(project(state, [1, 0], [first]).valid).toEqual([]);
  });

  it("refuses illegal moves without throwing", () => {
    const other = 1 - state.pub.turn;
    expect(step(state, fieldsFor(1n, other, { type: "draw" }, 0, handles))).toBeNull();
    expect(step(state, { ...fieldsFor(1n, 0, { type: "pass" }, 0, handles), kind: 99 })).toBeNull();
  });
});
