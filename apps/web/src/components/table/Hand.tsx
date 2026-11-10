"use client";

import { type Card, cardLabel, colorOf, rankOf } from "@kryphochroma/rules";
import { useCallback, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardSvg";

const STEP_RATIO = 0.7;
const EDGE_RATIO = 1.7;
const MAX_SPREAD_DEG = 3.2;
const TOTAL_SPREAD_DEG = 22;
const ARC = 0.6;
const FALLBACK_CARD_PX = 80;

export interface HandProps {
  readonly hand: readonly (Card | null)[];
  readonly mine: boolean;
  readonly playable: (slot: number) => boolean;
  readonly colorBlind: boolean;
  readonly onPlay: (slot: number) => void;
  readonly slotRef: (slot: number, el: HTMLElement | null) => void;
  readonly boxRef: (el: HTMLDivElement | null) => void;
}

export function Hand({ hand, mine, playable, colorBlind, onPlay, slotRef, boxRef }: HandProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, card: FALLBACK_CARD_PX });

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const card = el.querySelector<HTMLElement>(".kc-card");
      setSize({ width: el.clientWidth, card: card?.offsetWidth || FALLBACK_CARD_PX });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, hand]);

  const setBox = useCallback(
    (node: HTMLDivElement | null) => {
      setEl(node);
      boxRef(node);
    },
    [boxRef],
  );

  const entries = hand
    .map((card, slot) => ({ card, slot }))
    .filter((e): e is { card: Card; slot: number } => e.card !== null)
    .sort((a, b) => colorOf(a.card) - colorOf(b.card) || rankOf(a.card) - rankOf(b.card));
  const n = entries.length;
  const step = n > 1 ? Math.max(0, Math.min(size.card * STEP_RATIO, (size.width - size.card * EDGE_RATIO) / (n - 1))) : 0;
  const spread = Math.min(MAX_SPREAD_DEG, TOTAL_SPREAD_DEG / Math.max(n, 1));

  return (
    <div className="kc-hand" ref={setBox} role="group" aria-label={`Your hand, ${n} cards`}>
      {entries.map(({ card, slot }, i) => {
        const k = i - (n - 1) / 2;
        const ok = mine && playable(slot);
        return (
          <button
            key={`${slot}:${card}`}
            ref={(node) => slotRef(slot, node)}
            type="button"
            className={cn("kc-card", ok && "kc-ok", mine && !ok && "kc-no")}
            style={{ "--x": `${k * step}px`, "--r": `${k * spread}deg`, "--y": `${k * k * ARC}px`, zIndex: i } as React.CSSProperties}
            aria-label={`${cardLabel(card)}${ok ? ", playable" : ""}`}
            aria-disabled={!ok}
            onClick={() => ok && onPlay(slot)}
          >
            <CardFace card={card} colorBlind={colorBlind} />
          </button>
        );
      })}
    </div>
  );
}
