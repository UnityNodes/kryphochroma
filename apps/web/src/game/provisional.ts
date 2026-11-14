import { type GameState, type RevealedHand, applyReveal } from "@kryphochroma/rules";

export interface RevealedBots {
  readonly round: number;
  readonly seats: readonly { readonly seat: number; readonly hand: readonly (number | null)[]; readonly secret: number }[];
}

/** Every hand is known once the chain reaches the reveal: the player's own from its key, the bots' from the table server. Scoring them with the same rules shows the result at once, and the KMS proof that follows only confirms it. Honesty is the one thing nobody can read before that proof: the browser projects rival plays over cards it cannot see, which would mark every rival a liar, so rivals count as honest here and a caught lie changes the result when the proof lands. */
export function provisionalResult(state: GameState, me: number, ownSecret: number | null, bots: RevealedBots | null): GameState | null {
  if (state.pub.stage !== "Revealing" || !bots || bots.round !== state.pub.round) return null;
  const hands: RevealedHand[] = [];
  const secrets: number[] = [];
  for (let seat = 0; seat < state.pub.config.seats; seat++) {
    const bot = bots.seats.find((s) => s.seat === seat);
    const hand = seat === me ? state.hands[seat] : bot?.hand;
    const secret = seat === me ? ownSecret : bot?.secret;
    if (!hand || secret === null || secret === undefined || hand.some((card) => card !== null && card < 0)) return null;
    hands.push(hand);
    secrets.push(secret);
  }
  try {
    const honest = hands.map((_, seat) => (seat === me ? (state.honest[seat] ?? true) : true));
    return applyReveal(state, { honest, hands, secrets }).state;
  } catch {
    return null;
  }
}
