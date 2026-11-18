import { CARD_COLORS, colorShape } from "@kryphochroma/cards";
import { isWild } from "@kryphochroma/rules";
import { Lock, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { pileTilt } from "@/game/flight";
import { CardBack, CardFace } from "./CardSvg";
import { type WaitNote, WaitHint } from "./ChainProgress";

const PILE_SHOWN = 5;
const CARDS_PER_EDGE = 9;
const MAX_EDGES = 12;
const SHAPE_BOX = 16;

export interface CenterProps {
  readonly discard: readonly number[];
  readonly color: number;
  readonly deckCount: number;
  readonly dir: 1 | -1;
  readonly status: string;
  readonly note?: WaitNote | null;
  readonly canDraw: boolean;
  readonly colorBlind: boolean;
  readonly veiled?: string | null;
  readonly onDraw: () => void;
  readonly deckRef: (el: HTMLButtonElement | null) => void;
  readonly pileRef: (el: HTMLDivElement | null) => void;
}

export function Center({ discard, color, deckCount, dir, status, note, canDraw, colorBlind, veiled, onDraw, deckRef, pileRef }: CenterProps) {
  const start = Math.max(0, discard.length - PILE_SHOWN);
  const current = CARD_COLORS[color]?.base ?? "var(--r)";
  const top = discard[discard.length - 1];
  const inPlay = CARD_COLORS[color]?.name;
  const called = top !== undefined && isWild(top) ? inPlay : undefined;
  const edges = Math.min(MAX_EDGES, Math.ceil(deckCount / CARDS_PER_EDGE));
  return (
    <div className="kc-center">
      <div className="kc-piles">
        <button className="kc-deck" ref={deckRef} onClick={onDraw} disabled={!canDraw} aria-label={`Draw a card, ${deckCount} sealed`} style={{ "--n": edges } as React.CSSProperties}>
          <div className={cn("kc-s", deckCount === 0 && "kc-empty")}>{deckCount > 0 && <CardBack />}</div>
          <span className="kc-lbl">
            <b>{deckCount}</b>
            <span>
              <Lock aria-hidden />
              sealed
            </span>
          </span>
        </button>
        <div className="kc-pile" ref={pileRef} style={{ "--cur": current } as React.CSSProperties}>
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
          {inPlay && (
            <span className="kc-lbl">
              <b>
                {colorBlind ? (
                  <svg className="kc-shape" viewBox={`0 0 ${SHAPE_BOX} ${SHAPE_BOX}`} aria-hidden dangerouslySetInnerHTML={{ __html: colorShape(color, SHAPE_BOX / 2, SHAPE_BOX / 2, SHAPE_BOX - 2) }} />
                ) : (
                  <i className="kc-swatch" aria-hidden />
                )}
                {inPlay}
              </b>
              <span>in play</span>
              {veiled && <span className="kc-veiled">{veiled}</span>}
            </span>
          )}
        </div>
      </div>
      <div className="kc-status" aria-live="polite">
        <span className={cn("kc-dir", dir < 0 && "kc-ccw")}>
          <RotateCw aria-hidden />
        </span>
        <span>{status}</span>
        {called && <span className="kc-called">colour: {called}</span>}
      </div>
      {note && <WaitHint note={note} className="kc-note" />}
    </div>
  );
}
