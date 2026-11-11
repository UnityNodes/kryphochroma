"use client";

import { sharedDefs } from "@kryphochroma/cards";
import { cardLabel, initialState } from "@kryphochroma/rules";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { CardBack, CardFace } from "@/components/table/CardSvg";
import { cn } from "@/lib/utils";

const DEMO_SEED = 7;
const DECK_PREVIEW = 10;
const NAMES = ["You", "Mira", "Delta", "Orin"] as const;

function Row({ label, cards, open, note }: { readonly label: string; readonly cards: readonly number[]; readonly open: boolean; readonly note: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <b className="text-cream">{label}</b>
        <span className="flex items-center gap-1 text-xs text-muted">
          {open ? <Eye className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {note}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label={open ? `${label}: ${cards.map(cardLabel).join(", ")}` : `${label}: ${cards.length} sealed cards`}>
        {cards.map((card, i) => (
          <li key={`${i}:${card}`} className="w-[42px] sm:w-[52px]" aria-hidden>
            <div className="aspect-[2/3] [&_svg]:size-full">{open ? <CardFace card={card} colorBlind={false} /> : <CardBack />}</div>
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
    <section aria-labelledby="leak-title" className={cn("kc-box grid gap-5 text-left transition-shadow", leak && "shadow-[6px_6px_0_var(--r)]")}>
      <div aria-hidden dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="leak-title" className="font-display text-2xl text-sun">
          The same table, two contracts
        </h2>
        <button type="button" role="switch" aria-checked={leak} className={cn("kc-chip", leak && "kc-chip-on")} onClick={() => setLeak((v) => !v)}>
          {leak ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          Show what an open contract would leak
        </button>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {leak
          ? "A plain contract keeps hands and the deck in readable storage. Anyone with an RPC sees every card, so bluffing, the +4 challenge and the draw pile mean nothing."
          : "Kryphochroma stores every card as an FHE ciphertext. Your session key decrypts your own hand. Nobody else, not the contract and not us, can read the rest."}
      </p>
      {hands.map((cards, seat) => (
        <Row key={NAMES[seat]} label={NAMES[seat] ?? `Seat ${seat}`} cards={cards} open={seat === 0 || leak} note={seat === 0 ? "decrypted for you only" : leak ? "readable by anyone" : "sealed · FHE.allow to its owner"} />
      ))}
      <Row label={`Next ${DECK_PREVIEW} cards of the deck`} cards={state.deck.slice(0, DECK_PREVIEW)} open={leak} note={leak ? "you know every draw in advance" : "order unknown to everyone"} />
    </section>
  );
}
