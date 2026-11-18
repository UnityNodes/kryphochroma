"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_RADIO, type RadioSettings, loadRadio, saveRadio } from "./radioSettings";
import { STATIONS, type Station, stepStation } from "./stations";

export type RadioStatus = "idle" | "loading" | "live" | "error";

export interface RadioControls {
  readonly on: boolean;
  readonly volume: number;
  readonly index: number;
  readonly station: Station;
  readonly status: RadioStatus;
  readonly toggle: () => void;
  readonly tune: (delta: number) => void;
  readonly pick: (index: number) => void;
  readonly setVolume: (volume: number) => void;
}

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const hasSource = (player: HTMLAudioElement | null): boolean => !!player?.getAttribute("src");

export function useRadio(): RadioControls {
  const [settings, setSettings] = useState<RadioSettings>(() => (typeof window === "undefined" ? DEFAULT_RADIO : loadRadio(storage())));
  const [status, setStatus] = useState<RadioStatus>("idle");
  const player = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(settings);

  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  const update = useCallback((change: (s: RadioSettings) => RadioSettings) => {
    setSettings((s) => {
      const next = change(s);
      saveRadio(storage(), next);
      return next;
    });
  }, []);

  /** A live stream keeps downloading while paused, so stopping drops the source instead of pausing it. */
  const stop = useCallback(() => {
    const el = player.current;
    setStatus("idle");
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
    } catch {
      player.current = null;
    }
  }, []);

  /** Browsers only start sound from inside a click or a key press, so this is called straight from those handlers and never from an effect. A play call cut short by the next station change rejects with AbortError and is not a failure. */
  const start = useCallback((index: number, volume: number) => {
    const station = STATIONS[index];
    if (!station) return;
    try {
      if (!player.current) {
        const el = new Audio();
        el.preload = "none";
        el.addEventListener("playing", () => setStatus("live"));
        el.addEventListener("waiting", () => setStatus("loading"));
        el.addEventListener("error", () => {
          if (hasSource(el)) setStatus("error");
        });
        player.current = el;
      }
      const el = player.current;
      el.volume = volume;
      if (el.getAttribute("src") !== station.url) el.src = station.url;
      setStatus("loading");
      Promise.resolve(el.play()).catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name !== "AbortError" && el.getAttribute("src") === station.url) setStatus("error");
      });
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const resume = () => {
      const s = latest.current;
      if (s.on && !hasSource(player.current)) start(s.station, s.volume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      stop();
      player.current = null;
    };
  }, [start, stop]);

  const toggle = useCallback(() => {
    const s = latest.current;
    const on = !(s.on && hasSource(player.current));
    update((prev) => ({ ...prev, on }));
    if (on) start(s.station, s.volume);
    else stop();
  }, [update, start, stop]);

  const pick = useCallback(
    (index: number) => {
      if (!STATIONS[index]) return;
      update((prev) => ({ ...prev, on: true, station: index }));
      start(index, latest.current.volume);
    },
    [update, start],
  );

  const tune = useCallback((delta: number) => pick(stepStation(latest.current.station, delta)), [pick]);

  const setVolume = useCallback(
    (volume: number) => {
      update((prev) => ({ ...prev, volume }));
      if (player.current) player.current.volume = volume;
    },
    [update],
  );

  return { on: settings.on && status !== "idle", volume: settings.volume, index: settings.station, station: STATIONS[settings.station] ?? (STATIONS[0] as Station), status, toggle, tune, pick, setVolume };
}
