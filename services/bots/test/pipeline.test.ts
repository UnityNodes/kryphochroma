import { describe, expect, it } from "vitest";
import { MAX_PIPELINE, nextBatch, pipelinedGas } from "../src/relay/pipeline.js";

const a = (seat: number, nonce: number) => ({ seat, nonce });
const key = (x: { seat: number; nonce: number }) => `${x.seat}:${x.nonce}`;

describe("relay pipeline", () => {
  it("sends the whole backlog when nothing is in flight", () => {
    const pending = [a(0, 1), a(1, 4)];
    expect(nextBatch(pending, new Set(), 0, 64)).toEqual(pending);
  });

  it("sends only moves that came in after the transaction in flight", () => {
    const pending = [a(0, 1), a(1, 4), a(2, 7)];
    expect(nextBatch(pending, new Set(["0:1", "1:4"]), 1, 64)).toEqual([a(2, 7)]);
  });

  it("sends nothing when every move is already in flight", () => {
    const pending = [a(0, 1)];
    expect(nextBatch(pending, new Set(pending.map(key)), 1, 64)).toEqual([]);
  });

  it("waits once the pipeline is full", () => {
    expect(nextBatch([a(0, 1)], new Set(), MAX_PIPELINE, 64)).toEqual([]);
  });

  it("caps the batch", () => {
    const pending = Array.from({ length: 10 }, (_, i) => a(0, i));
    expect(nextBatch(pending, new Set(), 0, 4)).toHaveLength(4);
  });

  it("never sends a move ahead of one in flight that comes after it", () => {
    const pending = [a(0, 1), a(1, 2), a(2, 3)];
    expect(nextBatch(pending, new Set(["1:2"]), 1, 64)).toEqual([a(2, 3)]);
  });

  it("gives a pipelined batch gas per move and per dealt card under the cap", () => {
    expect(pipelinedGas(2, 0, false, 16_000_000n)).toBe(1_300_000n);
    expect(pipelinedGas(2, 2, false, 16_000_000n)).toBe(2_900_000n);
    expect(pipelinedGas(1, 6, false, 16_000_000n)).toBe(5_600_000n);
    expect(pipelinedGas(10, 20, false, 16_000_000n)).toBe(16_000_000n);
  });

  it("adds the cost of a sonar count for every card in the hand it counts", () => {
    expect(pipelinedGas(1, 0, false, 16_000_000n, 7)).toBe(800_000n + 7n * 130_000n);
    expect(pipelinedGas(1, 0, false, 16_000_000n, 7)).toBeGreaterThan(836_858n);
    expect(pipelinedGas(3, 1, false, 16_000_000n, 24)).toBe(300_000n + 1_500_000n + 800_000n + 24n * 130_000n);
  });

  it("gives the batch that ends a round the full limit", () => {
    expect(pipelinedGas(1, 0, true, 16_000_000n)).toBe(16_000_000n);
  });
});
