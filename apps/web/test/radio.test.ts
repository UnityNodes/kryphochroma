import { describe, expect, it } from "vitest";
import { initialState } from "@kryphochroma/rules";
import { STATIONS, STEPS, clampTension, midiToHz, stepEvents, stepSeconds, tableTension } from "@/game/radio";
import { DEFAULT_RADIO, loadRadio, saveRadio } from "@/game/radioSettings";

const bar = (stationIndex: number, index: number, tension: number) =>
  Array.from({ length: STEPS }, (_, step) => stepEvents(STATIONS[stationIndex]!, index, step, tension)).flat();

describe("radio stations", () => {
  it("every station has full sixteen step patterns and a chord per bar", () => {
    for (const s of STATIONS) {
      for (const pattern of [s.kick, s.snare, s.hat, s.bass]) expect(pattern).toHaveLength(STEPS);
      expect(s.chords.length).toBeGreaterThan(0);
      expect(new Set(STATIONS.map((x) => x.id)).size).toBe(STATIONS.length);
    }
  });

  it("is deterministic for the same bar and step", () => {
    expect(bar(0, 3, 0.4)).toEqual(bar(0, 3, 0.4));
  });

  it("plays one pad chord at the downbeat and follows the progression", () => {
    const first = bar(0, 0, 0).filter((e) => e.voice === "pad").map((e) => e.midi);
    const second = bar(0, 1, 0).filter((e) => e.voice === "pad").map((e) => e.midi);
    expect(first).toHaveLength(STATIONS[0]!.chords[0]!.length);
    expect(first).not.toEqual(second);
  });

  it("gets busier and faster when the table is tense", () => {
    const calm = Array.from({ length: 8 }, (_, b) => bar(1, b, 0)).flat().length;
    const tense = Array.from({ length: 8 }, (_, b) => bar(1, b, 1)).flat().length;
    expect(tense).toBeGreaterThan(calm);
    expect(stepSeconds(STATIONS[1]!, 1)).toBeLessThan(stepSeconds(STATIONS[1]!, 0));
  });

  it("clamps tension and converts pitch", () => {
    expect(clampTension(5)).toBe(1);
    expect(clampTension(-1)).toBe(0);
    expect(clampTension(Number.NaN)).toBe(0);
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBe(880);
  });
});

describe("table tension", () => {
  it("is calm off turn, warmer on your turn and peaks on a last card", () => {
    const { state } = initialState({ seats: 4, mode: "single", targetScore: 500, stackDrawTwo: false }, 3);
    const pub = state.pub;
    expect(tableTension({ ...pub, turn: 1 }, 0)).toBeLessThan(tableTension({ ...pub, turn: 0 }, 0));
    const lastCard = { ...pub, seats: pub.seats.map((s, i) => (i === 2 ? { ...s, handSize: 1 } : s)) };
    expect(tableTension(lastCard, 0)).toBe(1);
    expect(tableTension({ ...pub, stage: "RoundOver" }, 0)).toBe(0);
  });
});

describe("radio settings", () => {
  it("remembers station and volume and survives broken or bad storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadRadio(storage)).toEqual(DEFAULT_RADIO);
    saveRadio(storage, { on: true, station: 2, volume: 0.3 });
    expect(loadRadio(storage)).toEqual({ on: true, station: 2, volume: 0.3 });
    store.set("kc-radio", '{"on":true,"station":99,"volume":7}');
    expect(loadRadio(storage)).toEqual({ on: true, station: 0, volume: 1 });
    store.set("kc-radio", "not json");
    expect(loadRadio(storage)).toEqual(DEFAULT_RADIO);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadRadio(broken)).toEqual(DEFAULT_RADIO);
    expect(() => saveRadio(broken, DEFAULT_RADIO)).not.toThrow();
  });
});
