import { describe, expect, it } from "vitest";
import { bitCount, revealedSecrets } from "@/chain/secrets";

const word = (n: number) => n.toString(16).padStart(64, "0");
const proof = (seats: readonly (readonly number[])[]) => `0x${seats.flat().map(word).join("")}` as const;

describe("secret colours from the reveal proof", () => {
  it("reads the second word of every seat block", () => {
    const cleartexts = proof([
      [1, 3, 0x12, 0x25],
      [1, 0],
      [0, 4, 0x5d],
    ]);
    expect(revealedSecrets(cleartexts, [2, 0, 1])).toEqual([3, 0, 4]);
  });

  it("refuses a proof whose length does not match the hands", () => {
    const cleartexts = proof([
      [1, 3, 0x12],
      [1, 0],
    ]);
    expect(revealedSecrets(cleartexts, [2, 0])).toBeNull();
    expect(revealedSecrets(cleartexts, [1, 0, 0])).toBeNull();
  });

  it("counts the cards left from a slot mask", () => {
    expect(bitCount(0)).toBe(0);
    expect(bitCount(0b1011)).toBe(3);
    expect(bitCount(0xffffff)).toBe(24);
  });
});
