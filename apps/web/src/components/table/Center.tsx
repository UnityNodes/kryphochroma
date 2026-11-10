import { CARD_COLORS } from "@kryphochroma/cards";
import { Lock, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { pileTilt } from "@/game/flight";
import { CardBack, CardFace } from "./CardSvg";

const PILE_SHOWN = 5;

export interface CenterProps {
  readonly discard: readonly number[];
  readonly color: number;
  readonly deckCount: number;
  readonly dir: 1 | -1;
  readonly status: string;
  readonly canDraw: boolean;
  readonly colorBlind: boolean;
  readonly onDraw: () => void;
  readonly deckRef: (el: HTMLButtonElement | null) => void;
  readonly pileRef: (el: HTMLDivElement | null) => void;
}

export function Center({ discard, color, deckCount, dir, status, canDraw, colorBlind, onDraw, deckRef, pileRef }: CenterProps) {
  const start = Math.max(0, discard.length - PILE_SHOWN);
  const current = CARD_COLORS[color]?.base ?? "var(--r)";
  return (
    <div className="kc-center">
      <div className="kc-piles">
        <button className="kc-deck" ref={deckRef} onClick={onDraw} disabled={!canDraw} aria-label={`Draw a card, ${deckCount} sealed`}>
          <div className="kc-s"><CardBack /></div>
          <div className="kc-s"><CardBack /></div>
          <div className="kc-s"><CardBack /></div>
          <span className="kc-lbl">
            <Lock aria-hidden />
            {deckCount} sealed
          </span>
        </button>
        <div className="kc-pile" ref={pileRef} style={{ "--cur": current } as React.CSSProperties}>
          <div className="kc-halo" />
          <div className="kc-ring" />
          {discard.slice(start).map((card, i) => {
            const index = start + i;
            return (
              <div
                key={index}
                className="kc-card"
                style={{ "--r": `${pileTilt(index)}deg`, "--dx": `${(index * 37) % 9 - 4}px`, "--dy": `${(index * 53) % 7 - 3}px` } as React.CSSProperties}
              >
                <CardFace card={card} colorBlind={colorBlind} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="kc-status" aria-live="polite">
        <span className={cn("kc-dir", dir < 0 && "kc-ccw")}>
          <RotateCw aria-hidden />
        </span>
        <span>{status}</span>
      </div>
    </div>
  );
}
