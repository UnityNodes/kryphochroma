import { describe, expect, it } from "vitest";
import { type PlannedAction, nextKeeperAction, scheduleKeeper, type TableView } from "../src/keeper/plan.js";

const base: TableView = { stage: 3, joined: 3, setupStep: 0, dealtMask: 0, turnDeadline: 100n, candidate: 255, revealPrepared: 0 };

describe("keeper plan", () => {
  it("drives the setup until all steps are sent", () => {
    expect(nextKeeperAction({ ...base, stage: 1, setupStep: 12 }, 0n)).toEqual({ kind: "setupStep", remaining: 58 });
  });

  it("deals missing seats, then reveals the starter", () => {
    expect(nextKeeperAction({ ...base, stage: 2, dealtMask: 0b001 }, 0n)).toEqual({ kind: "dealSeat", seat: 1, seats: [1, 2] });
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

  it("starts the discard refill only when the deck runs low and continues it to the end", () => {
    const playing = { ...base, turnDeadline: 1000n, deckPtr: 50, deckEnd: 108, spare: 30 };
    expect(nextKeeperAction(playing, 0n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...playing, deckPtr: 84 }, 0n)).toEqual({ kind: "reshuffleStep", remaining: 65 });
    expect(nextKeeperAction({ ...playing, deckPtr: 84, spare: 70 }, 0n)).toEqual({ kind: "reshuffleStep", remaining: 67 });
    expect(nextKeeperAction({ ...playing, deckPtr: 84, spare: 0 }, 0n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...playing, deckPtr: 84, spare: 9 }, 0n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...playing, deckPtr: 108, spare: 9 }, 0n)).toEqual({ kind: "reshuffleStep", remaining: 65 });
    expect(nextKeeperAction({ ...playing, refillSize: 30, refillStep: 50 }, 0n)).toEqual({ kind: "reshuffleStep", remaining: 16 });
    expect(nextKeeperAction({ ...playing, refillSize: 30, refillStep: 66 }, 0n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...playing, deckPtr: 108 }, 2000n)).toEqual({ kind: "forceTimeout" });
  });

  it("idles in the lobby and after the match", () => {
    expect(nextKeeperAction({ ...base, stage: 0 }, 999n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 7 }, 999n)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 42 }, 999n)).toEqual({ kind: "idle" });
  });

  it("pre-shuffles only pool tables in the lobby", () => {
    const pool = "0xAbc";
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, creator: "0xabc" }, 0n, pool)).toEqual({ kind: "setupStep", remaining: 60 });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 70, creator: "0xabc" }, 0n, pool)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, creator: "0xdef" }, 0n, pool)).toEqual({ kind: "idle" });
  });

  it("runs urgent steps first and gives every background shuffle a batch, started tables and the pool before refills", () => {
    const planned: PlannedAction[] = [
      { id: 5n, stage: 0, action: { kind: "setupStep", remaining: 52 } },
      { id: 4n, stage: 2, action: { kind: "revealStarter" } },
      { id: 3n, stage: 3, action: { kind: "idle" } },
      { id: 6n, stage: 1, action: { kind: "setupStep", remaining: 30 } },
      { id: 2n, stage: 3, action: { kind: "forceTimeout" } },
      { id: 7n, stage: 3, action: { kind: "reshuffleStep", remaining: 20 } },
    ];
    const { urgent, background } = scheduleKeeper(planned);
    expect(urgent.map((p) => p.id)).toEqual([4n, 2n]);
    expect(background.map((p) => p.id)).toEqual([6n, 5n, 7n]);
    expect(scheduleKeeper([planned[5]!, planned[0]!]).background.map((p) => p.id)).toEqual([5n, 7n]);
    expect(scheduleKeeper([planned[2]!])).toEqual({ urgent: [], background: [] });
  });
});
