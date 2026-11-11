import {
  type Card,
  type Color,
  DECK_SIZE,
  RANK,
  colorOf,
  fullDeck,
  isColor,
  isDrawFour,
  isNumber,
  isSpyglass,
  isValidCard,
  isWild,
  matches,
  rankOf,
} from "./cards.js";
import {
  type Draft,
  HAND_SLOTS,
  HAND_START,
  MAX_SEATS,
  MAX_TIMEOUTS,
  MIN_SEATS,
  advance,
  canDraw,
  drawInto,
  finish,
  hasColorExcept,
  removeFromHand,
  requireSeat,
  requireStage,
  requireTurn,
  seatAt,
  toDraft,
} from "./draft.js";
import { randomInt, shuffle } from "./rng.js";
import { CHEAT_PENALTY, type RevealedHand, scoreRound } from "./score.js";

export const MAX_TARGET_SCORE = 10_000;
import { type GameState, type Peek, type PublicSeat, RuleError, type TableConfig, type Transition } from "./types.js";

export const SECRET_COLORS = 5;
export const VEIL_TRUE_DRAW = 2;
export const VEIL_LIE_DRAW = 4;

export function validateConfig(config: TableConfig): void {
  if (!Number.isInteger(config.seats) || config.seats < MIN_SEATS || config.seats > MAX_SEATS) {
    throw new RuleError("BadConfig", "seats must be 2..4");
  }
  if (!Number.isInteger(config.targetScore) || config.targetScore < 1 || config.targetScore > MAX_TARGET_SCORE) {
    throw new RuleError("BadConfig", "targetScore must be a positive integer");
  }
  if (typeof config.stackDrawTwo !== "boolean") throw new RuleError("BadConfig", "stackDrawTwo must be a boolean");
}

export function validateDeck(deck: readonly Card[]): void {
  if (deck.length !== DECK_SIZE) throw new RuleError("BadCard", `deck must have ${DECK_SIZE} cards`);
  const expected = [...fullDeck()].sort((a, b) => a - b);
  const actual = [...deck].sort((a, b) => a - b);
  if (expected.some((card, i) => card !== actual[i])) throw new RuleError("BadCard", "deck composition mismatch");
}

function emptySeat(score: number): PublicSeat {
  return {
    handSize: 0,
    slots: Array.from({ length: HAND_SLOTS }, () => false),
    saidMono: false,
    timeouts: 0,
    abandoned: false,
    score,
    veilUsed: false,
  };
}

function blankState(config: TableConfig, round: number, scores: readonly number[], rng: number): GameState {
  return {
    pub: {
      config,
      stage: "Playing",
      round,
      turn: 0,
      dir: 1,
      topCard: 0,
      color: 0,
      deckCount: 0,
      discard: [],
      seats: Array.from({ length: config.seats }, (_, i) => emptySeat(scores[i] ?? 0)),
      drawnSlot: null,
      drawFour: null,
      veil: null,
      pendingDraw: 0,
      monoWindow: null,
      candidate: null,
      lastResult: null,
    },
    deck: [],
    hands: Array.from({ length: config.seats }, () => Array.from({ length: HAND_SLOTS }, () => null)),
    honest: Array.from({ length: config.seats }, () => true),
    hadColor: null,
    veilTrue: null,
    secrets: Array.from({ length: config.seats }, () => -1),
    rng,
  };
}

