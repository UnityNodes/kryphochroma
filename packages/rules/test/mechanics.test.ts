import { describe, expect, it } from "vitest";
import {
  type GameState,
  RuleError,
  applyChallenge,
  applyDoubt,
  applyDraw,
  applyPlay,
  applySonar,
  applyTimeout,
  sonarCount,
  applyVeil,
  chooseMove,
  legalMoves,
} from "../src/index.js";
import { B, G, R, V, WILD, WILD4, Y, game, types } from "./helpers.js";

function expectRule(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RuleError);
    expect((error as RuleError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

function oneCardLeft(state: GameState, seat: number, card: number): GameState {
  const slots = Array.from({ length: 24 }, (_, i) => i === 0);
  return {
    ...state,
    hands: state.hands.map((hand, i) => (i === seat ? hand.map((_, k) => (k === 0 ? card : null)) : hand)),
    pub: { ...state.pub, color: 1, topCard: Y(5), seats: state.pub.seats.map((x, i) => (i === seat ? { ...x, handSize: 1, slots } : x)) },
  };
}

const twoSeats = (): GameState =>
  game([[V(13), WILD4, B(3), B(4), B(5), B(6), V(7)], [Y(1), Y(2), Y(3), Y(10), WILD, Y(6), Y(7)]], V(5));

describe("spyglass", () => {
  it("lets the player read one opponent card and moves on", () => {
    const s = twoSeats();
    const t = applyPlay(s, 0, 0, V(13), undefined, { seat: 1, slot: 3 });
    expect(types(t)).toEqual(["Played", "Peeked"]);
    expect(t.events[1]).toEqual({ type: "Peeked", seat: 0, target: 1, slot: 3 });
    expect(t.state.pub.turn).toBe(1);
    expect(t.state.pub.color).toBe(4);
  });

  it("refuses a peek at yourself, an empty slot or nothing", () => {
    const s = twoSeats();
    expectRule(() => applyPlay(s, 0, 0, V(13)), "BadPeek");
    expectRule(() => applyPlay(s, 0, 0, V(13), undefined, { seat: 0, slot: 1 }), "BadPeek");
    expectRule(() => applyPlay(s, 0, 0, V(13), undefined, { seat: 1, slot: 20 }), "BadPeek");
    expectRule(() => applyPlay(s, 0, 0, V(13), undefined, { seat: 3, slot: 0 }), "BadPeek");
  });

  it("offers every opponent slot as a legal target", () => {
    const peeks = legalMoves(twoSeats().pub, 0, twoSeats().hands[0] ?? []).filter((m) => m.type === "play" && m.card === V(13));
    expect(peeks).toHaveLength(7);
  });
});

describe("sonar", () => {
  it("counts the target's cards of one colour, ignores wilds and passes the turn", () => {
    const t = applySonar(twoSeats(), 0, 1, 1);
    expect(t.events).toEqual([{ type: "Sonared", seat: 0, target: 1, color: 1, count: 6 }]);
    expect(t.state.pub.turn).toBe(1);
    expect(t.state.pub.seats[0]?.sonarUsed).toBe(true);
    expect(t.state.pub.topCard).toBe(V(5));
  });

  it("works once per round, never on yourself, never on a wild colour and not after a draw", () => {
    const s = twoSeats();
    expectRule(() => applySonar(s, 0, 0, 1), "BadSonar");
    expectRule(() => applySonar(s, 0, 1, 5), "BadSonar");
    expectRule(() => applySonar(s, 0, 3, 1), "BadSonar");
    expectRule(() => applySonar(s, 1, 0, 1), "NotYourTurn");
    const back = applySonar(applySonar(s, 0, 1, 1).state, 1, 0, 3).state;
    expectRule(() => applySonar(back, 0, 1, 2), "BadSonar");
    expectRule(() => applySonar(applyDraw(s, 0).state, 0, 1, 1), "DrawPending");
  });

  it("is offered as a legal move for every rival and colour until used", () => {
    const sonars = legalMoves(twoSeats().pub, 0, twoSeats().hands[0] ?? []).filter((m) => m.type === "sonar");
    expect(sonars).toHaveLength(5);
    const used = applySonar(applySonar(twoSeats(), 0, 1, 1).state, 1, 0, 2).state;
    expect(legalMoves(used.pub, 0, used.hands[0] ?? []).some((m) => m.type === "sonar")).toBe(false);
  });

  it("lets a stuck bot ping the rival closest to going out instead of drawing", () => {
    const dealt = game([[R(1), R(2), R(3), R(4), R(6), R(7), R(8)], [Y(1), Y(2), Y(3), Y(4), Y(6), Y(7), Y(8)]], B(5));
    const close = (st: GameState): GameState => ({ ...st, pub: { ...st.pub, seats: st.pub.seats.map((x, i) => (i === 1 ? { ...x, handSize: 2 } : x)) } });
    expect(chooseMove(close(dealt).pub, 0, dealt.hands[0] ?? [])).toEqual({ type: "sonar", target: 1, color: 3 });
    expect(chooseMove(dealt.pub, 0, dealt.hands[0] ?? [])).toEqual({ type: "draw" });
    const used = applySonar(applySonar(dealt, 0, 1, 3).state, 1, 0, 0).state;
    expect(chooseMove(close(used).pub, 0, used.hands[0] ?? [])).toEqual({ type: "draw" });
  });

  it("cannot count a hand it cannot see", () => {
    expect(sonarCount([Y(1), null, -1], 1)).toBeNull();
    expect(sonarCount([Y(1), null, Y(2), B(3)], 1)).toBe(2);
  });
});

describe("veil", () => {
  it("plays any card face down as a named number card without touching the honesty bit", () => {
    const s = twoSeats();
    const t = applyVeil(s, 0, 1, V(9));
    expect(types(t)).toEqual(["Veiled"]);
    expect(t.state.pub.topCard).toBe(V(9));
    expect(t.state.pub.discard.at(-1)).toBe(V(9));
    expect(t.state.pub.veil).toEqual({ by: 0, judge: 1, claim: V(9) });
    expect(t.state.veilTrue).toBe(false);
    expect(t.state.honest[0]).toBe(true);
    expect(t.state.pub.seats[0]?.veilUsed).toBe(true);
    expect(t.state.pub.seats[0]?.handSize).toBe(6);
  });

  it("allows one veil per round, needs two cards and a legal number claim", () => {
    const s = twoSeats();
    expectRule(() => applyVeil(s, 0, 1, WILD), "BadCard");
    expectRule(() => applyVeil(s, 0, 1, B(10)), "BadCard");
    expectRule(() => applyVeil(s, 0, 1, G(8)), "IllegalCard");
    expectRule(() => applyVeil(s, 1, 0, V(1)), "NotYourTurn");
    const used = { ...s, pub: { ...s.pub, seats: s.pub.seats.map((x, i) => (i === 0 ? { ...x, veilUsed: true } : x)) } };
    expectRule(() => applyVeil(used, 0, 1, V(1)), "VeilUsed");
    const short = { ...s, pub: { ...s.pub, seats: s.pub.seats.map((x, i) => (i === 0 ? { ...x, handSize: 1 } : x)) } };
    expectRule(() => applyVeil(short, 0, 1, V(1)), "VeilUsed");
  });

  it("a caught lie costs the veiler four cards and the judge keeps the turn", () => {
    const veiled = applyVeil(twoSeats(), 0, 1, V(9)).state;
    expect(legalMoves(veiled.pub, 1, veiled.hands[1] ?? []).some((m) => m.type === "doubt")).toBe(true);
    const doubted = applyDoubt(veiled, 1);
    expect(doubted.state.pub.stage).toBe("Playing");
    expect(doubted.state.pub.doubt).toEqual({ by: 0, judge: 1 });
    expect(doubted.state.pub.veil).toBeNull();
    const resolved = applyChallenge(doubted.state);
    expect(resolved.events).toContainEqual({ type: "VeilResolved", truth: false });
    expect(resolved.state.pub.seats[0]?.handSize).toBe(10);
    expect(resolved.state.pub.turn).toBe(1);
    expect(resolved.state.pub.veil).toBeNull();
    expect(resolved.state.pub.doubt).toBeNull();
    expect(resolved.state.pub.stage).toBe("Playing");
  });

  it("the judge plays on while the doubt is checked and the penalty lands when the bit arrives", () => {
    const doubted = applyDoubt(applyVeil(twoSeats(), 0, 1, V(9)).state, 1).state;
    const moves = legalMoves(doubted.pub, 1, doubted.hands[1] ?? []);
    expect(moves.some((m) => m.type === "draw")).toBe(true);
    expect(moves.some((m) => m.type === "veil" || m.type === "doubt")).toBe(false);
    const played = applyPlay(doubted, 1, 4, WILD, 3).state;
    expect(played.pub.turn).toBe(0);
    expect(played.pub.doubt).toEqual({ by: 0, judge: 1 });
    const resolved = applyChallenge(played);
    expect(resolved.state.pub.seats[0]?.handSize).toBe(10);
    expect(resolved.state.pub.turn).toBe(0);
    expect(resolved.state.pub.doubt).toBeNull();
  });

  it("nobody veils or goes out while a doubt is open", () => {
    const doubted = applyDoubt(applyVeil(twoSeats(), 0, 1, V(9)).state, 1).state;
    const lastCard = oneCardLeft(doubted, 1, Y(9));
    expectRule(() => applyPlay(lastCard, 1, 0, Y(9)), "DoubtPending");
    expect(legalMoves(lastCard.pub, 1, lastCard.hands[1] ?? []).some((m) => m.type === "play")).toBe(false);
    expect(chooseMove(lastCard.pub, 1, lastCard.hands[1] ?? [])).toBeNull();
    const settled = applyChallenge(lastCard).state;
    expect(settled.pub.seats[1]?.handSize).toBe(1);
    expect(applyPlay(settled, 1, 0, Y(9)).state.pub.stage).toBe("Revealing");
    const fresh = { ...doubted, pub: { ...doubted.pub, seats: doubted.pub.seats.map((x) => ({ ...x, veilUsed: false })) } };
    expectRule(() => applyVeil(fresh, 1, 0, Y(9)), "VeilUsed");
  });

  it("a wrong doubt costs the judge two cards", () => {
    const veiled = applyVeil(twoSeats(), 0, 6, V(7)).state;
    expect(veiled.veilTrue).toBe(true);
    const resolved = applyChallenge(applyDoubt(veiled, 1).state);
    expect(resolved.events).toContainEqual({ type: "VeilResolved", truth: true });
    expect(resolved.state.pub.seats[1]?.handSize).toBe(9);
    expect(resolved.state.pub.turn).toBe(1);
  });

  it("any other first action of the judge accepts the veil", () => {
    const veiled = applyVeil(twoSeats(), 0, 1, V(9)).state;
    const drew = applyDraw(veiled, 1).state;
    expect(drew.pub.veil).toBeNull();
    expectRule(() => applyDoubt(drew, 1), "NoVeil");
    expectRule(() => applyDoubt(veiled, 0), "NoVeil");
    expect(applyTimeout(veiled).state.pub.veil).toBeNull();
  });

  it("bots doubt a claim they can prove impossible and veil their worst card when stuck", () => {
    const holdsZero = game([[V(13), WILD4, B(3), B(4), B(5), B(6), V(7)], [Y(1), V(0), Y(3), Y(10), WILD, Y(6), Y(7)]], V(5));
    const veiled = applyVeil(holdsZero, 0, 1, V(0)).state;
    expect(chooseMove(veiled.pub, 1, veiled.hands[1] ?? [])).toEqual({ type: "doubt" });
    const plausible = applyVeil(holdsZero, 0, 1, V(9)).state;
    expect(chooseMove(plausible.pub, 1, plausible.hands[1] ?? [])?.type).not.toBe("doubt");
    const stuck = game([[B(3), B(10), B(4), G(5), G(6), B(6), G(7)], [Y(1), Y(2), Y(3), Y(10), WILD, Y(6), Y(7)]], R(8));
    const move = chooseMove(stuck.pub, 0, stuck.hands[0] ?? []);
    expect(move).toMatchObject({ type: "veil", slot: 1 });
  });
});
