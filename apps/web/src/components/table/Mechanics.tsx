"use client";

import { CARD_COLORS } from "@kryphochroma/cards";
import { COLOR, type Card, type Color, type Peek, type PublicState, cardLabel, colorOf, peekTargets, rankOf, veilClaims } from "@kryphochroma/rules";
import { EyeOff, Lock } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CardBack, CardFace } from "./CardSvg";

const DIALOG = "kc-box max-h-[90dvh] overflow-auto border-2 border-cream bg-ink text-left sm:max-w-[520px]";
const TITLE = "font-display text-[30px] font-normal text-sun";

function MiniCard({ card, colorBlind, label, selected, onClick }: { readonly card: Card | null; readonly colorBlind: boolean; readonly label: string; readonly selected?: boolean; readonly onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn("w-[52px] rounded-[8px] transition-transform sm:w-[60px] [&_svg]:block [&_svg]:size-full", selected ? "-translate-y-2 ring-4 ring-sun" : "hover:-translate-y-1")}
    >
      <div className="aspect-[2/3]">{card === null || card < 0 ? <CardBack /> : <CardFace card={card} colorBlind={colorBlind} />}</div>
    </button>
  );
}

export interface VeilDialogProps {
  readonly open: boolean;
  readonly pub: PublicState;
  readonly hand: readonly (Card | null)[];
  readonly colorBlind: boolean;
  readonly onClose: () => void;
  readonly onVeil: (slot: number, claim: Card) => void;
}

