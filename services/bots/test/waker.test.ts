import { describe, expect, it, vi } from "vitest";
import { createWaker } from "../src/keeper/waker.js";

describe("keeper waker", () => {
  it("sleeps for the full poll when nobody wakes it", async () => {
    vi.useFakeTimers();
    const waker = createWaker();
    let done = false;
    void waker.sleep(2000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it("ends the sleep at once on wake", async () => {
    vi.useFakeTimers();
    const waker = createWaker();
    let done = false;
    void waker.sleep(2000).then(() => (done = true));
    waker.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it("skips the next sleep when woken while busy", async () => {
    const waker = createWaker();
    waker.wake();
    await expect(waker.sleep(60_000)).resolves.toBeUndefined();
  });
});
