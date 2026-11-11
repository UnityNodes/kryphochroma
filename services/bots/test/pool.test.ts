import { describe, expect, it } from "vitest";
import { type PoolTable, SPARE_BY_SEATS, pickBots, pickReady, planPool } from "../src/service/pool.js";

const t = (id: number, seats: number, joined = 0, over: Partial<PoolTable> = {}): PoolTable => ({ id: BigInt(id), seats, joined, reserved: false, setupStep: 0, starter: false, ...over });

describe("ready table pool", () => {
  it("keeps spare shuffled tables for every table size, the four seat ones first", () => {
    expect(planPool([], 20).create).toEqual([4, 4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2]);
    expect(planPool([t(1, 4), t(2, 3)], 20).create).toEqual([4, 4, 4, 4, 4, 3, 3, 2, 2, 2, 2, 2]);
    const full = [...Array.from({ length: 6 }, (_, i) => t(i + 1, 4)), ...Array.from({ length: 3 }, (_, i) => t(i + 7, 3)), ...Array.from({ length: 5 }, (_, i) => t(i + 10, 2))];
    expect(planPool(full, 20).create).toEqual([]);
  });

  it("does not count reserved or occupied tables as spare, and respects the cap", () => {
    expect(planPool([t(1, 4, 0, { reserved: true }), t(2, 4, 2)], 6).create).toEqual([4, 4, 4, 4]);
    expect(planPool([t(1, 4, 1), t(2, 3, 1)], 4).create).toEqual([4, 4]);
  });

  it("fills every spare slot when the pool is empty and the cap allows", () => {
    expect(planPool([], 20).create).toHaveLength(Object.values(SPARE_BY_SEATS).reduce((a, b) => a + b, 0));
  });

  it("hands out the most shuffled spare table of the asked size", () => {
    const tables = [t(1, 4, 0, { setupStep: 20 }), t(2, 4, 0, { setupStep: 70 }), t(3, 4, 0, { setupStep: 70, reserved: true }), t(4, 3, 0, { setupStep: 70 })];
    expect(pickReady(tables, 4)?.id).toBe(2n);
    expect(pickReady(tables, 3)?.id).toBe(4n);
    expect(pickReady(tables, 2)).toBeNull();
  });

  it("prefers a shuffled table whose starter card is already revealed", () => {
    const tables = [t(1, 2, 0, { setupStep: 70 }), t(2, 2, 0, { setupStep: 70, starter: true })];
    expect(pickReady(tables, 2)?.id).toBe(2n);
  });
});

describe("bot picking", () => {
  it("skips bots that already sit at the table", () => {
    expect(pickBots(["0xA", "0xB", "0xC", "0xD"], ["0xa", "0xc"], 2)).toEqual(["0xB", "0xD"]);
    expect(pickBots(["0xA", "0xB"], ["0xa"], 3)).toEqual(["0xB"]);
  });
});
