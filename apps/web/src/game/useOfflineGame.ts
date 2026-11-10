"use client";

import { type GameState, type Move, RuleError, type Transition, applyCatch, botCatchTarget } from "@kryphochroma/rules";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Anchors, animateEvents } from "./flight";
import { type FeedLine, HUMAN, describe, humanMove, newOfflineGame, nextAutoStep } from "./offline";

const THINK_MIN_MS = 600;
const THINK_SPREAD_MS = 900;
const FEED_LIMIT = 6;

export interface OfflineGame {
  readonly state: GameState;
  readonly busy: boolean;
  readonly feed: readonly FeedLine[];
  readonly anchors: Anchors;
  readonly act: (move: Move) => string | null;
  readonly catchBot: () => void;
  readonly restart: () => void;
}

export function useOfflineGame(seats: number, stackDrawTwo: boolean, colorBlind: boolean): OfflineGame {
  const seed = useRef(Math.floor(Math.random() * 2 ** 31));
  const [state, setState] = useState<GameState>(() => newOfflineGame({ seats, stackDrawTwo, seed: seed.current }).state);
  const [queue, setQueue] = useState<readonly Transition[]>([]);
  const [animating, setAnimating] = useState(false);
  const [feed, setFeed] = useState<readonly FeedLine[]>([]);
  const anchors = useRef<Anchors>(new Map()).current;
  const colorBlindRef = useRef(colorBlind);
  colorBlindRef.current = colorBlind;

  const enqueue = useCallback((transition: Transition) => setQueue((q) => [...q, transition]), []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const running = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const next = queue[0];
    if (!next || running.current) return;
    running.current = true;
    const gen = generation.current;
    setAnimating(true);
    animateEvents(stateRef.current, next.state, next.events, anchors, colorBlindRef.current)
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
        if (!mounted.current || gen !== generation.current) return;
        setState(next.state);
        const lines = next.events.map(describe).filter((line): line is FeedLine => line !== null);
        if (lines.length > 0) setFeed((f) => [...lines.reverse(), ...f].slice(0, FEED_LIMIT));
        setQueue((q) => q.slice(1));
        setAnimating(false);
      });
  }, [queue, anchors]);

  useEffect(() => {
    if (queue.length > 0 || animating) return;
    const step = nextAutoStep(state, () => THINK_MIN_MS + Math.random() * THINK_SPREAD_MS);
    if (step.kind !== "auto") return;
    const timer = setTimeout(() => enqueue(step.transition), step.delayMs);
    return () => clearTimeout(timer);
  }, [state, queue.length, animating, enqueue]);

  const busy = queue.length > 0 || animating;

  const act = useCallback(
    (move: Move): string | null => {
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

  const catchBot = useCallback(() => {
    const target = botCatchTarget(state.pub, HUMAN);
    if (busy || target === null) return;
    enqueue(applyCatch(state, target));
  }, [busy, state, enqueue]);

  const restart = useCallback(() => {
    seed.current += 1;
    generation.current += 1;
    running.current = false;
    setAnimating(false);
    setQueue([]);
    setFeed([]);
    setState(newOfflineGame({ seats, stackDrawTwo, seed: seed.current }).state);
  }, [seats, stackDrawTwo]);

  return { state, busy, feed, anchors, act, catchBot, restart };
}
