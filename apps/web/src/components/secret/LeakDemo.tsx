"use client";

import { sharedDefs } from "@kryphochroma/cards";
import { cardLabel, initialState } from "@kryphochroma/rules";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { CardBack, CardFace } from "@/components/table/CardSvg";
import { cn } from "@/lib/utils";

const DEMO_SEED = 7;
const DECK_PREVIEW = 8;
const NAMES = ["You", "Mira", "Delta", "Orin"] as const;

function Row({ label, cards, open, note }: { readonly label: string; readonly cards: readonly number[]; readonly open: boolean; readonly note: string }) {
  return (
    <div className="grid content-start gap-2 rounded-md border border-cream/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <b className="text-cream">{label}</b>
        <span className="flex items-center gap-1 text-xs text-muted">
          {open ? <Eye className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {note}
        </span>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1.5" aria-label={open ? `${label}: ${cards.map(cardLabel).join(", ")}` : `${label}: ${cards.length} sealed cards`}>
        {cards.map((card, i) => (
          <li key={`${i}:${card}`} aria-hidden>
            <div className="aspect-[2/3] [&_svg]:block [&_svg]:size-full">{open ? <CardFace card={card} colorBlind={false} /> : <CardBack />}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeakDemo() {
  const [leak, setLeak] = useState(false);
  const { state } = useMemo(() => initialState({ seats: 4, mode: "single", targetScore: 500, stackDrawTwo: false }, DEMO_SEED), []);
  const hands = state.hands.map((hand) => hand.filter((c): c is number => c !== null));

  return (
    <section aria-labelledby="leak-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start">
      <div aria-hidden className="absolute size-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
      <div className="grid gap-4 lg:sticky lg:top-8">
        <h2 id="leak-title" className="font-display text-3xl text-brass">
          The same table, two contracts
        </h2>
        <p className="text-muted">Flip the switch to see the table the way a plain smart contract would store it: in storage anyone can read through an RPC.</p>
        <button
          type="button"
          role="switch"
          aria-checked={leak}
          onClick={() => setLeak((v) => !v)}
          className={cn("flex w-full items-center gap-3 rounded-md border-2 px-4 py-3 text-left transition-colors", leak ? "border-red bg-red/15" : "border-cream/30 bg-black/20")}
        >
          <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", leak ? "bg-red" : "bg-cream/25")}>
            <span className={cn("absolute top-1 size-5 rounded-full bg-cream transition-transform", leak ? "translate-x-6" : "translate-x-1")} />
          </span>
          <span className="grid">
            <b className="text-cream">Show what an open contract would leak</b>
            <span className="text-sm text-muted">{leak ? "Leaking: every hand and the draw pile are public" : "Sealed: FHE ciphertexts, only your hand decrypts"}</span>
          </span>
          {leak ? <Eye className="ml-auto size-5 text-red" aria-hidden /> : <EyeOff className="ml-auto size-5 text-brass" aria-hidden />}
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {leak
            ? "With every card readable, bluffing with a veil, spying with a spyglass, the +4 challenge and the draw pile all stop meaning anything."
            : "Kryphochroma stores every card as an FHE ciphertext. Your session key decrypts your own hand. Nobody else, not the contract and not us, can read the rest."}
        </p>
      </div>
      <div className={cn("grid gap-3 rounded-md border-2 p-3 sm:p-4", leak ? "border-red" : "border-cream/30")} style={{ background: "radial-gradient(120% 90% at 50% 40%, var(--felt1), var(--felt2))" }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {hands.map((cards, seat) => (
            <Row key={NAMES[seat]} label={NAMES[seat] ?? `Seat ${seat}`} cards={cards} open={seat === 0 || leak} note={seat === 0 ? "decrypted for you only" : leak ? "readable by anyone" : "sealed · FHE.allow to its owner"} />
          ))}
        </div>
        <Row label={`Next ${DECK_PREVIEW} cards of the deck`} cards={state.deck.slice(0, DECK_PREVIEW)} open={leak} note={leak ? "you know every draw in advance" : "order unknown to everyone"} />
      </div>
    </section>
  );
}
