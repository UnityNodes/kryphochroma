import { type Object3D, Quaternion, Vector3 } from "three";
import { type FanFrame, type Lie, fanPoint } from "./layout";
import type { FanSpot } from "./targets";

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const qa = new Quaternion();
const qb = new Quaternion();

export const AXIS = { x: X, y: Y, z: Z } as const;

/** A card lying on the table: turned to its yaw, laid flat, then rolled about its long axis. A flip of zero is face up, half a turn is face down. */
export function lieQuat(yaw: number, flip: number, out: Quaternion): Quaternion {
  out.setFromAxisAngle(Y, yaw);
  qa.setFromAxisAngle(X, -Math.PI / 2);
  qb.setFromAxisAngle(Y, flip);
  return out.multiply(qa).multiply(qb);
}

export function setLie(object: Object3D, lie: Lie): void {
  object.position.set(lie.x, lie.y, lie.z);
  lieQuat(lie.yaw, lie.flip, object.quaternion);
}

/** A card held in the fan: leaned back to the player with the fan, turned along its arc, rolled so it shingles on its neighbour, and turned round when it is still sealed. */
export function fanPose(fan: FanFrame, spot: FanSpot, back: number, sealed: boolean, wobble: number, position: Vector3, quaternion: Quaternion): void {
  const at = fanPoint(fan, spot.x, spot.lift, spot.row, back);
  position.set(at.x, at.y, at.z);
  quaternion.setFromAxisAngle(X, -fan.lean);
  qa.setFromAxisAngle(Z, -spot.x / fan.radius + wobble);
  qb.setFromAxisAngle(Y, spot.roll + (sealed ? Math.PI : 0));
  quaternion.multiply(qa).multiply(qb);
}

export function nearYaw(from: number, to: number): number {
  let b = to;
  while (b - from > Math.PI) b -= Math.PI * 2;
  while (b - from < -Math.PI) b += Math.PI * 2;
  return b;
}
