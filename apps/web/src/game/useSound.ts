"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOLUME, SHOUT_TEXT, type SoundName, VOICES, loadMuted, saveMuted } from "./sound";

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

const SHOUT_RATE = 0.75;
const SHOUT_PITCH = 1.4;

/** The call is spoken by the browser's own speech engine, so there is no recorded voice to license; browsers without it just play the horn. */
function shout(text: string): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const line = new SpeechSynthesisUtterance(text);
    line.rate = SHOUT_RATE;
    line.pitch = SHOUT_PITCH;
    line.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
  } catch {
    return;
  }
}

export function useSound(): SoundControls {
  const [muted, setMuted] = useState(() => (typeof window === "undefined" ? false : loadMuted(storage())));
  const ctx = useRef<{ audio: AudioContext; out: GainNode } | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (ctx.current || typeof AudioContext === "undefined") return;
      try {
        const audio = new AudioContext();
        const out = audio.createGain();
        out.gain.value = DEFAULT_VOLUME;
        out.connect(audio.destination);
        ctx.current = { audio, out };
      } catch {
        ctx.current = null;
      }
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
      if (muted) return;
      if (name === "mono") shout(SHOUT_TEXT);
      const current = ctx.current;
      if (!current) return;
      try {
        VOICES[name](current.audio, current.out, current.audio.currentTime + 0.01);
      } catch {
        return;
      }
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
