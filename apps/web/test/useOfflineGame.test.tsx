import { act, renderHook, waitFor } from "@testing-library/react";
import { legalMoves } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { HUMAN } from "@/game/offline";
import { useOfflineGame } from "@/game/useOfflineGame";

describe("useOfflineGame", () => {
  it("applies a human move and lets the bots answer", async () => {
    const { result } = renderHook(() => useOfflineGame(2, false, false));
    await waitFor(() => expect(result.current.state.pub.turn).toBe(HUMAN), { timeout: 10_000 });
    const before = result.current.state;
    const moves = legalMoves(before.pub, HUMAN, before.hands[HUMAN] ?? []);
    const move = moves.find((m) => m.type === "play") ?? moves.find((m) => m.type === "draw");
    if (!move) throw new Error("no move");
    let error: string | null = "unset";
    act(() => {
      error = result.current.act(move);
    });
    expect(error).toBeNull();
    await waitFor(() => expect(result.current.state).not.toBe(before), { timeout: 5_000 });
    expect(result.current.feed.length).toBeGreaterThan(0);
  }, 20_000);
});
