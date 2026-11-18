import { type GameEvent, type GameState, HAND_START, applyMove, cardOf, initialState, legalMoves } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { type TableModel, beginMove, endMove, modelOf, planMoves } from "@/components/table3d/model";
import { MS } from "@/game/flight";
import { handOrder } from "@/game/handOrder";

function deal(seats: number, seed = 7): GameState {
  return initialState({ seats, mode: "single", targetScore: 500, stackDrawTwo: false }, seed).state;
}

const never = () => false;

describe("table model", () => {
  it("lists the rivals clockwise from the viewer with their hand sizes", () => {
    const state = deal(4);
    expect(modelOf(state, 0, false, never).rivals).toEqual([1, 2, 3].map((seat) => ({ seat, count: HAND_START })));
    expect(modelOf(state, 2, false, never).rivals.map((r) => r.seat)).toEqual([3, 0, 1]);
    expect(modelOf(deal(2), 0, false, never).rivals).toEqual([{ seat: 1, count: HAND_START }]);
  });

  it("keeps the hand in the order the hidden buttons use and marks playable slots", () => {
    const state = deal(3);
    const model = modelOf(state, 0, false, (slot) => slot === 2);
    expect(model.hand.map((c) => c.slot)).toEqual(handOrder(state.hands[0] ?? []).map((e) => e.slot));
    expect(model.hand.filter((c) => c.playable).map((c) => c.slot)).toEqual([2]);
    expect(model.own).toBeNull();
    expect(model.deck).toBe(state.pub.deckCount);
    expect(model.pile).toEqual(state.pub.discard);
    expect(model.color).toBe(state.pub.color);
    expect(model.veiled).toBe(false);
  });

  it("never shows a value for a card that is still being decrypted", () => {
    const state = deal(2);
    const hands = state.hands.map((hand, seat) => (seat === 0 ? hand.map((card, slot) => (slot === 1 && card !== null ? -5 : card)) : hand));
    const model = modelOf({ ...state, hands }, 0, false, () => true);
    const sealed = model.hand.filter((c) => c.card < 0);
    expect(sealed.map((c) => c.slot)).toEqual([1]);
    expect(model.hand[model.hand.length - 1]?.slot).toBe(1);
    expect(sealed[0]?.playable).toBe(false);
  });

  it("gives a watcher no hand and lays their seat as a sealed row", () => {
    const model = modelOf(deal(3), 0, true, () => true);
    expect(model.hand).toEqual([]);
    expect(model.own).toEqual({ seat: 0, count: HAND_START });
  });
});

describe("event to move mapping", () => {
  const state = deal(2);
  const play = (seat: number, slot: number, card: number): GameEvent => ({ type: "Played", seat, slot, card, color: 2 });
  const drew = (seat: number, slot: number): GameEvent => ({ type: "Drew", seat, slot });

  it("gives a played card the queue's play time and a drawn card its draw time", () => {
    const plan = planMoves([play(1, 3, cardOf(2, 5))], state, 0, false);
    expect(plan.moves).toEqual([{ kind: "play", at: 0, dur: MS.play, seat: 1, slot: 3, card: cardOf(2, 5), faceDown: false, color: 2 }]);
    expect(plan.total).toBe(MS.play);
    const draw = planMoves([drew(1, 7)], state, 0, false);
    expect(draw.moves).toEqual([{ kind: "draw", at: 0, dur: MS.draw, seat: 1, slot: 7, card: null }]);
    expect(draw.total).toBe(MS.draw);
  });

  it("staggers penalty draws and plays them after the card that caused them", () => {
    const plan = planMoves([play(0, 0, cardOf(1, 12)), drew(1, 7), drew(1, 8)], state, 0, false);
    expect(plan.moves.map((m) => [m.kind, m.at])).toEqual([
      ["play", 0],
      ["draw", MS.play],
      ["draw", MS.play + MS.stagger],
    ]);
    expect(plan.total).toBe(MS.play + MS.stagger + MS.draw);
  });

  it("waits for running draws before the next card is played", () => {
    const plan = planMoves([drew(1, 7), play(1, 7, cardOf(0, 3))], state, 0, false);
    expect(plan.moves[1]?.at).toBe(MS.draw);
    expect(plan.total).toBe(MS.draw + MS.play);
  });

  it("shows my drawn card only when its value has arrived", () => {
    const slot = (state.hands[0] ?? []).findIndex((c) => c === null);
    const known = { ...state, hands: state.hands.map((hand, seat) => (seat === 0 ? hand.map((c, s) => (s === slot ? cardOf(3, 9) : c)) : hand)) };
    const sealed = { ...state, hands: state.hands.map((hand, seat) => (seat === 0 ? hand.map((c, s) => (s === slot ? -9 : c)) : hand)) };
    expect(planMoves([drew(0, slot)], known, 0, false).moves[0]).toMatchObject({ kind: "draw", card: cardOf(3, 9) });
    expect(planMoves([drew(0, slot)], sealed, 0, false).moves[0]).toMatchObject({ kind: "draw", card: null });
    expect(planMoves([drew(0, slot)], known, 0, true).moves[0]).toMatchObject({ kind: "draw", card: null });
  });

  it("lays a veiled card face down as the claimed card and refills the deck", () => {
    const plan = planMoves([{ type: "Veiled", seat: 1, slot: 2, claim: cardOf(4, 6) }, { type: "Reshuffled", count: 60 }], state, 0, false);
    expect(plan.moves[0]).toEqual({ kind: "play", at: 0, dur: MS.play, seat: 1, slot: 2, card: cardOf(4, 6), faceDown: true, color: 4 });
    expect(plan.moves[1]).toEqual({ kind: "refill", at: MS.play, dur: 0, count: 60 });
  });

  it("has no move for events that only change words on the table", () => {
    const quiet: GameEvent[] = [{ type: "Passed", seat: 1 }, { type: "MonoSaid", seat: 1 }, { type: "VeilDoubted", seat: 0 }, { type: "Sonared", seat: 0, target: 1, color: 2, count: 1 }];
    expect(planMoves(quiet, state, 0, false)).toEqual({ moves: [], total: 0 });
  });
});

