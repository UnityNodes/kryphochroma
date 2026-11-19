import type { Card, Color } from "./cards.js";

export type Stage = "Playing" | "AwaitChallenge" | "Revealing" | "RoundOver" | "MatchOver";

export type MatchMode = "single" | "match";

export interface TableConfig {
  readonly seats: number;
  readonly mode: MatchMode;
  readonly targetScore: number;
  readonly stackDrawTwo: boolean;
}

export interface PublicSeat {
  readonly handSize: number;
  readonly slots: readonly boolean[];
  readonly saidMono: boolean;
  readonly timeouts: number;
  readonly abandoned: boolean;
  readonly score: number;
  readonly veilUsed: boolean;
  readonly sonarUsed: boolean;
}

export interface PendingVeil {
  readonly by: number;
  readonly judge: number;
  readonly claim: Card;
}

export interface PendingDoubt {
  readonly by: number;
  readonly judge: number;
}

export interface Peek {
  readonly seat: number;
  readonly slot: number;
}

export interface PendingDrawFour {
  readonly by: number;
  readonly prevColor: Color;
}

export interface RoundResult {
  readonly winner: number | null;
  readonly points: number;
  readonly cheaters: readonly number[];
  readonly bonus?: boolean;
  readonly secrets?: readonly number[];
}

export interface PublicState {
  readonly config: TableConfig;
  readonly stage: Stage;
  readonly round: number;
  readonly turn: number;
  readonly dir: 1 | -1;
  readonly topCard: Card;
  readonly color: Color;
  readonly deckCount: number;
  readonly discard: readonly Card[];
  readonly seats: readonly PublicSeat[];
  readonly drawnSlot: number | null;
  readonly drawFour: PendingDrawFour | null;
  readonly veil: PendingVeil | null;
  readonly doubt: PendingDoubt | null;
  readonly pendingDraw: number;
  readonly monoWindow: number | null;
  readonly candidate: number | null;
  readonly lastResult: RoundResult | null;
  readonly recycles?: boolean;
}

export type Hand = readonly (Card | null)[];

export interface GameState {
  readonly pub: PublicState;
  readonly deck: readonly Card[];
  readonly hands: readonly Hand[];
  readonly queues?: readonly (readonly Card[])[];
  readonly honest: readonly boolean[];
  readonly hadColor: boolean | null;
  readonly veilTrue: boolean | null;
  readonly secrets: readonly number[];
  readonly rng: number;
}

export type Move =
  | { readonly type: "play"; readonly slot: number; readonly card: Card; readonly color?: Color; readonly peek?: Peek }
  | { readonly type: "veil"; readonly slot: number; readonly claim: Card }
  | { readonly type: "doubt" }
  | { readonly type: "sonar"; readonly target: number; readonly color: Color }
  | { readonly type: "draw" }
  | { readonly type: "pass" }
  | { readonly type: "mono" }
  | { readonly type: "accept" }
  | { readonly type: "challenge" }
  | { readonly type: "take" };

export type GameEvent =
  | { readonly type: "Dealt"; readonly round: number; readonly firstSeat: number; readonly topCard: Card }
  | { readonly type: "Played"; readonly seat: number; readonly slot: number; readonly card: Card; readonly color: Color }
  | { readonly type: "Drew"; readonly seat: number; readonly slot: number }
  | { readonly type: "Passed"; readonly seat: number }
  | { readonly type: "MonoSaid"; readonly seat: number }
  | { readonly type: "MonoCaught"; readonly seat: number }
  | { readonly type: "DrawFourAccepted"; readonly seat: number }
  | { readonly type: "DrawsTaken"; readonly seat: number; readonly count: number }
  | { readonly type: "DrawFourChallenged"; readonly seat: number }
  | { readonly type: "ChallengeResolved"; readonly bit: boolean }
  | { readonly type: "Veiled"; readonly seat: number; readonly slot: number; readonly claim: Card }
  | { readonly type: "VeilDoubted"; readonly seat: number }
  | { readonly type: "VeilResolved"; readonly truth: boolean }
  | { readonly type: "Peeked"; readonly seat: number; readonly target: number; readonly slot: number }
  | { readonly type: "Sonared"; readonly seat: number; readonly target: number; readonly color: Color; readonly count: number | null }
  | { readonly type: "TimedOut"; readonly seat: number }
  | { readonly type: "SeatAbandoned"; readonly seat: number }
  | { readonly type: "Reshuffled"; readonly count: number }
  | { readonly type: "RevealStarted"; readonly candidate: number }
  | { readonly type: "RoundSettled"; readonly winner: number | null; readonly points: number; readonly cheaters: readonly number[]; readonly bonus?: boolean }
  | { readonly type: "MatchOver"; readonly winner: number | null };

export interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type RuleErrorCode =
  | "BadConfig"
  | "WrongStage"
  | "NotYourTurn"
  | "BadSlot"
  | "BadCard"
  | "IllegalCard"
  | "BadColor"
  | "MustPlayDrawnCard"
  | "AlreadyDrew"
  | "CannotDraw"
  | "CannotPass"
  | "DrawFourPending"
  | "DrawPending"
  | "NoPendingDraw"
  | "MustStackOrTake"
  | "NoDrawFour"
  | "CannotSayMono"
  | "CannotCatch"
  | "BadReveal"
  | "VeilUsed"
  | "BadSonar"
  | "NoVeil"
  | "DoubtPending"
  | "BadPeek";

export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RuleError";
    this.code = code;
  }
}
