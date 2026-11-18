import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W, HAND_SIZE, HAND_SPACING, HAND_Y, HAND_Z, NUDGE, RIVAL_SPACING, SEATS } from "@/components/landing/constants";
import { type RestCard, type Slot, handPlaneHit, handSlot, pickHandAt, seatSlot } from "@/components/landing/layout";

const slotOf = (slot: number, count: number): Slot => {
  const out = { x: 0, z: 0, yaw: 0 };
  handSlot(slot, count, out);
  return out;
};

const restingHand = (): RestCard[] =>
  Array.from({ length: HAND_SIZE }, (_, index) => {
    const slot = slotOf(index, HAND_SIZE);
    return { rest: true, rx: slot.x, rz: slot.z, ryaw: slot.yaw };
  });

const cardAt = (hand: readonly RestCard[], index: number): RestCard => {
  const card = hand[index];
  if (!card) throw new Error(`no card ${index}`);
  return card;
};

describe("hand slots", () => {
  it("puts the middle card on the centre line, square to the player", () => {
    const middle = slotOf((HAND_SIZE - 1) / 2, HAND_SIZE);
    expect(middle.x).toBeCloseTo(0, 9);
    expect(middle.z).toBeCloseTo(HAND_Z, 9);
    expect(middle.yaw).toBeCloseTo(0, 9);
  });

  it("spaces neighbours evenly and mirrors the two ends", () => {
    const first = slotOf(0, HAND_SIZE);
    const second = slotOf(1, HAND_SIZE);
    const last = slotOf(HAND_SIZE - 1, HAND_SIZE);
    expect(second.x - first.x).toBeCloseTo(HAND_SPACING, 9);
    expect(last.x).toBeCloseTo(-first.x, 9);
    expect(last.z).toBeCloseTo(first.z, 9);
    expect(last.yaw).toBeCloseTo(-first.yaw, 9);
  });

  it("bows the row towards the player at the ends", () => {
    const end = slotOf(0, HAND_SIZE);
    expect(end.z).toBeCloseTo(HAND_Z + 0.03 * 9, 9);
    expect(end.yaw).toBeCloseTo(3 * 0.045, 9);
  });

  it("closes the row around the centre when a card leaves", () => {
    const first = slotOf(0, HAND_SIZE - 1);
    const last = slotOf(HAND_SIZE - 2, HAND_SIZE - 1);
    expect(first.x).toBeCloseTo(-2.5 * HAND_SPACING, 9);
    expect(last.x).toBeCloseTo(2.5 * HAND_SPACING, 9);
  });

  it("accepts a slot between two cards while the row closes", () => {
    const between = slotOf(1.5, 6.5);
    expect(between.x).toBeCloseTo((1.5 - 2.75) * HAND_SPACING, 9);
  });
});

describe("rival slots", () => {
  it("lines a rival row up along the seat and keeps its yaw", () => {
    const out = { x: 0, z: 0, yaw: 0 };
    for (const seat of SEATS) {
      seatSlot(seat, (HAND_SIZE - 1) / 2, out);
      expect(out.x).toBeCloseTo(seat.x, 9);
      expect(out.z).toBeCloseTo(seat.z, 9);
      expect(out.yaw).toBe(seat.yaw);
      seatSlot(seat, (HAND_SIZE - 1) / 2 + 1, out);
      expect(Math.hypot(out.x - seat.x, out.z - seat.z)).toBeCloseTo(RIVAL_SPACING, 9);
    }
  });
});

describe("picking a hand card from where the cards rest", () => {
  it("finds the card whose centre is under the point", () => {
    const hand = restingHand();
    for (let index = 0; index < HAND_SIZE; index++) {
      const card = cardAt(hand, index);
      const visibleStrip = index === HAND_SIZE - 1 ? 0 : (CARD_W - HAND_SPACING) / 2 + 0.05;
      expect(pickHandAt(card.rx - visibleStrip, card.rz, hand, -1)).toBe(index);
    }
  });

  it("lets the topmost of two overlapping cards win", () => {
    const hand = restingHand();
    const lower = cardAt(hand, 2);
    const upper = cardAt(hand, 3);
    const x = (lower.rx + upper.rx) / 2;
    const z = (lower.rz + upper.rz) / 2;
    expect(pickHandAt(x, z, hand, -1)).toBe(3);
    expect(pickHandAt(x, z, hand.slice(0, 3), -1)).toBe(2);
  });

  it("misses beside, above and below the row", () => {
    const hand = restingHand();
    const first = cardAt(hand, 0);
    const middle = cardAt(hand, 3);
    expect(pickHandAt(first.rx - CARD_W, first.rz, hand, -1)).toBe(-1);
    expect(pickHandAt(middle.rx, middle.rz - CARD_H / 2 - 0.05, hand, -1)).toBe(-1);
    expect(pickHandAt(middle.rx, middle.rz + CARD_H / 2 + 0.05, hand, -1)).toBe(-1);
  });

  it("keeps the strip a held card slid out of, and only for that card", () => {
    const hand = restingHand();
    const middle = cardAt(hand, 3);
    const x = middle.rx + 0.1;
    const z = middle.rz - CARD_H / 2 - NUDGE / 2;
    expect(pickHandAt(x, z, hand, -1)).toBe(-1);
    expect(pickHandAt(x, z, hand, 3)).toBe(3);
    expect(pickHandAt(x, z, hand, 2)).toBe(-1);
    expect(pickHandAt(x, middle.rz - CARD_H / 2 - NUDGE - 0.02, hand, 3)).toBe(-1);
  });

  it("follows the yaw of a turned card", () => {
    const turned: RestCard[] = [{ rest: true, rx: 0, rz: 0, ryaw: Math.PI / 2 }];
    expect(pickHandAt(CARD_H / 2 - 0.05, 0, turned, -1)).toBe(0);
    expect(pickHandAt(0, CARD_H / 2 - 0.05, turned, -1)).toBe(-1);
    expect(pickHandAt(-(CARD_H / 2 + NUDGE / 2), 0, turned, -1)).toBe(-1);
    expect(pickHandAt(-(CARD_H / 2 + NUDGE / 2), 0, turned, 0)).toBe(0);
  });

  it("skips cards that are not at rest", () => {
    const resting = restingHand();
    const middle = cardAt(resting, 3);
    const moving = resting.map((card, index) => (index === 3 ? { ...card, rest: false } : card));
    expect(pickHandAt(middle.rx - 0.2, middle.rz, resting, -1)).toBe(3);
    expect(pickHandAt(middle.rx - 0.2, middle.rz, moving, -1)).toBe(2);
  });
});

describe("pointer ray on the plane of the hand", () => {
  it("lands where a downward ray crosses the height of the hand", () => {
    const out = { x: 0, z: 0 };
    expect(handPlaneHit(1, HAND_Y + 2, 5, 0.5, -1, -1, out)).toBe(true);
    expect(out.x).toBeCloseTo(2, 9);
    expect(out.z).toBeCloseTo(3, 9);
  });

  it("reports no hit for a level or upward ray", () => {
    const out = { x: 7, z: 7 };
    expect(handPlaneHit(0, 3, 0, 1, 0, 0, out)).toBe(false);
    expect(handPlaneHit(0, 3, 0, 0, 1, 0, out)).toBe(false);
    expect(out).toEqual({ x: 7, z: 7 });
  });
});
