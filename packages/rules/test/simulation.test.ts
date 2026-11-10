import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DECK_SIZE,
  type GameState,
  HAND_SLOTS,
  type Transition,
  applyCatch,
  applyChallenge,
  applyMove,
  applyReveal,
  botCatchTarget,
  chooseMove,
  initialState,
  legalMoves,
  nextRound,
  randomInt,
} from "../src/index.js";
import { config, totalCards } from "./helpers.js";

const STEP_CAP = 3000;

function invariantError(state: GameState): string | null {
  if (totalCards(state) !== DECK_SIZE) return `card count ${totalCards(state)}`;
  if (state.pub.deckCount !== state.deck.length) return "deck count drift";
  for (const [i, seat] of state.pub.seats.entries()) {
    const hand = state.hands[i] ?? [];
    if (hand.length !== HAND_SLOTS) return `seat ${i} slot array`;
    const held = hand.filter((c) => c !== null).length;
    if (held !== seat.handSize || seat.slots.filter(Boolean).length !== held) return `seat ${i} hand size`;
    if (hand.some((card, slot) => (card !== null) !== seat.slots[slot])) return `seat ${i} slot map`;
  }
  return null;
}

function checkInvariants(state: GameState): void {
  const error = invariantError(state);
  if (error) expect.fail(error);
}

type Picker = (state: GameState, seat: number) => ReturnType<typeof chooseMove>;

function playRound(start: GameState, pick: Picker, cheaters: readonly number[] = []): { state: GameState; steps: number } {
  let state = start;
  let steps = 0;
  const run = (t: Transition) => {
    state = t.state;
    steps += 1;
  };
  while (steps < STEP_CAP) {
    if (state.pub.stage === "AwaitChallenge") {
      run(applyChallenge(state));
      continue;
    }
    if (state.pub.stage === "Revealing") {
      run(applyReveal(state));
      break;
    }
    if (state.pub.stage !== "Playing") break;
    const turn = state.pub.turn;
    const catcher = botCatchTarget(state.pub, (turn + 1) % state.pub.config.seats);
    if (catcher !== null && steps % 2 === 0) {
      run(applyCatch(state, catcher));
      continue;
    }
    const previous = state.pub.monoWindow;
    if (previous !== null && previous !== turn) {
      const mono = chooseMove(state.pub, previous, state.hands[previous] ?? []);
      if (mono?.type === "mono" && steps % 3 !== 0) {
        run(applyMove(state, previous, mono));
        continue;
      }
    }
    const move = cheaters.includes(turn)
      ? chooseMove(state.pub, turn, state.hands[turn] ?? [], { cheat: true })
      : pick(state, turn);
    if (!move) throw new Error("no move for the seat on turn");
    run(applyMove(state, turn, move));
    checkInvariants(state);
  }
  return { state, steps };
}

const botPick: Picker = (state, seat) => chooseMove(state.pub, seat, state.hands[seat] ?? []);

describe("simulation", () => {
  it("1000 bot rounds all finish without an illegal move", () => {
    let finished = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const seats = 2 + (seed % 3);
      const { state } = playRound(initialState(config(seats, "single", seed % 2 === 0), seed).state, botPick);
      expect(state.pub.stage).toBe("MatchOver");
      expect(state.pub.lastResult?.winner).not.toBeNull();
      expect(state.pub.lastResult?.cheaters).toEqual([]);
      finished += 1;
    }
    expect(finished).toBe(1000);
  }, 60_000);

  it("random legal moves keep every invariant", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 }), fc.integer({ min: 2, max: 4 }), (seed, seats) => {
        let rng = seed;
        const randomPick: Picker = (state, seat) => {
          const moves = legalMoves(state.pub, seat, state.hands[seat] ?? []);
          const step = randomInt(rng, moves.length);
          rng = step.next;
          return moves[step.value] ?? null;
        };
        const { state } = playRound(initialState(config(seats, "single", seed % 2 === 0), seed).state, randomPick);
        expect(["MatchOver", "Playing", "AwaitChallenge", "Revealing"]).toContain(state.pub.stage);
      }),
      { numRuns: 100 },
    );
  }, 60_000);

  it("a lying bot is caught at reveal", () => {
    let caught = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = playRound(initialState(config(3), seed).state, botPick, [0]);
      const result = state.pub.lastResult;
      if (state.honest[0] === false) {
        expect(result?.cheaters).toContain(0);
        expect(result?.winner).not.toBe(0);
        caught += 1;
      }
    }
    expect(caught).toBeGreaterThan(50);
  });

  it("a full match reaches the target score", () => {
    let state = initialState({ seats: 3, mode: "match", targetScore: 500, stackDrawTwo: false }, 5).state;
    let rounds = 0;
    while (state.pub.stage !== "MatchOver" && rounds < 100) {
      state = playRound(state, botPick).state;
      rounds += 1;
      if (state.pub.stage === "RoundOver") state = nextRound(state).state;
    }
    expect(state.pub.stage).toBe("MatchOver");
    expect(Math.max(...state.pub.seats.map((s) => s.score))).toBeGreaterThanOrEqual(500);
  });
});
