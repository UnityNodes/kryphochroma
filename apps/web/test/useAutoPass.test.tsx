import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_PASS_MS } from "@/game/autoPass";
import { useAutoPass } from "@/game/useAutoPass";

describe("useAutoPass", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes once, after the player had time to see the card", () => {
    const pass = vi.fn();
    renderHook(() => useAutoPass("a", pass));
    vi.advanceTimersByTime(AUTO_PASS_MS - 1);
    expect(pass).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a due pass", () => {
    const pass = vi.fn();
    renderHook(() => useAutoPass(null, pass));
    vi.advanceTimersByTime(AUTO_PASS_MS * 3);
    expect(pass).not.toHaveBeenCalled();
  });

  it("drops the pass when the situation ends before the pause is over", () => {
    const pass = vi.fn();
    const { rerender } = renderHook(({ due }: { due: string | null }) => useAutoPass(due, pass), { initialProps: { due: "a" as string | null } });
    vi.advanceTimersByTime(AUTO_PASS_MS / 2);
    rerender({ due: null });
    vi.advanceTimersByTime(AUTO_PASS_MS * 2);
    expect(pass).not.toHaveBeenCalled();
  });

  it("does not repeat a pass for the same draw, and passes again on the next one", () => {
    const pass = vi.fn();
    const { rerender } = renderHook(({ due }: { due: string | null }) => useAutoPass(due, pass), { initialProps: { due: "a" as string | null } });
    vi.advanceTimersByTime(AUTO_PASS_MS);
    rerender({ due: null });
    rerender({ due: "a" });
    vi.advanceTimersByTime(AUTO_PASS_MS * 2);
    expect(pass).toHaveBeenCalledTimes(1);
    rerender({ due: "b" });
    vi.advanceTimersByTime(AUTO_PASS_MS);
    expect(pass).toHaveBeenCalledTimes(2);
  });
});
