import { MAX_FOV } from "./constants";
import { easeInOut, mix, seg } from "./ease";

export interface Frame {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  ox: number;
  oy: number;
  lx: number;
  lz: number;
  lamp: number;
  scrimL: number;
  scrimR: number;
}

export interface Pose extends Readonly<Frame> {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

type PoseRow = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

function toPose([px, py, pz, tx, ty, tz, fov, ox, oy, lx, lz, lamp, scrimL, scrimR, dx, dy, dz]: PoseRow): Pose {
  return { px, py, pz, tx, ty, tz, fov, ox, oy, lx, lz, lamp, scrimL, scrimR, dx, dy, dz };
}

const SHOT_ROWS: readonly PoseRow[] = [
  [0, 4.35, 10.6, 0, 0, 0.7, 30, 0.13, 0.08, 0, 0, 1, 0.3, 0, 0, -0.5, -1.2],
  [1.6, 1.35, 5.0, 0.2, 0.2, -0.4, 30, -0.2, 0, 0.3, -0.3, 1, 0, 1, -0.5, 0, 0.1],
  [0, 6.6, 5.6, 0, 0, 0.2, 30, 0, 0, 0, 0, 0.12, 0.45, 0.45, 0, 0.5, 0],
  [-2.9, 2.3, 4.3, -0.55, 0, 0.75, 30, 0.2, 0, -0.5, 0.5, 1, 1, 0, 0.5, 0, 0],
  [-0.2, 1.7, 3.4, -3.1, 0.7, 0.2, 30, -0.16, 0, -2.2, 0, 1, 0, 1, 0, 0, 0.4],
  [0.6, 1.5, 3.6, 3.1, 0.3, -0.2, 30, 0.14, 0, 2.2, -0.1, 1, 1, 0, -0.4, 0, 0],
  [-2.6, 1.3, 7.4, 0.1, 0.15, 1.8, 30, -0.2, 0, 0, -1.0, 0.9, 0, 1, 0.5, 0, 0],
  [1.5, 1.0, 3.3, -1.5, 0.5, -0.7, 30, -0.24, 0, -1.0, -0.4, 1, 0, 1, 0, 0.2, 0.3],
];

export const POSES: readonly Pose[] = SHOT_ROWS.map(toPose);
export const SHOT_COUNT = POSES.length;
export const CLOSING: Pose = toPose([0, 1.5, 10.2, 0, 1.61, 0, 34, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.8]);

const CUT_START = 0.3;
const CUT_END = 0.72;
const HELD = ["tx", "ty", "tz", "fov", "ox", "oy", "lx", "lz", "lamp", "scrimL", "scrimR"] as const satisfies readonly (keyof Frame)[];

export function poseAt(index: number): Pose {
  const pose = POSES[index];
  if (!pose) throw new RangeError(`no camera pose ${index}`);
  return pose;
}

export function blankFrame(): Frame {
  return { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 0, ox: 0, oy: 0, lx: 0, lz: 0, lamp: 0, scrimL: 0, scrimR: 0 };
}

function closingFrame(out: Frame, closeProgress: number): void {
  const drift = closeProgress - 0.5;
  for (const key of HELD) out[key] = CLOSING[key];
  out.px = CLOSING.px + CLOSING.dx * drift;
  out.py = CLOSING.py + CLOSING.dy * drift;
  out.pz = CLOSING.pz + CLOSING.dz * drift;
}

function shotFrame(out: Frame, shot: number): void {
  const along = shot - 0.5;
  const index = Math.min(Math.max(Math.floor(along), 0), SHOT_COUNT - 2);
  const part = along - index;
  const cut = part <= 0 ? 0 : easeInOut(seg(part, CUT_START, CUT_END));
  const from = poseAt(index);
  const to = poseAt(index + 1);
  const fromDrift = shot - (index + 0.5);
  const toDrift = shot - (index + 1.5);
  for (const key of HELD) out[key] = mix(from[key], to[key], cut);
  out.px = mix(from.px + from.dx * fromDrift, to.px + to.dx * toDrift, cut);
  out.py = mix(from.py + from.dy * fromDrift, to.py + to.dy * toDrift, cut);
  out.pz = mix(from.pz + from.dz * fromDrift, to.pz + to.dz * toDrift, cut);
}

export function framePose(out: Frame, shot: number, closing: boolean, closeProgress: number, band: boolean): void {
  if (closing) closingFrame(out, closeProgress);
  else shotFrame(out, shot);
  if (band) {
    out.ox = 0;
    out.oy = 0;
    out.scrimL = 0;
    out.scrimR = 0;
  }
}

export function fitFov(fov: number, aspect: number, base: number): number {
  if (aspect >= base) return fov;
  const fitted = (2 * Math.atan((Math.tan((fov * Math.PI) / 360) * base) / aspect) * 180) / Math.PI;
  return fitted > MAX_FOV ? MAX_FOV : fitted;
}
