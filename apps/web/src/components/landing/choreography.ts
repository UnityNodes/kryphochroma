import { place } from "./cards";
import {
  CARD_H,
  CARD_T,
  DEAL_GAP,
  DEAL_ORDER_STEP,
  DECK,
  DECK_TOP,
  DRAWN_SLOT,
  HAND_ROLL,
  HAND_SIZE,
  HAND_Y,
  INTRO,
  NUDGE,
  PEEK_SEAT,
  PEEK_SLOT,
  PILE,
  PLAYED_SLOT,
  RIVAL_ROLL,
  RIVAL_Y,
  SEATS,
  SLIDE,
  SONAR_SEAT,
  SPYGLASS_SHOT,
  SPYGLASS_SLOT,
  VEIL,
  VEILED_SLOT,
} from "./constants";
import { easeInOut, easeOut, mix, seg, smooth } from "./ease";
import { type Slot, handSlot, seatSlot } from "./layout";
import { poseAt } from "./pose";
import type { CardRig, Rig } from "./state";

const PI = Math.PI;
const DEAL_START = 0.05;
const HAND_SEAT = SEATS.length;

function peekYaw(): number {
  const slot = { x: 0, z: 0, yaw: 0 };
  seatSlot(SEATS[PEEK_SEAT], PEEK_SLOT, slot);
  const camera = poseAt(SPYGLASS_SHOT);
  return Math.atan2(-(camera.px - slot.x), -(camera.pz - slot.z));
}

const PEEK_YAW = peekYaw();

function dealStart(slot: number, seat: number): number {
  return DEAL_START + (slot * DEAL_ORDER_STEP + seat) * DEAL_GAP;
}

function moveHandCard(card: CardRig, index: number, at: Slot, t: number, done: boolean, closing: boolean, play: number): void {
  let x = at.x;
  let y = HAND_Y;
  let z = at.z;
  let yaw = at.yaw;
  let visible = true;
  let faceUp = closing ? 0 : 1;
  card.rest = false;
  if (!done) {
    const start = dealStart(index, HAND_SEAT);
    const p = easeOut(seg(t, start, start + 0.62));
    if (p <= 0) {
      visible = false;
    } else if (p < 1) {
      x = mix(DECK.x, x, p);
      z = mix(DECK.z, z, p);
      y = mix(DECK_TOP + CARD_T, y, smooth(p)) + 0.72 * Math.sin(PI * p);
      yaw = mix(DECK.yaw + 1.2, yaw, p);
      faceUp = easeInOut(seg(p, 0.1, 0.78));
    }
  }
  let flip = HAND_ROLL + PI * (1 - faceUp);
  if (play > 0) {
    const slide = smooth(seg(play, 0, 0.36)) * SLIDE;
    x -= Math.sin(yaw) * slide;
    z -= Math.cos(yaw) * slide;
    const m = smooth(seg(play, 0.3, 1));
    if (index === VEILED_SLOT) {
      x = mix(x, VEIL.x, m);
      z = mix(z, VEIL.z, m);
      y = mix(y, CARD_T / 2, m) + Math.sin(PI * m) * 0.75;
      yaw = mix(yaw, VEIL.yaw, m);
      flip = HAND_ROLL * (1 - m) + PI * easeInOut(seg(m, 0.1, 0.8));
    } else {
      const lower = index === PLAYED_SLOT;
      x = mix(x, PILE.x + (lower ? 0.05 : -0.07), m);
      z = mix(z, PILE.z + (lower ? 0.04 : -0.05), m);
      y = mix(y, CARD_T * (lower ? 1.5 : 2.5), m) + Math.sin(PI * m) * 0.3;
      yaw = mix(yaw, lower ? 0.34 : -0.22, m);
      flip = HAND_ROLL * (1 - m);
    }
  } else if (done && !closing) {
    card.rest = true;
    card.rx = x;
    card.rz = z;
    card.ryaw = yaw;
    x -= Math.sin(yaw) * NUDGE * card.hover;
    z -= Math.cos(yaw) * NUDGE * card.hover;
  }
  place(card, x, y, z, yaw, 0, flip, visible);
}

