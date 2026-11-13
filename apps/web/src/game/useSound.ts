"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOLUME, HORN_AFTER_SHOUT, SHOUT_URL, type SoundName, VOICES, loadMuted, saveMuted } from "./sound";

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
  const shoutBuffer = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (ctx.current || typeof AudioContext === "undefined") return;
      try {
        const audio = new AudioContext();
        const out = audio.createGain();
        out.gain.value = DEFAULT_VOLUME;
        out.connect(audio.destination);
        ctx.current = { audio, out };
        void fetch(SHOUT_URL)
          .then((res) => res.arrayBuffer())
          .then((data) => audio.decodeAudioData(data))
          .then((buffer) => {
            shoutBuffer.current = buffer;
          })
          .catch(() => undefined);
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
      const current = ctx.current;
      if (!current) return;
      try {
        const at = current.audio.currentTime + 0.01;
        const buffer = name === "mono" ? shoutBuffer.current : null;
        if (buffer) {
          const voice = current.audio.createBufferSource();
          voice.buffer = buffer;
          voice.connect(current.out);
          voice.start(at);
        }
        VOICES[name](current.audio, current.out, buffer ? at + buffer.duration * HORN_AFTER_SHOUT : at);
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
