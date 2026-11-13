import { describe, expect, it } from "vitest";
import type { GameEvent } from "@kryphochroma/rules";
import { ZERO_HANDLE, namesSlot, seatHandles, slotReady } from "@kryphochroma/abi";

const h = (n: number): `0x${string}` => `0x${n.toString(16).padStart(64, "0")}`;
const drew = (seat: number, slot: number): GameEvent => ({ type: "Drew", seat, slot });
const played = (seat: number, slot: number): GameEvent => ({ type: "Played", seat, slot, card: 1, color: 0 });

describe("seat handles over pending moves", () => {
  it("keeps the chain hand when nothing is pending", () => {
    expect(seatHandles([h(1), h(2)], [h(9), h(10)], [], 0)).toEqual([h(1), h(2)]);
  });

  it("gives a pending draw the head of the seat's queue", () => {
    const hands = seatHandles([h(1), ZERO_HANDLE], [h(9), h(10)], [drew(0, 1)], 0);
    expect(hands).toEqual([h(1), h(9)]);
    expect(slotReady(hands, 1)).toBe(true);
  });

  it("walks the queue in order over several pending draws", () => {
    const hands = seatHandles([h(1), ZERO_HANDLE, ZERO_HANDLE, ZERO_HANDLE], [h(9), h(10)], [drew(0, 1), drew(0, 2), drew(0, 3)], 0);
    expect(hands).toEqual([h(1), h(9), h(10), null]);
    expect(slotReady(hands, 3)).toBe(false);
  });

  it("clears a played slot and refills it from the queue", () => {
    expect(seatHandles([h(1), h(2)], [h(9), ZERO_HANDLE], [played(0, 0)], 0)).toEqual([null, h(2)]);
    expect(seatHandles([h(1), h(2)], [h(9), ZERO_HANDLE], [played(0, 0), drew(0, 0)], 0)).toEqual([h(9), h(2)]);
  });

  it("waits for a draw from an empty queue", () => {
    expect(slotReady(seatHandles([h(1), ZERO_HANDLE], [ZERO_HANDLE, ZERO_HANDLE], [drew(0, 1)], 0), 1)).toBe(false);
  });

  it("ignores other seats", () => {
    expect(seatHandles([h(1), ZERO_HANDLE], [h(9)], [drew(1, 1), played(1, 0)], 0)).toEqual([h(1), ZERO_HANDLE]);
  });

  it("only guards moves that name a slot", () => {
    expect(namesSlot({ type: "draw" })).toBe(false);
    expect(namesSlot({ type: "veil", slot: 1, claim: 3 } as never)).toBe(true);
  });
});
