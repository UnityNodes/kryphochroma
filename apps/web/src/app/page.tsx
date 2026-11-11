import { EyeOff, Lock, Play, Swords } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center overflow-auto">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <section className="relative z-10 col-[1/-1] row-[1/-1] mx-4 grid max-w-xl gap-6 place-self-center py-10 text-center">
          <h1 className="font-display text-5xl text-sun [text-shadow:3px_3px_0_var(--r),6px_6px_0_var(--ink)] sm:text-7xl">Kryphochroma</h1>
          <p className="text-lg text-cream">A shedding card game in the Crazy Eights family where nobody can peek. Hands and the deck are Zama FHE ciphertexts on Sepolia.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/new" className="kc-btn kc-mono">
              <Play aria-hidden />
              Play on Sepolia
            </Link>
            <Link href="/play" className="kc-btn">
              Practice offline
            </Link>
          </div>
          <Link href="/secret" className="justify-self-center text-sm text-sun underline underline-offset-4">
            How it stays secret
          </Link>
          <ul className="grid gap-3 text-left text-sm text-muted sm:grid-cols-3">
            <li className="flex gap-2">
              <EyeOff className="size-5 shrink-0 text-sun" aria-hidden />
              Only you can decrypt your hand
            </li>
            <li className="flex gap-2">
              <Lock className="size-5 shrink-0 text-sun" aria-hidden />
              The contract shuffles with encrypted randomness
            </li>
            <li className="flex gap-2">
              <Swords className="size-5 shrink-0 text-sun" aria-hidden />
              A Wild Draw Four challenge reveals exactly one bit
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
