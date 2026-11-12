import { describe as group, expect, it } from "vitest";
import { type GameState, applyMove, chooseMove } from "@kryphochroma/rules";
import { HUMAN, describe, newOfflineGame, nextAutoStep } from "@/game/offline";

function playOut(seats: number, seed: number): { state: GameState; steps: number } {
  let state = newOfflineGame({ seats, stackDrawTwo: seed % 2 === 0, seed }).state;
  let steps = 0;
  while (steps < 3000) {
    steps++;
    const step = nextAutoStep(state, () => 0);
    if (step.kind === "over") break;
    if (step.kind === "auto") {
      state = step.transition.state;
      continue;
    }
    const move = chooseMove(state.pub, HUMAN, state.hands[HUMAN] ?? []);
    if (!move) throw new Error("human has no move");
    state = applyMove(state, HUMAN, move).state;
  }
  return { state, steps };
}

group("offline driver", () => {
  it("runs bots until the human has to act, then finishes the game", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = playOut(2 + (seed % 3), seed);
      expect(state.pub.stage).toBe("MatchOver");
    }
  });

  it("hands control to the human on their turn", () => {
    const { state } = newOfflineGame({ seats: 3, stackDrawTwo: false, seed: 3 });
    expect(state.pub.turn).toBe(HUMAN);
    expect(nextAutoStep(state, () => 0).kind).toBe("human");
  });

  it("describes events for the feed", () => {
    expect(describe({ type: "Played", seat: 1, slot: 0, card: 39, color: 2 })?.text).toBe("Mira played Teal 7");
    expect(describe({ type: "Drew", seat: 0, slot: 3 })?.sub).toBe("decrypted for you only");
    expect(describe({ type: "RoundSettled", winner: 2, points: 40, cheaters: [1] })?.sub).toBe("caught lying: Mira");
    expect(describe({ type: "RoundSettled", winner: null, points: 0, cheaters: [0, 1] })?.text).toBe("No honest winner");
    expect(describe({ type: "Dealt", round: 0, firstSeat: 0, topCard: 3 })).toBeNull();
    expect(describe({ type: "MonoSaid", seat: 1 })).toMatchObject({ icon: "mono", actor: "Mira" });
    expect(describe({ type: "MonoSaid", seat: 0 })?.actor).toBe("You");
    expect(describe({ type: "MonoCaught", seat: 2 })).toMatchObject({ icon: "caught" });
    expect(describe({ type: "MonoCaught", seat: 2 })?.actor).toBeUndefined();
  });
});
