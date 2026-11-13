import { describe, expect, it } from "vitest";
import { refillNote, roundEndSteps, sealedCardNote } from "@/components/table/ChainProgress";

const base = { pendingMoves: 0, chainStage: 5, revealPrepared: 0, seats: 4, refillStep: 0, refillTotal: 0 };

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
    expect(sealedCardNote(base, 0, 7)).toBeNull();
  });

  it("explains the block wait while the draw is still queued", () => {
    const note = sealedCardNote({ ...base, pendingMoves: 2 }, 1, 8);
    expect(note?.title).toBe("Writing your new card to Sepolia");
    expect(note?.why).toMatch(/12 s/);
    expect(note?.why).toMatch(/2 moves are queued/);
  });

  it("explains the KMS right after the deal", () => {
    const note = sealedCardNote(base, 7, 7);
    expect(note?.title).toBe("Opening your hand");
    expect(note?.why).toMatch(/not even our server/);
  });

  it("names how many cards the KMS still opens", () => {
    expect(sealedCardNote(base, 2, 9)?.title).toBe("Opening your cards, 2 still sealed");
    expect(sealedCardNote(base, 2, 9)?.phase).toBe(sealedCardNote(base, 7, 7)?.phase);
  });
});

describe("refill note", () => {
  it("stays quiet while the deck has cards", () => {
    expect(refillNote(base, 12)).toBeNull();
  });

  it("explains the on chain reshuffle and its progress once the deck is empty", () => {
    const note = refillNote({ ...base, refillStep: 20, refillTotal: 65 }, 0);
    expect(note?.title).toMatch(/fresh deck/);
    expect(note?.why).toMatch(/Step 20 of 65/);
  });
});
