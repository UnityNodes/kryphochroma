import { describe, expect, it } from "vitest";
import { type DripLedger, decideDrip } from "../src/service/drip.js";

const policy = { perAddressMs: 1000, dailyCap: 2 };
const empty: DripLedger = { lastByAddress: new Map(), dayStart: 0, count: 0 };
const a = "0x" + "a".repeat(40);
const b = "0x" + "b".repeat(40);
const c = "0x" + "c".repeat(40);

describe("drip policy", () => {
  it("rejects malformed addresses", () => {
    expect(decideDrip(empty, "0x123", 0, policy)).toEqual({ ok: false, reason: "bad-address" });
  });

  it("limits each address and the whole day", () => {
    const first = decideDrip(empty, a, 0, policy);
    if (!first.ok) throw new Error("first drip refused");
    expect(decideDrip(first.ledger, a.toUpperCase().replace("0X", "0x"), 500, policy)).toEqual({ ok: false, reason: "too-soon" });
    const second = decideDrip(first.ledger, b, 600, policy);
    if (!second.ok) throw new Error("second drip refused");
    expect(decideDrip(second.ledger, c, 700, policy)).toEqual({ ok: false, reason: "daily-cap" });
    const nextDay = decideDrip(second.ledger, c, 86_400_001, policy);
    expect(nextDay.ok).toBe(true);
  });
});
