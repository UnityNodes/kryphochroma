import { ACTION_KIND, peekField } from "@kryphochroma/abi";
import { describe, expect, it } from "vitest";
import { parseSignedAction, parseTableId } from "../src/service/parse.js";

const base = { table: "3", seat: 1, kind: ACTION_KIND.play, slot: 4, card: 0x47, color: 0, seenHandle: `0x${"ab".repeat(32)}`, nonce: 2, signature: `0x${"cd".repeat(65)}` };

describe("signed action parsing", () => {
  it("accepts veil, doubt, a violet wild colour and a spyglass target", () => {
    expect(parseSignedAction({ ...base, kind: ACTION_KIND.veil, card: 0x07 }, 5n).kind).toBe(8);
    expect(parseSignedAction({ ...base, kind: ACTION_KIND.doubt }, 5n).kind).toBe(9);
    expect(parseSignedAction({ ...base, kind: ACTION_KIND.sonar, slot: 2, color: 4 }, 5n).kind).toBe(10);
    expect(parseSignedAction({ ...base, card: 0x5d, color: 4 }, 5n).color).toBe(4);
    expect(parseSignedAction({ ...base, card: 0x4d, color: peekField(3, 23) }, 5n).color).toBe(119);
  });

  it("refuses unknown kinds, oversized fields and unknown tables", () => {
    expect(() => parseSignedAction({ ...base, kind: 11 }, 5n)).toThrow("bad field");
    expect(() => parseSignedAction({ ...base, color: 120 }, 5n)).toThrow("bad field");
    expect(() => parseSignedAction({ ...base, slot: 24 }, 5n)).toThrow("bad field");
    expect(() => parseSignedAction({ ...base, signature: "0x12" }, 5n)).toThrow("bad hex");
    expect(() => parseTableId("6", 5n)).toThrow("unknown table");
    expect(() => parseTableId("0x5", 5n)).toThrow("bad table");
    expect(() => parseTableId("0", 5n)).toThrow("unknown table");
  });
});
