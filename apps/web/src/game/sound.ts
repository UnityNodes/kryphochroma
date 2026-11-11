export type SoundName = "deal" | "rustle" | "slap" | "mono" | "win" | "shuffle";

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
    tone(ctx, out, at, 660, 0.35, 0.14, "square");
    tone(ctx, out, at + 0.12, 990, 0.35, 0.22, "square");
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
  trophy: "win",
  shuffle: "shuffle",
  pass: "deal",
};
