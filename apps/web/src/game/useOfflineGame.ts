"use client";

import { type Move, RuleError, applyCatch, sonarCount } from "@kryphochroma/rules";
import { useCallback, useEffect, useRef, useState } from "react";
import { BOT_PROFILES } from "@kryphochroma/abi";
import { useMyProfile } from "@/components/profile/useMyProfile";
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
  const [peek, setPeek] = useState<TableController["peek"]>(null);
  const myProfile = useMyProfile();
  const [sonar, setSonar] = useState<TableController["sonar"]>(null);

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
        if (move.type === "play" && move.peek) setPeek({ ...move.peek, card: state.hands[move.peek.seat]?.[move.peek.slot] ?? null });
        if (move.type === "sonar") setSonar({ target: move.target, color: move.color, count: sonarCount(state.hands[move.target] ?? [], move.color) });
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

  const clearPeek = useCallback(() => setPeek(null), []);
  const clearSonar = useCallback(() => setSonar(null), []);

  return {
    mode: "practice",
    state,
    me: HUMAN,
    names: SEAT_NAMES,
    avatars: [myProfile.profile?.avatar ?? null, ...BOT_PROFILES.map((p) => p.avatar)],
    busy,
    feed: queue.feed,
    anchors: queue.anchors,
    act,
    catchSeat,
    restart,
    secretColor: state.secrets[HUMAN] ?? null,
    peek,
    clearPeek,
    sonar,
    clearSonar,
  };
}