export function VeilDialog({ open, pub, hand, colorBlind, onClose, onVeil }: VeilDialogProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const claims = veilClaims(pub);
  const close = () => {
    setSlot(null);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className={DIALOG}>
        <DialogTitle className={TITLE}>Veil a card</DialogTitle>
        <DialogDescription className="text-muted">
          Lay any card face down and name a number card that fits the pile. Its real value stays encrypted. The next player can doubt you: one bit settles it. Once per round.
        </DialogDescription>
        <h3 className="text-xs font-semibold tracking-[.12em] text-muted uppercase">1. The card you hide</h3>
        <div className="flex flex-wrap gap-2">
          {hand.map((card, i) =>
            card === null || card < 0 || (pub.drawnSlot !== null && i !== pub.drawnSlot) ? null : (
              <MiniCard key={i} card={card} colorBlind={colorBlind} label={`Hide ${cardLabel(card)}`} selected={slot === i} onClick={() => setSlot(i)} />
            ),
          )}
        </div>
        <h3 className="text-xs font-semibold tracking-[.12em] text-muted uppercase">2. The card you name</h3>
        {slot === null && <p className="-mt-1 text-xs text-muted">Pick the card you hide first, then name one of these.</p>}
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
          {CARD_COLORS.map((color, c) => {
            const row = claims.filter((claim) => colorOf(claim) === c);
            if (row.length === 0) return null;
            return (
              <Fragment key={color.name}>
                <span className="flex h-11 items-center text-xs text-muted">{color.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {row.map((claim) => (
                    <button
                      key={claim}
                      type="button"
                      disabled={slot === null}
                      onClick={() => slot !== null && (onVeil(slot, claim), setSlot(null))}
                      aria-label={`Name it ${cardLabel(claim)}`}
                      className="grid size-11 place-items-center rounded-full border-2 border-cream font-display text-xl transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-35"
                      style={{ background: color.base, color: c === COLOR.sun ? "var(--color-ink)" : "var(--color-cream)" }}
                    >
                      {rankOf(claim)}
                    </button>
                  ))}
                </div>
              </Fragment>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface PeekDialogProps {
  readonly open: boolean;
  readonly pub: PublicState;
  readonly me: number;
  readonly names: readonly string[];
  readonly onClose: () => void;
  readonly onPeek: (peek: Peek) => void;
}

export function PeekDialog({ open, pub, me, names, onClose, onPeek }: PeekDialogProps) {
  const targets = peekTargets(pub, me);
  const seats = [...new Set(targets.map((t) => t.seat))];
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogTitle className={TITLE}>Spyglass</DialogTitle>
        <DialogDescription className="text-muted">Pick one sealed card. The contract grants your key access to exactly that card. Everyone sees which slot you looked at, nobody else sees the card.</DialogDescription>
        {seats.map((seat) => (
          <div key={seat} className="grid gap-2">
            <b className="text-cream">{names[seat] ?? `Seat ${seat + 1}`}</b>
            <div className="flex flex-wrap gap-2">
              {targets
                .filter((t) => t.seat === seat)
                .map((t) => (
                  <MiniCard key={t.slot} card={null} colorBlind={false} label={`Peek at ${names[seat] ?? "seat"} card ${t.slot + 1}`} onClick={() => onPeek(t)} />
                ))}
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

export interface PeekResultProps {
  readonly peek: { readonly seat: number; readonly slot: number; readonly card: Card | null } | null;
  readonly names: readonly string[];
  readonly colorBlind: boolean;
  readonly onClose: () => void;
}

export function PeekResult({ peek, names, colorBlind, onClose }: PeekResultProps) {
  return (
    <Dialog open={peek !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="kc-box border-2 border-cream bg-ink sm:max-w-[360px]">
        <DialogTitle className={TITLE}>You peeked</DialogTitle>
        <DialogDescription className="text-muted">
          {peek ? `${names[peek.seat] ?? "Seat"} holds this card. Only your key can decrypt it.` : ""}
        </DialogDescription>
        <div className="mx-auto w-28 [&_svg]:block [&_svg]:size-full">
          <div className="aspect-[2/3]">{peek?.card === null || peek?.card === undefined || peek.card < 0 ? <CardBack /> : <CardFace card={peek.card} colorBlind={colorBlind} />}</div>
        </div>
        {peek && (peek.card === null || peek.card < 0) && (
          <p className="flex items-center justify-center gap-1 text-sm text-muted" role="status">
            <Lock className="size-4" aria-hidden />
            Decrypting with your session key…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SecretChip({ color, compact }: { readonly color: number | null; readonly compact?: boolean }) {
  const swatch = color === null || color < 0 ? null : CARD_COLORS[color];
  return (
    <span className="whitespace-nowrap" title="Your secret colour: go out on a card of this colour to double the round">
      <EyeOff aria-hidden />
      {compact ? "secret" : "secret colour"}
      <b style={{ color: swatch?.base }}>{swatch ? `● ${swatch.name}` : "…"}</b>
    </span>
  );
}

export function SecretBadge({ color }: { readonly color: number | null }) {
  const swatch = color === null || color < 0 ? null : CARD_COLORS[color];
  const label = swatch ? `Your secret colour is ${swatch.name}` : "Your secret colour is being decrypted";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="absolute -right-1 -bottom-1 size-4 rounded-full border-2 border-ink"
      style={{ background: swatch?.base ?? "var(--muted)" }}
    />
  );
}


export interface SonarDialogProps {
  readonly open: boolean;
  readonly pub: PublicState;
  readonly me: number;
  readonly names: readonly string[];
  readonly onClose: () => void;
  readonly onSonar: (target: number, color: Color) => void;
}

export function SonarDialog({ open, pub, me, names, onClose, onSonar }: SonarDialogProps) {
  const rivals = pub.seats.map((s, seat) => ({ seat, size: s.handSize })).filter((r) => r.seat !== me);
  const [target, setTarget] = useState<number | null>(null);
  const chosen = target ?? (rivals.length === 1 ? (rivals[0]?.seat ?? null) : null);
  const close = () => {
    setTarget(null);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className={DIALOG}>
        <DialogTitle className={TITLE}>Sonar</DialogTitle>
        <DialogDescription className="text-muted">
          Ask how many cards of one colour a rival holds. The contract counts it inside their encrypted hand and only your key can read the answer. Everyone sees that you pinged, nobody sees the number. Once per round, uses your turn.
        </DialogDescription>
        <h3 className="text-xs font-semibold tracking-[.12em] text-muted uppercase">1. Who</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rival to ping">
          {rivals.map((r) => (
            <button key={r.seat} type="button" role="radio" aria-checked={chosen === r.seat} className={cn("kc-chip min-h-11", chosen === r.seat && "kc-chip-on")} onClick={() => setTarget(r.seat)}>
              {names[r.seat] ?? `Seat ${r.seat + 1}`} · {r.size} cards
            </button>
          ))}
        </div>
        <h3 className="text-xs font-semibold tracking-[.12em] text-muted uppercase">2. Which colour</h3>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((color, c) => (
            <button
              key={color.name}
              type="button"
              disabled={chosen === null}
              onClick={() => chosen !== null && (onSonar(chosen, c as Color), setTarget(null))}
              aria-label={`Ping for ${color.name} cards`}
              className="grid size-11 place-items-center rounded-full border-2 border-cream text-xs font-semibold text-ink disabled:opacity-40"
              style={{ background: color.base }}
            >
              {color.name.slice(0, 1)}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface SonarResultProps {
  readonly sonar: { readonly target: number; readonly color: number; readonly count: number | null } | null;
  readonly names: readonly string[];
  readonly onClose: () => void;
}

export function SonarResult({ sonar, names, onClose }: SonarResultProps) {
  const swatch = sonar ? CARD_COLORS[sonar.color] : undefined;
  const who = sonar ? (names[sonar.target] ?? "Seat") : "";
  return (
    <Dialog open={sonar !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="kc-box border-2 border-cream bg-ink sm:max-w-[360px]">
        <DialogTitle className={TITLE}>Sonar answer</DialogTitle>
        <DialogDescription className="text-muted">{sonar ? `${who} · ${swatch?.name ?? ""} cards. Only your key can decrypt this number.` : ""}</DialogDescription>
        {sonar && sonar.count !== null ? (
          <p className="text-center font-display text-7xl" style={{ color: swatch?.base }} role="status">
            {sonar.count}
          </p>
        ) : (
          <SonarWaiting onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SonarWaiting({ onClose }: { readonly onClose: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="grid gap-3 text-center">
      <p className="flex items-center justify-center gap-1 text-sm text-muted" role="status">
        <Lock className="size-4" aria-hidden />
        {seconds < 15 ? "The contract is counting inside the encrypted hand" : "Zama KMS is decrypting the count for your key only"} · {seconds} s
      </p>
      <p className="text-xs text-muted">This takes about half a minute on Sepolia. Close this and keep playing, the answer pops up by itself.</p>
      <button type="button" className="kc-btn justify-center" onClick={onClose}>
        Keep playing
      </button>
    </div>
  );
}
