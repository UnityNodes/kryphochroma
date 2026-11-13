import { describe, expect, it } from "vitest";
import { type PlannedAction, nextKeeperAction, scheduleKeeper, type TableView } from "../src/keeper/plan.js";

const base: TableView = { stage: 3, joined: 3, setupStep: 0, dealtMask: 0, turnDeadline: 100n, candidate: 255, revealPrepared: 0 };

describe("keeper plan", () => {
  it("drives the setup until all steps are sent", () => {
    expect(nextKeeperAction({ ...base, stage: 1, setupStep: 12 }, 0n)).toEqual({ kind: "setupStep", remaining: 58 });
  });

  it("deals every seat at once, reveals the starter alongside when it is still hidden", () => {
    expect(nextKeeperAction({ ...base, stage: 2, topCard: 255 }, 0n)).toEqual({ kind: "deal", reveal: true });
    expect(nextKeeperAction({ ...base, stage: 2, topCard: 17 }, 0n)).toEqual({ kind: "deal", reveal: false });
    expect(nextKeeperAction({ ...base, stage: 2, dealtMask: 0b111, topCard: 255 }, 0n)).toEqual({ kind: "revealStarter" });
    expect(nextKeeperAction({ ...base, stage: 2, dealtMask: 0b111, topCard: 17 }, 0n)).toEqual({ kind: "idle" });
  });

  it("reveals the starter of a shuffled lobby before anyone asks to start", () => {
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 70, topCard: 255 }, 0n)).toEqual({ kind: "revealStarter" });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 70, topCard: 17 }, 0n)).toEqual({ kind: "idle" });
  });

  it("resolves challenges and reveals", () => {
    expect(nextKeeperAction({ ...base, stage: 4 }, 0n)).toEqual({ kind: "resolveChallenge" });
    expect(nextKeeperAction({ ...base, stage: 5, candidate: 1 }, 0n)).toEqual({ kind: "prepareReveal", remaining: 3 });
    expect(nextKeeperAction({ ...base, stage: 5, candidate: 1, revealPrepared: 1 }, 0n)).toEqual({ kind: "prepareReveal", remaining: 2 });
    expect(nextKeeperAction({ ...base, stage: 5, candidate: 1, revealPrepared: 3 }, 0n)).toEqual({ kind: "finishReveal" });
    expect(nextKeeperAction({ ...base, stage: 5 }, 0n)).toEqual({ kind: "idle" });
  });

  it("refills the deck of a running game before the pool shuffles", () => {
    const refill = { id: 9n, stage: 3, action: { kind: "reshuffleStep" as const, remaining: 60 } };
    const lobby = { id: 2n, stage: 0, joined: 1, action: { kind: "setupStep" as const, remaining: 5 } };
    const pool = { id: 3n, stage: 0, joined: 0, action: { kind: "setupStep" as const, remaining: 2 } };
    expect(scheduleKeeper([pool, lobby, refill]).background.map((p) => p.id)).toEqual([2n, 9n]);
  });

  it("fills the draw queues first once play opens, even past a deadline", () => {
    expect(nextKeeperAction({ ...base, queuesFilled: false }, 50n)).toEqual({ kind: "fillQueues" });
    expect(nextKeeperAction({ ...base, queuesFilled: false }, 500n)).toEqual({ kind: "fillQueues" });
    expect(nextKeeperAction({ ...base, queuesFilled: true }, 500n)).toEqual({ kind: "forceTimeout" });
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

  it("pre-shuffles pool tables and lobbies someone already sits at, so a friends table is ready when it starts", () => {
    const pool = "0xAbc";
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, joined: 0, creator: "0xabc" }, 0n, pool)).toEqual({ kind: "setupStep", remaining: 60 });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 70, topCard: 17, creator: "0xabc" }, 0n, pool)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, joined: 1, creator: "0xdef" }, 0n, pool)).toEqual({ kind: "setupStep", remaining: 60 });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, joined: 0, creator: "0xdef" }, 0n, pool)).toEqual({ kind: "idle" });
    expect(nextKeeperAction({ ...base, stage: 0, setupStep: 10, joined: 1, creator: "0xdef" }, 0n)).toEqual({ kind: "idle" });
  });

  it("runs urgent steps first and gives every background shuffle a batch, started tables and refills before the pool", () => {
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
    expect(background.map((p) => p.id)).toEqual([7n, 6n, 5n]);
    expect(scheduleKeeper([planned[5]!, planned[0]!]).background.map((p) => p.id)).toEqual([7n, 5n]);
    expect(scheduleKeeper([planned[2]!])).toEqual({ urgent: [], background: [] });
  });

  it("finishes the most shuffled lobby before touching the next one", () => {
    const lobbies: PlannedAction[] = [
      { id: 1n, stage: 0, action: { kind: "setupStep", remaining: 30 } },
      { id: 2n, stage: 0, action: { kind: "setupStep", remaining: 12 } },
      { id: 3n, stage: 1, action: { kind: "setupStep", remaining: 50 } },
    ];
    expect(scheduleKeeper(lobbies).background.map((p) => p.id)).toEqual([3n, 2n]);
  });

  it("shuffles the lobby a player waits at before spare tables and running shuffles", () => {
    const lobbies: PlannedAction[] = [
      { id: 1n, stage: 0, joined: 0, action: { kind: "setupStep", remaining: 4 } },
      { id: 2n, stage: 0, joined: 1, action: { kind: "setupStep", remaining: 60 } },
      { id: 3n, stage: 1, joined: 4, action: { kind: "setupStep", remaining: 10 } },
    ];
    expect(scheduleKeeper(lobbies).background.map((p) => p.id)).toEqual([2n, 3n]);
  });
});
