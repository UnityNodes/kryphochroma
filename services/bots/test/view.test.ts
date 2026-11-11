import { chooseMove, initialState } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { type ChainSeat, type ChainTable, chainDeckCount, toPublicState } from "@kryphochroma/abi";

describe("chain view", () => {
  it("rebuilds the engine public state from contract reads", () => {
    const { state } = initialState({ seats: 3, mode: "single", targetScore: 500, stackDrawTwo: true }, 4);
    const pub = state.pub;
    const table: ChainTable = {
      stage: 3,
      joined: 3,
      turn: pub.turn,
      dir: pub.dir,
      topCard: pub.topCard,
      color: pub.color,
      round: pub.round,
      deckPtr: 138 - pub.deckCount,
      veilBy: 255,
      veilJudge: 255,
      drawnSlot: 255,
      pendingDraw: 0,
      monoWindow: 255,
      drawFourBy: 255,
      prevColor: 0,
      candidate: 255,
      config: { targetScore: 500, singleRound: true, stackDrawTwo: true },
    };
    const seats: ChainSeat[] = pub.seats.map((s) => ({
      handSize: s.handSize,
      slots: s.slots.reduce((m, used, i) => (used ? m | (1 << i) : m), 0),
      saidMono: s.saidMono,
      timeouts: s.timeouts,
      abandoned: s.abandoned,
      veilUsed: s.veilUsed,
      score: s.score,
    }));
    const view = toPublicState(table, seats, pub.discard);
    expect(view).toEqual({ ...pub, recycles: false });
    const hand = state.hands[pub.turn] ?? [];
    expect(chooseMove(view!, pub.turn, hand)).toEqual(chooseMove(pub, pub.turn, hand));
  });

  it("counts a finished background refill as drawable cards", () => {
    expect(chainDeckCount({ deckPtr: 100 })).toBe(38);
    expect(chainDeckCount({ deckPtr: 100, deckEnd: 108, refillSize: 30, refillStep: 57 })).toBe(8);
    expect(chainDeckCount({ deckPtr: 108, deckEnd: 108, refillSize: 30, refillStep: 58 })).toBe(0);
    expect(chainDeckCount({ deckPtr: 108, deckEnd: 108, refillSize: 30, refillStep: 66 })).toBe(30);
    expect(chainDeckCount({ deckPtr: 3, deckEnd: 30 })).toBe(27);
  });

  it("returns null before play starts", () => {
    const table = { stage: 1 } as ChainTable;
    expect(toPublicState(table, [], [])).toBeNull();
  });

  it("maps a pending draw four", () => {
    const { state } = initialState({ seats: 2, mode: "match", targetScore: 500, stackDrawTwo: false }, 2);
    const seats: ChainSeat[] = state.pub.seats.map((s) => ({ ...s, slots: 0 }));
    const table = { stage: 4, joined: 2, turn: 1, dir: -1, topCard: 0x5e, color: 2, round: 0, deckPtr: 20, drawnSlot: 3, pendingDraw: 0, monoWindow: 0, drawFourBy: 0, prevColor: 1, candidate: 255, config: { targetScore: 500, singleRound: false, stackDrawTwo: false } };
    const view = toPublicState(table, seats, [1]);
    expect(view?.stage).toBe("AwaitChallenge");
    expect(view?.drawFour).toEqual({ by: 0, prevColor: 1 });
    expect(view?.dir).toBe(-1);
    expect(view?.drawnSlot).toBe(3);
    expect(view?.monoWindow).toBe(0);
    expect(view?.config.mode).toBe("match");
  });
});
