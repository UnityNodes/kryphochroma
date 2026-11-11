"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOLUME, type SoundName, VOICES, loadMuted, saveMuted } from "./sound";

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export interface SoundControls {
  readonly muted: boolean;
  readonly toggle: () => void;
  readonly play: (name: SoundName) => void;
}

export function useSound(): SoundControls {
  const [muted, setMuted] = useState(() => (typeof window === "undefined" ? false : loadMuted(storage())));
  const ctx = useRef<{ audio: AudioContext; out: GainNode } | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (ctx.current || typeof AudioContext === "undefined") return;
      const audio = new AudioContext();
      const out = audio.createGain();
      out.gain.value = DEFAULT_VOLUME;
      out.connect(audio.destination);
      ctx.current = { audio, out };
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void ctx.current?.audio.close();
      ctx.current = null;
    };
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      const current = ctx.current;
      if (muted || !current) return;
      VOICES[name](current.audio, current.out, current.audio.currentTime + 0.01);
    },
    [muted],
  );

  const toggle = useCallback(() => {
    setMuted((value) => {
      saveMuted(storage(), !value);
      return !value;
    });
  }, []);

  return { muted, toggle, play };
}
