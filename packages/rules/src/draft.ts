import { type Card, colorOf, fullDeck } from "./cards.js";
import { randomInt } from "./rng.js";
import {
  type GameEvent,
  type GameState,
  type PublicState,
  RuleError,
  type Stage,
  type Transition,
} from "./types.js";

export const HAND_SLOTS = 24;
export const HAND_START = 7;
export const NEXT_CARDS = 2;
export const MAX_TIMEOUTS = 3;
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

type DeepMutable<T> = T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;

export type Draft = DeepMutable<GameState> & { events: GameEvent[] };
export type DraftPublic = DeepMutable<PublicState>;

export function toDraft(state: GameState): Draft {
  return { ...(structuredClone(state) as DeepMutable<GameState>), events: [] };
}

export function finish(draft: Draft): Transition {
  const { events, ...rest } = draft;
  rest.pub.deckCount = rest.deck.length;
  return { state: rest, events };
}

export function requireStage(d: Draft, stage: Stage): void {
  if (d.pub.stage !== stage) throw new RuleError("WrongStage", `expected ${stage}, got ${d.pub.stage}`);
}

export function requireSeat(d: Draft, seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= d.pub.config.seats) {
    throw new RuleError("BadSlot", `seat ${seat} out of range`);
  }
}

export function requireTurn(d: Draft, seat: number): void {
  requireSeat(d, seat);
  if (d.pub.turn !== seat) throw new RuleError("NotYourTurn");
}

export function seatAt(d: Draft, offset: number): number {
  const seats = d.pub.config.seats;
  return (((d.pub.turn + d.pub.dir * offset) % seats) + seats) % seats;
}

export function advance(d: Draft, offset: number): void {
  d.pub.turn = seatAt(d, offset);
}

export function freeSlot(slots: readonly boolean[]): number {
  return slots.indexOf(false);
}

export function canDraw(pub: PublicState, seat: number): boolean {
  const s = pub.seats[seat];
  if (!s || freeSlot(s.slots) < 0) return false;
  return pub.deckCount > 0 || pub.recycles !== false;
}

export const REFILL_CARDS = 60;

export function freshCards(seed: number, count: number): { readonly items: Card[]; readonly next: number } {
  const layout = fullDeck();
  const items: Card[] = [];
  let rng = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const step = randomInt(rng, layout.length);
    rng = step.next;
    items.push(layout[step.value] as Card);
  }
  return { items, next: rng };
}

/** An empty deck is topped up with fresh draws, never with the discard pile, so a played card does not come back. */
function recycle(d: Draft): void {
  if (d.pub.recycles === false) return;
  const fresh = freshCards(d.rng, REFILL_CARDS);
  d.rng = fresh.next;
  d.deck = [...d.deck, ...fresh.items];
  d.events.push({ type: "Reshuffled", count: fresh.items.length });
}

function deckCard(d: Draft): Card | undefined {
  if (d.deck.length === 0) recycle(d);
  return d.deck.shift();
}

/** A seat draws the head of its own queue, which only it can read, and the deck tops the queue back up, so the contract can open a drawn card to its owner before the draw is even mined. */
function nextCard(d: Draft, seat: number): Card | undefined {
  const queue = d.queues?.[seat];
  if (!queue) return deckCard(d);
  const card = queue.length > 0 ? queue.shift() : deckCard(d);
  if (card === undefined) return undefined;
  const fresh = deckCard(d);
  if (fresh !== undefined) queue.push(fresh);
  return card;
}

export function drawInto(d: Draft, seat: number, count: number): number[] {
  const drawn: number[] = [];
  const s = d.pub.seats[seat];
  const hand = d.hands[seat];
  if (!s || !hand) return drawn;
  for (let i = 0; i < count; i++) {
    const slot = freeSlot(s.slots);
    if (slot < 0) break;
    const card = nextCard(d, seat);
    if (card === undefined) break;
    hand[slot] = card;
    s.slots[slot] = true;
    s.handSize += 1;
    drawn.push(slot);
    d.events.push({ type: "Drew", seat, slot });
  }
  if (drawn.length > 0) s.saidMono = false;
  d.pub.deckCount = d.deck.length;
  return drawn;
}

export function removeFromHand(d: Draft, seat: number, slot: number): Card | null {
  const s = d.pub.seats[seat];
  const hand = d.hands[seat];
  if (!s || !hand) return null;
  const card = hand[slot] ?? null;
  hand[slot] = null;
  s.slots[slot] = false;
  s.handSize -= 1;
  return card;
}

export function hasColorExcept(hand: readonly (Card | null)[], color: number, exceptSlot: number): boolean {
  return hand.some((card, i) => i !== exceptSlot && card !== null && colorOf(card) === color);
}
