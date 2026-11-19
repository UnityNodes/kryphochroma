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
  [-2.5, 1.55, 6.3, 0.1, 0.15, 1.8, 30, -0.2, 0, 0, -1.0, 0.9, 0, 1, 0.5, 0, 0],
  [1.5, 1.0, 3.3, -1.5, 0.5, -0.7, 30, -0.24, 0, -1.0, -0.4, 1, 0, 1, 0, 0.2, 0.3],
];

/** A phone held upright sees a narrow slice of the table, so it gets shots of its own: the subject sits in the upper middle of a tall frame, the headline goes above it and the copy below. Here the left scrim dims the whole stage and the right one is the frame that keeps the type readable at the top and the bottom. */
const PORTRAIT_ROWS: readonly PoseRow[] = [
  [0, 8.05, 8.8, 0, 0, 0.2, 58, 0, -0.06, 0, 0, 1, 0, 1, 0, -0.3, -0.8],
  [1.88, 1.58, 6.08, 0.2, 0.2, -0.4, 58, 0, 0, 0.3, -0.3, 1, 0, 1, -0.5, 0, 0.1],
  [0, 7.92, 6.68, 0, 0, 0.2, 58, 0, -0.07, 0, 0, 0.12, 0, 1, 0, 0.5, 0],
  [-3.37, 2.76, 5.01, -0.55, 0, 0.75, 58, 0, -0.07, -0.5, 0.5, 1, 0, 1, 0.5, 0, 0],
  [0.38, 1.9, 4.04, -3.1, 0.7, 0.2, 58, 0, -0.07, -2.2, 0, 1, 0, 1, 0, 0, 0.4],
  [0.1, 1.74, 4.36, 3.1, 0.3, -0.2, 58, 0, -0.07, 2.2, -0.1, 1, 0, 1, -0.4, 0, 0],
  [-3.02, 1.83, 7.2, 0.1, 0.15, 1.8, 58, 0, -0.07, 0, -1.0, 0.9, 0, 1, 0.5, 0, 0],
  [2.1, 1.1, 4.1, -1.5, 0.5, -0.7, 58, 0, -0.07, -1.0, -0.4, 1, 0.74, 1, 0, 0.2, 0.3],
];

export interface PoseSet {
  readonly poses: readonly Pose[];
  readonly closing: Pose;
}

export const POSES: readonly Pose[] = SHOT_ROWS.map(toPose);
export const SHOT_COUNT = POSES.length;
export const CLOSING: Pose = toPose([0, 1.5, 10.2, 0, 1.61, 0, 34, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.8]);
export const WIDE: PoseSet = { poses: POSES, closing: CLOSING };
export const PORTRAIT: PoseSet = { poses: PORTRAIT_ROWS.map(toPose), closing: toPose([0, 1.9, 13, 0, 2.5, 0, 58, 0, -0.2, 0, 0, 1, 0, 1, 0, 0, -0.8]) };

const CUT_START = 0.3;
const CUT_END = 0.72;
const HELD = ["tx", "ty", "tz", "fov", "ox", "oy", "lx", "lz", "lamp", "scrimL", "scrimR"] as const satisfies readonly (keyof Frame)[];

function poseIn(poses: readonly Pose[], index: number): Pose {
  const pose = poses[index];
  if (!pose) throw new RangeError(`no camera pose ${index}`);
  return pose;
}

export function poseAt(index: number): Pose {
  return poseIn(POSES, index);
}

export function blankFrame(): Frame {
  return { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 0, ox: 0, oy: 0, lx: 0, lz: 0, lamp: 0, scrimL: 0, scrimR: 0 };
}

function closingFrame(out: Frame, closing: Pose, closeProgress: number): void {
  const drift = closeProgress - 0.5;
  for (const key of HELD) out[key] = closing[key];
  out.px = closing.px + closing.dx * drift;
  out.py = closing.py + closing.dy * drift;
  out.pz = closing.pz + closing.dz * drift;
}

function shotFrame(out: Frame, poses: readonly Pose[], shot: number): void {
  const along = shot - 0.5;
  const index = Math.min(Math.max(Math.floor(along), 0), SHOT_COUNT - 2);
  const part = along - index;
  const cut = part <= 0 ? 0 : easeInOut(seg(part, CUT_START, CUT_END));
  const from = poseIn(poses, index);
  const to = poseIn(poses, index + 1);
  const fromDrift = shot - (index + 0.5);
  const toDrift = shot - (index + 1.5);
  for (const key of HELD) out[key] = mix(from[key], to[key], cut);
  out.px = mix(from.px + from.dx * fromDrift, to.px + to.dx * toDrift, cut);
  out.py = mix(from.py + from.dy * fromDrift, to.py + to.dy * toDrift, cut);
  out.pz = mix(from.pz + from.dz * fromDrift, to.pz + to.dz * toDrift, cut);
}

export function framePose(out: Frame, shot: number, closing: boolean, closeProgress: number, set: PoseSet): void {
  if (closing) closingFrame(out, set.closing, closeProgress);
  else shotFrame(out, set.poses, shot);
}

export function fitFov(fov: number, aspect: number, base: number): number {
  if (aspect >= base) return fov;
  const fitted = (2 * Math.atan((Math.tan((fov * Math.PI) / 360) * base) / aspect) * 180) / Math.PI;
  return fitted > MAX_FOV ? MAX_FOV : fitted;
}
