import { CARD_COLORS, cardBack, cardFace } from "@kryphochroma/cards";
import { cardOf } from "@kryphochroma/rules";
import { ArrowRight, ArrowUpRight, Bot, EyeOff, Lock, Play, Radar, ScanEye, ShieldCheck, Shuffle, Sparkles, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { CardFan } from "@/components/site/CardFan";
import { SiteHeader } from "@/components/site/SiteHeader";
import { readDeployment } from "@/guide/deployment";

const VIOLET = CARD_COLORS[4]?.base ?? "#9b4fc9";

const FAN = [
  { svg: cardBack("0x7a3f1c09e4b2"), rotate: -16, x: "-62%", y: "6%" },
  { svg: cardFace(cardOf(4, 7)), rotate: -3, x: "-10%", y: "-4%" },
  { svg: cardFace(cardOf(2, 13)), rotate: 12, x: "40%", y: "4%" },
] as const;

const MOVES = [
  { icon: EyeOff, color: VIOLET, title: "Veil", text: "Play a card face down and name any card. The next player believes you or doubts.", hidden: "A doubt reveals one encrypted bit: true or false." },
  { icon: ScanEye, color: "var(--color-teal)", title: "Spyglass", text: "Look at one sealed card in a rival hand. Your session key, and only yours, gets access to it.", hidden: "Everyone sees which slot you looked at, never the card." },
  { icon: Radar, color: "var(--color-blue)", title: "Sonar", text: "Ask how many cards of a colour a rival holds. The contract counts inside the encrypted hand.", hidden: "The answer is a ciphertext only you can open." },
  { icon: Sparkles, color: "var(--color-sun)", title: "Secret colour", text: "A colour dealt to you alone. Go out on it and the round counts double.", hidden: "Nobody can block a colour they can not see." },
] as const;

const STEPS = [
  { icon: Shuffle, title: "Shuffled by the contract", text: "138 cards pass 70 encrypted steps of FHE.randEbool and FHE.select. Nobody knows the order, not even the server." },
  { icon: Lock, title: "Dealt with FHE.allow", text: "Each card handle is granted to one session key. Your tab decrypts your hand through the Zama relayer, no wallet popup." },
  { icon: ShieldCheck, title: "Revealed only by the rules", text: "The first discard, a doubted veil, the hands at the end of a round: each one opens with a KMS proof the contract checks." },
] as const;

const MODES = [
  { icon: Bot, title: "Quick game", text: "You and three bots at a table that was shuffled before you clicked.", href: "/new" },
  { icon: Users, title: "With friends", text: "Share a link like /j/teal-otter. Play opens the moment the last seat is taken.", href: "/new" },
  { icon: Play, title: "Practice offline", text: "Learn the rules against bots in your browser. Nothing goes on chain.", href: "/play" },
] as const;

export default function Home() {
  const { table } = readDeployment();
  const short = `${table.slice(0, 6)}…${table.slice(-4)}`;
  return (
    <div className="min-h-dvh overflow-clip bg-bg text-cream">
      <SiteHeader />

      <section className="relative isolate">
        <div className="kc-rays -z-10" />
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pt-6 pb-16 sm:px-6 lg:min-h-[min(760px,calc(100dvh-64px))] lg:grid-cols-[1.05fr_.95fr] lg:gap-6 lg:pb-24">
          <div className="grid gap-6 text-center lg:text-left">
            <h1 className="font-display text-[56px] leading-[.9] text-sun [text-shadow:3px_3px_0_var(--color-red),6px_6px_0_var(--color-ink)] sm:text-8xl lg:text-[104px]">Kryphochroma</h1>
            <p className="text-2xl font-semibold text-cream sm:text-3xl">The card game nobody can peek at.</p>
            <p className="mx-auto max-w-[52ch] text-base leading-relaxed text-cream/75 sm:text-lg lg:mx-0">
              Hands, the deck and every bluff are FHE ciphertexts. The contract shuffles, deals and checks each move without seeing a card. Only you can decrypt yours.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Link href="/new" className="kc-btn kc-mono">
                <Play aria-hidden />
                Play on Sepolia
              </Link>
              <Link href="/play" className="kc-btn">
                Practice offline
              </Link>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted lg:justify-start">
              <li className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-teal shadow-[0_0_0_4px_rgba(31,158,138,.25)]" aria-hidden />
                Live on Sepolia with Zama FHEVM
              </li>
              <li className="flex items-center gap-2">
                <Wallet className="size-4 shrink-0 text-sun" aria-hidden />
                No wallet needed, test ETH is on us
              </li>
            </ul>
          </div>
          <CardFan cards={FAN} className="mx-auto aspect-[5/4] w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[560px]" />
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="moves">
        <div className="grid max-w-2xl gap-4">
          <h2 id="moves" className="font-display text-4xl leading-none text-cream sm:text-5xl">
            Four moves that only work encrypted
          </h2>
          <p className="max-w-[60ch] text-lg leading-relaxed text-cream/70">Hidden information is the game. Each of these needs a card the contract can compute on and nobody can read.</p>
        </div>
        <ul className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {MOVES.map(({ icon: Icon, color: base, title, text, hidden }) => {
            const color = `color-mix(in srgb, ${base} 62%, var(--color-cream))`;
            return (
            <li key={title} className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
              <span className="row-span-3 grid size-14 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${base} 22%, transparent)`, color }}>
                <Icon className="size-7" aria-hidden />
              </span>
              <h3 className="font-display text-3xl leading-none tracking-wide" style={{ color }}>
                {title}
              </h3>
              <p className="max-w-[46ch] leading-relaxed text-cream/85">{text}</p>
              <p className="max-w-[46ch] text-sm text-muted">{hidden}</p>
            </li>
            );
          })}
        </ul>
      </section>

      <section className="border-y border-cream/10 bg-ink/40" aria-labelledby="chain">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid max-w-2xl gap-3">
            <h2 id="chain" className="font-display text-4xl leading-none text-cream sm:text-5xl">
              A deck nobody holds
            </h2>
          </div>
          <ol className="mt-10 grid gap-8 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="grid gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-5xl leading-none text-sun/90">{i + 1}</span>
                  <Icon className="size-6 text-cream/70" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-cream">{title}</h3>
                <p className="leading-relaxed text-cream/75">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link href="/secret" className="inline-flex min-h-11 items-center gap-1 text-sun underline underline-offset-4">
              See what stays secret and when
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href={`https://sepolia.etherscan.io/address/${table}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-cream/80 underline underline-offset-4 hover:text-cream">
              Contract {short} on Etherscan
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24" aria-labelledby="modes">
        <div className="grid max-w-2xl gap-3">
          <h2 id="modes" className="font-display text-4xl leading-none text-cream sm:text-5xl">
            Three ways to play
          </h2>
        </div>
        <ul className="mt-10 grid border-y border-cream/12 md:grid-cols-3 md:divide-x md:divide-cream/12 max-md:divide-y max-md:divide-cream/12">
          {MODES.map(({ icon: Icon, title, text, href }) => (
            <li key={title}>
              <Link href={href} className="group flex h-full flex-col gap-3 px-1 py-8 transition-colors hover:bg-sun/5 md:px-8">
                <Icon className="size-7 text-sun" aria-hidden />
                <h3 className="text-xl font-semibold text-cream">{title}</h3>
                <p className="leading-relaxed text-cream/75">{text}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-sun">
                  Open
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-cream/10">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>A shedding card game in the Crazy Eights family, built on Zama FHEVM.</p>
          <nav className="flex gap-5" aria-label="Footer">
            <Link href="/docs" className="inline-flex min-h-11 items-center gap-1 hover:text-cream">
              Docs
            </Link>
            <Link href="/secret" className="inline-flex min-h-11 items-center gap-1 hover:text-cream">
              How it stays secret
            </Link>
            <Link href="/play" className="inline-flex min-h-11 items-center gap-1 hover:text-cream">
              Practice
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
