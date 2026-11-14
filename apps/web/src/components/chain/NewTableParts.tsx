"use client";

import { SETUP_STEPS } from "@kryphochroma/abi";
import { cardBack } from "@kryphochroma/cards";
import { ArrowRight, Bot, Check, Loader2, Users, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardFan } from "@/components/site/CardFan";
import { tableCode, tablePath } from "@/lib/invite";
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
        <ol className="grid gap-1.5 rounded-2xl bg-black/25 p-4 text-sm">
          {steps.map((step, i) => (
            <li key={step} className={cn("flex items-center gap-2.5", i > done + 1 && "text-cream/45")}>
              {i <= done ? <Check className="size-4 shrink-0 text-teal" aria-hidden /> : i === done + 1 && running ? <Loader2 className="size-4 shrink-0 animate-spin text-sun" aria-hidden /> : <span className="size-4 shrink-0 rounded-full border border-cream/30" />}
              {step}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="rounded-2xl border-2 border-red/70 bg-red/10 px-4 py-3 text-sm text-cream">
          {error}
        </p>
      )}
      {warming !== null && (
        <p role="status" className="rounded-2xl bg-black/25 px-4 py-3 text-sm text-cream/85">
          Every ready table is taken, a new one is drawing its cards on chain: step {warming} of {SETUP_STEPS}. Try again in half a minute, or open your own table below.
        </p>
      )}
    </div>
  );
}

export function QuickPanel({ onPlay, disabled, children }: { readonly onPlay: () => void; readonly disabled: boolean; readonly children: ReactNode }) {
  return (
    <section className="kc-panel kc-felt relative overflow-hidden p-6 sm:p-8" aria-labelledby="quick-title">
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid gap-4">
          <h2 id="quick-title" className="font-display text-5xl leading-[.9] text-cream sm:text-6xl">
            Quick game
          </h2>
          <p className="max-w-[40ch] text-base leading-relaxed text-cream/80">You and three bots at a table whose cards were drawn on chain before you clicked. No waiting for the draw.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
            <button type="button" className="kc-btn kc-mono h-14 px-7 text-2xl" onClick={onPlay} disabled={disabled}>
              <Zap aria-hidden />
              Deal me in
            </button>
            <span className="flex items-center gap-2 text-sm text-cream/75">
              <span className="size-2 rounded-full bg-teal shadow-[0_0_0_4px_rgba(31,158,138,.25)]" aria-hidden />
              Tables ready now
            </span>
          </div>
        </div>
        <CardFan cards={QUICK_FAN} className="order-first mx-auto aspect-[4/3] w-48 sm:order-none sm:w-full" cardClassName="w-[46%]" />
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

export interface OwnTableProps {
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

export function OwnTablePanel({ seats, onSeats, stack, onStack, onFriends, onBots, locked, disabled, children }: OwnTableProps) {
  return (
    <section className="kc-panel grid grid-cols-1 gap-6 p-6 sm:p-8" aria-labelledby="own-title">
      <div className="grid gap-1.5">
        <h2 id="own-title" className="font-display text-4xl leading-none text-sun">
          Your own table
        </h2>
        <p className="text-sm text-cream/70">Pick the seats, then fill them with friends or bots.</p>
      </div>
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Players at your table">
        {SEAT_CHOICES.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={seats === n} className="kc-seat-pick" onClick={() => onSeats(n)} disabled={locked}>
            <span className="font-display text-4xl leading-none">{n}</span>
            <SeatDots count={n} />
            <span className="text-xs font-semibold">players</span>
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cream/15 p-4 transition-colors hover:bg-cream/5">
        <input type="checkbox" checked={stack} onChange={(e) => onStack(e.target.checked)} disabled={locked} className="kc-switch mt-0.5" />
        <span className="grid gap-1">
          <span className="font-semibold text-cream">Stack draw two cards</span>
          <span className="text-sm text-cream/65">A +2 can answer a +2. Ready tables use the standard rule, so a stacking table draws its cards after you open it, about half a minute.</span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="kc-option" onClick={onFriends} disabled={disabled}>
          <Users aria-hidden />
          <span>
            <b>With friends</b>
            <small>Get an invite link to share</small>
          </span>
        </button>
        <button type="button" className="kc-option" onClick={onBots} disabled={disabled}>
          <Bot aria-hidden />
          <span>
            <b>With bots</b>
            <small>Empty seats go to bots, start now</small>
          </span>
        </button>
      </div>
      {children}
    </section>
  );
}

export function OpenTablesPanel({ tables, onOpen, disabled }: { readonly tables: readonly OpenTable[]; readonly onOpen: () => void; readonly disabled: boolean }) {
  return (
    <section className="kc-panel grid grid-cols-1 content-start gap-5 p-6 sm:p-8 lg:sticky lg:top-24" aria-labelledby="open-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="open-title" className="font-display text-4xl leading-none text-sun">
          Open tables
        </h2>
        <span className="flex items-center gap-2 text-xs font-semibold text-cream/70">
          <span className="kc-live size-2 rounded-full bg-teal" aria-hidden />
          Live
        </span>
      </div>
      {tables.length === 0 ? (
        <div className="grid justify-items-center gap-4 rounded-2xl border-2 border-dashed border-cream/20 px-5 py-8 text-center">
          <SeatDots count={4} filled={0} className="text-cream/40" />
          <p className="max-w-[30ch] text-sm text-cream/75">Nobody is waiting for players right now. Open a table and send the link to a friend.</p>
          <button type="button" className="kc-btn" onClick={onOpen} disabled={disabled}>
            <Users aria-hidden />
            Open with friends
          </button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {tables.map((t) => (
            <li key={t.id}>
              <Link href={tablePath(t.id)} className="group flex items-center gap-4 rounded-2xl border border-cream/15 px-4 py-3 transition-colors hover:border-sun/60 hover:bg-sun/5">
                <span className="grid min-w-0 flex-1 gap-1">
                  <b className="truncate font-display text-2xl leading-none font-normal tracking-wide text-cream">{tableCode(t.id)}</b>
                  <span className="flex items-center gap-2 text-xs text-cream/65">
                    <SeatDots count={t.seats} filled={t.joined} className="text-sun" />
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
      <p className="text-xs leading-relaxed text-cream/55">Anyone can sit down as a guest with a key made in their tab, or with a wallet on Sepolia.</p>
    </section>
  );
}
