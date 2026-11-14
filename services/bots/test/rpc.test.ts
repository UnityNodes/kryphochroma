import { describe, expect, it } from "vitest";
import { isStaleBlock, retryStale } from "../src/rpc.js";

const stale = () => Object.assign(new Error("Requested resource not found."), { code: -32001 });
const noSleep = async () => {};

describe("rpc retry on a lagging node", () => {
  it("recognises a block the node has not seen yet", () => {
    expect(isStaleBlock(stale())).toBe(true);
  });

  it("recognises it under the errors that wrap it", () => {
    const wrapped = Object.assign(new Error("call failed"), { cause: Object.assign(new Error("execution failed"), { cause: stale() }) });
    expect(isStaleBlock(wrapped)).toBe(true);
  });

  it("does not treat a revert or a rate limit as a lagging node", () => {
    expect(isStaleBlock(Object.assign(new Error("execution reverted"), { code: 3 }))).toBe(false);
    expect(isStaleBlock(Object.assign(new Error("limit exceeded"), { code: -32005 }))).toBe(false);
    expect(isStaleBlock(null)).toBe(false);
  });

  it("asks again until the node has the block", async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await retryStale(
      async () => {
        calls++;
        if (calls < 3) throw stale();
        return "0x1";
      },
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(result).toBe("0x1");
    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);
  });

  it("gives up after a few tries so a missing block cannot hang the loop", async () => {
    let calls = 0;
    await expect(
      retryStale(async () => {
        calls++;
        throw stale();
      }, noSleep),
    ).rejects.toThrow("Requested resource not found.");
    expect(calls).toBe(5);
  });

  it("passes every other error through at once", async () => {
    let calls = 0;
    await expect(
      retryStale(async () => {
        calls++;
        throw Object.assign(new Error("execution reverted"), { code: 3 });
      }, noSleep),
    ).rejects.toThrow("execution reverted");
    expect(calls).toBe(1);
  });
});
