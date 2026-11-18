import { cardOf } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { CARD_T, DECK_SLABS, LIFT_HOVER, LIFT_PLAYABLE, LIFT_SEALED, PILE_BASE_MAX, PILE_SHOWN, STRIP_MIN } from "@/components/table3d/constants";
import { type Layout, backRowCount, fanPoint, rivalSpots, rowHit, rowLayout, rowPlanePoint, solveLayout } from "@/components/table3d/layout";
import type { HandCard, TableModel } from "@/components/table3d/model";
import { pickSlot, targetsOf } from "@/components/table3d/targets";

const FRAME = { head: 60, dock: 110 };
const DESKTOP = solveLayout(1440, 900, FRAME);
const WIDE = solveLayout(1918, 885, FRAME);
const PHONE = solveLayout(390, 844, FRAME);
const VIEWS: readonly (readonly [string, Layout])[] = [["desktop", DESKTOP], ["wide", WIDE], ["phone", PHONE]];

function hand(count: number, sealed = 0): HandCard[] {
  return Array.from({ length: count }, (_, slot) => (slot >= count - sealed ? { slot, card: -1 - slot, playable: false } : { slot, card: cardOf(slot % 5, slot % 10), playable: slot % 3 === 0 }));
}

function model(parts: Partial<TableModel>): TableModel {
  return { rivals: [], own: null, hand: [], deck: 100, pile: [cardOf(2, 7)], veiled: false, color: 2, round: 0, ...parts };
}

describe("table layout", () => {
  it("recomposes for a phone held upright", () => {
    expect(DESKTOP.portrait).toBe(false);
    expect(WIDE.portrait).toBe(false);
    expect(PHONE.portrait).toBe(true);
    expect(PHONE.chairs).toBe(false);
    expect(DESKTOP.chairs).toBe(true);
    expect(PHONE.table.hx).toBeLessThan(DESKTOP.table.hx);
    expect(WIDE.table.hx).toBeGreaterThan(DESKTOP.table.hx);
  });

  it("holds 24 cards in one row on a desktop and splits above 13 on a phone", () => {
    expect(backRowCount(24, DESKTOP.fan.per)).toBe(0);
    expect(backRowCount(13, PHONE.fan.per)).toBe(0);
    expect(backRowCount(14, PHONE.fan.per)).toBe(7);
    expect(backRowCount(24, PHONE.fan.per)).toBe(12);
  });

  it("seats one rival opposite, two at the sides and three round the table", () => {
    expect(rivalSpots(DESKTOP, 1)).toEqual([DESKTOP.seatFar]);
    expect(rivalSpots(DESKTOP, 2)).toEqual([DESKTOP.seatLeft, DESKTOP.seatRight]);
    expect(rivalSpots(DESKTOP, 3)).toEqual([DESKTOP.seatLeft, DESKTOP.seatFar, DESKTOP.seatRight]);
  });

  it("keeps the far name off the rail when a short phone has no room under the header", () => {
    expect(PHONE.seatFar.plate.far).toBe(true);
    expect(solveLayout(390, 844, { head: 400, dock: 110 }).seatFar.plate.far).toBe(false);
  });
});

