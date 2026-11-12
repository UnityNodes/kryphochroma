import { describe, expect, it } from "vitest";
import { roundEndSteps, sealedCardNote } from "@/components/table/ChainProgress";

const base = { pendingMoves: 0, chainStage: 5, revealPrepared: 0, seats: 4 };

describe("round end progress", () => {
  it("waits on the last moves while the chain is still playing", () => {
    const steps = roundEndSteps({ ...base, pendingMoves: 3, chainStage: 3 });
    expect(steps.map((s) => s.state)).toEqual(["active", "waiting", "waiting"]);
    expect(steps[0]?.detail).toBe("3 moves still on their way");
  });

  it("opens hands once the chain reached the reveal", () => {
    const steps = roundEndSteps({ ...base, revealPrepared: 2 });
    expect(steps.map((s) => s.state)).toEqual(["done", "active", "waiting"]);
    expect(steps[1]?.detail).toBe("2 of 4 hands marked for public decryption");
  });

  it("checks the KMS proof after every hand is open", () => {
    expect(roundEndSteps({ ...base, revealPrepared: 4 }).map((s) => s.state)).toEqual(["done", "done", "active"]);
  });

  it("marks every step done once the round is settled", () => {
    expect(roundEndSteps({ ...base, chainStage: 6, revealPrepared: 4 }).map((s) => s.state)).toEqual(["done", "done", "done"]);
  });
});

describe("sealed card note", () => {
  it("says nothing when every card is open", () => {
    expect(sealedCardNote(base, 0)).toBeNull();
  });

  it("names the relay while the draw is still queued", () => {
    expect(sealedCardNote({ ...base, pendingMoves: 2 }, 1)).toBe("Your new card: writing your draw to Sepolia (2 moves queued)");
  });

  it("names the KMS once the draw is on chain", () => {
    expect(sealedCardNote(base, 2)).toBe("2 new cards: Zama KMS is decrypting them for your key only");
  });
});
