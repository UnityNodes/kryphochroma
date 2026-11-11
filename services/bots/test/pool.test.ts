import { describe, expect, it } from "vitest";
import { type PoolTable, planPool, pickBots } from "../src/service/pool.js";

const t = (id: number, joined: number, over: Partial<PoolTable> = {}): PoolTable => ({ id: BigInt(id), seats: 4, joined, reserved: false, ...over });

describe("pool planning", () => {
  it("starts a full pool table that nobody started", () => {
    expect(planPool([t(7, 4)], 3).start).toEqual([7n]);
  });

  it("tops up a partly seated table so exactly one seat stays open", () => {
    const plan = planPool([t(8, 2), t(9, 0)], 3);
    expect(plan.seat).toEqual([
      { id: 8n, count: 1 },
      { id: 9n, count: 3 },
    ]);
    expect(plan.create).toBe(false);
  });

  it("leaves a reserved table alone and creates a new one while under the cap", () => {
    const plan = planPool([t(8, 2, { reserved: true })], 3);
    expect(plan.seat).toEqual([]);
    expect(plan.create).toBe(true);
  });

  it("does not create past the cap", () => {
    expect(planPool([t(1, 3, { reserved: true }), t(2, 3, { reserved: true }), t(3, 3, { reserved: true })], 3).create).toBe(false);
  });

  it("does not create while a ready table is waiting", () => {
    expect(planPool([t(4, 3)], 3).create).toBe(false);
  });
});

describe("bot picking", () => {
  it("skips bots that already sit at the table", () => {
    expect(pickBots(["0xA", "0xB", "0xC", "0xD"], ["0xa", "0xc"], 2)).toEqual(["0xB", "0xD"]);
    expect(pickBots(["0xA", "0xB"], ["0xa"], 3)).toEqual(["0xB"]);
  });
});