function deal(base: GameState, deck: readonly Card[]): Transition {
  validateDeck(deck);
  const d = toDraft(base);
  const seats = d.pub.config.seats;
  d.deck = [...deck];
  for (let i = 0; i < HAND_START; i++) {
    for (let seat = 0; seat < seats; seat++) {
      const card = d.deck.shift() as Card;
      const hand = d.hands[seat] as (Card | null)[];
      const s = d.pub.seats[seat] as PublicSeat & { slots: boolean[]; handSize: number };
      hand[i] = card;
      s.slots[i] = true;
      s.handSize += 1;
    }
  }
  const skipped: Card[] = [];
  let top = d.deck.shift() as Card;
  while (!isNumber(top)) {
    skipped.push(top);
    top = d.deck.shift() as Card;
  }
  d.pub.topCard = top;
  d.pub.color = colorOf(top) as Color;
  d.pub.discard = [...skipped, top];
  d.pub.turn = d.pub.round % seats;
  let rng = d.rng;
  d.secrets = d.secrets.map(() => {
    const step = randomInt(rng, SECRET_COLORS);
    rng = step.next;
    return step.value;
  });
  d.rng = rng;
  d.events.push({ type: "Dealt", round: d.pub.round, firstSeat: d.pub.turn, topCard: top });
  return finish(d);
}

export function initialState(config: TableConfig, seed = 1, deck?: readonly Card[]): Transition {
  validateConfig(config);
  const scores = Array.from({ length: config.seats }, () => 0);
  if (deck) return deal(blankState(config, 0, scores, seed >>> 0), deck);
  const shuffled = shuffle(fullDeck(), seed >>> 0);
  return deal(blankState(config, 0, scores, shuffled.next), shuffled.items);
}

export function nextRound(state: GameState, deck?: readonly Card[]): Transition {
  if (state.pub.stage !== "RoundOver") throw new RuleError("WrongStage", "round is not over");
  const scores = state.pub.seats.map((s) => s.score);
  const round = state.pub.round + 1;
  if (deck) return deal(blankState(state.pub.config, round, scores, state.rng), deck);
  const shuffled = shuffle(fullDeck(), state.rng);
  return deal(blankState(state.pub.config, round, scores, shuffled.next), shuffled.items);
}

function seatOf(d: Draft, seat: number): Draft["pub"]["seats"][number] {
  return d.pub.seats[seat] as Draft["pub"]["seats"][number];
}

function beginReveal(d: Draft, candidate: number): void {
  d.pub.stage = "Revealing";
  d.pub.candidate = candidate;
  d.pub.drawFour = null;
  d.pub.veil = null;
  d.pub.drawnSlot = null;
  d.pub.monoWindow = null;
  d.hadColor = null;
  d.veilTrue = null;
  d.events.push({ type: "RevealStarted", candidate });
}

function closeVeil(d: Draft, seat: number): void {
  if (d.pub.veil && d.pub.veil.judge === seat) {
    d.pub.veil = null;
    d.veilTrue = null;
  }
}

function requirePeek(d: Draft, seat: number, peek: Peek | undefined): Peek {
  const target = peek ? d.pub.seats[peek.seat] : undefined;
  if (!peek || !target || peek.seat === seat || !Number.isInteger(peek.slot) || !target.slots[peek.slot]) throw new RuleError("BadPeek");
  return peek;
}

