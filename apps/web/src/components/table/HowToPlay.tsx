"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const SEEN_KEY = "kc-howto-seen";

const RULES = [
  "Match the top card by colour or number. Wild cards go on anything and pick the next colour.",
  "Skip, Reverse and Draw Two work as you expect. A Wild +4 makes the next player take 4, unless they challenge it.",
  "No card to play? Draw one. If it fits you may play it, otherwise pass.",
  "Down to one card? Press Mono! before the next player moves, or anyone can catch you for 2 cards.",
  "Empty your hand first. You score the points left in everyone else's hand.",
] as const;

const KEYS = [
  ["← / →", "move between cards"],
  ["Enter", "play the focused card"],
  ["D", "draw or pass"],
  ["M", "say Mono!"],
] as const;

export function HowToPlay({ autoOpen }: { readonly autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) === "1") return;
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    setOpen(true);
  }, [autoOpen]);

  return (
    <>
      <button type="button" className="kc-chip" onClick={() => setOpen(true)} aria-label="How to play">
        <CircleHelp aria-hidden />
        <span className="kc-hide-s">How to play</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="kc-box max-h-[90dvh] overflow-auto border-2 border-cream bg-ink text-left sm:max-w-[480px]">
          <DialogTitle className="font-display text-[30px] font-normal text-sun">How to play</DialogTitle>
          <DialogDescription className="text-muted">A shedding game in the Crazy Eights family. Nobody can see your hand, not even the contract.</DialogDescription>
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-cream">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
          <h3 className="mt-2 text-xs font-semibold tracking-[.12em] text-muted uppercase">Keyboard</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {KEYS.map(([key, what]) => (
              <div key={key} className="contents">
                <dt className="font-semibold text-sun">{key}</dt>
                <dd className="text-cream">{what}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted">
            Lying about a card is possible but every move updates an encrypted honesty bit. Liars are caught at the end of the round.{" "}
            <Link href="/secret" className="text-sun underline">
              How it stays secret
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
