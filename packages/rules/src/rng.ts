export interface RngStep {
  readonly value: number;
  readonly next: number;
}

export function nextRandom(seed: number): RngStep {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

export function randomInt(seed: number, bound: number): RngStep {
  const step = nextRandom(seed);
  return { value: Math.floor(step.value * bound), next: step.next };
}

export interface Shuffled<T> {
  readonly items: T[];
  readonly next: number;
}

export function shuffle<T>(items: readonly T[], seed: number): Shuffled<T> {
  const out = [...items];
  let rng = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    const step = randomInt(rng, i + 1);
    rng = step.next;
    const j = step.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { items: out, next: rng };
}
