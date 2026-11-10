import { describe, expect, it } from "vitest";
import { nextKeeperAction, type TableView } from "../src/keeper/plan.js";

const base: TableView = { stage: 3, joined: 3, setupStep: 0, dealtMask: 0, turnDeadline: 100n, candidate: 255, revealPrepared: 0 };

describe("keeper plan", () => {
  it("drives the setup until all steps are sent", () => {
    expect(nextKeeperAction({ ...base, stage: 1, setupStep: 12 }, 0n)).toEqual({ kind: "setupStep", remaining: 48 });
  });

  it("deals missing seats, then reveals the starter", () => {
    expect(nextKeeperAction({ ...base, stage: 2, dealtMask: 0b001 }, 0n)).toEqual({ kind: "dealSeat", seat: 1 });
    expect(nextKeeperAction({ ...base, stage: 2, dealtMask: 0b111 }, 0n)).toEqual({ kind: "revealStarter" });
  });

  it("resolves challenges and reveals", () => {
    expect(nextKeeperAction({ ...base, stage: 4 }, 0n)).toEqual({ kind: "resolveChallenge" });
    expect(nextKeeperAction({ ...base, stage: 5, candidate: 1 }, 0n)).toEqual({ kind: "prepareReveal" });
    expect(nextKeeperAction({ ...base, stage: 5, candidate: 1, revealPrepared: 3 }, 0n)).toEqual({ kind: "finishReveal" });
    expect(nextKeeperAction({ ...base, stage: 5 }, 0n)).toEqual({ kind: "idle" });
  });

  it("pushes a timed out turn only after the deadline", () => {
    expect(nextKeeperAction(base, 100n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction(base, 101n)).toEqual({ kind: "forceTimeout" });
  });

  it("idles in the lobby and after the match", () => {
    expect(nextKeeperAction({ ...base, stage: 0 }, 999n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 7 }, 999n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 42 }, 999n)).toEqual({ kind: "idle" });
  });
});
