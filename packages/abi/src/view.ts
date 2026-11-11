import { DECK_SIZE, FILL_CHUNK, NO_SEAT, SHUFFLE_STEPS } from "./constants.js";
import { type Color, HAND_SLOTS, type PublicSeat, type PublicState, type Stage } from "@kryphochroma/rules";

export interface ChainTable {
  readonly stage: number;
  readonly joined: number;
  readonly turn: number;
  readonly dir: number;
  readonly topCard: number;
  readonly color: number;
  readonly round: number;
  readonly deckPtr: number;
  readonly deckEnd?: number;
  readonly refillSize?: number;
  readonly refillStep?: number;
  readonly drawnSlot: number;
  readonly pendingDraw: number;
  readonly monoWindow: number;
  readonly drawFourBy: number;
  readonly veilBy?: number;
  readonly veilJudge?: number;
  readonly prevColor: number;
  readonly candidate: number;
  readonly config: { readonly seats?: number; readonly targetScore: number; readonly singleRound: boolean; readonly stackDrawTwo: boolean };
}

export interface ChainSeat {
  readonly handSize: number;
  readonly slots: number;
  readonly saidMono: boolean;
  readonly timeouts: number;
  readonly abandoned: boolean;
  readonly score: number;
  readonly veilUsed?: boolean;
}

const STAGES: Record<number, Stage> = { 3: "Playing", 4: "AwaitChallenge", 5: "Revealing", 6: "RoundOver", 7: "MatchOver" };
export function chainDeckCount(table: Pick<ChainTable, "deckPtr" | "deckEnd" | "refillSize" | "refillStep">): number {
  const live = Number(table.deckEnd ?? DECK_SIZE) - Number(table.deckPtr);
  const size = Number(table.refillSize ?? 0);
  const ready = size > 0 && Number(table.refillStep ?? 0) === Math.ceil(size / FILL_CHUNK) + SHUFFLE_STEPS;
  return live + (ready ? size : 0);
}

const orNull = (value: number): number | null => (value === NO_SEAT ? null : value);

export function toPublicState(table: ChainTable, seats: readonly ChainSeat[], discard: readonly number[]): PublicState | null {
  const stage = STAGES[table.stage];
  if (!stage) return null;
  const publicSeats: PublicSeat[] = seats.map((s) => ({
    handSize: s.handSize,
    slots: Array.from({ length: HAND_SLOTS }, (_, i) => (s.slots & (1 << i)) !== 0),
    saidMono: s.saidMono,
    timeouts: s.timeouts,
    abandoned: s.abandoned,
    score: s.score,
    veilUsed: Boolean(s.veilUsed),
  }));
  const veilBy = table.veilBy ?? NO_SEAT;
  const veilJudge = table.veilJudge ?? NO_SEAT;
  return {
    config: {
      seats: table.joined,
      mode: table.config.singleRound ? "single" : "match",
      targetScore: table.config.targetScore,
      stackDrawTwo: table.config.stackDrawTwo,
    },
    stage,
    round: table.round,
    turn: table.turn,
    dir: table.dir < 0 ? -1 : 1,
    topCard: table.topCard,
    color: table.color as Color,
    deckCount: chainDeckCount(table),
    discard,
    seats: publicSeats,
    drawnSlot: orNull(table.drawnSlot),
    drawFour: table.drawFourBy === NO_SEAT ? null : { by: table.drawFourBy, prevColor: table.prevColor as Color },
    veil: Number(veilBy) === NO_SEAT ? null : { by: Number(veilBy), judge: Number(veilJudge), claim: table.topCard },
    pendingDraw: table.pendingDraw,
    monoWindow: orNull(table.monoWindow),
    candidate: orNull(table.candidate),
    lastResult: null,
    recycles: false,
  };
}
