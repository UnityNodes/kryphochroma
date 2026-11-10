"use client";

import { type Move, RuleError, applyCatch } from "@kryphochroma/rules";
import { useCallback, useEffect, useRef } from "react";
import type { TableController } from "./controller";
import { HUMAN, SEAT_NAMES, humanMove, newOfflineGame, nextAutoStep } from "./offline";
import { useTransitionQueue } from "./useTransitionQueue";

const THINK_MIN_MS = 600;
const THINK_SPREAD_MS = 900;

export function useOfflineGame(seats: number, stackDrawTwo: boolean, colorBlind: boolean): TableController {
  const seed = useRef(Math.floor(Math.random() * 2 ** 31));
  const initial = useRef(newOfflineGame({ seats, stackDrawTwo, seed: seed.current }).state);
  const queue = useTransitionQueue(initial.current, HUMAN, SEAT_NAMES, colorBlind);
  const { shown: state, busy, enqueue, reset } = queue;

  useEffect(() => {
    if (busy) return;
    const step = nextAutoStep(state, () => THINK_MIN_MS + Math.random() * THINK_SPREAD_MS);
    if (step.kind !== "auto") return;
    const timer = setTimeout(() => enqueue(step.transition), step.delayMs);
    return () => clearTimeout(timer);
  }, [state, busy, enqueue]);

  const act = useCallback(
    async (move: Move): Promise<string | null> => {
      if (busy) return "Wait for the table";
      try {
        enqueue(humanMove(state, move));
        return null;
      } catch (error) {
        return error instanceof RuleError ? error.code : "Move failed";
      }
    },
    [busy, state, enqueue],
  );

  const catchSeat = useCallback(
    (target: number) => {
      if (!busy) enqueue(applyCatch(state, target));
    },
    [busy, state, enqueue],
  );

  const restart = useCallback(() => {
    seed.current += 1;
    reset(newOfflineGame({ seats, stackDrawTwo, seed: seed.current }).state);
  }, [seats, stackDrawTwo, reset]);

  return { mode: "practice", state, me: HUMAN, names: SEAT_NAMES, busy, feed: queue.feed, anchors: queue.anchors, act, catchSeat, restart };
}