export function applyPlay(state: GameState, seat: number, slot: number, card: Card, chosenColor?: number, peek?: Peek): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (d.pub.drawFour) throw new RuleError("DrawFourPending");
  requireTurn(d, seat);
  closeVeil(d, seat);
  if (d.pub.pendingDraw > 0 && (isWild(card) || rankOf(card) !== RANK.drawTwo)) throw new RuleError("MustStackOrTake");
  const s = seatOf(d, seat);
  if (!Number.isInteger(slot) || slot < 0 || slot >= HAND_SLOTS || !s.slots[slot]) throw new RuleError("BadSlot");
  if (d.pub.drawnSlot !== null && slot !== d.pub.drawnSlot) throw new RuleError("MustPlayDrawnCard");
  if (!isValidCard(card)) throw new RuleError("BadCard");
  if (!matches(card, d.pub.topCard, d.pub.color)) throw new RuleError("IllegalCard");
  if (isWild(card) && (chosenColor === undefined || !isColor(chosenColor))) throw new RuleError("BadColor");
  const target = isSpyglass(card) ? requirePeek(d, seat, peek) : null;

  const hand = d.hands[seat] as (Card | null)[];
  const prevColor = d.pub.color;
  const hadColor = isDrawFour(card) ? hasColorExcept(hand, prevColor, slot) : null;
  const actual = removeFromHand(d, seat, slot);
  if (actual !== card) d.honest[seat] = false;

  const color = (isWild(card) ? chosenColor : colorOf(card)) as Color;
  d.pub.discard.push(card);
  d.pub.topCard = card;
  d.pub.color = color;
  d.pub.monoWindow = null;
  d.pub.drawnSlot = null;
  s.timeouts = 0;
  d.events.push({ type: "Played", seat, slot, card, color });
  if (target) d.events.push({ type: "Peeked", seat, target: target.seat, slot: target.slot });

  if (s.handSize === 0) {
    if (rankOf(card) === RANK.drawTwo && !isWild(card)) drawInto(d, seatAt(d, 1), d.pub.pendingDraw + 2);
    d.pub.pendingDraw = 0;
    if (isDrawFour(card)) drawInto(d, seatAt(d, 1), 4);
    beginReveal(d, seat);
    return finish(d);
  }
  if (s.handSize === 1 && !s.saidMono) d.pub.monoWindow = seat;

  applyEffect(d, card, seat, prevColor, hadColor);
  return finish(d);
}

function applyEffect(d: Draft, card: Card, seat: number, prevColor: Color, hadColor: boolean | null): void {
  if (isDrawFour(card)) {
    advance(d, 1);
    d.pub.drawFour = { by: seat, prevColor };
    d.hadColor = hadColor;
    return;
  }
  if (isWild(card)) return advance(d, 1);
  switch (rankOf(card)) {
    case RANK.skip:
      return advance(d, 2);
    case RANK.reverse:
      d.pub.dir = d.pub.dir === 1 ? -1 : 1;
      return advance(d, d.pub.config.seats === 2 ? 2 : 1);
    case RANK.drawTwo:
      if (d.pub.config.stackDrawTwo) {
        d.pub.pendingDraw += 2;
        return advance(d, 1);
      }
      drawInto(d, seatAt(d, 1), 2);
      return advance(d, 2);
    default:
      return advance(d, 1);
  }
}

export function applyVeil(state: GameState, seat: number, slot: number, claim: Card): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (d.pub.drawFour) throw new RuleError("DrawFourPending");
  if (d.pub.pendingDraw > 0) throw new RuleError("MustStackOrTake");
  requireTurn(d, seat);
  closeVeil(d, seat);
  const s = seatOf(d, seat);
  if (s.veilUsed || s.handSize < 2) throw new RuleError("VeilUsed");
  if (!Number.isInteger(slot) || slot < 0 || slot >= HAND_SLOTS || !s.slots[slot]) throw new RuleError("BadSlot");
  if (d.pub.drawnSlot !== null && slot !== d.pub.drawnSlot) throw new RuleError("MustPlayDrawnCard");
  if (!isValidCard(claim) || !isNumber(claim)) throw new RuleError("BadCard");
  if (!matches(claim, d.pub.topCard, d.pub.color)) throw new RuleError("IllegalCard");
  const actual = removeFromHand(d, seat, slot);
  s.veilUsed = true;
  d.pub.discard.push(claim);
  d.pub.topCard = claim;
  d.pub.color = colorOf(claim) as Color;
  d.pub.monoWindow = s.handSize === 1 && !s.saidMono ? seat : null;
  d.pub.drawnSlot = null;
  s.timeouts = 0;
  d.events.push({ type: "Veiled", seat, slot, claim });
  advance(d, 1);
  d.pub.veil = { by: seat, judge: d.pub.turn, claim };
  d.veilTrue = actual === claim;
  return finish(d);
}

