import { type Card, type GameEvent, type GameState, colorOf } from "@kryphochroma/rules";
import { MS } from "@/game/flight";
import { compareHand, handOrder } from "@/game/handOrder";

export interface HandCard {
  readonly slot: number;
  readonly card: Card;
  readonly playable: boolean;
}

export interface RowModel {
  readonly seat: number;
  readonly count: number;
}

/** What the table surface shows, and nothing the viewer may not know: rivals are counts, a negative card is one still being decrypted. */
export interface TableModel {
  readonly rivals: readonly RowModel[];
  readonly own: RowModel | null;
  readonly hand: readonly HandCard[];
  readonly deck: number;
  readonly pile: readonly Card[];
  readonly veiled: boolean;
  readonly color: number | null;
  readonly round: number;
}

export type TableMove =
  | { readonly kind: "play"; readonly at: number; readonly dur: number; readonly seat: number; readonly slot: number; readonly card: Card; readonly faceDown: boolean; readonly color: number }
  | { readonly kind: "draw"; readonly at: number; readonly dur: number; readonly seat: number; readonly slot: number; readonly card: Card | null }
  | { readonly kind: "refill"; readonly at: number; readonly dur: 0; readonly count: number };

export interface MovePlan {
  readonly moves: readonly TableMove[];
  readonly total: number;
}

export function sealedCard(slot: number): Card {
  return -1 - slot;
}

export function modelOf(state: GameState, me: number, watching: boolean, playable: (slot: number) => boolean): TableModel {
  const pub = state.pub;
  const seats = pub.config.seats;
  const rivals: RowModel[] = [];
  for (let i = 1; i < seats; i++) {
    const seat = (me + i) % seats;
    rivals.push({ seat, count: pub.seats[seat]?.handSize ?? 0 });
  }
  return {
    rivals,
    own: watching ? { seat: me, count: pub.seats[me]?.handSize ?? 0 } : null,
    hand: watching ? [] : handOrder(state.hands[me] ?? []).map(({ card, slot }) => ({ slot, card, playable: card >= 0 && playable(slot) })),
    deck: pub.deckCount,
    pile: pub.discard,
    veiled: pub.veil !== null,
    color: pub.discard.length > 0 ? pub.color : null,
    round: pub.round,
  };
}

/** The same timeline the 2D table flies its cards on: a played card waits for the draws before it and takes the play time, draws leave the deck a beat apart and overlap. Keeping the two in step is what lets `busy` mean the same thing in both views. */
export function planMoves(events: readonly GameEvent[], after: GameState, me: number, watching: boolean): MovePlan {
  const moves: TableMove[] = [];
  let cursor = 0;
  let drawsEnd = 0;
  let drawIndex = 0;
  for (const event of events) {
    if (event.type === "Played" || event.type === "Veiled") {
      cursor = Math.max(cursor, drawsEnd);
      const veiled = event.type === "Veiled";
      const card = veiled ? event.claim : event.card;
      moves.push({ kind: "play", at: cursor, dur: MS.play, seat: event.seat, slot: event.slot, card, faceDown: veiled, color: veiled ? colorOf(card) : event.color });
      cursor += MS.play;
    } else if (event.type === "Drew") {
      const value = !watching && event.seat === me ? (after.hands[me]?.[event.slot] ?? null) : null;
      const at = cursor + MS.stagger * drawIndex++;
      moves.push({ kind: "draw", at, dur: MS.draw, seat: event.seat, slot: event.slot, card: value !== null && value >= 0 ? value : null });
      drawsEnd = Math.max(drawsEnd, at + MS.draw);
    } else if (event.type === "Reshuffled") {
      moves.push({ kind: "refill", at: cursor, dur: 0, count: event.count });
    }
  }
  return { moves, total: Math.max(cursor, drawsEnd) };
}

function withRow(model: TableModel, seat: number, delta: number): TableModel {
  const bump = (row: RowModel): RowModel => (row.seat === seat ? { seat, count: Math.max(0, row.count + delta) } : row);
  return { ...model, rivals: model.rivals.map(bump), own: model.own ? bump(model.own) : null };
}

function isMine(model: TableModel, seat: number, me: number): boolean {
  return model.own === null && seat === me;
}

/** What changes the moment a card leaves: the hand or row it came from closes up and the place it is going to opens. */
export function beginMove(model: TableModel, move: TableMove, me: number): TableModel {
  if (move.kind === "refill") return { ...model, deck: model.deck + move.count };
  const mine = isMine(model, move.seat, me);
  if (move.kind === "play") {
    const base = mine ? { ...model, hand: model.hand.filter((c) => c.slot !== move.slot) } : withRow(model, move.seat, -1);
    return { ...base, pile: [...model.pile, move.card], veiled: move.faceDown };
  }
  const deck = Math.max(0, model.deck - 1);
  if (!mine) return { ...withRow(model, move.seat, 1), deck };
  const hand = [...model.hand.filter((c) => c.slot !== move.slot), { slot: move.slot, card: sealedCard(move.slot), playable: false }];
  return { ...model, hand, deck };
}

/** What changes when the card lands: the colour in play follows a played card, and a drawn card whose value is known turns over into its place in the hand. */
export function endMove(model: TableModel, move: TableMove, me: number): TableModel {
  if (move.kind === "play") return { ...model, color: move.color };
  if (move.kind !== "draw" || move.card === null || !isMine(model, move.seat, me)) return model;
  const card = move.card;
  const hand = model.hand.map((c) => (c.slot === move.slot ? { ...c, card } : c));
  return { ...model, hand: [...hand].sort(compareHand) };
}
