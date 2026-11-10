import { describe, expect, it } from "vitest";
import {
  type GameState,
  RuleError,
  applyAcceptDrawFour,
  applyCatch,
  applyChallenge,
  applyChallengeDrawFour,
  applyDraw,
  applyMono,
  applyPass,
  applyPlay,
  applyReveal,
  applyTimeout,
  canSayMono,
  catchableSeat,
  legalMoves,
} from "../src/index.js";
import { B, G, R, WILD, WILD4, Y, game, types } from "./helpers.js";

function expectRule(fn: () => unknown, code: string): void {
  expect(fn).toThrow(RuleError);
  try {
    fn();
  } catch (error) {
    expect((error as RuleError).code).toBe(code);
  }
}

function withHandSize(state: GameState, seat: number, keep: number): GameState {
  const hand = state.hands[seat]?.map((c, i) => (i < keep ? c : null)) ?? [];
  const seats = state.pub.seats.map((s, i) =>
    i === seat ? { ...s, handSize: keep, slots: s.slots.map((_, j) => j < keep) } : s,
  );
  const hands = state.hands.map((h, i) => (i === seat ? hand : h));
  return { ...state, hands, pub: { ...state.pub, seats } };
}

describe("mono", () => {
  const twoLeft = () =>
    withHandSize(game([[R(1), R(2), B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)], [G(1), G(2), G(3), G(4), G(5), G(6), G(7)]], R(5)), 0, 2);

  it("opens a catch window when a seat drops to one card without calling", () => {
    const { state } = applyPlay(twoLeft(), 0, 0, R(1));
    expect(state.pub.monoWindow).toBe(0);
    expect(catchableSeat(state.pub)).toBe(0);
    const caught = applyCatch(state, 0);
    expect(caught.state.pub.seats[0]?.handSize).toBe(3);
    expect(types(caught)).toEqual(["MonoCaught", "Drew", "Drew"]);
    expectRule(() => applyCatch(caught.state, 0), "CannotCatch");
  });

  it("lets the seat call mono after playing to close the window", () => {
    const played = applyPlay(twoLeft(), 0, 0, R(1)).state;
    const said = applyMono(played, 0).state;
    expect(said.pub.monoWindow).toBeNull();
    expect(said.pub.seats[0]?.saidMono).toBe(true);
    expectRule(() => applyCatch(said, 0), "CannotCatch");
    expectRule(() => applyMono(said, 0), "CannotSayMono");
  });

  it("lets the seat call mono before playing with two cards", () => {
    const s = twoLeft();
    expect(canSayMono(s.pub, 0)).toBe(true);
    expect(legalMoves(s.pub, 0, s.hands[0] ?? [])[0]).toEqual({ type: "mono" });
    const played = applyPlay(applyMono(s, 0).state, 0, 0, R(1)).state;
    expect(played.pub.monoWindow).toBeNull();
  });

  it("closes the window once the next seat acts", () => {
    const played = applyPlay(twoLeft(), 0, 0, R(1)).state;
    const next = applyDraw(played, 1).state;
    expect(catchableSeat(next.pub)).toBeNull();
    expectRule(() => applyCatch(next, 0), "CannotCatch");
    expectRule(() => applyMono(next, 0), "CannotSayMono");
  });

  it("resets the call after drawing", () => {
    const said = applyMono(twoLeft(), 0).state;
    const drew = applyDraw(said, 0).state;
    expect(drew.pub.seats[0]?.saidMono).toBe(false);
  });
});

