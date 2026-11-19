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
      <small className="kc-elapsed" aria-hidden>
        {elapsed} s
      </small>
    </div>
  );
}

export interface WaitNote {
  readonly title: string;
  readonly why: string;
  readonly phase?: string;
}

const BLOCK_WHY = "Sepolia makes one block about every 12 s, and your move counts once it is in a block.";
const KMS_WHY = "Each card is a ciphertext on chain. Zama KMS re-encrypts it for your key alone, nobody else can read it, not even our server. Usually 3 to 8 s.";

export function sealedCardNote(sync: ChainSync | null | undefined, sealed: number, handSize: number): WaitNote | null {
  if (!sync || sealed === 0) return null;
  if (sealed === handSize) return { title: "Opening your hand", why: KMS_WHY, phase: "kms" };
  if (sync.pendingMoves > 0) {
    const cards = sealed === 1 ? "your new card" : `${sealed} new cards`;
    return { title: `Writing ${cards} to Sepolia`, why: `${BLOCK_WHY} ${sync.pendingMoves} ${sync.pendingMoves === 1 ? "move is" : "moves are"} queued for it.`, phase: "block" };
  }
  return { title: `Opening your cards, ${sealed} still sealed`, why: KMS_WHY, phase: "kms" };
}

const BIT_WHY = "Zama's coprocessor works the bit out under encryption, the KMS decrypts that one bit in public and the contract checks its signatures. Usually 15 to 40 s; no card is shown to anyone.";

export function challengeNote(sync: ChainSync | null | undefined, stage: string): WaitNote | null {
  if (!sync || stage !== "AwaitChallenge") return null;
  return { title: "Checking the Wild +4", why: `One encrypted yes or no decides it: had the player held the colour in play? ${BIT_WHY}`, phase: "bit" };
}

/** A doubted veil no longer stops the table; the one seat it holds up is a player down to their last card, who may not go out before the penalty is dealt. */
export function lastCardNote(sync: ChainSync | null | undefined, waits: boolean): WaitNote | null {
  if (!sync || !waits) return null;
  return {
    title: "Your last card waits for the veil check",
    why: "Nobody can go out while a doubted veil is open, so its penalty counts before the hands are scored. The KMS opens that one bit while the game goes on, usually within 20 s.",
    phase: "doubt",
  };
}

export function refillNote(sync: ChainSync | null | undefined, deckCount: number): WaitNote | null {
  if (!sync || deckCount > 0) return null;
  const progress = sync.refillTotal > 0 ? ` Step ${sync.refillStep} of ${sync.refillTotal}.` : "";
  return { title: "Drawing fresh cards for the deck", why: `The deck ran out. New cards are drawn on chain as encrypted random numbers, a few blocks, and played cards never come back; until then you can only pass or play from your hand.${progress}` };
}

export function WaitHint({ note, className }: { readonly note: WaitNote; readonly className?: string }) {
  const elapsed = useElapsedFor(note.phase ?? note.title);
  return (
    <div className={cn("kc-wait-hint", className)} role="status" aria-live="polite">
      <p>
        <Loader2 className="animate-spin" aria-hidden />
        <b>{note.title}</b>
        <span className="kc-elapsed" aria-hidden>
          {elapsed} s
        </span>
      </p>
      <small>{note.why}</small>
    </div>
  );
}

function useElapsedFor(key: string): number {
  const [start, setStart] = useState(() => ({ key, at: Date.now() }));
  const [now, setNow] = useState(start.at);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  if (start.key !== key) {
    const at = Date.now();
    setStart({ key, at });
    setNow(at);
  }
  return Math.max(0, Math.floor((now - start.at) / 1000));
}
