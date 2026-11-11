import type { PublicState } from "@kryphochroma/rules";

export type RadioVoice = "kick" | "snare" | "hat" | "bass" | "pad" | "lead";

export interface RadioEvent {
  readonly voice: RadioVoice;
  readonly midi: number;
  readonly gain: number;
  readonly steps: number;
}

export interface Station {
  readonly id: string;
  readonly name: string;
  readonly freq: string;
  readonly bpm: number;
  readonly swing: number;
  readonly root: number;
  readonly chords: readonly (readonly number[])[];
  readonly kick: string;
  readonly snare: string;
  readonly hat: string;
  readonly bass: string;
  readonly bassWave: OscillatorType;
  readonly padWave: OscillatorType;
  readonly padCutoff: number;
  readonly leadWave: OscillatorType;
  readonly leadScale: readonly number[] | "arp";
  readonly leadDensity: number;
}

export const STEPS = 16;
export const MAX_TENSION = 1;
const TENSION_TEMPO = 0.12;

export const STATIONS: readonly Station[] = [
  {
    id: "felt",
    name: "Felt FM",
    freq: "88.4",
    bpm: 76,
    swing: 0.14,
    root: 57,
    chords: [
      [0, 3, 7, 10, 14],
      [-4, 0, 3, 7],
      [3, 7, 10, 14],
      [-2, 2, 5, 7],
    ],
    kick: "x.....x...x.....",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    bass: "0.....0...2.....",
    bassWave: "triangle",
    padWave: "triangle",
    padCutoff: 900,
    leadWave: "sine",
    leadScale: [0, 3, 5, 7, 10],
    leadDensity: 0.16,
  },
  {
    id: "cipher",
    name: "Cipher Wave",
    freq: "101.7",
    bpm: 104,
    swing: 0,
    root: 52,
    chords: [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
    ],
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    bass: "0.0.0.0.0.0.0.0.",
    bassWave: "sawtooth",
    padWave: "sawtooth",
    padCutoff: 1400,
    leadWave: "square",
    leadScale: "arp",
    leadDensity: 0.55,
  },
  {
    id: "velvet",
    name: "Velvet Lounge",
    freq: "94.2",
    bpm: 96,
    swing: 0.22,
    root: 50,
    chords: [
      [0, 3, 7, 10],
      [5, 9, 12, 15],
      [-2, 2, 5, 9],
      [-5, -1, 2, 5],
    ],
    kick: "x.........x.....",
    snare: "....x.......x...",
    hat: "x..xx..xx..xx..x",
    bass: "0...1...2...3...",
    bassWave: "sine",
    padWave: "sine",
    padCutoff: 2200,
    leadWave: "triangle",
    leadScale: [0, 2, 3, 5, 7, 9, 10],
    leadDensity: 0.12,
  },
];

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function clampTension(tension: number): number {
  if (!Number.isFinite(tension)) return 0;
  return Math.min(MAX_TENSION, Math.max(0, tension));
}

export function stepSeconds(station: Station, tension: number): number {
  return 60 / (station.bpm * (1 + TENSION_TEMPO * clampTension(tension))) / 4;
}

function chance(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const hit = (pattern: string, step: number): boolean => pattern[step % pattern.length] === "x";

export function stepEvents(station: Station, bar: number, step: number, tension: number): RadioEvent[] {
  const t = clampTension(tension);
  const chord = station.chords[bar % station.chords.length] ?? [0];
  const seed = bar * STEPS + step;
  const events: RadioEvent[] = [];
  if (hit(station.kick, step)) events.push({ voice: "kick", midi: 0, gain: 0.9, steps: 2 });
  if (hit(station.snare, step)) events.push({ voice: "snare", midi: 0, gain: 0.45, steps: 2 });
  if (hit(station.hat, step)) events.push({ voice: "hat", midi: 0, gain: 0.22, steps: 1 });
  else if (t >= 0.5 && step % 2 === 1) events.push({ voice: "hat", midi: 0, gain: 0.12 * t, steps: 1 });
  if (step === 0) events.push(...chord.map((n) => ({ voice: "pad" as const, midi: station.root + n, gain: 0.16 / chord.length, steps: STEPS })));
  const bassIndex = station.bass[step];
  if (bassIndex !== undefined && bassIndex !== ".") events.push({ voice: "bass", midi: station.root - 12 + (chord[Number(bassIndex) % chord.length] ?? 0), gain: 0.5, steps: 2 });
  if (chance(seed * 7 + station.root) < station.leadDensity * (1 + t)) {
    const scale = station.leadScale;
    const note = scale === "arp" ? (chord[step % chord.length] ?? 0) + 12 : (scale[Math.floor(chance(seed * 13 + 5) * scale.length)] ?? 0) + 12;
    events.push({ voice: "lead", midi: station.root + note, gain: 0.14, steps: scale === "arp" ? 1 : 3 });
  }
  return events;
}

export function tableTension(pub: PublicState, me: number): number {
  if (pub.stage !== "Playing" && pub.stage !== "AwaitChallenge") return 0;
  if (pub.seats.some((seat) => seat.handSize === 1) || pub.drawFour !== null || pub.veil !== null) return MAX_TENSION;
  return pub.turn === me ? 0.5 : 0.2;
}