export function applyDoubt(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (!d.pub.veil || d.pub.veil.judge !== seat) throw new RuleError("NoVeil");
  requireTurn(d, seat);
  if (d.pub.drawnSlot !== null) throw new RuleError("NoVeil");
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  d.pub.stage = "AwaitChallenge";
  d.events.push({ type: "VeilDoubted", seat });
  return finish(d);
}

export function applyDraw(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (d.pub.drawFour) throw new RuleError("DrawFourPending");
  if (d.pub.pendingDraw > 0) throw new RuleError("DrawPending");
  requireTurn(d, seat);
  closeVeil(d, seat);
  if (d.pub.drawnSlot !== null) throw new RuleError("AlreadyDrew");
  if (!canDraw(state.pub, seat)) throw new RuleError("CannotDraw");
  const [slot] = drawInto(d, seat, 1);
  d.pub.drawnSlot = slot ?? null;
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  return finish(d);
}

export function applyPass(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (d.pub.drawFour) throw new RuleError("DrawFourPending");
  if (d.pub.pendingDraw > 0) throw new RuleError("DrawPending");
  requireTurn(d, seat);
  closeVeil(d, seat);
  if (d.pub.drawnSlot === null && canDraw(state.pub, seat)) throw new RuleError("CannotPass");
  d.pub.drawnSlot = null;
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  d.events.push({ type: "Passed", seat });
  advance(d, 1);
  return finish(d);
}

export function canSayMono(pub: GameState["pub"], seat: number): boolean {
  const s = pub.seats[seat];
  if (pub.stage !== "Playing" || !s || s.saidMono) return false;
  if (pub.monoWindow === seat && s.handSize === 1) return true;
  return pub.turn === seat && s.handSize === 2 && pub.drawFour === null;
}

export function applyMono(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  requireSeat(d, seat);
  if (!canSayMono(state.pub, seat)) throw new RuleError("CannotSayMono");
  seatOf(d, seat).saidMono = true;
  if (d.pub.monoWindow === seat) d.pub.monoWindow = null;
  d.events.push({ type: "MonoSaid", seat });
  return finish(d);
}

export function catchableSeat(pub: GameState["pub"]): number | null {
  if (pub.stage !== "Playing" || pub.monoWindow === null) return null;
  const s = pub.seats[pub.monoWindow];
  return s && s.handSize === 1 && !s.saidMono ? pub.monoWindow : null;
}

export function applyCatch(state: GameState, target: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  requireSeat(d, target);
  if (catchableSeat(state.pub) !== target) throw new RuleError("CannotCatch");
  d.pub.monoWindow = null;
  d.events.push({ type: "MonoCaught", seat: target });
  drawInto(d, target, 2);
  return finish(d);
}

export function applyAcceptDrawFour(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (!d.pub.drawFour) throw new RuleError("NoDrawFour");
  requireTurn(d, seat);
  closeVeil(d, seat);
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  d.events.push({ type: "DrawFourAccepted", seat });
  drawInto(d, seat, 4);
  d.pub.drawFour = null;
  d.hadColor = null;
  advance(d, 1);
  return finish(d);
}

export function applyTakeDraws(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (d.pub.pendingDraw === 0) throw new RuleError("NoPendingDraw");
  requireTurn(d, seat);
  closeVeil(d, seat);
  const count = d.pub.pendingDraw;
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  d.events.push({ type: "DrawsTaken", seat, count });
  drawInto(d, seat, count);
  d.pub.pendingDraw = 0;
  advance(d, 1);
  return finish(d);
}

export function applyChallengeDrawFour(state: GameState, seat: number): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  if (!d.pub.drawFour) throw new RuleError("NoDrawFour");
  requireTurn(d, seat);
  d.pub.monoWindow = null;
  seatOf(d, seat).timeouts = 0;
  d.pub.stage = "AwaitChallenge";
  d.events.push({ type: "DrawFourChallenged", seat });
  return finish(d);
}

