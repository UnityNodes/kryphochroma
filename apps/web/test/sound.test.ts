import { describe, expect, it } from "vitest";
import { SOUND_FOR_ICON, VOICES, loadMuted, saveMuted } from "@/game/sound";

describe("sound settings", () => {
  it("remembers mute and survives broken storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadMuted(storage)).toBe(false);
    saveMuted(storage, true);
    expect(loadMuted(storage)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadMuted(broken)).toBe(false);
    expect(() => saveMuted(broken, true)).not.toThrow();
    expect(loadMuted(null)).toBe(false);
  });

  it("maps every feed icon it names to a real voice", () => {
    for (const name of Object.values(SOUND_FOR_ICON)) if (name) expect(VOICES[name]).toBeTypeOf("function");
    expect(SOUND_FOR_ICON.play).toBe("slap");
    expect(SOUND_FOR_ICON.trophy).toBe("win");
    expect(SOUND_FOR_ICON.mono).toBe("mono");
    expect(SOUND_FOR_ICON.caught).toBe("caught");
  });
});
