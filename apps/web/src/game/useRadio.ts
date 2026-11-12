"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STATIONS, type Station } from "./radio";
import { type RadioEngine, createRadioEngine } from "./radioEngine";
import { DEFAULT_RADIO, type RadioSettings, loadRadio, saveRadio } from "./radioSettings";

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export interface RadioControls {
  readonly on: boolean;
  readonly volume: number;
  readonly station: Station;
  readonly unavailable: boolean;
  readonly toggle: () => void;
  readonly tune: (delta: number) => void;
  readonly setVolume: (volume: number) => void;
}

export function useRadio(tension: number): RadioControls {
  const [settings, setSettings] = useState<RadioSettings>(() => (typeof window === "undefined" ? DEFAULT_RADIO : loadRadio(storage())));
  const audio = useRef<AudioContext | null>(null);
  const engine = useRef<RadioEngine | null>(null);
  const [armed, setArmed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  /** Browsers with audio fingerprinting guards or no Web Audio can throw from any node call; the radio is extra, so a failure turns it off instead of taking the table down. */
  const safely = useCallback((task: () => void) => {
    try {
      task();
    } catch {
      engine.current = null;
      setUnavailable(true);
    }
  }, []);

  const update = useCallback((change: (s: RadioSettings) => RadioSettings) => {
    setSettings((s) => {
      const next = change(s);
      saveRadio(storage(), next);
      return next;
    });
  }, []);

  useEffect(() => {
    const arm = () => setArmed(true);
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    const onVisible = () => {
      const ctx = audio.current;
      if (!ctx) return;
      void (document.hidden ? ctx.suspend() : ctx.resume());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      document.removeEventListener("visibilitychange", onVisible);
      engine.current?.stop();
      engine.current = null;
      void audio.current?.close();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    if (!settings.on || !armed || unavailable || typeof AudioContext === "undefined") {
      safely(() => engine.current?.stop());
      engine.current = null;
      return;
    }
    if (engine.current) return;
    safely(() => {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => undefined);
      engine.current = createRadioEngine(audio.current, settings.station, settings.volume);
    });
  }, [settings.on, armed, unavailable, settings.station, settings.volume, safely]);

  useEffect(() => safely(() => engine.current?.setStation(settings.station)), [settings.station, safely]);
  useEffect(() => safely(() => engine.current?.setVolume(settings.volume)), [settings.volume, safely]);
  useEffect(() => safely(() => engine.current?.setTension(tension)), [tension, settings.on, armed, safely]);

  const toggle = useCallback(() => {
    setArmed(true);
    update((s) => ({ ...s, on: !s.on }));
  }, [update]);
  const tune = useCallback((delta: number) => update((s) => ({ ...s, on: true, station: (s.station + delta + STATIONS.length) % STATIONS.length })), [update]);
  const setVolume = useCallback((volume: number) => update((s) => ({ ...s, volume })), [update]);

  return { on: settings.on && !unavailable, volume: settings.volume, station: STATIONS[settings.station] ?? (STATIONS[0] as Station), unavailable, toggle, tune, setVolume };
}
