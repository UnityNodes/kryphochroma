import { decryptEach } from "@kryphochroma/abi";
import { describe, expect, it, vi } from "vitest";

const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

describe("decrypting a hand", () => {
  it("decrypts everything in one batch when it can", async () => {
    const decrypt = vi.fn(async (batch: readonly `0x${string}`[]) => Object.fromEntries(batch.map((x, i) => [x, BigInt(i + 1)])));
    const { values, pending } = await decryptEach(decrypt, [h(1), h(2)]);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect([...values.values()]).toEqual([1, 2]);
    expect(pending).toEqual([]);
  });

  it("keeps the older cards when one fresh card is not decryptable yet", async () => {
    const fresh = h(3);
    const decrypt = vi.fn(async (batch: readonly `0x${string}`[]) => {
      if (batch.includes(fresh)) throw new Error("not entitled to decrypt");
      return Object.fromEntries(batch.map((x) => [x, 7n]));
    });
    const { values, pending } = await decryptEach(decrypt, [h(1), h(2), fresh]);
    expect([...values.keys()]).toEqual([h(1), h(2)]);
    expect(pending).toEqual([fresh]);
  });

  it("does nothing for an empty hand", async () => {
    const decrypt = vi.fn();
    expect((await decryptEach(decrypt, [])).pending).toEqual([]);
    expect(decrypt).not.toHaveBeenCalled();
  });
});
