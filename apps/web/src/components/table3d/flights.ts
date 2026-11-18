import { Quaternion, Vector3 } from "three";
import { easeInOut, easeOut, mix, seg, smooth } from "../landing/ease";
import type { CardBody } from "./cards";
import { CARD_H } from "./constants";
import type { Lie } from "./layout";
import { AXIS, lieQuat, nearYaw, setLie } from "./pose";

export const RISE = CARD_H * 1.05;
export const SLIDE_TOP = 0.6;
const ROW_ARC = 0.32;
const DEAL_ARC = 0.55;
const PLAY_ARC = 0.95;
const TURN_ARC = 0.62;
const LEAVE = CARD_H * 0.9;

const scratch = { v: new Vector3(), q1: new Quaternion(), q2: new Quaternion() };

interface FlightOptions {
  readonly dur: number;
  readonly delay?: number;
  readonly done?: () => void;
}

function fly(body: CardBody, options: FlightOptions, fn: (body: CardBody, p: number) => void, init?: (body: CardBody) => void): void {
  body.flight = { t: -(options.delay ?? 0), dur: options.dur, fn, init, done: options.done, started: false };
}

function lying(body: CardBody, x: number, y: number, z: number, yaw: number, flip: number): void {
  body.group.position.set(x, y, z);
  lieQuat(yaw, flip, body.group.quaternion);
}

/** Off the deck to a place in a row on the felt: a low hop, sealed all the way. */
export function flightDeckToRow(body: CardBody, from: Lie, options: FlightOptions): void {
  fly(
    body,
    options,
    (c, p) => {
      const to = c.lie;
      const e = easeOut(p);
      lying(c, mix(from.x, to.x, e), mix(from.y, to.y, smooth(e)) + ROW_ARC * Math.sin(Math.PI * e), mix(from.z, to.z, e), mix(from.yaw, nearYaw(from.yaw, to.yaw), e), mix(from.flip, to.flip, e));
    },
    (c) => setLie(c.group, from),
  );
}

/** The first card of a round: off the deck, turned over in the air, onto the pile. */
export function flightDeckToPile(body: CardBody, from: Lie, options: FlightOptions): void {
  fly(
    body,
    options,
    (c, p) => {
      const to = c.lie;
      const e = easeOut(p);
      const turn = easeInOut(seg(p, 0.12, 0.86));
      lying(c, mix(from.x, to.x, e), mix(from.y, to.y, smooth(e)) + DEAL_ARC * Math.sin(Math.PI * turn), mix(from.z, to.z, e), mix(from.yaw, to.yaw, e), mix(from.flip, to.flip, turn));
    },
    (c) => setLie(c.group, from),
  );
}

/** A rival's card leaves the row the way a hand would take it: it slides out along the felt in its own plane, and only then lifts and turns over in the air. Rivals play the end card of their row: nothing lies on it, so a short slide frees it. A veiled card makes the same trip without turning. */
export function flightRowToPile(body: CardBody, from: Lie, options: FlightOptions): void {
  fly(
    body,
    options,
    (c, p) => {
      const to = c.lie;
      const slide = smooth(seg(p, 0, 0.34)) * SLIDE_TOP;
      const x = from.x - Math.sin(from.yaw) * slide;
      const z = from.z - Math.cos(from.yaw) * slide;
      const m = smooth(seg(p, 0.28, 1));
      lying(c, mix(x, to.x, m), mix(from.y, to.y, m) + Math.sin(Math.PI * m) * PLAY_ARC, mix(z, to.z, m), mix(from.yaw, nearYaw(from.yaw, to.yaw), m), mix(from.flip, to.flip, easeInOut(seg(m, 0.1, 0.8))));
    },
    (c) => setLie(c.group, from),
  );
}

/** A card on the felt turns over where it lies, lifted clear of the table while it turns. */
export function flightTurn(body: CardBody, from: Lie, options: FlightOptions): void {
  fly(body, options, (c, p) => {
    const to = c.lie;
    const e = smooth(p);
    lying(c, mix(from.x, to.x, e), mix(from.y, to.y, e) + Math.sin(Math.PI * e) * TURN_ARC, mix(from.z, to.z, e), mix(from.yaw, to.yaw, e), mix(from.flip, to.flip, easeInOut(seg(p, 0.12, 0.88))));
  });
}

export interface ArriveOptions extends FlightOptions {
  readonly from: Lie | null;
  readonly rise: number;
  readonly arc: number;
}

/** Into the fan from above: every arrival ends by sliding down the slot's own plane, so a card never passes through the ones already held. A card that is already in the fan first rises out of it the same way, which is how a card moves to another place in the hand and how a decrypted card turns over. */
export function flightArrive(body: CardBody, options: ArriveOptions): void {
  const p0 = new Vector3();
  const q0 = new Quaternion();
  const up0 = new Vector3();
  const top = new Vector3();
  const upHome = new Vector3();
  const fromFan = options.from === null;
  fly(
    body,
    options,
    (c, p) => {
      const a = fromFan ? smooth(seg(p, 0, 0.24)) : 0;
      const b = seg(p, fromFan ? 0.2 : 0, 0.74);
      const d = smooth(seg(p, 0.7, 1));
      upHome.set(0, 1, 0).applyQuaternion(c.home.q);
      top.copy(c.home.p).addScaledVector(upHome, options.rise);
      c.group.position.copy(p0).addScaledVector(up0, RISE * a).lerp(top, easeInOut(b));
      c.group.position.y += Math.sin(Math.PI * b) * options.arc;
      c.group.position.addScaledVector(upHome, -options.rise * d);
      c.group.quaternion.copy(q0).slerp(c.home.q, easeInOut(seg(b, 0.05, 0.85)));
    },
    (c) => {
      if (options.from) setLie(c.group, options.from);
      p0.copy(c.group.position);
      q0.copy(c.group.quaternion);
      up0.set(0, 1, 0).applyQuaternion(q0);
    },
  );
}

/** Out of the fan to the pile: up along the card's own plane first, then a lob whose first direction is still that plane, high enough to clear a second row standing behind. */
export function flightFanToPile(body: CardBody, tall: boolean, spin: number, options: FlightOptions): void {
  const p0 = new Vector3();
  const q0 = new Quaternion();
  const up = new Vector3();
  const control = new Vector3();
  fly(
    body,
    options,
    (c, p) => {
      const a = smooth(seg(p, 0, 0.26));
      const m = seg(p, 0.2, 1);
      const start = scratch.v.copy(p0).addScaledVector(up, LEAVE * a);
      if (m <= 0) {
        c.group.position.copy(start);
        c.group.quaternion.copy(q0);
        return;
      }
      const t = smooth(m);
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * t * (1 - t);
      const w2 = t * t;
      c.group.position.set(start.x * w0 + control.x * w1 + c.home.p.x * w2, start.y * w0 + control.y * w1 + c.home.p.y * w2, start.z * w0 + control.z * w1 + c.home.p.z * w2);
      scratch.q1.copy(q0).slerp(c.home.q, easeInOut(seg(m, 0.08, 0.82)));
      scratch.q2.setFromAxisAngle(AXIS.y, spin * (1 - easeOut(m)) * seg(m, 0, 0.15));
      c.group.quaternion.copy(scratch.q2).multiply(scratch.q1);
    },
    (c) => {
      p0.copy(c.group.position);
      q0.copy(c.group.quaternion);
      up.set(0, 1, 0).applyQuaternion(q0);
      control.copy(p0).addScaledVector(up, LEAVE + (tall ? 2.7 : 1.2));
    },
  );
}
