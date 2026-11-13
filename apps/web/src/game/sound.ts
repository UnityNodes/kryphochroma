export type SoundName = "deal" | "rustle" | "slap" | "mono" | "caught" | "win" | "shuffle";

export const DEFAULT_VOLUME = 0.6;
const MUTE_KEY = "kc-muted";

type Voice = (ctx: AudioContext, out: AudioNode, at: number) => void;

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(ctx: AudioContext, out: AudioNode, at: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(out);
  return gain;
}

function filteredNoise(ctx: AudioContext, out: AudioNode, at: number, type: BiquadFilterType, freq: number, peak: number, decay: number): void {
  const source = noise(ctx, decay + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  source.connect(filter).connect(envelope(ctx, out, at, peak, 0.004, decay));
  source.start(at);
}

function tone(ctx: AudioContext, out: AudioNode, at: number, freq: number, peak: number, decay: number, type: OscillatorType = "triangle"): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.connect(envelope(ctx, out, at, peak, 0.008, decay));
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

const HORN = [233, 294, 349] as const;
const HORN_VIBRATO_HZ = 7;
const HORN_VIBRATO_DEPTH = 5;

function horn(ctx: AudioContext, out: AudioNode, at: number, freq: number, peak: number, decay: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq * 0.94, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + 0.06);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = HORN_VIBRATO_HZ;
  const depth = ctx.createGain();
  depth.gain.value = HORN_VIBRATO_DEPTH;
  vibrato.connect(depth).connect(osc.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  osc.connect(filter).connect(envelope(ctx, out, at, peak, 0.02, decay));
  osc.start(at);
  vibrato.start(at);
  osc.stop(at + decay + 0.1);
  vibrato.stop(at + decay + 0.1);
}

/** A recorded call instead of the browser speech engine, which reads the word flat and differently on every system; the voice comes from a public domain dataset so it needs no notice. */
export const SHOUT_URL = "/sounds/mono.mp3";
export const HORN_AFTER_SHOUT = 0.85;

export const VOICES: Record<SoundName, Voice> = {
  deal: (ctx, out, at) => filteredNoise(ctx, out, at, "highpass", 3500, 0.35, 0.06),
  rustle: (ctx, out, at) => {
    for (let k = 0; k < 3; k++) filteredNoise(ctx, out, at + k * 0.045, "bandpass", 2400 + k * 500, 0.25, 0.07);
  },
  slap: (ctx, out, at) => {
    filteredNoise(ctx, out, at, "lowpass", 1200, 0.8, 0.12);
    tone(ctx, out, at, 110, 0.5, 0.1, "sine");
  },
  mono: (ctx, out, at) => {
    for (const [k, freq] of HORN.entries()) {
      horn(ctx, out, at, freq, 0.16, 0.22);
      horn(ctx, out, at + 0.28, freq * 1.06, 0.2, 0.75 + k * 0.05);
    }
  },
  caught: (ctx, out, at) => {
    tone(ctx, out, at, 880, 0.3, 0.12, "square");
    tone(ctx, out, at + 0.14, 587, 0.3, 0.12, "square");
    tone(ctx, out, at + 0.28, 392, 0.35, 0.3, "square");
  },
  win: (ctx, out, at) => {
    [523, 659, 784, 1047].forEach((f, k) => tone(ctx, out, at + k * 0.11, f, 0.4, 0.3));
  },
  shuffle: (ctx, out, at) => {
    for (let k = 0; k < 8; k++) filteredNoise(ctx, out, at + k * 0.035, "highpass", 3000, 0.2, 0.03);
  },
};

export function loadMuted(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(storage: Pick<Storage, "setItem"> | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    return;
  }
}

export const SOUND_FOR_ICON: Record<string, SoundName | undefined> = {
  play: "slap",
  draw: "rustle",
  mono: "mono",
  caught: "caught",
  trophy: "win",
  shuffle: "shuffle",
  pass: "deal",
};
