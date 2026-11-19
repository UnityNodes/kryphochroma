"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { Disclaimer } from "@/components/site/Disclaimer";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const SEEN_KEY = "kc-howto-seen";

const RULES = [
  "Five colours: red, sun, teal, blue and violet. Match the top card by colour or number. Wild cards go on anything and pick the next colour.",
  "Skip, Reverse and Draw Two work as you expect. A Wild +4 makes the next player take 4, unless they challenge it.",
  "Spyglass: play it on its colour and look at one card in an opponent's hand. Only your key can decrypt it.",
  "Sonar: once per round, instead of your move, ask how many cards of one colour a rival holds. The contract counts it inside their encrypted hand and only your key reads the answer.",
  "Veil, once per round: lay any card face down and name a number card that fits. The next player may doubt it. A lie draws 4, a wrong doubt draws 2.",
  "Secret colour: you get a hidden colour at the deal. Go out on a card of that colour and the round counts double.",
  "No card to play? Draw one. If it fits you may play it or pass; if it does not, the turn moves on by itself. Down to one card? Press Mono! or get caught for 2.",
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
        <DialogContent className="kc-box kc-box-wide max-h-[90dvh] overflow-auto">
          <DialogTitle>How to play</DialogTitle>
          <DialogDescription>A shedding card game where hidden information is part of the play. Nobody can see your hand, not even the contract.</DialogDescription>
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-cream">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
          <h3 className="mt-2">Keyboard</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {KEYS.map(([key, what]) => (
              <div key={key} className="contents">
                <dt className="font-semibold text-brass">{key}</dt>
                <dd className="text-cream">{what}</dd>
              </div>
            ))}
          </dl>
          <p>
            Lying about a card is possible but every move updates an encrypted honesty bit. Liars are caught at the end of the round.{" "}
            <Link href="/secret" className="text-brass underline underline-offset-4">
              How it stays secret
            </Link>
          </p>
          <Disclaimer className="text-xs text-cream/70" />
        </DialogContent>
      </Dialog>
    </>
  );
}
