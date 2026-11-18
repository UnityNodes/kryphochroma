import { BookOpen, Dices, EyeOff, Lock, Palette, Play, ScanEye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeakDemo } from "@/components/secret/LeakDemo";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "How it stays secret · Kryphochroma",
  description: "What is encrypted in Kryphochroma, who can read it, when it is revealed and what would break without FHE.",
};

const MATRIX = [
  { data: "Cards in a hand", type: "euint8 per slot", who: "Only the owner, through the ACL of their session key", when: "A played card becomes public as part of the move. The rest at the end of the round, for scoring", breaks: "Everyone sees who holds what. Bluffing and tactics are gone" },
  { data: "Deck order", type: "euint8[138]", who: "Nobody, not the contract and not us", when: "Never. A seat key can open only its own drawn cards and its own next two draws", breaks: "You know what you and your rivals will draw next" },
  { data: "Veiled card", type: "euint8 + ebool", who: "Nobody. The table sees only the named card", when: "Only if the next player doubts it: exactly one bit, true or false", breaks: "A veil is a plain lie anyone can check, so bluffing is dead" },
  { data: "Spyglass target", type: "FHE.allow to one key", who: "The player who played the spyglass, for one card", when: "Never to the rest of the table", breaks: "A peek would show the card to everyone watching" },
  { data: "Sonar answer", type: "euint8", who: "Only the player who pinged", when: "Never. The table sees who asked whom about which colour", breaks: "A rival would know exactly what you learned" },
  { data: "Secret colour", type: "euint8 from FHE.randEuint8", who: "Only its owner", when: "At the end of the round, with the hands", breaks: "Rivals would block your colour and the bonus means nothing" },
  { data: "Had the colour at a Wild +4", type: "ebool", who: "Nobody", when: "Only when challenged, exactly one bit", breaks: "Proving an honest +4 would mean showing your hand" },
  { data: "Honesty of every move", type: "ebool per player", who: "Nobody", when: "Once, at the end of the round", breaks: "A lie would show at once instead of at the end" },
] as const;

const MECHANICS = [
  { icon: EyeOff, title: "Veil", text: "Lay any card face down and name a number card. The contract stores FHE.eq(real card, named card). If the next player doubts, only that bit is decrypted with a KMS proof.", ops: "FHE.eq · makePubliclyDecryptable · checkSignatures" },
  { icon: ScanEye, title: "Spyglass", text: "Play it and pick one sealed card of a rival. The contract grants your session key access to that one ciphertext. Nobody else learns what you saw.", ops: "FHE.allow" },
  { icon: Palette, title: "Secret colour", text: "Each seat gets an encrypted random colour at the deal. Go out on that colour and the round counts double. It is revealed with the hands.", ops: "FHE.randEuint8 · FHE.rem · FHE.allow" },
  { icon: Dices, title: "Encrypted draws", text: "Each card is an encrypted random number scaled to the odds of a full 138 card deck. It is a ciphertext from the moment it exists, so the contract never holds a readable deck and no shuffle is needed.", ops: "FHE.randEuint16 · FHE.mul · FHE.select" },
] as const;

const LEAKS = [
  "Hand slots are numbered, so you can tell a played card is the one drawn a few turns ago. At a real table you can see that too.",
  "Everyone sees which slot a spyglass looked at, but not the card.",
  "Drawing and playing at once is visible, as it is in person.",
  "Transaction timing can hint that a player was thinking. That is UX, not cryptography.",
] as const;

export default function SecretPage() {
  return (
    <div className="min-h-dvh bg-bg text-cream">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-[1200px] gap-12 px-4 py-8 sm:px-6 lg:py-14">
        <header className="grid gap-4">
          <h1 className="font-display text-5xl leading-[0.95] text-brass sm:text-7xl">How it stays secret</h1>
          <p className="max-w-3xl text-lg text-muted">Hands, the deck, veiled cards and secret colours live on Sepolia as Zama FHE ciphertexts. The contract draws, deals and checks every move without ever seeing a card.</p>
        </header>

        <LeakDemo />

        <section aria-labelledby="mech-title" className="grid gap-5">
          <h2 id="mech-title" className="font-display text-3xl text-brass">
            Hidden information is the game
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MECHANICS.map(({ icon: Icon, title, text, ops }) => (
              <article key={title} className="grid content-start gap-3 rounded-md border border-cream/15 bg-black/25 p-5">
                <Icon className="size-7 text-brass" aria-hidden />
                <h3 className="font-display text-2xl text-cream">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
                <code className="mt-auto text-xs text-teal">{ops}</code>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="matrix-title" className="grid gap-5">
          <h2 id="matrix-title" className="font-display text-3xl text-brass">
            What is hidden, from whom, until when
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MATRIX.map((row) => (
              <dl key={row.data} className="grid content-start gap-2 rounded-md border border-cream/15 bg-black/25 p-5 text-sm">
                <dt className="flex items-center gap-2 text-base font-semibold text-cream">
                  <Lock className="size-4 text-brass" aria-hidden />
                  {row.data}
                </dt>
                <dd className="font-mono text-xs text-brass">{row.type}</dd>
                <dd>
                  <span className="text-muted">Who sees it: </span>
                  {row.who}
                </dd>
                <dd>
                  <span className="text-muted">Revealed: </span>
                  {row.when}
                </dd>
                <dd className="border-t border-cream/10 pt-2">
                  <span className="text-red">If it were open: </span>
                  {row.breaks}
                </dd>
              </dl>
            ))}
          </div>
        </section>

        <section aria-labelledby="leaks-title" className="grid gap-3 rounded-md border border-cream/15 p-5 sm:p-6">
          <h2 id="leaks-title" className="font-display text-2xl text-brass">
            What still shows, on purpose
          </h2>
          <ul className="grid list-disc gap-2 pl-5 text-sm text-muted md:grid-cols-2 md:gap-x-10">
            {LEAKS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/new" className="kc-btn kc-btn-brass">
            <Play aria-hidden />
            Play on Sepolia
          </Link>
          <Link href="/play" className="kc-btn">
            Practice offline
          </Link>
          <Link href="/docs" className="kc-btn">
            <BookOpen aria-hidden />
            Read the docs
          </Link>
        </div>
      </main>
    </div>
  );
}
