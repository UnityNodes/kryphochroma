import { describe, expect, it } from "vitest";
import { CARD_H, DECK, DECK_TOP } from "@/components/landing/constants";
import { DRAW_TILT, deckLeft, drawPose, drawProgress } from "@/components/landing/draw";

const TO = { x: -3.3, z: 1.5, yaw: -Math.PI / 2 };
const TO_Y = 0.05;
const REVEAL = 0.64;
const lowestEdge = (y: number, tilt: number) => y - (CARD_H / 2) * Math.sin(tilt);

describe("a card drawn from the deck", () => {
  it("starts flat on top of the deck", () => {
    const pose = drawPose(0, TO, TO_Y, REVEAL);
    expect(pose.x).toBeCloseTo(DECK.x, 9);
    expect(pose.z).toBeCloseTo(DECK.z, 9);
    expect(pose.tilt).toBeCloseTo(0, 9);
    expect(pose.y).toBeGreaterThan(DECK_TOP);
  });

  it("rises over the deck and turns its back to the camera before it goes anywhere", () => {
    const pose = drawPose(0.3, TO, TO_Y, REVEAL);
    expect(pose.x).toBeCloseTo(DECK.x, 9);
    expect(pose.z).toBeCloseTo(DECK.z, 9);
    expect(pose.tilt).toBeCloseTo(DRAW_TILT, 6);
    expect(pose.yaw).toBeCloseTo(REVEAL, 6);
    expect(lowestEdge(pose.y, pose.tilt)).toBeGreaterThan(DECK_TOP);
  });

  it("never dips an edge into the deck or the table on the way", () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const pose = drawPose(Math.min(p, 1), TO, TO_Y, REVEAL);
      const overDeck = Math.hypot(pose.x - DECK.x, pose.z - DECK.z) < 0.6;
      expect(lowestEdge(pose.y, pose.tilt)).toBeGreaterThan(overDeck ? DECK_TOP : 0);
    }
  });

  it("lands flat in its place", () => {
    const pose = drawPose(1, TO, TO_Y, REVEAL);
    expect(pose.x).toBeCloseTo(TO.x, 9);
    expect(pose.z).toBeCloseTo(TO.z, 9);
    expect(pose.y).toBeCloseTo(TO_Y, 9);
    expect(pose.yaw).toBeCloseTo(TO.yaw, 9);
    expect(pose.tilt).toBeCloseTo(0, 9);
  });
});

describe("the deck while cards are drawn", () => {
  it("gives each draw its own stretch of the scroll, one after another", () => {
    expect(drawProgress(0, 7.0)).toBe(0);
    expect(drawProgress(0, 7.6)).toBe(1);
    expect(drawProgress(1, 7.3)).toBeLessThan(drawProgress(0, 7.3));
    expect(drawProgress(2, 7.95)).toBe(1);
  });

  it("gets lower by one card for every card that has left it", () => {
    expect(deckLeft(7.0)).toBe(0);
    expect(deckLeft(7.3)).toBe(1);
    expect(deckLeft(7.95)).toBe(3);
  });
});
