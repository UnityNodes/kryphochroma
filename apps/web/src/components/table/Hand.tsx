"use client";

import { type Card, cardLabel } from "@kryphochroma/rules";
import { useCallback, useLayoutEffect, useState } from "react";
import { handOrder } from "@/game/handOrder";
import { cn } from "@/lib/utils";
import { CardBack, CardFace } from "./CardSvg";

const STEP_RATIO = 0.7;
const EDGE_RATIO = 1.7;
const MAX_SPREAD_DEG = 3.2;
const TOTAL_SPREAD_DEG = 22;
const ARC = 0.6;
const MAX_DROP_RATIO = 0.2;
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

  const entries = handOrder(hand);
  const n = entries.length;
  const step = n > 1 ? Math.max(0, Math.min(size.card * STEP_RATIO, (size.width - size.card * EDGE_RATIO) / (n - 1))) : 0;
  const spread = Math.min(MAX_SPREAD_DEG, TOTAL_SPREAD_DEG / Math.max(n, 1));
  const maxDrop = size.card * MAX_DROP_RATIO;

  return (
    <div className="kc-hand" ref={setBox} role="group" aria-label={`Your hand, ${n} cards`} onKeyDown={moveFocus}>
      {entries.map(({ card, slot }, i) => {
        const k = i - (n - 1) / 2;
        const sealed = card < 0;
        const ok = mine && !sealed && playable(slot);
        return (
          <button
            key={slot}
            data-slot={slot}
            ref={(node) => slotRef(slot, node)}
            type="button"
            className={cn("kc-card", ok && "kc-ok", mine && !ok && "kc-no")}
            style={{ "--x": `${k * step}px`, "--r": `${k * spread}deg`, "--y": `${Math.min(k * k * ARC, maxDrop)}px`, zIndex: i } as React.CSSProperties}
            aria-label={sealed ? "Card being decrypted" : `${cardLabel(card)}${ok ? ", playable" : ""}`}
            aria-disabled={!ok}
            onClick={() => ok && onPlay(slot)}
          >
            {sealed ? <CardBack /> : <CardFace card={card} colorBlind={colorBlind} />}
          </button>
        );
      })}
    </div>
  );
}

function moveFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const cards = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button.kc-card")];
  const current = cards.indexOf(document.activeElement as HTMLButtonElement);
  const delta = event.key === "ArrowRight" ? 1 : -1;
  const next = cards[current < 0 ? 0 : (current + delta + cards.length) % cards.length];
  if (!next) return;
  event.preventDefault();
  next.focus();
}