describe("moves applied to the model", () => {
  function playFirst(state: GameState, seat: number) {
    const moves = legalMoves(state.pub, seat, state.hands[seat] ?? []);
    const move = moves.find((m) => m.type === "play") ?? moves.find((m) => m.type === "draw") ?? moves.find((m) => m.type === "pass" || m.type === "take" || m.type === "accept");
    if (!move) throw new Error("no move");
    return applyMove(state, seat, move.type === "play" ? { ...move, color: 1 } : move);
  }

  function replay(before: GameState, after: GameState, events: readonly GameEvent[], me: number): TableModel {
    let model = modelOf(before, me, false, never);
    for (const move of planMoves(events, after, me, false).moves) {
      model = beginMove(model, move, me);
      model = endMove(model, move, me);
    }
    return model;
  }

  it("ends in the state the rules reached, whoever moved", () => {
    let state = deal(3, 11);
    for (let step = 0; step < 40 && state.pub.stage === "Playing"; step++) {
      const next = playFirst(state, state.pub.turn);
      const model = replay(state, next.state, next.events, 0);
      const want = modelOf(next.state, 0, false, never);
      expect(model.rivals).toEqual(want.rivals);
      expect(model.hand.map((c) => [c.slot, c.card])).toEqual(want.hand.map((c) => [c.slot, c.card]));
      expect(model.deck).toBe(want.deck);
      expect(model.pile).toEqual(want.pile);
      expect(model.color).toBe(want.color);
      state = next.state;
    }
  });

  it("keeps a drawn card sealed until the move ends", () => {
    const state = deal(2, 3);
    const slot = (state.hands[0] ?? []).findIndex((c) => c === null);
    const move = { kind: "draw", at: 0, dur: MS.draw, seat: 0, slot, card: cardOf(0, 4) } as const;
    const flying = beginMove(modelOf(state, 0, false, never), move, 0);
    expect(flying.hand.find((c) => c.slot === slot)?.card).toBeLessThan(0);
    expect(flying.hand[flying.hand.length - 1]?.slot).toBe(slot);
    expect(flying.deck).toBe(state.pub.deckCount - 1);
    expect(endMove(flying, move, 0).hand.find((c) => c.slot === slot)?.card).toBe(cardOf(0, 4));
  });

  it("marks the pile veiled while a face down card is on top and clears it on the next play", () => {
    const state = deal(2, 3);
    const veil = { kind: "play", at: 0, dur: MS.play, seat: 1, slot: 0, card: cardOf(1, 2), faceDown: true, color: 1 } as const;
    const veiled = beginMove(modelOf(state, 0, false, never), veil, 0);
    expect(veiled.veiled).toBe(true);
    expect(veiled.rivals[0]?.count).toBe(HAND_START - 1);
    const open = beginMove(veiled, { ...veil, faceDown: false, card: cardOf(1, 5) }, 0);
    expect(open.veiled).toBe(false);
    expect(open.pile.slice(-2)).toEqual([cardOf(1, 2), cardOf(1, 5)]);
  });
});
