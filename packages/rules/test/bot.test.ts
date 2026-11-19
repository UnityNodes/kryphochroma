import { describe, expect, it } from "vitest";
import { type Card, type PublicState, chooseMove, rankOf } from "../src/index.js";
import { B, G, R, Y, game } from "./helpers.js";

const BLUE_SKIP = B(10);
const GREEN_SKIP = G(10);
const HAND: readonly Card[] = [B(5), B(7), B(3), BLUE_SKIP, GREEN_SKIP, Y(6), G(4)];

function veiledOn(discard: readonly Card[]): PublicState {
  const state = game([HAND, [R(1), R(2), R(3), R(4), R(5), R(6), R(7)]], R(9));
  const top = discard[discard.length - 1] ?? R(0);
  return { ...state.pub, turn: 0, discard, topCard: top, color: 0 };
}

function veilClaim(pub: PublicState): Card {
  const move = chooseMove(pub, 0, HAND);
  if (move?.type !== "veil") throw new Error(`expected a veil, got ${JSON.stringify(move)}`);
  return move.claim;
}

describe("bot veil claims", () => {
  it("never claims a card whose every copy is already face up on the pile", () => {
    const claim = veilClaim(veiledOn([B(0), R(0)]));
    expect(claim).not.toBe(B(0));
    expect(claim).not.toBe(R(0));
  });

  it("claims a number that exists twice, so the next player can not rule it out", () => {
    const claim = veilClaim(veiledOn([R(0)]));
    expect(rankOf(claim)).toBeGreaterThan(0);
  });

  it("keeps to its favourite colour when that colour can follow the pile", () => {
    expect(veilClaim(veiledOn([R(8)]))).toBe(B(8));
  });
});
