import { type RadioEvent, STATIONS, STEPS, type Station, clampTension, midiToHz, stepEvents, stepSeconds } from "./radio";

const LOOKAHEAD_S = 0.2;
const TICK_MS = 50;
const TUNE_S = 0.45;
const RAMP_S = 0.08;

export interface RadioEngine {
  readonly setStation: (index: number) => void;
  readonly setVolume: (volume: number) => void;
  readonly setTension: (tension: number) => void;
  readonly stop: () => void;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ctx: AudioContext, out: AudioNode, at: number, peak: number, attack: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + length);
  gain.connect(out);
  return gain;
}

function noiseHit(ctx: AudioContext, buffer: AudioBuffer, out: AudioNode, at: number, type: BiquadFilterType, freq: number, peak: number, length: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  source.connect(filter).connect(envelope(ctx, out, at, peak, 0.003, length));
  source.start(at);
  source.stop(at + length + 0.05);
}

function osc(ctx: AudioContext, out: AudioNode, at: number, wave: OscillatorType, hz: number, peak: number, attack: number, length: number, cutoff?: number): void {
  const node = ctx.createOscillator();
  node.type = wave;
  node.frequency.setValueAtTime(hz, at);
  const env = envelope(ctx, out, at, peak, attack, length);
  if (cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    node.connect(filter).connect(env);
  } else node.connect(env);
  node.start(at);
  node.stop(at + attack + length + 0.05);
}

function play(ctx: AudioContext, noise: AudioBuffer, out: AudioNode, station: Station, event: RadioEvent, at: number, step: number): void {
  const length = event.steps * step;
  switch (event.voice) {
    case "kick": {
      const node = ctx.createOscillator();
      node.frequency.setValueAtTime(120, at);
      node.frequency.exponentialRampToValueAtTime(42, at + 0.12);
      node.connect(envelope(ctx, out, at, event.gain, 0.002, 0.22));
      node.start(at);
      node.stop(at + 0.3);
      return;
    }
    case "snare":
      noiseHit(ctx, noise, out, at, "bandpass", 1800, event.gain, 0.14);
      return;
    case "hat":
      noiseHit(ctx, noise, out, at, "highpass", 7000, event.gain, 0.04);
      return;
    case "bass":
      osc(ctx, out, at, station.bassWave, midiToHz(event.midi), event.gain, 0.01, length, 600);
      return;
    case "pad":
      osc(ctx, out, at, station.padWave, midiToHz(event.midi), event.gain, 0.4, length, station.padCutoff);
      osc(ctx, out, at, station.padWave, midiToHz(event.midi) * 1.004, event.gain * 0.6, 0.4, length, station.padCutoff);
      return;
    case "lead":
      osc(ctx, out, at, station.leadWave, midiToHz(event.midi), event.gain, 0.005, length, 3200);
  }
}

export function createRadioEngine(ctx: AudioContext, stationIndex: number, volume: number): RadioEngine {
  const noise = noiseBuffer(ctx, 1);
  const master = ctx.createGain();
  master.gain.value = volume;
  const air = ctx.createBiquadFilter();
  air.type = "lowpass";
  air.frequency.value = 9000;
  const glue = ctx.createDynamicsCompressor();
  air.connect(glue).connect(master).connect(ctx.destination);
  let station = STATIONS[stationIndex] ?? (STATIONS[0] as Station);
  let tension = 0;
  let bar = 0;
  let step = 0;
  let next = ctx.currentTime + 0.1;

  const tick = () => {
    while (next < ctx.currentTime + LOOKAHEAD_S) {
      const seconds = stepSeconds(station, tension);
      const swing = step % 2 === 1 ? seconds * station.swing : 0;
      for (const event of stepEvents(station, bar, step, tension)) play(ctx, noise, air, station, event, next + swing, seconds);
      next += seconds;
      step = (step + 1) % STEPS;
      if (step === 0) bar += 1;
    }
  };
  const timer = setInterval(tick, TICK_MS);
  tick();

  return {
    setStation: (index) => {
      station = STATIONS[index] ?? station;
      bar = 0;
      step = 0;
      const at = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const sweep = ctx.createBiquadFilter();
      sweep.type = "bandpass";
      sweep.frequency.setValueAtTime(400, at);
      sweep.frequency.exponentialRampToValueAtTime(5000, at + TUNE_S);
      source.connect(sweep).connect(envelope(ctx, master, at, 0.25, 0.02, TUNE_S));
      source.start(at);
      source.stop(at + TUNE_S + 0.1);
      next = at + TUNE_S;
    },
    setVolume: (value) => master.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), ctx.currentTime, RAMP_S),
    setTension: (value) => {
      tension = clampTension(value);
    },
    stop: () => {
      clearInterval(timer);
      master.gain.setTargetAtTime(0, ctx.currentTime, RAMP_S);
      setTimeout(() => master.disconnect(), 400);
    },
  };
}
