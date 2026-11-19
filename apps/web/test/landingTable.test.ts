import { describe, expect, it } from "vitest";
import { CARD_H, CHAIRS, HAND_SIZE, HAND_Z, SEATS, TABLE_CUT } from "@/components/landing/constants";
import { type Slot, handSlot, seatSlot } from "@/components/landing/layout";
import { CHAIR_REACH } from "@/components/table3d/constants";

const REACH = CARD_H / 2;

describe("landing table", () => {
  it("keeps every rival card on the felt", () => {
    const slot: Slot = { x: 0, z: 0, yaw: 0 };
    for (const seat of SEATS) {
      for (let i = 0; i < HAND_SIZE; i++) {
        seatSlot(seat, i, slot);
        expect(Math.abs(slot.x) + REACH).toBeLessThan(TABLE_CUT.hx);
        expect(slot.z - REACH).toBeGreaterThan(TABLE_CUT.z0);
        expect(slot.z + REACH).toBeLessThan(TABLE_CUT.z1);
      }
    }
  });

  it("keeps the open hand on the felt", () => {
    const slot: Slot = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < HAND_SIZE; i++) {
      handSlot(i, HAND_SIZE, slot);
      expect(slot.z).toBeGreaterThanOrEqual(HAND_Z);
      expect(slot.z + REACH).toBeLessThan(TABLE_CUT.z1);
      expect(Math.abs(slot.x) + REACH).toBeLessThan(TABLE_CUT.hx);
    }
  });

  it("pulls a chair up behind every rival, facing the table", () => {
    expect(CHAIRS).toHaveLength(SEATS.length);
    const centreZ = (TABLE_CUT.z0 + TABLE_CUT.z1) / 2;
    CHAIRS.forEach((chair, i) => {
      const seat = SEATS[i];
      if (!seat) throw new Error("chair without a seat");
      const towardCentre = Math.sin(chair.yaw) * -chair.x + Math.cos(chair.yaw) * (centreZ - chair.z);
      expect(towardCentre).toBeGreaterThan(0);
      const outside = Math.max(Math.abs(chair.x) - TABLE_CUT.hx, TABLE_CUT.z0 - chair.z);
      expect(outside).toBeCloseTo(CHAIR_REACH, 6);
      expect(Math.hypot(chair.x - seat.x, chair.z - seat.z)).toBeLessThan(Math.abs(CHAIR_REACH) + 2);
    });
  });
});
