import { describe, expect, it } from "vitest";
import type { GameState } from "@kryphochroma/rules";
import { namesSlot, slotSettled } from "@kryphochroma/abi";

const withHand = (hand: readonly (number | null)[]): GameState => ({ hands: [hand] }) as unknown as GameState;

describe("settled slot", () => {
  it("allows a card that sits on chain as projected", () => {
    expect(slotSettled(withHand([12, 40]), withHand([12, 40]), 0, 1)).toBe(true);
  });

  it("waits for a card drawn into an empty slot by a move not yet relayed", () => {
    expect(slotSettled(withHand([12, null]), withHand([12, -1]), 0, 1)).toBe(false);
  });

  it("waits when a played slot was refilled by a pending draw", () => {
    expect(slotSettled(withHand([12, 40]), withHand([12, -1]), 0, 1)).toBe(false);
  });

  it("allows a sealed card that is already on chain", () => {
    expect(slotSettled(withHand([-1]), withHand([-1]), 0, 0)).toBe(true);
  });

  it("only guards moves that name a slot", () => {
    expect(namesSlot({ type: "draw" })).toBe(false);
    expect(namesSlot({ type: "veil", slot: 1, claim: 3 } as never)).toBe(true);
  });
});
