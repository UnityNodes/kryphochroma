import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATIONS } from "@/game/stations";
import { useRadio } from "@/game/useRadio";

const proto = window.HTMLMediaElement.prototype;
let player: HTMLMediaElement | null = null;
let playResult: () => Promise<void> = () => Promise.resolve();

function playing(): Promise<void> {
  player = (vi.mocked(proto.play).mock.contexts.at(-1) as HTMLMediaElement | undefined) ?? null;
  return playResult();
}

describe("radio", () => {
  beforeEach(() => {
    player = null;
    playResult = () => Promise.resolve();
    vi.spyOn(proto, "play").mockImplementation(playing);
    vi.spyOn(proto, "pause").mockImplementation(() => undefined);
    vi.spyOn(proto, "load").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("tunes in to the chosen station and reports it live once sound arrives", () => {
    const { result } = renderHook(() => useRadio());
    expect(result.current.on).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.on).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(player?.getAttribute("src")).toBe(STATIONS[0]?.url);
    act(() => void player?.dispatchEvent(new Event("playing")));
    expect(result.current.status).toBe("live");
  });

  it("switches the stream when another station is picked", () => {
    const { result } = renderHook(() => useRadio());
    act(() => result.current.pick(3));
    expect(result.current.on).toBe(true);
    expect(result.current.station).toBe(STATIONS[3]);
    expect(player?.getAttribute("src")).toBe(STATIONS[3]?.url);
    act(() => result.current.tune(1));
    expect(player?.getAttribute("src")).toBe(STATIONS[4]?.url);
  });

  it("drops the stream when turned off so nothing keeps downloading", () => {
    const { result } = renderHook(() => useRadio());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.on).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(proto.pause).toHaveBeenCalled();
    expect(player?.hasAttribute("src")).toBe(false);
  });

  it("says the station is unavailable instead of throwing when it can not be played", async () => {
    playResult = () => Promise.reject(new Error("no stream"));
    const { result } = renderHook(() => useRadio());
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    act(() => void player?.dispatchEvent(new Event("playing")));
    playResult = () => Promise.resolve();
    act(() => result.current.tune(1));
    expect(result.current.status).toBe("loading");
  });

  it("ignores a play call cut short by a quick station change", async () => {
    playResult = () => Promise.reject(Object.assign(new Error("interrupted"), { name: "AbortError" }));
    const { result } = renderHook(() => useRadio());
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("loading");
  });

  it("keeps the volume it was given", () => {
    const { result } = renderHook(() => useRadio());
    act(() => result.current.toggle());
    act(() => result.current.setVolume(0.2));
    expect(result.current.volume).toBe(0.2);
    expect(player?.volume).toBeCloseTo(0.2);
  });
});
