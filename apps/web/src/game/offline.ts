import {
  type GameEvent,
  type GameState,
  type Move,
  type Transition,
  applyCatch,
  applyChallenge,
  applyMove,
  applyReveal,
  botCatchTarget,
  cardLabel,
  chooseMove,
  initialState,
} from "@kryphochroma/rules";

export const HUMAN = 0;
export const SEAT_NAMES = ["You", "Mira", "Delta", "Orin"] as const;
export const SEAT_COLORS = ["var(--y)", "var(--g)", "var(--b)", "var(--r)"] as const;

export interface OfflineOptions {
  readonly seats: number;
  readonly stackDrawTwo: boolean;
  readonly seed: number;
}

export function newOfflineGame(options: OfflineOptions): Transition {
  return initialState({ seats: options.seats, mode: "single", targetScore: 500, stackDrawTwo: options.stackDrawTwo }, options.seed);
}

export type AutoStep = { readonly kind: "auto"; readonly transition: Transition; readonly delayMs: number } | { readonly kind: "human" } | { readonly kind: "over" };

export function nextAutoStep(state: GameState, think: () => number): AutoStep {
  const pub = state.pub;
  if (pub.stage === "MatchOver" || pub.stage === "RoundOver") return { kind: "over" };
  if (pub.stage === "AwaitChallenge") return { kind: "auto", transition: applyChallenge(state), delayMs: 700 };
  if (pub.stage === "Revealing") return { kind: "auto", transition: applyReveal(state), delayMs: 900 };
  for (let seat = 0; seat < pub.config.seats; seat++) {
    if (seat === HUMAN) continue;
    const target = botCatchTarget(pub, seat);
    if (target === HUMAN) return { kind: "auto", transition: applyCatch(state, target), delayMs: 1600 };
  }
  for (let seat = 0; seat < pub.config.seats; seat++) {
    if (seat === HUMAN || pub.turn === seat) continue;
    const move = chooseMove(pub, seat, state.hands[seat] ?? []);
    if (move?.type === "mono") return { kind: "auto", transition: applyMove(state, seat, move), delayMs: 400 };
  }
  if (pub.turn === HUMAN) return { kind: "human" };
  const move = chooseMove(pub, pub.turn, state.hands[pub.turn] ?? []);
  if (!move) return { kind: "human" };
  return { kind: "auto", transition: applyMove(state, pub.turn, move), delayMs: think() };
}

export function humanMove(state: GameState, move: Move): Transition {
  return applyMove(state, HUMAN, move);
}


export interface FeedLine {
  readonly icon: "play" | "draw" | "pass" | "mono" | "challenge" | "lock" | "trophy" | "shuffle";
  readonly text: string;
  readonly sub: string;
}

export function describe(event: GameEvent, names: readonly string[] = SEAT_NAMES, me = HUMAN): FeedLine | null {
  const name = (seat: number): string => (seat === me ? "You" : (names[seat] ?? `Seat ${seat}`));
  switch (event.type) {
    case "Played":
      return { icon: "play", text: `${name(event.seat)} played ${cardLabel(event.card)}`, sub: "honesty bit updated · FHE.eq" };
    case "Drew":
      return { icon: "draw", text: `${name(event.seat)} drew a card`, sub: event.seat === me ? "decrypted for you only" : "sealed · FHE.allow" };
    case "Passed":
      return { icon: "pass", text: `${name(event.seat)} passed`, sub: "turn moves on" };
    case "MonoSaid":
      return { icon: "mono", text: `${name(event.seat)} called Mono!`, sub: "one card left" };
    case "MonoCaught":
      return { icon: "mono", text: `${name(event.seat)} was caught`, sub: "draws 2" };
    case "DrawFourChallenged":
      return { icon: "challenge", text: `${name(event.seat)} challenged the +4`, sub: "revealing exactly 1 bit" };
    case "ChallengeResolved":
      return { icon: "lock", text: event.bit ? "Bluff caught: had the colour" : "No bluff: did not have the colour", sub: "FHE.checkSignatures" };
    case "DrawFourAccepted":
    case "DrawsTaken":
      return { icon: "draw", text: `${name(event.seat)} took the penalty`, sub: "sealed cards" };
    case "Reshuffled":
      return { icon: "shuffle", text: "Discard reshuffled into the deck", sub: "new encrypted order" };
    case "RoundSettled":
      return {
        icon: "trophy",
        text: event.winner === null ? "No honest winner" : `${name(event.winner)} won ${event.points} points`,
        sub: event.cheaters.length > 0 ? `caught lying: ${event.cheaters.map(name).join(", ")}` : "every honesty bit checked",
      };
    default:
      return null;
  }
}
