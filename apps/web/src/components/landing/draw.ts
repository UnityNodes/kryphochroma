import { CARD_H, CARD_T, DECK, DECK_TOP } from "./constants";
import { easeInOut, mix, seg, smooth } from "./ease";
import type { Slot } from "./layout";

export const DRAW_TILT = 1;
export const DRAW_COUNT = 3;
const DRAW_START = 7.18;
const DRAW_STEP = 0.2;
const DRAW_SPAN = 0.32;
const RISE_END = 0.3;
const TRAVEL_START = 0.38;
const CLEARANCE = 0.06;
const ARC = 0.14;

export interface DrawPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly travel: number;
}

export function drawProgress(order: number, shot: number): number {
  const start = DRAW_START + order * DRAW_STEP;
  return easeInOut(seg(shot, start, start + DRAW_SPAN));
}

export function deckLeft(shot: number): number {
  let left = 0;
  for (let order = 0; order < DRAW_COUNT; order++) if (drawProgress(order, shot) > 0) left++;
  return left;
}

/** The deck shot looks along the table almost level with the top of the deck, so a card that slides off flat is an edge-on sliver and seems to appear out of nowhere at its seat. It first rises clear of the deck and leans its sealed back toward the camera, and only then travels. */
export function drawPose(p: number, to: Slot, toY: number, revealYaw: number): DrawPose {
  const rise = smooth(seg(p, 0, RISE_END));
  const travel = smooth(seg(p, TRAVEL_START, 1));
  const settle = (1 - travel) * (1 - travel);
  const tilt = DRAW_TILT * rise * settle;
  const lifted = DECK_TOP + CARD_T * 1.5 + ((CARD_H / 2) * Math.sin(DRAW_TILT) + CLEARANCE) * rise;
  return {
    x: mix(DECK.x, to.x, travel),
    y: mix(lifted, toY, easeInOut(travel)) + Math.sin(Math.PI * travel) * ARC,
    z: mix(DECK.z, to.z, travel),
    yaw: mix(mix(DECK.yaw, revealYaw, rise), to.yaw, travel),
    tilt,
    travel,
  };
}
