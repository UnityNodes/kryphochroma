import {
  type Card,
  type Color,
  PLAYABLE_COLORS,
  cardOf,
  colorOf,
  isAction,
  isDrawFour,
  isWild,
  points,
  rankOf,
} from "./cards.js";
import { catchableSeat } from "./engine.js";
import { lastCardWaits, legalMoves, veilClaims } from "./moves.js";
import type { Hand, Move, PublicState } from "./types.js";

export interface BotOptions {
  readonly cheat?: boolean;
}

const CHALLENGE_THRESHOLD = 3;
const PRESSURE_HAND_SIZE = 2;

type PlayMove = Extract<Move, { type: "play" }>;

export function favouriteColor(hand: Hand, exceptSlot: number): Color {
  const counts = PLAYABLE_COLORS.map((color) =>
    hand.filter((card, i) => i !== exceptSlot && card !== null && !isWild(card) && colorOf(card) === color).length,
  );
  const best = Math.max(...counts);
  return PLAYABLE_COLORS[counts.indexOf(best)] as Color;
}

function nextSeat(pub: PublicState): number {
  const seats = pub.config.seats;
  return (((pub.turn + pub.dir) % seats) + seats) % seats;
}

function playScore(pub: PublicState, card: Card, pressure: boolean): number {
  if (pressure && (isAction(card) || isDrawFour(card))) return 1000 + (isDrawFour(card) ? 0 : 50);
  if (isDrawFour(card)) return 0;
  if (isWild(card)) return 100;
  const sameColor = colorOf(card) === pub.color;
  if (!isAction(card)) return (sameColor ? 600 : 400) + rankOf(card);
  return sameColor ? 300 : 200;
}

function pickPlay(pub: PublicState, seat: number, hand: Hand, plays: PlayMove[]): PlayMove | null {
  const pressure = (pub.seats[nextSeat(pub)]?.handSize ?? 99) <= PRESSURE_HAND_SIZE && nextSeat(pub) !== seat;
  const unique = plays.filter((m, i) => plays.findIndex((o) => o.slot === m.slot) === i);
  let best: PlayMove | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of unique) {
    const score = playScore(pub, move.card, pressure);
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  if (!best) return null;
  if (!isWild(best.card)) return best;
  return { type: "play", slot: best.slot, card: best.card, color: favouriteColor(hand, best.slot) };
}

function cheatMove(pub: PublicState, hand: Hand): PlayMove | null {
  const slot = hand.findIndex((card) => card !== null);
  if (slot < 0 || pub.drawnSlot !== null) return null;
  return { type: "play", slot, card: cardOf(pub.color, rankOf(pub.topCard) <= 9 ? rankOf(pub.topCard) : 0) };
}

function copiesOf(card: Card): number {
  return rankOf(card) === 0 ? 1 : 2;
}

function copiesLeft(claim: Card, faceUp: readonly Card[], hand: Hand): number {
  return copiesOf(claim) - faceUp.filter((c) => c === claim).length - hand.filter((c) => c === claim).length;
}

export function veilIsImpossible(pub: PublicState, hand: Hand): boolean {
  const claim = pub.veil?.claim;
  if (claim === undefined) return false;
  return copiesLeft(claim, pub.discard.slice(0, -1), hand) <= 0;
}

/** Every bot doubts a claim it can prove false, and a doubt freezes the table for two blocks and a KMS round trip, so a bot only claims a card that still has a copy nobody has seen, and prefers one that exists twice. */
function safeClaim(pub: PublicState, hand: Hand, favourite: Color): Card | undefined {
  const open = veilClaims(pub).filter((claim) => copiesLeft(claim, pub.discard, hand) > 0);
  const rank = (claim: Card): number => copiesLeft(claim, pub.discard, hand) * 2 + (colorOf(claim) === favourite ? 1 : 0);
  return open.reduce<Card | undefined>((best, claim) => (best === undefined || rank(claim) > rank(best) ? claim : best), undefined);
}

function veilMove(pub: PublicState, seat: number, hand: Hand): Move | null {
  const me = pub.seats[seat];
  if (!me || me.veilUsed || me.handSize < 2 || pub.pendingDraw > 0 || pub.drawnSlot !== null || pub.doubt) return null;
  let slot = -1;
  let worst = -1;
  hand.forEach((card, i) => {
    if (card !== null && points(card) > worst) {
      worst = points(card);
      slot = i;
    }
  });
  if (slot < 0 || worst < 20) return null;
  const claim = safeClaim(pub, hand, favouriteColor(hand, slot));
  return claim === undefined ? null : { type: "veil", slot, claim };
}

const SONAR_WHEN_RIVAL_HOLDS = 3;

function sonarMove(pub: PublicState, seat: number, moves: readonly Move[]): Move | null {
  if (!moves.some((m) => m.type === "sonar")) return null;
  const rivals = pub.seats.map((s, i) => ({ i, size: s.handSize })).filter((r) => r.i !== seat && r.size > 0 && r.size <= SONAR_WHEN_RIVAL_HOLDS);
  const target = rivals.sort((a, b) => a.size - b.size)[0];
  return target ? { type: "sonar", target: target.i, color: pub.color } : null;
}

export function chooseMove(pub: PublicState, seat: number, hand: Hand, options: BotOptions = {}): Move | null {
  const moves = legalMoves(pub, seat, hand);
  if (moves.some((m) => m.type === "mono")) return { type: "mono" };
  if (pub.turn !== seat || pub.stage !== "Playing") return null;
  if (lastCardWaits(pub, seat, hand)) return null;
  if (moves.some((m) => m.type === "doubt") && veilIsImpossible(pub, hand)) return { type: "doubt" };
  if (pub.drawFour) {
    const held = hand.filter((card) => card !== null && !isWild(card) && colorOf(card) === pub.drawFour?.prevColor);
    return held.length >= CHALLENGE_THRESHOLD ? { type: "challenge" } : { type: "accept" };
  }
  const plays = moves.filter((m): m is PlayMove => m.type === "play");
  const play = pickPlay(pub, seat, hand, plays);
  if (play) return play;
  const veil = veilMove(pub, seat, hand);
  if (veil) return veil;
  const sonar = sonarMove(pub, seat, moves);
  if (sonar) return sonar;
  if (options.cheat && pub.pendingDraw === 0) {
    const lie = cheatMove(pub, hand);
    if (lie) return lie;
  }
  return moves.find((m) => m.type === "take") ?? moves.find((m) => m.type === "draw") ?? moves.find((m) => m.type === "pass") ?? null;
}

export function botCatchTarget(pub: PublicState, seat: number): number | null {
  const target = catchableSeat(pub);
  return target !== null && target !== seat ? target : null;
}

