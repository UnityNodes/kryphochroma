import { type Card, PLAYABLE_COLORS, isWild, matches } from "./cards.js";
import { canDraw } from "./draft.js";
import {
  applyAcceptDrawFour,
  applyChallengeDrawFour,
  applyDraw,
  applyMono,
  applyPass,
  applyPlay,
  canSayMono,
} from "./engine.js";
import type { GameState, Hand, Move, PublicState, Transition } from "./types.js";

export function legalMoves(pub: PublicState, seat: number, hand: Hand): Move[] {
  if (pub.stage !== "Playing") return [];
  const moves: Move[] = [];
  if (canSayMono(pub, seat)) moves.push({ type: "mono" });
  if (pub.turn !== seat) return moves;
  if (pub.drawFour) return [...moves, { type: "accept" }, { type: "challenge" }];
  hand.forEach((card, slot) => {
    if (card === null) return;
    if (pub.drawnSlot !== null && slot !== pub.drawnSlot) return;
    if (!matches(card, pub.topCard, pub.color)) return;
    if (isWild(card)) {
      for (const color of PLAYABLE_COLORS) moves.push({ type: "play", slot, card, color });
    } else {
      moves.push({ type: "play", slot, card });
    }
  });
  const drawable = canDraw(pub, seat);
  if (pub.drawnSlot === null && drawable) moves.push({ type: "draw" });
  if (pub.drawnSlot !== null || !drawable) moves.push({ type: "pass" });
  return moves;
}

export function isPlayable(pub: PublicState, card: Card): boolean {
  return matches(card, pub.topCard, pub.color);
}

export function applyMove(state: GameState, seat: number, move: Move): Transition {
  switch (move.type) {
    case "play":
      return applyPlay(state, seat, move.slot, move.card, move.color);
    case "draw":
      return applyDraw(state, seat);
    case "pass":
      return applyPass(state, seat);
    case "mono":
      return applyMono(state, seat);
    case "accept":
      return applyAcceptDrawFour(state, seat);
    case "challenge":
      return applyChallengeDrawFour(state, seat);
  }
}
