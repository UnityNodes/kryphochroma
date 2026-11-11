import { ArrowLeft, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeakDemo } from "@/components/secret/LeakDemo";

export const metadata: Metadata = {
  title: "How it stays secret · Kryphochroma",
  description: "What is encrypted in Kryphochroma, who can read it, when it is revealed and what would break without FHE.",
};

const MATRIX = [
  {
    data: "Cards in a hand",
    type: "euint8 per slot",
    who: "Only the owner, through the ACL of their session key",
    when: "A played card becomes public as part of the move. The rest at the end of the round, for scoring",
    breaks: "The whole game: everyone sees who holds what, bluffing and tactics are gone",
  },
  {
    data: "Deck order",
    type: "euint8[108]",
    who: "Nobody, not the contract and not us",
    when: "Never. Only a drawn card, and only to the player who drew it",
    breaks: "You know what you and your rivals will draw next",
  },
  {
    data: "Had the colour, at a Wild +4",
    type: "ebool",
    who: "Nobody",
    when: "Only when challenged, exactly one bit",
    breaks: "Proving an honest +4 would mean showing your hand",
  },
  {
    data: "Honesty bit of each move",
    type: "ebool per player",
    who: "Nobody",
    when: "In one batch at the end of the round",
    breaks: "A lie would show at once instead of at the end. The bits alone reveal no card",
  },
  {
    data: "Public, like at a real table",
    type: "plain state",
    who: "Everyone",
    when: "Right away",
    breaks: "Top card, colour, direction, whose turn, hand sizes, who drew, who said Mono",
  },
] as const;

const LEAKS = [
  "Hand slots are numbered, so you can tell a played card is the one drawn a few turns ago. At a real table you can see that too.",
  "Drawing and playing at once is visible, as it is in person.",
  "Transaction timing can hint that a player was thinking. That is UX, not cryptography.",
] as const;

export default function SecretPage() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-8 text-cream">
      <main className="mx-auto grid max-w-4xl gap-8">
        <header className="grid gap-3">
          <Link href="/" className="flex w-fit items-center gap-1 text-sm text-muted hover:text-cream">
            <ArrowLeft className="size-4" aria-hidden />
            Kryphochroma
          </Link>
          <h1 className="font-display text-4xl text-sun [text-shadow:3px_3px_0_var(--r)] sm:text-6xl">How it stays secret</h1>
          <p className="max-w-2xl text-muted">Hands, the deck and the honesty of every move live on Sepolia as Zama FHE ciphertexts. The contract can shuffle, deal and check moves without ever seeing a card.</p>
        </header>
        <LeakDemo />
        <section aria-labelledby="matrix-title" className="grid gap-4">
          <h2 id="matrix-title" className="font-display text-2xl text-sun">
            What is hidden, from whom, until when
          </h2>
          <div className="grid gap-3 md:hidden">
            {MATRIX.map((row) => (
              <dl key={row.data} className="kc-box grid gap-1 text-left text-sm">
                <dt className="font-semibold text-cream">{row.data}</dt>
                <dd className="text-xs text-sun">{row.type}</dd>
                <dd>
                  <span className="text-muted">Who sees it: </span>
                  {row.who}
                </dd>
                <dd>
                  <span className="text-muted">Revealed: </span>
                  {row.when}
                </dd>
                <dd>
                  <span className="text-muted">If it were open: </span>
                  {row.breaks}
                </dd>
              </dl>
            ))}
          </div>
          <table className="hidden w-full border-collapse text-left text-sm md:table">
            <thead className="text-xs tracking-[.08em] text-muted uppercase">
              <tr>
                <th scope="col" className="border-b border-cream/20 p-2">Data</th>
                <th scope="col" className="border-b border-cream/20 p-2">Type</th>
                <th scope="col" className="border-b border-cream/20 p-2">Who sees it</th>
                <th scope="col" className="border-b border-cream/20 p-2">Revealed</th>
                <th scope="col" className="border-b border-cream/20 p-2">If it were open</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.data} className="align-top">
                  <th scope="row" className="border-b border-cream/10 p-2 font-semibold">{row.data}</th>
                  <td className="border-b border-cream/10 p-2 text-sun">{row.type}</td>
                  <td className="border-b border-cream/10 p-2">{row.who}</td>
                  <td className="border-b border-cream/10 p-2">{row.when}</td>
                  <td className="border-b border-cream/10 p-2">{row.breaks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="leaks-title" className="grid gap-3">
          <h2 id="leaks-title" className="font-display text-2xl text-sun">
            What still shows, on purpose
          </h2>
          <ul className="grid list-disc gap-2 pl-5 text-sm text-muted">
            {LEAKS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link href="/new" className="kc-btn kc-mono">
            <Play aria-hidden />
            Play on Sepolia
          </Link>
          <Link href="/play" className="kc-btn">
            Practice offline
          </Link>
        </div>
      </main>
    </div>
  );
}
