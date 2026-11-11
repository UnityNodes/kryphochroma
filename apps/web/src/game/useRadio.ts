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
  readonly toggle: () => void;
  readonly tune: (delta: number) => void;
  readonly setVolume: (volume: number) => void;
}

export function useRadio(tension: number): RadioControls {
  const [settings, setSettings] = useState<RadioSettings>(() => (typeof window === "undefined" ? DEFAULT_RADIO : loadRadio(storage())));
  const audio = useRef<AudioContext | null>(null);
  const engine = useRef<RadioEngine | null>(null);
  const [armed, setArmed] = useState(false);

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
    if (!settings.on || !armed || typeof AudioContext === "undefined") {
      engine.current?.stop();
      engine.current = null;
      return;
    }
    if (engine.current) return;
    audio.current ??= new AudioContext();
    void audio.current.resume();
    engine.current = createRadioEngine(audio.current, settings.station, settings.volume);
  }, [settings.on, armed, settings.station, settings.volume]);

  useEffect(() => engine.current?.setStation(settings.station), [settings.station]);
  useEffect(() => engine.current?.setVolume(settings.volume), [settings.volume]);
  useEffect(() => engine.current?.setTension(tension), [tension, settings.on, armed]);

  const toggle = useCallback(() => {
    setArmed(true);
    update((s) => ({ ...s, on: !s.on }));
  }, [update]);
  const tune = useCallback((delta: number) => update((s) => ({ ...s, on: true, station: (s.station + delta + STATIONS.length) % STATIONS.length })), [update]);
  const setVolume = useCallback((volume: number) => update((s) => ({ ...s, volume })), [update]);

  return { on: settings.on, volume: settings.volume, station: STATIONS[settings.station] ?? (STATIONS[0] as Station), toggle, tune, setVolume };
}
