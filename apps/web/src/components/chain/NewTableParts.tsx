"use client";

import { SETUP_STEPS } from "@kryphochroma/abi";
import { cardBack } from "@kryphochroma/cards";
import { ArrowRight, Bot, Check, GraduationCap, KeyRound, Loader2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { CardFan } from "@/components/site/CardFan";
import { tableCode, tableIdFromCode, tablePath } from "@/lib/invite";
import { cn } from "@/lib/utils";

export interface OpenTable {
  readonly id: string;
  readonly joined: number;
  readonly seats: number;
  readonly creator: string;
}

const SEAT_CHOICES = [2, 3, 4] as const;

const QUICK_FAN = [
  { svg: cardBack("0x51c0ffee"), rotate: -14, x: "-38%", y: "4%" },
  { svg: cardBack("0x9e3779b9"), rotate: 0, x: "0%", y: "-4%" },
  { svg: cardBack("0x2545f491"), rotate: 14, x: "38%", y: "4%" },
] as const;

export interface FlowStatus {
  readonly steps: readonly string[];
  readonly done: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly warming: number | null;
}

export function FlowProgress({ status }: { readonly status: FlowStatus }) {
  const { steps, done, running, error, warming } = status;
  return (
    <div className="grid gap-3 empty:hidden" aria-live="polite">
      {done >= 0 && (
        <ol className="grid gap-1.5 rounded-md bg-black/25 p-4 text-sm">
          {steps.map((step, i) => (
            <li key={step} className={cn("flex items-center gap-2.5", i > done + 1 && "text-cream/45")}>
              {i <= done ? <Check className="size-4 shrink-0 text-teal" aria-hidden /> : i === done + 1 && running ? <Loader2 className="size-4 shrink-0 animate-spin text-brass" aria-hidden /> : <span className="size-4 shrink-0 rounded-full border border-cream/30" />}
              {step}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="rounded-md border-2 border-red/70 bg-red/10 px-4 py-3 text-sm text-cream">
          {error}
        </p>
      )}
      {warming !== null && (
        <p role="status" className="rounded-md bg-black/25 px-4 py-3 text-sm text-cream/85">
          Every ready table is taken, a new one is drawing its cards on chain: step {warming} of {SETUP_STEPS}. Try again in half a minute, or open your own table below.
        </p>
      )}
    </div>
  );
}

export function AiPanel({ onPlay, disabled, children }: { readonly onPlay: () => void; readonly disabled: boolean; readonly children: ReactNode }) {
  return (
    <section className="kc-panel kc-felt kc-mode relative overflow-hidden" aria-labelledby="ai-title">
      <p className="kc-mode-head">
        <Bot aria-hidden />
        Fastest start
      </p>
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
        <div className="grid gap-3">
          <h2 id="ai-title" className="font-display text-5xl leading-[.9] text-cream">
            Play the AI
          </h2>
          <p className="max-w-[38ch] text-base leading-relaxed text-cream/80">You and three bots at a table whose cards are already drawn on chain. You are dealt in seconds.</p>
        </div>
        <CardFan cards={QUICK_FAN} className="order-first mx-auto aspect-[4/3] w-36 sm:order-none sm:w-full" cardClassName="w-[46%]" />
      </div>
      <div className="kc-mode-go">
        <button type="button" className="kc-btn kc-btn-brass h-14 w-full justify-center px-7 text-2xl" onClick={onPlay} disabled={disabled}>
          <Zap aria-hidden />
          Deal me in
        </button>
        <span className="flex items-center justify-center gap-2 text-sm text-cream/75">
          <span className="size-2 rounded-[1px] bg-teal" aria-hidden />
          Tables ready now
        </span>
      </div>
      {children}
    </section>
  );
}

function SeatDots({ count, filled = count, className }: { readonly count: number; readonly filled?: number; readonly className?: string }) {
  return (
    <span className={cn("flex gap-1", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cn("size-2.5 rounded-full border-2 border-current", i < filled && "bg-current")} />
      ))}
    </span>
  );
}

export interface FriendsPanelProps {
  readonly seats: number;
  readonly onSeats: (n: number) => void;
  readonly stack: boolean;
  readonly onStack: (on: boolean) => void;
  readonly onFriends: () => void;
  readonly onBots: () => void;
  readonly locked: boolean;
  readonly disabled: boolean;
  readonly children: ReactNode;
}

export function FriendsPanel({ seats, onSeats, stack, onStack, onFriends, onBots, locked, disabled, children }: FriendsPanelProps) {
  return (
    <section className="kc-panel kc-mode" aria-labelledby="friends-title">
      <p className="kc-mode-head">
        <Users aria-hidden />
        Your own table
      </p>
      <div className="grid gap-2">
        <h2 id="friends-title" className="font-display text-5xl leading-[.9] text-cream">
          Play with friends
        </h2>
        <p className="text-base leading-relaxed text-cream/75">Open a table, send the link. Seats nobody takes can go to bots.</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Players at your table">
        {SEAT_CHOICES.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={seats === n} className="kc-seat-pick min-h-0 py-3" onClick={() => onSeats(n)} disabled={locked}>
            <span className="font-display text-3xl leading-none">{n}</span>
            <SeatDots count={n} />
            <span className="text-xs font-semibold">players</span>
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={stack} onChange={(e) => onStack(e.target.checked)} disabled={locked} className="kc-switch mt-0.5" />
        <span className="grid gap-0.5">
          <span className="font-semibold text-cream">Stack draw two cards</span>
          <span className="text-cream/60">A +2 can answer a +2. Such a table draws its cards after you open it, about half a minute.</span>
        </span>
      </label>
      <div className="kc-mode-go">
        <button type="button" className="kc-btn kc-btn-brass h-12 w-full justify-center text-lg" onClick={onFriends} disabled={disabled}>
          <Users aria-hidden />
          Get an invite link
        </button>
        <button type="button" className="kc-btn h-12 w-full justify-center" onClick={onBots} disabled={disabled}>
          <Bot aria-hidden />
          Fill empty seats with bots
        </button>
      </div>
      {children}
    </section>
  );
}

function CodeForm({ disabled, onJoin }: { readonly disabled: boolean; readonly onJoin: (path: string) => void }) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = code.trim().replace(/^.*\/j\//, "").replace(/\s+/g, "-");
    const id = tableIdFromCode(typed);
    if (id === null) return setWrong(true);
    setWrong(false);
    onJoin(tablePath(id));
  };
  return (
    <form className="grid gap-2" onSubmit={submit}>
      <label htmlFor="table-code" className="text-sm font-semibold text-cream">
        Table code or invite link
      </label>
      <div className="flex gap-2">
        <input
          id="table-code"
          className="kc-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="red-otter"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={wrong}
          aria-describedby={wrong ? "table-code-error" : undefined}
        />
        <button type="submit" className="kc-btn kc-btn-brass h-12 px-5" disabled={disabled || code.trim() === ""}>
          Join
        </button>
      </div>
      {wrong && (
        <p id="table-code-error" role="alert" className="text-sm text-cream">
          That is not a table code. It looks like two words, for example red-otter.
        </p>
      )}
    </form>
  );
}

export function JoinPanel({ tables, disabled, onJoin }: { readonly tables: readonly OpenTable[]; readonly disabled: boolean; readonly onJoin: (path: string) => void }) {
  return (
    <section className="kc-panel kc-mode" aria-labelledby="join-title">
      <p className="kc-mode-head">
        <KeyRound aria-hidden />
        Got an invite
      </p>
      <div className="grid gap-2">
        <h2 id="join-title" className="font-display text-5xl leading-[.9] text-cream">
          Join a table
        </h2>
        <p className="text-base leading-relaxed text-cream/75">Type the code a friend sent you, or sit down at a table that waits for players.</p>
      </div>
      <CodeForm disabled={disabled} onJoin={onJoin} />
      <div className="grid gap-2">
        <p className="flex items-center justify-between text-sm font-semibold text-cream">
          Waiting for players
          <span className="flex items-center gap-2 text-xs font-semibold text-cream/65">
            <span className="size-2 rounded-[1px] bg-teal" aria-hidden />
            Live
          </span>
        </p>
        {tables.length === 0 ? (
          <p className="rounded-md border border-dashed border-cream/20 px-4 py-4 text-sm text-cream/65">No open tables right now. Open one with friends and send the link.</p>
        ) : (
          <ul className="grid gap-2">
            {tables.map((t) => (
              <li key={t.id}>
                <Link href={tablePath(t.id)} className="group flex items-center gap-3 rounded-md border border-cream/15 px-3 py-2.5 transition-colors hover:border-brass/60 hover:bg-brass/5">
                  <span className="grid min-w-0 flex-1 gap-1">
                    <b className="truncate font-display text-xl leading-none font-normal tracking-wide text-cream">{tableCode(t.id)}</b>
                    <span className="flex items-center gap-2 text-xs text-cream/65">
                      <SeatDots count={t.seats} filled={t.joined} className="text-brass" />
                      {t.joined} of {t.seats} seats
                    </span>
                  </span>
                  <span className="kc-chip kc-chip-on min-h-11 px-4">
                    Join
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function PracticeStrip() {
  return (
    <section className="kc-panel flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5" aria-labelledby="practice-title">
      <GraduationCap className="size-8 shrink-0 text-brass" aria-hidden />
      <div className="grid min-w-[16rem] flex-1 gap-1">
        <h2 id="practice-title" className="font-display text-3xl leading-none text-cream">
          New to the game?
        </h2>
        <p className="text-sm text-cream/70">Practice offline against bots in this tab. Nothing goes on chain and nothing waits for a block.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/play" className="kc-btn h-12 px-5">
          Practice offline
        </Link>
        <Link href="/docs" className="kc-btn h-12 px-5">
          How to play
        </Link>
      </div>
    </section>
  );
}
