import {
  type Card,
  type Color,
  PLAYABLE_COLORS,
  cardOf,
  colorOf,
  isAction,
  isDrawFour,
  isWild,
  rankOf,
} from "./cards.js";
import { catchableSeat } from "./engine.js";
import { legalMoves } from "./moves.js";
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

export function chooseMove(pub: PublicState, seat: number, hand: Hand, options: BotOptions = {}): Move | null {
  const moves = legalMoves(pub, seat, hand);
  if (moves.some((m) => m.type === "mono")) return { type: "mono" };
  if (pub.turn !== seat || pub.stage !== "Playing") return null;
  if (pub.drawFour) {
    const held = hand.filter((card) => card !== null && !isWild(card) && colorOf(card) === pub.drawFour?.prevColor);
    return held.length >= CHALLENGE_THRESHOLD ? { type: "challenge" } : { type: "accept" };
  }
  const plays = moves.filter((m): m is PlayMove => m.type === "play");
  const play = pickPlay(pub, seat, hand, plays);
  if (play) return play;
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

