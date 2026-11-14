import type { GameEvent, GameState } from "@kryphochroma/rules";

export interface RevealedSeat {
  readonly seat: number;
  readonly hand: readonly (number | null)[];
  readonly secret: number;
}

/** The hub knows a bot's cards, so the rules engine fills in what a sonar counted; on chain that number is encrypted for the seat that asked, so it is cut from what every subscriber receives. */
export function sealed(event: GameEvent): GameEvent {
  return event.type === "Sonared" ? { ...event, count: null } : event;
}

/** Bot hands are handed out only for a state read from the chain that has reached the reveal, and only once every bot card and secret colour is known; a hand with a card still sealed would let the browser score a wrong result. */
export function botReveal(chain: GameState, isBot: (seat: number) => boolean, secrets: ReadonlyMap<number, number>): RevealedSeat[] | null {
  if (chain.pub.stage !== "Revealing") return null;
  const seats: RevealedSeat[] = [];
  for (let seat = 0; seat < chain.pub.config.seats; seat++) {
    if (!isBot(seat)) continue;
    const hand = chain.hands[seat] ?? [];
    const secret = secrets.get(seat);
    if (secret === undefined || hand.some((card) => card !== null && card < 0)) return null;
    seats.push({ seat, hand, secret });
  }
  return seats;
}
