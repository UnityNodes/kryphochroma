import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRadio } from "@/game/useRadio";

describe("radio in a browser that blocks web audio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("turns the radio off instead of throwing when the audio context fails", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("audio blocked");
        }
      },
    );
    const { result } = renderHook(() => useRadio(0));
    expect(() => act(() => result.current.toggle())).not.toThrow();
    expect(result.current.unavailable).toBe(true);
    expect(result.current.on).toBe(false);
  });
});
