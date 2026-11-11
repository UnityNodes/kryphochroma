import { kryphoTableAbi } from "@kryphochroma/abi";
import type { Color, GameEvent } from "@kryphochroma/rules";
import { type Log, parseEventLogs } from "viem";

const num = (value: unknown): number => Number(value);

function maskToSeats(mask: number): number[] {
  const seats: number[] = [];
  for (let seat = 0; seat < 8; seat++) if ((mask & (1 << seat)) !== 0) seats.push(seat);
  return seats;
}

export function toGameEvents(logs: readonly Log[], id: bigint): GameEvent[] {
  const parsed = parseEventLogs({ abi: kryphoTableAbi, logs: [...logs] });
  const events: GameEvent[] = [];
  for (const log of parsed) {
    const args = log.args as Record<string, unknown>;
    if (args.id !== undefined && BigInt(args.id as bigint) !== id) continue;
    switch (log.eventName) {
      case "Played":
        events.push({ type: "Played", seat: num(args.seat), slot: num(args.slot), card: num(args.card), color: num(args.color) as Color });
        break;
      case "Drew":
        events.push({ type: "Drew", seat: num(args.seat), slot: num(args.slot) });
        break;
      case "Passed":
        events.push({ type: "Passed", seat: num(args.seat) });
        break;
      case "MonoSaid":
        events.push({ type: "MonoSaid", seat: num(args.seat) });
        break;
      case "MonoCaught":
        events.push({ type: "MonoCaught", seat: num(args.seat) });
        break;
      case "DrawFourAccepted":
        events.push({ type: "DrawFourAccepted", seat: num(args.seat) });
        break;
      case "DrawsTaken":
        events.push({ type: "DrawsTaken", seat: num(args.seat), count: num(args.count) });
        break;
      case "DrawFourChallenged":
        events.push({ type: "DrawFourChallenged", seat: num(args.seat) });
        break;
      case "ChallengeResolved":
        events.push({ type: "ChallengeResolved", bit: Boolean(args.hadColor) });
        break;
      case "TimedOut":
        events.push({ type: "TimedOut", seat: num(args.seat) });
        break;
      case "Veiled":
        events.push({ type: "Veiled", seat: num(args.seat), slot: num(args.slot), claim: num(args.claim) });
        break;
      case "VeilDoubted":
        events.push({ type: "VeilDoubted", seat: num(args.seat) });
        break;
      case "VeilResolved":
        events.push({ type: "VeilResolved", truth: Boolean(args.truth) });
        break;
      case "Peeked":
        events.push({ type: "Peeked", seat: num(args.seat), target: num(args.target), slot: num(args.slot) });
        break;
      case "Sonared":
        events.push({ type: "Sonared", seat: num(args.seat), target: num(args.target), color: num(args.color) as Color, count: null });
        break;
      case "SeatAbandoned":
        events.push({ type: "SeatAbandoned", seat: num(args.seat) });
        break;
      case "Reshuffled":
        events.push({ type: "Reshuffled", count: num(args.count) });
        break;
      case "RevealStarted":
        events.push({ type: "RevealStarted", candidate: num(args.candidate) });
        break;
      case "RoundSettled": {
        const winner = num(args.winner);
        events.push({ type: "RoundSettled", winner: winner < 0 ? null : winner, points: num(args.points), cheaters: maskToSeats(num(args.cheaters)), bonus: Boolean(args.bonus) });
        break;
      }
      default:
        break;
    }
  }
  return events;
}
