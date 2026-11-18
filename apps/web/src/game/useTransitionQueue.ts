"use client";

import type { GameEvent, GameState, Transition } from "@kryphochroma/rules";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Anchors, animateEvents } from "./flight";
import { type FeedLine, describe } from "./offline";

const FEED_LIMIT = 6;

/** The transition whose cards are in the air right now. The 2D table flies DOM cards for it; a view that draws the table itself reads the same events to move its own cards for exactly as long. */
export interface PlayingTransition {
  readonly id: number;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
}

export interface TransitionQueue {
  readonly shown: GameState;
  readonly playing: PlayingTransition | null;
  readonly busy: boolean;
  readonly feed: readonly FeedLine[];
  readonly anchors: Anchors;
  readonly enqueue: (transition: Transition) => void;
  readonly reset: (state: GameState) => void;
  readonly note: (line: FeedLine) => void;
}

export function useTransitionQueue(initial: GameState, me: number, names: readonly string[], colorBlind: boolean): TransitionQueue {
  const [shown, setShown] = useState<GameState>(initial);
  const [queue, setQueue] = useState<readonly Transition[]>([]);
  const [animating, setAnimating] = useState(false);
  const [playing, setPlaying] = useState<PlayingTransition | null>(null);
  const played = useRef(0);
  const [feed, setFeed] = useState<readonly FeedLine[]>([]);
  const anchors = useRef<Anchors>(new Map()).current;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const optionsRef = useRef({ me, names, colorBlind });
  optionsRef.current = { me, names, colorBlind };
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
    const { me: seat, names: labels, colorBlind: shapes } = optionsRef.current;
    setAnimating(true);
    played.current += 1;
    setPlaying({ id: played.current, after: next.state, events: next.events });
    animateEvents(shownRef.current, next.state, next.events, anchors, shapes, seat)
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
        if (!mounted.current || gen !== generation.current) return;
        setShown(next.state);
        const lines = next.events.map((e) => describe(e, labels, seat)).filter((line): line is FeedLine => line !== null);
        if (lines.length > 0) setFeed((f) => [...lines.reverse(), ...f].slice(0, FEED_LIMIT));
        setQueue((q) => q.slice(1));
        setPlaying(null);
        setAnimating(false);
      });
  }, [queue, anchors]);

  const enqueue = useCallback((transition: Transition) => setQueue((q) => [...q, transition]), []);
  const note = useCallback((line: FeedLine) => setFeed((f) => [line, ...f].slice(0, FEED_LIMIT)), []);
  const reset = useCallback((state: GameState) => {
    generation.current += 1;
    running.current = false;
    setAnimating(false);
    setPlaying(null);
    setQueue([]);
    setFeed([]);
    setShown(state);
  }, []);

  return { shown, playing, busy: queue.length > 0 || animating, feed, anchors, enqueue, reset, note };
}