export function applyChallenge(state: GameState, bit?: boolean): Transition {
  const d = toDraft(state);
  requireStage(d, "AwaitChallenge");
  const veil = d.pub.veil;
  if (veil && !d.pub.drawFour) {
    const truth = bit ?? d.veilTrue;
    if (truth === null) throw new RuleError("BadReveal");
    d.events.push({ type: "VeilResolved", truth });
    drawInto(d, truth ? veil.judge : veil.by, truth ? VEIL_TRUE_DRAW : VEIL_LIE_DRAW);
    d.pub.veil = null;
    d.veilTrue = null;
    d.pub.stage = "Playing";
    return finish(d);
  }
  const pending = d.pub.drawFour;
  const value = bit ?? d.hadColor;
  if (!pending || value === null) throw new RuleError("BadReveal");
  d.events.push({ type: "ChallengeResolved", bit: value });
  if (value) {
    drawInto(d, pending.by, 4);
  } else {
    drawInto(d, d.pub.turn, 6);
    advance(d, 1);
  }
  d.pub.drawFour = null;
  d.hadColor = null;
  d.pub.stage = "Playing";
  return finish(d);
}

export function applyTimeout(state: GameState): Transition {
  const d = toDraft(state);
  requireStage(d, "Playing");
  const seat = d.pub.turn;
  const s = seatOf(d, seat);
  closeVeil(d, seat);
  d.events.push({ type: "TimedOut", seat });
  if (d.pub.drawFour) {
    drawInto(d, seat, 4);
    d.pub.drawFour = null;
    d.hadColor = null;
  } else if (d.pub.pendingDraw > 0) {
    drawInto(d, seat, d.pub.pendingDraw);
    d.pub.pendingDraw = 0;
  } else if (d.pub.drawnSlot === null && canDraw(state.pub, seat)) {
    drawInto(d, seat, 1);
  }
  d.pub.drawnSlot = null;
  d.pub.monoWindow = null;
  s.timeouts += 1;
  if (s.timeouts >= MAX_TIMEOUTS && !s.abandoned) {
    s.abandoned = true;
    d.events.push({ type: "SeatAbandoned", seat });
  }
  advance(d, 1);
  return finish(d);
}

export interface Reveal {
  readonly honest: readonly boolean[];
  readonly hands: readonly RevealedHand[];
  readonly secrets?: readonly number[];
}

export function applyReveal(state: GameState, reveal?: Reveal): Transition {
  const d = toDraft(state);
  requireStage(d, "Revealing");
  const candidate = d.pub.candidate;
  const seats = d.pub.config.seats;
  const data = reveal ?? { honest: state.honest, hands: state.hands, secrets: state.secrets };
  const secrets = data.secrets ?? state.secrets;
  if (candidate === null || data.honest.length !== seats || data.hands.length !== seats) {
    throw new RuleError("BadReveal");
  }
  const scored = scoreRound(data.hands, data.honest, candidate);
  let forfeited = 0;
  for (const cheater of scored.cheaters) {
    const s = seatOf(d, cheater);
    const taken = Math.min(s.score, CHEAT_PENALTY);
    s.score -= taken;
    forfeited += taken;
  }
  const bonus = scored.winner !== null && scored.winner === candidate && secrets[candidate] === colorOf(d.pub.topCard);
  const points = scored.winner === null ? 0 : scored.points * (bonus ? 2 : 1) + forfeited;
  const result = { winner: scored.winner, points, cheaters: [...scored.cheaters], bonus };
  if (result.winner !== null) seatOf(d, result.winner).score += result.points;
  d.pub.lastResult = { ...result, secrets: [...secrets] };
  d.pub.candidate = null;
  d.events.push({ type: "RoundSettled", ...result });
  const over =
    d.pub.config.mode === "single" ||
    (result.winner !== null && seatOf(d, result.winner).score >= d.pub.config.targetScore);
  d.pub.stage = over ? "MatchOver" : "RoundOver";
  if (over) d.events.push({ type: "MatchOver", winner: result.winner });
  return finish(d);
}
