"use client";

import { STAGE } from "@kryphochroma/abi";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChainSync } from "@/game/controller";
import { cn } from "@/lib/utils";

const REVEALING = STAGE.indexOf("Revealing");
const TICK_MS = 1000;

type StepState = "done" | "active" | "waiting";

interface Step {
  readonly label: string;
  readonly detail: string;
  readonly state: StepState;
}

export function roundEndSteps(sync: ChainSync): readonly Step[] {
  const written = sync.pendingMoves === 0 && sync.chainStage >= REVEALING;
  const opened = written && (sync.revealPrepared >= sync.seats || sync.chainStage > REVEALING);
  const scored = sync.chainStage > REVEALING;
  const state = (done: boolean, ready: boolean): StepState => (done ? "done" : ready ? "active" : "waiting");
  return [
    { label: "Last moves written to Sepolia", detail: sync.pendingMoves > 0 ? `${sync.pendingMoves} moves still on their way` : "waiting for the next block", state: state(written, true) },
    { label: "Every hand opened for scoring", detail: `${Math.min(sync.revealPrepared, sync.seats)} of ${sync.seats} hands marked for public decryption`, state: state(opened, written) },
    { label: "Zama KMS proof checked, points counted", detail: "the contract verifies the KMS signatures", state: state(scored, opened) },
  ];
}

function useElapsed(): number {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return Math.floor((now - start) / 1000);
}

export function RoundEndProgress({ sync, winner }: { readonly sync: ChainSync; readonly winner: string | null }) {
  const elapsed = useElapsed();
  const steps = roundEndSteps(sync);
  return (
    <div className="kc-progress" role="status" aria-live="polite">
      <b>{winner ? `${winner} went out!` : "Round over!"}</b>
      <p>Counting points on Sepolia, each step is one block of about 12 s.</p>
      <ol>
        {steps.map((step) => (
          <li key={step.label} className={cn(step.state === "waiting" && "kc-wait")}>
            {step.state === "done" ? <Check aria-hidden className="kc-ok" /> : step.state === "active" ? <Loader2 aria-hidden className="animate-spin" /> : <span className="kc-dot-wait" aria-hidden />}
            <span>
              {step.label}
              {step.state === "active" && <small>{step.detail}</small>}
            </span>
          </li>
        ))}
      </ol>
      <small className="kc-elapsed">{elapsed} s</small>
    </div>
  );
}

export function sealedCardNote(sync: ChainSync | null | undefined, sealed: number): string | null {
  if (!sync || sealed === 0) return null;
  const cards = sealed === 1 ? "Your new card" : `${sealed} new cards`;
  return sync.pendingMoves > 0 ? `${cards}: writing your draw to Sepolia (${sync.pendingMoves} moves queued)` : `${cards}: Zama KMS is decrypting ${sealed === 1 ? "it" : "them"} for your key only`;
}
