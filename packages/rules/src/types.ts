import type { Card, Color } from "./cards.js";

export type Stage = "Playing" | "AwaitChallenge" | "Revealing" | "RoundOver" | "MatchOver";

export type MatchMode = "single" | "match";

export interface TableConfig {
  readonly seats: number;
  readonly mode: MatchMode;
  readonly targetScore: number;
}

export interface PublicSeat {
  readonly handSize: number;
  readonly slots: readonly boolean[];
  readonly saidMono: boolean;
  readonly timeouts: number;
  readonly abandoned: boolean;
  readonly score: number;
}

export interface PendingDrawFour {
  readonly by: number;
  readonly prevColor: Color;
}

export interface RoundResult {
  readonly winner: number | null;
  readonly points: number;
  readonly cheaters: readonly number[];
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
  readonly monoWindow: number | null;
  readonly candidate: number | null;
  readonly lastResult: RoundResult | null;
}

export type Hand = readonly (Card | null)[];

export interface GameState {
  readonly pub: PublicState;
  readonly deck: readonly Card[];
  readonly hands: readonly Hand[];
  readonly honest: readonly boolean[];
  readonly hadColor: boolean | null;
  readonly rng: number;
}

export type Move =
  | { readonly type: "play"; readonly slot: number; readonly card: Card; readonly color?: Color }
  | { readonly type: "draw" }
  | { readonly type: "pass" }
  | { readonly type: "mono" }
  | { readonly type: "accept" }
  | { readonly type: "challenge" };

export type GameEvent =
  | { readonly type: "Dealt"; readonly round: number; readonly firstSeat: number; readonly topCard: Card }
  | { readonly type: "Played"; readonly seat: number; readonly slot: number; readonly card: Card; readonly color: Color }
  | { readonly type: "Drew"; readonly seat: number; readonly slot: number }
  | { readonly type: "Passed"; readonly seat: number }
  | { readonly type: "MonoSaid"; readonly seat: number }
  | { readonly type: "MonoCaught"; readonly seat: number }
  | { readonly type: "DrawFourAccepted"; readonly seat: number }
  | { readonly type: "DrawFourChallenged"; readonly seat: number }
  | { readonly type: "ChallengeResolved"; readonly bit: boolean }
  | { readonly type: "TimedOut"; readonly seat: number }
  | { readonly type: "SeatAbandoned"; readonly seat: number }
  | { readonly type: "Reshuffled"; readonly count: number }
  | { readonly type: "RevealStarted"; readonly candidate: number }
  | { readonly type: "RoundSettled"; readonly winner: number | null; readonly points: number; readonly cheaters: readonly number[] }
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
  | "NoDrawFour"
  | "CannotSayMono"
  | "CannotCatch"
  | "BadReveal";

export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RuleError";
    this.code = code;
  }
}
