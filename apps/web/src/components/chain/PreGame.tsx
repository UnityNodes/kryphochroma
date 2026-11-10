"use client";

import { SETUP_STEPS } from "@kryphochroma/abi";
import { Bot, Lock, Play, Shuffle, Users } from "lucide-react";
import type { ChainSnapshot } from "@/chain/useChainGame";

export interface PreGameProps {
  readonly snapshot: ChainSnapshot;
  readonly address: string;
  readonly onFill: () => void;
  readonly onStart: () => void;
  readonly working: boolean;
}

export function PreGame({ snapshot, address, onFill, onStart, working }: PreGameProps) {
  const { table, seats } = snapshot;
  const stage = Number(table.stage);
  const isCreator = table.creator.toLowerCase() === address.toLowerCase();
  const progress = Math.round((Number(table.setupStep) / SETUP_STEPS) * 100);
  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <div className="kc-box relative z-10 col-[1/-1] row-[1/-1] mx-4 grid gap-4 place-self-center">
          {stage === 0 && (
            <>
              <h2>Table lobby</h2>
              <p>
                <Users className="mr-1 inline size-4" aria-hidden />
                {seats.length} of {table.config.seats ?? seats.length} seats taken
              </p>
              <ol className="grid gap-2 text-left text-sm">
                {seats.map((s, i) => (
                  <li key={s.player} className="flex items-center gap-2">
                    <Lock className="size-4 text-sun" aria-hidden />
                    Seat {i + 1}: {s.player.toLowerCase() === address.toLowerCase() ? "you" : `${s.player.slice(0, 6)}…${s.player.slice(-4)}`}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap justify-center gap-3">
                {seats.length < (table.config.seats ?? 0) && (
                  <button type="button" className="kc-btn" onClick={onFill} disabled={working}>
                    <Bot aria-hidden />
                    Fill with bots
                  </button>
                )}
                {isCreator && (
                  <button type="button" className="kc-btn" onClick={onStart} disabled={working || seats.length < 2}>
                    <Play aria-hidden />
                    Start
                  </button>
                )}
              </div>
            </>
          )}
          {stage === 1 && (
            <>
              <h2>Shuffling on chain</h2>
              <p>
                <Shuffle className="mr-1 inline size-4" aria-hidden />
                Step {Number(table.setupStep)} of {SETUP_STEPS} · FHE.randEbool + FHE.select
              </p>
              <div className="h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-sun transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p>Nobody, not even the contract, knows the order of the 108 cards.</p>
            </>
          )}
          {stage === 2 && (
            <>
              <h2>Dealing sealed cards</h2>
              <p>Each card is granted only to its owner with FHE.allow. The first discard is revealed with a KMS proof.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
