import { describe, expect, it } from "vitest";
import { emptyDay, relayGasPrice, serial, takeDaily } from "../src/service/limits.js";

const DAY = 86_400_000;

describe("daily allowance", () => {
  it("counts up to the cap and refuses past it", () => {
    let counter = emptyDay(DAY * 10);
    for (let i = 0; i < 3; i++) {
      const step = takeDaily(counter, DAY * 10 + i, 3);
      expect(step.ok).toBe(true);
      counter = step.counter;
    }
    expect(takeDaily(counter, DAY * 10 + 5, 3).ok).toBe(false);
  });

  it("starts over the next day", () => {
    const spent = { day: 10, count: 3 };
    const next = takeDaily(spent, DAY * 11 + 1, 3);
    expect(next.ok).toBe(true);
    expect(next.counter).toEqual({ day: 11, count: 1 });
  });
});

describe("relay gas price", () => {
  it("keeps the floor while the base fee is low", () => {
    expect(relayGasPrice(16n, 5_000_000n, 50_000_000n)).toBe(5_000_000n);
  });

  it("follows a base fee above the floor with headroom", () => {
    expect(relayGasPrice(8_000_000n, 5_000_000n, 50_000_000n)).toBe(16_000_000n);
  });

  it("never pays more than the cap", () => {
    expect(relayGasPrice(1_000_000_000n, 5_000_000n, 50_000_000n)).toBe(50_000_000n);
  });
});

describe("serial tasks", () => {
  it("runs overlapping tasks one after another, and survives a failure", async () => {
    const run = serial();
    const order: string[] = [];
    const slow = run(async () => {
      order.push("a start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a end");
    });
    const failing = run(async () => {
      order.push("b");
      throw new Error("boom");
    });
    const last = run(async () => {
      order.push("c");
      return 7;
    });
    await slow;
    await expect(failing).rejects.toThrow("boom");
    expect(await last).toBe(7);
    expect(order).toEqual(["a start", "a end", "b", "c"]);
  });
});
