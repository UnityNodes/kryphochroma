import { type Card, PLAYABLE_COLORS, RANK, cardOf, isSpyglass, isWild, matches, rankOf } from "./cards.js";
import { canDraw } from "./draft.js";
import {
  applyAcceptDrawFour,
  applyChallengeDrawFour,
  applyDoubt,
  applyDraw,
  applyMono,
  applyPass,
  applyPlay,
  applyTakeDraws,
  applyVeil,
  canSayMono,
} from "./engine.js";
import type { GameState, Hand, Move, PublicState, Transition } from "./types.js";

export function legalMoves(pub: PublicState, seat: number, hand: Hand): Move[] {
  if (pub.stage !== "Playing") return [];
  const moves: Move[] = [];
  if (canSayMono(pub, seat)) moves.push({ type: "mono" });
  if (pub.turn !== seat) return moves;
  if (pub.drawFour) return [...moves, { type: "accept" }, { type: "challenge" }];
  if (pub.veil && pub.veil.judge === seat && pub.drawnSlot === null) moves.push({ type: "doubt" });
  if (pub.pendingDraw > 0) {
    hand.forEach((card, slot) => {
      if (card !== null && !isWild(card) && rankOf(card) === RANK.drawTwo) moves.push({ type: "play", slot, card });
    });
    return [...moves, { type: "take" }];
  }
  hand.forEach((card, slot) => {
    if (card === null) return;
    if (pub.drawnSlot !== null && slot !== pub.drawnSlot) return;
    if (!matches(card, pub.topCard, pub.color)) return;
    if (isWild(card)) {
      for (const color of PLAYABLE_COLORS) moves.push({ type: "play", slot, card, color });
    } else if (isSpyglass(card)) {
      for (const peek of peekTargets(pub, seat)) moves.push({ type: "play", slot, card, peek });
    } else {
      moves.push({ type: "play", slot, card });
    }
  });
  const me = pub.seats[seat];
  if (me && !me.veilUsed && me.handSize >= 2) {
    const claims = veilClaims(pub);
    hand.forEach((card, slot) => {
      if (card === null || (pub.drawnSlot !== null && slot !== pub.drawnSlot)) return;
      for (const claim of claims) moves.push({ type: "veil", slot, claim });
    });
  }
  const drawable = canDraw(pub, seat);
  if (pub.drawnSlot === null && drawable) moves.push({ type: "draw" });
  if (pub.drawnSlot !== null || !drawable) moves.push({ type: "pass" });
  return moves;
}

export function peekTargets(pub: PublicState, seat: number): { seat: number; slot: number }[] {
  return pub.seats.flatMap((s, target) => (target === seat ? [] : s.slots.flatMap((used, slot) => (used ? [{ seat: target, slot }] : []))));
}

export function veilClaims(pub: PublicState): Card[] {
  const claims: Card[] = [];
  for (const color of PLAYABLE_COLORS) {
    for (let rank = 0; rank <= 9; rank++) {
      const claim = cardOf(color, rank);
      if (matches(claim, pub.topCard, pub.color)) claims.push(claim);
    }
  }
  return claims;
}

export function isPlayable(pub: PublicState, card: Card): boolean {
  return matches(card, pub.topCard, pub.color);
}

export function applyMove(state: GameState, seat: number, move: Move): Transition {
  switch (move.type) {
    case "play":
      return applyPlay(state, seat, move.slot, move.card, move.color, move.peek);
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
    case "take":
      return applyTakeDraws(state, seat);
    case "veil":
      return applyVeil(state, seat, move.slot, move.claim);
    case "doubt":
      return applyDoubt(state, seat);
  }
}
