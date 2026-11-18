export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function seg(t: number, from: number, to: number): number {
  return clamp01((t - from) / (to - from));
}

export function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

export function easeInOut(x: number): number {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easeOut(x: number): number {
  const y = 1 - x;
  return 1 - y * y * y;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
