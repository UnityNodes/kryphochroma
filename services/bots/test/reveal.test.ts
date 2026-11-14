import { describe, expect, it } from "vitest";
import { type GameEvent, type GameState, applyChallenge, applyMove, chooseMove, initialState } from "@kryphochroma/rules";
import { botReveal, sealed } from "../src/relay/reveal.js";

function play(until: (s: GameState) => boolean): GameState {
  let state = initialState({ seats: 3, mode: "single", targetScore: 500, stackDrawTwo: false }, 5).state;
  for (let step = 0; step < 900 && !until(state); step++) {
    if (state.pub.stage === "AwaitChallenge") {
      state = applyChallenge(state).state;
      continue;
    }
    const seat = state.pub.turn;
    const move = chooseMove(state.pub, seat, state.hands[seat] ?? []);
    if (!move) throw new Error("no move");
    state = applyMove(state, seat, move).state;
  }
  return state;
}

const bots = (seat: number) => seat !== 0;
const secrets = new Map([
  [1, 2],
  [2, 4],
]);

describe("bot reveal", () => {
  const over = play((s) => s.pub.stage === "Revealing");

  it("stays sealed while the round is still being played", () => {
    const playing = play((s) => s.pub.discard.length > 6);
    expect(playing.pub.stage).toBe("Playing");
    expect(botReveal(playing, bots, secrets)).toBeNull();
  });

  it("hands out every bot hand and secret once the round is over, never a player's", () => {
    const seats = botReveal(over, bots, secrets);
    expect(seats?.map((s) => s.seat)).toEqual([1, 2]);
    expect(seats?.[0]?.hand).toEqual(over.hands[1]);
    expect(seats?.[1]?.secret).toBe(4);
  });

  it("waits while a bot card or a secret colour is still unknown", () => {
    expect(botReveal(over, bots, new Map([[1, 2]]))).toBeNull();
    const hands = over.hands.map((hand, seat) => (seat === 2 ? [-1, ...hand.slice(1)] : hand));
    expect(botReveal({ ...over, hands }, bots, secrets)).toBeNull();
  });
});

describe("sealed stream events", () => {
  it("cuts the count of a sonar and leaves other events alone", () => {
    const sonar: GameEvent = { type: "Sonared", seat: 0, target: 1, color: 2, count: 3 };
    expect(sealed(sonar)).toEqual({ ...sonar, count: null });
    const drew: GameEvent = { type: "Drew", seat: 1, slot: 4 };
    expect(sealed(drew)).toBe(drew);
  });
});
