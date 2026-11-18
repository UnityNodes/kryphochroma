import { describe, expect, it } from "vitest";
import { DEFAULT_RADIO, loadRadio, saveRadio } from "@/game/radioSettings";
import { STATIONS, mediaOrigins, stepStation } from "@/game/stations";

describe("radio stations", () => {
  it("lists stations a page served over https can play, each with its source and licence", () => {
    expect(STATIONS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const station of STATIONS) {
      expect(new URL(station.url).protocol).toBe("https:");
      expect(new URL(station.site).protocol).toBe("https:");
      expect(station.name.length).toBeGreaterThan(0);
      expect(station.genre.length).toBeGreaterThan(0);
      expect(station.license.length).toBeGreaterThan(0);
    }
  });

  it("names every origin the content policy has to let audio from", () => {
    const origins = mediaOrigins();
    for (const station of STATIONS) expect(origins).toContain(new URL(station.url).origin);
    for (const station of STATIONS) if (station.edge) expect(origins).toContain(station.edge);
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("steps through the dial and wraps at both ends", () => {
    expect(stepStation(0, 1)).toBe(1);
    expect(stepStation(STATIONS.length - 1, 1)).toBe(0);
    expect(stepStation(0, -1)).toBe(STATIONS.length - 1);
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
