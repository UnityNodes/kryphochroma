import { HAND_SLOTS } from "@kryphochroma/rules";

const FROZEN = ["idle", "deal", "play", "veil", "draw", "sealed", "reveal", "rival", "rivaldraw"] as const;
const FREEZE_MIDWAY = 0.5;

export type FrozenName = (typeof FROZEN)[number];

/** Stills of states in the middle of an animation can only be taken by pinning them: this server draws WebGL in software, far too slowly to catch a frame in passing. A test page sets `window.__kcTable3d` and the table reads it every frame. `state` and `measure` are put there by the table for the test to call. */
export interface TableDebug {
  readonly hq?: unknown;
  readonly freeze?: unknown;
  readonly hover?: unknown;
  readonly camera?: unknown;
  readonly lift?: unknown;
  readonly bare?: unknown;
  readonly hand?: unknown;
  state?: () => unknown;
  measure?: (frames: number) => number;
}

declare global {
  interface Window {
    __kcTable3d?: TableDebug;
  }
}

export interface FrozenMoment {
  readonly name: FrozenName;
  readonly at: number;
}

export interface DebugCamera {
  readonly p: readonly [number, number, number];
  readonly t: readonly [number, number, number];
  readonly fov: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function triple(value: unknown): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value.map(numberOrNull);
  return x === null || y === null || z === null || x === undefined || y === undefined || z === undefined ? null : [x, y, z];
}

export function readDebug(host: { readonly __kcTable3d?: unknown }): TableDebug | undefined {
  const value = host.__kcTable3d;
  return typeof value === "object" && value !== null ? value : undefined;
}

export function forcesHq(debug: TableDebug | undefined): boolean {
  return debug?.hq === true;
}

export function parseFreeze(debug: TableDebug | undefined): FrozenMoment | null {
  if (typeof debug?.freeze !== "string") return null;
  const match = /^([a-z]+)([\d.]*)$/.exec(debug.freeze);
  const name = FROZEN.find((known) => known === match?.[1]);
  if (!name) return null;
  const at = match?.[2] ? Number.parseFloat(match[2]) : Number.NaN;
  return { name, at: Number.isFinite(at) ? at : FREEZE_MIDWAY };
}

export function forcedHover(debug: TableDebug | undefined): number | null {
  return numberOrNull(debug?.hover);
}

export function forcedLift(debug: TableDebug | undefined): number {
  return numberOrNull(debug?.lift) ?? 1;
}

export function hidesFurniture(debug: TableDebug | undefined): boolean {
  return debug?.bare === true;
}

export function forcedCamera(debug: TableDebug | undefined): DebugCamera | null {
  const value = debug?.camera;
  if (typeof value !== "object" || value === null) return null;
  const { p, t, fov } = value as { p?: unknown; t?: unknown; fov?: unknown };
  const from = triple(p);
  const to = triple(t);
  return from && to ? { p: from, t: to, fov: numberOrNull(fov) } : null;
}

/** A practice round can be opened with a long hand, to look at a crowded fan without playing for it. */
export function seededHand(debug: TableDebug | undefined): number | null {
  const size = numberOrNull(debug?.hand);
  return size !== null && Number.isInteger(size) && size >= 1 && size <= HAND_SLOTS ? size : null;
}
