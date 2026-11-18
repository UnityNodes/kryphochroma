import { applyMove, initialState, legalMoves } from "@kryphochroma/rules";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTransitionQueue } from "@/game/useTransitionQueue";

const NAMES = ["You", "Mira"];

function firstTurn() {
  const before = initialState({ seats: 2, mode: "single", targetScore: 500, stackDrawTwo: false }, 9).state;
  const seat = before.pub.turn;
  const moves = legalMoves(before.pub, seat, before.hands[seat] ?? []);
  const move = moves.find((m) => m.type === "draw") ?? moves[0];
  if (!move) throw new Error("no legal move");
  return { before, transition: applyMove(before, seat, move) };
}

describe("transition queue", () => {
  it("names the transition that is in the air and clears it when the new state is shown", async () => {
    const { before, transition } = firstTurn();
    const { result } = renderHook(() => useTransitionQueue(before, 0, NAMES, false));
    expect(result.current.playing).toBeNull();

    act(() => result.current.enqueue(transition));
    expect(result.current.busy).toBe(true);
    expect(result.current.playing?.events).toBe(transition.events);
    expect(result.current.playing?.after).toBe(transition.state);
    expect(result.current.shown).toBe(before);

    await act(async () => undefined);
    expect(result.current.playing).toBeNull();
    expect(result.current.shown).toBe(transition.state);
    expect(result.current.busy).toBe(false);
  });

  it("gives every transition its own id and drops the one in the air on reset", async () => {
    const { before, transition } = firstTurn();
    const { result } = renderHook(() => useTransitionQueue(before, 0, NAMES, false));
    act(() => result.current.enqueue(transition));
    const first = result.current.playing?.id;
    await act(async () => undefined);
    act(() => result.current.enqueue(transition));
    expect(result.current.playing?.id).not.toBe(first);
    act(() => result.current.reset(before));
    expect(result.current.playing).toBeNull();
    expect(result.current.shown).toBe(before);
  });
});
