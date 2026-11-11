import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardBack } from "./CardSvg";

const MAX_MINIS = 10;
const MINI_ROTATE_DEG = 6;
const MINI_SHIFT = 0.13;

export interface SeatProps {
  readonly position: "left" | "top" | "right" | "bottom";
  readonly name: string;
  readonly color: string;
  readonly handSize: number;
  readonly active: boolean;
  readonly saidMono: boolean;
  readonly fanRef: (el: HTMLDivElement | null) => void;
}

export function Seat({ position, name, color, handSize, active, saidMono, fanRef }: SeatProps) {
  const shown = Math.min(handSize, MAX_MINIS);
  return (
    <section className={cn("kc-seat", `kc-${position}`, active && "kc-active")} aria-label={`${name}, ${handSize} cards`}>
      <div className="kc-who">
        <div className="kc-avatar" style={{ "--c": color } as React.CSSProperties}>
          {name[0]}
        </div>
        <div className="kc-meta">
          <b>{saidMono ? `${name} · Mono!` : name}</b>
          <span>
            <Lock aria-hidden />
            {handSize} cards<span className="kc-long">&nbsp;· sealed</span>
          </span>
        </div>
      </div>
      <div className="kc-fan" ref={fanRef}>
        {Array.from({ length: shown }, (_, k) => {
          const q = k - (shown - 1) / 2;
          return (
            <div
              key={k}
              className="kc-mini"
              style={{ "--r": `${q * MINI_ROTATE_DEG}deg`, "--x": `calc(var(--cw) * ${q * MINI_SHIFT})` } as React.CSSProperties}
            >
              <CardBack />
            </div>
          );
        })}
      </div>
    </section>
  );
}
