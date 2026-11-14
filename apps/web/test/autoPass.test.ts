import { COLOR, type GameState, RANK, WILD_COLOR, applyMove, cardOf } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { autoPassKey } from "@/game/autoPass";
import { HUMAN, newOfflineGame } from "@/game/offline";

const TOP = cardOf(COLOR.teal, 5);
const MISFIT = cardOf(COLOR.red, 3);

function fresh(): GameState {
  const state = newOfflineGame({ seats: 3, stackDrawTwo: false, seed: 3 }).state;
  return { ...state, pub: { ...state.pub, topCard: TOP, color: COLOR.teal } };
}

function afterDraw(drawn: number, rest: number = cardOf(COLOR.sun, 2)): GameState {
  const state = applyMove(fresh(), HUMAN, { type: "draw" }).state;
  const slot = state.pub.drawnSlot;
  const hands = state.hands.map((hand, seat) => (seat === HUMAN ? hand.map((card, i) => (card === null ? null : i === slot ? drawn : rest)) : hand));
  return { ...state, hands };
}

const keyOf = (state: GameState, seat = HUMAN) => autoPassKey(state.pub, seat, state.hands[seat] ?? []);

describe("auto pass", () => {
  it("is due when the drawn card does not fit", () => {
    expect(keyOf(afterDraw(MISFIT))).not.toBeNull();
  });

  it("is due even when another card in the hand fits, since only the drawn one may be played", () => {
    expect(keyOf(afterDraw(MISFIT, cardOf(COLOR.teal, 9)))).not.toBeNull();
  });

  it("leaves the choice to the player when the drawn card fits", () => {
    expect(keyOf(afterDraw(cardOf(COLOR.teal, 9)))).toBeNull();
    expect(keyOf(afterDraw(cardOf(COLOR.red, 5)))).toBeNull();
    expect(keyOf(afterDraw(cardOf(WILD_COLOR, RANK.wild)))).toBeNull();
  });

  it("waits while the drawn card is still sealed", () => {
    expect(keyOf(afterDraw(-1))).toBeNull();
  });

  it("stays quiet before a draw and on another seat's turn", () => {
    expect(keyOf(fresh())).toBeNull();
    expect(keyOf(afterDraw(MISFIT), 1)).toBeNull();
  });

  it("names each draw apart so a refused pass is not sent twice", () => {
    const first = afterDraw(MISFIT);
    const later = { ...first, pub: { ...first.pub, deckCount: first.pub.deckCount - 1 } };
    expect(keyOf(first)).toBe(keyOf(first));
    expect(keyOf(later)).not.toBe(keyOf(first));
  });
});
