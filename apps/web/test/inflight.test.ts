import { afterEach, describe, expect, it, vi } from "vitest";
import { isSeatInFlight, trackSeat } from "@/chain/inflight";

describe("seat in flight", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the seat while the join is mined and a little after it lands", async () => {
    vi.useFakeTimers();
    let land: () => void = () => undefined;
    const task = trackSeat("7", new Promise<void>((resolve) => (land = resolve)));
    expect(isSeatInFlight("7")).toBe(true);
    land();
    await task;
    expect(isSeatInFlight("7")).toBe(true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(isSeatInFlight("7")).toBe(false);
  });

  it("drops the seat at once when the join fails", async () => {
    const task = trackSeat("8", Promise.reject(new Error("no gas")));
    await expect(task).rejects.toThrow("no gas");
    await Promise.resolve();
    expect(isSeatInFlight("8")).toBe(false);
  });

  it("keeps a newer join when an older one for the same table settles", async () => {
    vi.useFakeTimers();
    const first = trackSeat("9", Promise.resolve());
    trackSeat("9", new Promise<void>(() => undefined));
    await first;
    await vi.advanceTimersByTimeAsync(8000);
    expect(isSeatInFlight("9")).toBe(true);
  });
});