describe("state to layout mapping", () => {
  it.each(VIEWS)("lays every rival row inside the felt for 2, 3 and 4 seats on %s", (_name, layout) => {
    for (const rivals of [1, 2, 3]) {
      for (const count of [0, 1, 7, 15, 24]) {
        const targets = targetsOf(model({ rivals: Array.from({ length: rivals }, (_, i) => ({ seat: i + 1, count })) }), layout, null);
        expect(targets.rows).toHaveLength(rivals);
        for (const row of targets.rows) {
          expect(row.spots).toHaveLength(count);
          for (const spot of row.spots) {
            expect(Math.abs(spot.x)).toBeLessThan(layout.table.hx);
            expect(spot.z).toBeGreaterThan(layout.table.z0);
            expect(spot.z).toBeLessThan(layout.table.z1);
            expect(spot.y).toBeGreaterThan(CARD_T / 2);
            expect(spot.flip).toBeGreaterThanOrEqual(Math.PI);
          }
        }
      }
    }
  });

  it("closes a rival row up instead of letting it outgrow its place", () => {
    const row = (count: number) => targetsOf(model({ rivals: [{ seat: 1, count }] }), DESKTOP, null).rows[0]?.spots ?? [];
    const length = (count: number) => Math.abs((row(count)[count - 1]?.x ?? 0) - (row(count)[0]?.x ?? 0));
    expect(length(7)).toBeCloseTo(6 * DESKTOP.seatFar.sp, 5);
    expect(length(24)).toBeLessThanOrEqual(DESKTOP.seatFar.maxLen + 1e-9);
  });

  it("lays a watcher's own seat as one more sealed row and no fan", () => {
    const targets = targetsOf(model({ rivals: [{ seat: 1, count: 7 }], own: { seat: 0, count: 5 } }), DESKTOP, null);
    expect(targets.fan).toEqual([]);
    expect(targets.rows.map((r) => [r.seat, r.spots.length])).toEqual([[1, 7], [0, 5]]);
    expect(targets.rows[1]?.spots[0]?.z).toBeGreaterThan(0);
  });

  it("raises the deck with its count, caps it, and leaves an empty spot at zero", () => {
    const deck = (count: number) => targetsOf(model({ deck: count }), DESKTOP, null).deck;
    expect(deck(0)).toEqual({ slabs: 0, topY: 0, top: null });
    expect(deck(1).slabs).toBe(1);
    expect(deck(60).topY).toBeGreaterThan(deck(20).topY);
    expect(deck(5000).slabs).toBe(DECK_SLABS);
    expect(deck(60).top?.y).toBeGreaterThan(deck(60).topY);
    expect(deck(60).top?.flip).toBe(Math.PI);
  });

  it("shows the last cards of the pile on a base that stops growing", () => {
    const pile = Array.from({ length: 90 }, (_, i) => cardOf(i % 5, i % 10));
    const shown = targetsOf(model({ pile }), DESKTOP, null).pile;
    expect(shown.cards).toHaveLength(PILE_SHOWN);
    expect(shown.cards[shown.cards.length - 1]).toMatchObject({ index: 89, card: pile[89], faceDown: false });
    expect(shown.base).toBe(PILE_BASE_MAX);
    const ys = shown.cards.map((c) => c.lie.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(targetsOf(model({ pile: [cardOf(1, 1)] }), DESKTOP, null).pile.base).toBe(0);
  });

  it("turns only the top card face down while a veil is pending", () => {
    const shown = targetsOf(model({ pile: [cardOf(1, 1), cardOf(1, 2)], veiled: true }), DESKTOP, null).pile.cards;
    expect(shown.map((c) => c.faceDown)).toEqual([false, true]);
    expect(shown[1]?.lie.flip).toBe(Math.PI);
  });

  it.each(VIEWS)("fans 1 to 24 cards on %s in hand order with a readable strip of each", (_name, layout) => {
    for (let count = 1; count <= 24; count++) {
      const fan = targetsOf(model({ hand: hand(count) }), layout, null).fan;
      expect(fan.map((c) => c.slot)).toEqual(Array.from({ length: count }, (_, i) => i));
      const backCount = backRowCount(count, layout.fan.per);
      expect(fan.filter((c) => c.row === 1).map((c) => c.slot)).toEqual(Array.from({ length: backCount }, (_, i) => i));
      for (const row of [0, 1] as const) {
        const xs = fan.filter((c) => c.row === row).map((c) => c.x);
        for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThanOrEqual(STRIP_MIN - 1e-9);
        if (xs.length > 0) expect((xs[xs.length - 1] ?? 0) - (xs[0] ?? 0)).toBeLessThanOrEqual(layout.fan.maxSpan + 1e-9);
      }
    }
  });

  it("lifts playable cards, lifts the held one further and opens the gap after it", () => {
    const rest = targetsOf(model({ hand: hand(7) }), DESKTOP, null).fan;
    const held = targetsOf(model({ hand: hand(7) }), DESKTOP, 2).fan;
    expect(rest[0]?.lift).toBe(LIFT_PLAYABLE);
    expect(rest[1]?.lift).toBe(0);
    expect(held[2]?.lift).toBe(LIFT_HOVER);
    expect(held[3]?.lift).toBe(LIFT_PLAYABLE);
    expect((held[3]?.x ?? 0) - (held[2]?.x ?? 0)).toBeGreaterThan((rest[3]?.x ?? 0) - (rest[2]?.x ?? 0));
  });

  it("stands a card that is still being decrypted with its back to the player, never playable", () => {
    const fan = targetsOf(model({ hand: hand(8, 2) }), DESKTOP, null).fan;
    expect(fan.map((c) => c.sealed)).toEqual([false, false, false, false, false, false, true, true]);
    expect(fan[6]?.lift).toBe(LIFT_SEALED);
    expect(fan[7]?.playable).toBe(false);
  });
});

describe("picking the fan card under a point", () => {
  const fan = DESKTOP.fan;
  const row = rowLayout(fan, 7, -1);
  const lifts = row.xs.map(() => 0);

  it("picks the card whose uncovered strip is under the point", () => {
    for (let i = 0; i < row.xs.length; i++) {
      const x = (row.xs[i] ?? 0) - 0.5 + row.gap / 2;
      expect(rowHit(fan, row.xs, lifts, x, 0, -1, 0)).toBe(i);
    }
  });

  it("picks the last card anywhere on its face and nothing beside or above the fan", () => {
    const last = row.xs[row.xs.length - 1] ?? 0;
    expect(rowHit(fan, row.xs, lifts, last + 0.4, -0.3, -1, 0)).toBe(row.xs.length - 1);
    expect(rowHit(fan, row.xs, lifts, last + 0.8, 0, -1, 0)).toBe(-1);
    expect(rowHit(fan, row.xs, lifts, 0, 1.2, -1, 0)).toBe(-1);
  });

  it("keeps a held card under the pointer in the space it rose into", () => {
    const x = (row.xs[3] ?? 0) - 0.5 + row.gap / 2;
    expect(rowHit(fan, row.xs, lifts, x, 0.75 + 0.3, -1, 0)).toBe(-1);
    expect(rowHit(fan, row.xs, lifts, x, 0.75 + 0.3, 3, LIFT_HOVER)).toBe(3);
  });

  it("finds where a ray from the camera meets the fan", () => {
    const at = fanPoint(fan, row.xs[2] ?? 0, 0, 0, 0);
    const dir = { x: at.x - DESKTOP.cam.x, y: at.y - DESKTOP.cam.y, z: at.z - DESKTOP.cam.z };
    const point = rowPlanePoint(fan, 0, 0, DESKTOP.cam, dir);
    expect(point).not.toBeNull();
    expect(rowHit(fan, row.xs, lifts, point?.x ?? 9, point?.y ?? 9, -1, 0)).toBe(2);
    expect(rowPlanePoint(fan, 0, 0, DESKTOP.cam, { x: 0, y: 1, z: 1 })).toBeNull();
  });

  it("picks through both rows of a crowded phone hand, front row first", () => {
    const targets = targetsOf(model({ hand: hand(20) }), PHONE, null);
    const ray = (slot: number, lift: number) => {
      const spot = targets.fan.find((c) => c.slot === slot);
      if (!spot) throw new Error("no such card");
      const at = fanPoint(PHONE.fan, spot.x - 0.5 + 0.1, 0.5 + lift, spot.row, targets.back);
      return { x: at.x - PHONE.cam.x, y: at.y - PHONE.cam.y, z: at.z - PHONE.cam.z };
    };
    expect(pickSlot(PHONE, targets, PHONE.cam, ray(15, 0), null, false)).toBe(15);
    expect(pickSlot(PHONE, targets, PHONE.cam, ray(3, 0.2), null, false)).toBe(3);
    expect(pickSlot(PHONE, targets, PHONE.cam, { x: 0, y: 1, z: -1 }, null, false)).toBeNull();
  });
});