describe("wild draw four", () => {
  const withRed = () => game([[WILD4, R(1), B(2), B(3), B(4), B(5), B(6)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5));
  const noRed = () => game([[WILD4, G(1), B(2), B(3), B(4), B(5), B(6)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5));

  it("opens a decision window for the next seat and records the hidden bit", () => {
    const { state } = applyPlay(withRed(), 0, 0, WILD4, 2);
    expect(state.pub.turn).toBe(1);
    expect(state.pub.color).toBe(2);
    expect(state.pub.drawFour).toEqual({ by: 0, prevColor: 0 });
    expect(state.hadColor).toBe(true);
    expect(legalMoves(state.pub, 1, state.hands[1] ?? [])).toEqual([{ type: "accept" }, { type: "challenge" }]);
    expectRule(() => applyPlay(state, 1, 0, Y(1)), "DrawFourPending");
    expectRule(() => applyDraw(state, 1), "DrawFourPending");
    expectRule(() => applyPass(state, 1), "DrawFourPending");
  });

  it("accept draws four and loses the turn", () => {
    const played = applyPlay(noRed(), 0, 0, WILD4, 2).state;
    const { state } = applyAcceptDrawFour(played, 1);
    expect(state.pub.seats[1]?.handSize).toBe(11);
    expect(state.pub.turn).toBe(0);
    expect(state.pub.drawFour).toBeNull();
    expectRule(() => applyAcceptDrawFour(state, 0), "NoDrawFour");
    expectRule(() => applyChallengeDrawFour(state, 0), "NoDrawFour");
  });

  it("a caught bluff makes the bluffer draw four and the challenger keeps the turn", () => {
    const played = applyPlay(withRed(), 0, 0, WILD4, 2).state;
    const waiting = applyChallengeDrawFour(played, 1).state;
    expect(waiting.pub.stage).toBe("AwaitChallenge");
    expectRule(() => applyTimeout(waiting), "WrongStage");
    const { state, events } = applyChallenge(waiting);
    expect(events[0]).toEqual({ type: "ChallengeResolved", bit: true });
    expect(state.pub.seats[0]?.handSize).toBe(10);
    expect(state.pub.seats[1]?.handSize).toBe(7);
    expect(state.pub.turn).toBe(1);
    expect(state.pub.stage).toBe("Playing");
  });

  it("a failed challenge costs six and the turn", () => {
    const played = applyPlay(noRed(), 0, 0, WILD4, 2).state;
    const { state } = applyChallenge(applyChallengeDrawFour(played, 1).state, false);
    expect(state.pub.seats[1]?.handSize).toBe(13);
    expect(state.pub.turn).toBe(0);
  });

  it("needs a bit to resolve", () => {
    const played = applyPlay(noRed(), 0, 0, WILD4, 2).state;
    const waiting = applyChallengeDrawFour(played, 1).state;
    expectRule(() => applyChallenge({ ...waiting, hadColor: null }), "BadReveal");
  });
});

describe("timeouts", () => {
  const base = () => game([[B(1), B(2), B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5));

  it("draws one and passes for the idle seat", () => {
    const { state, events } = applyTimeout(base());
    expect(types({ state, events })).toEqual(["TimedOut", "Drew"]);
    expect(state.pub.seats[0]?.handSize).toBe(8);
    expect(state.pub.seats[0]?.timeouts).toBe(1);
    expect(state.pub.turn).toBe(1);
  });

  it("only passes when the seat already drew", () => {
    const drew = applyDraw(base(), 0).state;
    const { state } = applyTimeout(drew);
    expect(state.pub.seats[0]?.handSize).toBe(8);
    expect(state.pub.drawnSlot).toBeNull();
  });

  it("accepts a pending draw four", () => {
    const s = game([[WILD4, B(1), B(2), B(3), B(4), B(5), B(6)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5));
    const played = applyPlay(s, 0, 0, WILD4, 1).state;
    const { state } = applyTimeout(played);
    expect(state.pub.seats[1]?.handSize).toBe(11);
    expect(state.pub.drawFour).toBeNull();
    expect(state.pub.turn).toBe(0);
  });

  it("marks a seat abandoned after three in a row and resets on a real move", () => {
    let s = base();
    const t1 = applyTimeout(s).state;
    const back = applyDraw(applyTimeout(t1).state, 0).state;
    expect(back.pub.seats[0]?.timeouts).toBe(0);
    s = t1;
    for (let i = 0; i < 2; i++) s = applyTimeout(applyTimeout(s).state).state;
    expect(s.pub.seats[0]?.abandoned).toBe(true);
    expect(s.pub.seats[1]?.abandoned).toBe(false);
    expect(s.pub.seats[1]?.timeouts).toBe(2);
  });
});

describe("reveal and scoring", () => {
  const lastCard = (mode: "single" | "match" = "single") =>
    withHandSize(game([[R(1), WILD, B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(10), WILD, Y(6), Y(7)]], R(5), mode), 0, 1);

  it("ends the round when a hand is empty and pays the winner", () => {
    const played = applyPlay(lastCard(), 0, 0, R(1));
    expect(played.state.pub.stage).toBe("Revealing");
    expect(types(played)).toEqual(["Played", "RevealStarted"]);
    expectRule(() => applyPlay(played.state, 1, 0, Y(1)), "WrongStage");
    const { state, events } = applyReveal(played.state);
    expect(state.pub.lastResult).toEqual({ winner: 0, points: 1 + 2 + 3 + 20 + 50 + 6 + 7, cheaters: [] });
    expect(state.pub.seats[0]?.score).toBe(89);
    expect(state.pub.stage).toBe("MatchOver");
    expect(types({ state, events })).toEqual(["RoundSettled", "MatchOver"]);
  });

  it("keeps the match going until the target score", () => {
    const { state } = applyReveal(applyPlay(lastCard("match"), 0, 0, R(1)).state);
    expect(state.pub.stage).toBe("RoundOver");
  });

  it("gives the round to the best honest seat when the winner lied", () => {
    const s = withHandSize(game([[B(9), WILD, B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(10), WILD, Y(6), Y(7)], [G(1), G(1), G(2), G(2), G(3), G(3), G(4)]], R(5)), 0, 1);
    const played = applyPlay(s, 0, 0, R(9)).state;
    expect(played.honest[0]).toBe(false);
    const { state } = applyReveal(played);
    expect(state.pub.lastResult).toEqual({ winner: 2, points: 1 + 2 + 3 + 20 + 50 + 6 + 7 + 100, cheaters: [0] });
    expect(state.pub.seats[2]?.score).toBe(189);
    expect(state.pub.seats[0]?.score).toBe(0);
  });

  it("applies a pending draw two or four from the winning card", () => {
    const s = withHandSize(game([[R(12), WILD, B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5)), 0, 1);
    expect(applyPlay(s, 0, 0, R(12)).state.pub.seats[1]?.handSize).toBe(9);
    const w = withHandSize(game([[WILD4, WILD, B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(4), Y(5), Y(6), Y(7)]], R(5)), 0, 1);
    const played = applyPlay(w, 0, 0, WILD4, 1).state;
    expect(played.pub.seats[1]?.handSize).toBe(11);
    expect(played.pub.drawFour).toBeNull();
  });

  it("accepts an external reveal and rejects malformed ones", () => {
    const played = applyPlay(lastCard(), 0, 0, R(1)).state;
    expectRule(() => applyReveal(played, { honest: [true], hands: [[]] }), "BadReveal");
    const { state } = applyReveal(played, { honest: [false, false], hands: [[], [Y(1)]] });
    expect(state.pub.lastResult).toEqual({ winner: null, points: 0, cheaters: [0, 1] });
    expect(state.pub.stage).toBe("MatchOver");
  });
});

describe("cheat penalty", () => {
  it("takes points from a cheater who already scored", () => {
    const s = withHandSize(game([[B(9), WILD, B(3), B(4), B(5), B(6), B(7)], [Y(1), Y(2), Y(3), Y(10), WILD, Y(6), Y(7)]], R(5), "match"), 0, 1);
    const scored = { ...s, pub: { ...s.pub, seats: s.pub.seats.map((x, i) => (i === 0 ? { ...x, score: 150 } : x)) } };
    const { state } = applyReveal(applyPlay(scored, 0, 0, R(9)).state);
    expect(state.pub.seats[0]?.score).toBe(50);
    expect(state.pub.lastResult?.winner).toBe(1);
    expect(state.pub.lastResult?.points).toBe(100);
  });
});