function moveRival(card: CardRig, seat: number, slot: number, at: Slot, t: number, shot: number, done: boolean, closing: boolean, peek: number): void {
  let x = at.x;
  let y = RIVAL_Y;
  let z = at.z;
  let yaw = at.yaw + card.jit;
  let tilt = 0;
  let flip = PI + RIVAL_ROLL;
  let visible = true;
  if (!done) {
    const start = dealStart(slot, seat);
    const p = easeOut(seg(t, start, start + 0.5));
    if (p <= 0) {
      visible = false;
    } else if (p < 1) {
      x = mix(DECK.x, x, p);
      z = mix(DECK.z, z, p);
      y = mix(DECK_TOP + CARD_T, y, smooth(p)) + 0.3 * Math.sin(PI * p);
      yaw = mix(DECK.yaw, yaw, p);
    }
  }
  if (!closing) {
    if (seat === PEEK_SEAT && slot === PEEK_SLOT && peek > 0) {
      tilt = peek * (PI / 2 + 0.22);
      y += (CARD_H / 2) * Math.sin(Math.min(tilt, PI / 2)) + 0.1 * peek;
      yaw = mix(yaw, PEEK_YAW, peek);
      flip = PI + RIVAL_ROLL * (1 - peek);
    } else if (seat === SONAR_SEAT && shot > 5.25 && shot < 5.75) {
      const start = 5.3 + (HAND_SIZE - 1 - slot) * 0.04;
      const ripple = Math.sin(PI * seg(shot, start, start + 0.14));
      x -= Math.sin(yaw) * 0.24 * ripple;
      z -= Math.cos(yaw) * 0.24 * ripple;
    }
  }
  place(card, x, y, z, yaw, tilt, flip, visible);
}

function moveFirst(card: CardRig, t: number, done: boolean): void {
  const p = done ? 1 : easeOut(seg(t, 1.15, 1.7));
  const turn = done ? 1 : easeInOut(seg(t, 1.25, 1.8));
  place(card, mix(DECK.x, PILE.x, p), mix(DECK_TOP + CARD_T, CARD_T / 2, smooth(p)) + Math.sin(PI * turn) * 0.5, mix(DECK.z, PILE.z, p), mix(DECK.yaw, 0.12, p), 0, PI * (1 - turn), p > 0);
}

function moveDraw(card: CardRig, order: number, at: Slot, shot: number, closing: boolean, count: number): void {
  const start = 7.26 + order * 0.15;
  const p = closing ? 0 : easeInOut(seg(shot, start, start + 0.22));
  if (p <= 0) {
    card.pivot.visible = false;
    return;
  }
  let turn = 0;
  let y = RIVAL_Y;
  let flip = PI + RIVAL_ROLL * p;
  if (order < 2) {
    seatSlot(SEATS[order === 0 ? 1 : 0], HAND_SIZE, at);
  } else {
    handSlot(DRAWN_SLOT, count, at);
    turn = easeInOut(seg(p, 0.22, 0.8));
    y = HAND_Y;
    flip = PI * (1 - turn) + HAND_ROLL * p;
  }
  const w = smooth(p);
  const height = mix(DECK_TOP + CARD_T * 1.5, y, easeInOut(seg(p, 0.3, 1))) + Math.sin(PI * turn) * 0.5 + Math.sin(PI * p) * 0.14;
  place(card, mix(DECK.x, at.x, w), height, mix(DECK.z, at.z, w), mix(DECK.yaw, at.yaw, p), 0, flip, true);
}

export function updateCards(rig: Rig, at: Slot, t: number, shot: number, closing: boolean): void {
  const done = t >= INTRO;
  const played = closing ? 0 : easeInOut(seg(shot, 1.3, 1.62));
  const veiled = closing ? 0 : easeInOut(seg(shot, 3.28, 3.62));
  const spied = closing ? 0 : easeInOut(seg(shot, 4.2, 4.42));
  const gapPlayed = smooth(seg(played, 0.36, 0.9));
  const gapVeiled = smooth(seg(veiled, 0.36, 0.9));
  const gapSpied = smooth(seg(spied, 0.36, 0.9));
  const drawn = closing ? 0 : smooth(seg(shot, 7.66, 7.78));
  const count = HAND_SIZE - gapPlayed - gapVeiled - gapSpied + drawn;
  const peek = closing ? 0 : easeInOut(seg(shot, 4.38, 4.6)) * (1 - easeInOut(seg(shot, 4.78, 4.94)));

  for (let i = 0; i < rig.hand.length; i++) {
    const card = rig.hand[i];
    if (!card) continue;
    handSlot(i - (i > PLAYED_SLOT ? gapPlayed : 0) - (i > VEILED_SLOT ? gapVeiled : 0) - (i > SPYGLASS_SLOT ? gapSpied : 0), count, at);
    moveHandCard(card, i, at, t, done, closing, i === PLAYED_SLOT ? played : i === VEILED_SLOT ? veiled : i === SPYGLASS_SLOT ? spied : 0);
  }

  for (let seat = 0; seat < SEATS.length; seat++) {
    const seatAt = SEATS[seat];
    if (!seatAt) continue;
    for (let slot = 0; slot < HAND_SIZE; slot++) {
      const card = rig.rivals[seat * HAND_SIZE + slot];
      if (!card) continue;
      seatSlot(seatAt, slot, at);
      moveRival(card, seat, slot, at, t, shot, done, closing, peek);
    }
  }

  moveFirst(rig.first, t, done);

  for (let order = 0; order < rig.draws.length; order++) {
    const card = rig.draws[order];
    if (card) moveDraw(card, order, at, shot, closing, count);
  }
}
