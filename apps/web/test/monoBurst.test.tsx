import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonoBurst } from "@/components/table/MonoBurst";

describe("mono burst", () => {
  afterEach(() => vi.useRealTimers());

  it("shouts who called mono and clears itself", () => {
    vi.useFakeTimers();
    const { rerender } = render(<MonoBurst actor={null} stamp={0} />);
    expect(screen.queryByText("MONO!")).toBeNull();
    rerender(<MonoBurst actor="Mira" stamp={1} />);
    expect(screen.getByText("MONO!")).toBeTruthy();
    expect(screen.getByText("Mira called it")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText("MONO!")).toBeNull();
  });

  it("speaks to the player when they call it themselves", () => {
    render(<MonoBurst actor="You" stamp={5} />);
    expect(screen.getByText("You called it")).toBeTruthy();
  });
});
