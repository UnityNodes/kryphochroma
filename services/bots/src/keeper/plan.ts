import { DECK_SIZE, FILL_CHUNK, NO_SEAT, REFILL_AT, SETUP_STEPS, SHUFFLE_STEPS, STAGE } from "@kryphochroma/abi";

export interface TableView {
  readonly stage: number;
  readonly joined: number;
  readonly setupStep: number;
  readonly dealtMask: number;
  readonly turnDeadline: bigint;
  readonly candidate: number;
  readonly revealPrepared: number;
  readonly creator?: string;
  readonly deckPtr?: number;
  readonly deckEnd?: number;
  readonly refillSize?: number;
  readonly refillStep?: number;
  readonly spare?: number;
}

export type KeeperAction =
  | { readonly kind: "setupStep"; readonly remaining: number }
  | { readonly kind: "dealSeat"; readonly seat: number; readonly seats: readonly number[] }
  | { readonly kind: "revealStarter" }
  | { readonly kind: "resolveChallenge" }
  | { readonly kind: "prepareReveal" }
  | { readonly kind: "finishReveal" }
  | { readonly kind: "forceTimeout" }
  | { readonly kind: "reshuffleStep"; readonly remaining: number }
  | { readonly kind: "idle" };

function refillAction(table: TableView): KeeperAction {
  const deckPtr = Number(table.deckPtr ?? 0);
  const deckEnd = Number(table.deckEnd ?? DECK_SIZE);
  const size = Number(table.refillSize ?? 0);
  if (size > 0) {
    const remaining = Math.ceil(size / FILL_CHUNK) + SHUFFLE_STEPS - Number(table.refillStep ?? 0);
    return remaining > 0 ? { kind: "reshuffleStep", remaining } : { kind: "idle" };
  }
  const room = Math.max(deckPtr, DECK_SIZE - deckEnd);
  const startable = Number(table.spare ?? 0) > 0 && room > 0 && deckEnd - deckPtr <= REFILL_AT;
  if (!startable) return { kind: "idle" };
  const fresh = 2 ** Math.floor(Math.log2(Math.min(Number(table.spare), room)));
  return { kind: "reshuffleStep", remaining: Math.ceil(fresh / FILL_CHUNK) + SHUFFLE_STEPS };
}

const stageName = (stage: number): string => STAGE[stage] ?? "Unknown";

export function nextKeeperAction(table: TableView, nowSeconds: bigint, poolOwner?: string): KeeperAction {
  switch (stageName(table.stage)) {
    case "Lobby":
      if (poolOwner && table.creator?.toLowerCase() === poolOwner.toLowerCase() && table.setupStep < SETUP_STEPS) {
        return { kind: "setupStep", remaining: SETUP_STEPS - table.setupStep };
      }
      return { kind: "idle" };
    case "Shuffling":
      return { kind: "setupStep", remaining: SETUP_STEPS - table.setupStep };
    case "Dealing": {
      const undealt = Array.from({ length: table.joined }, (_, seat) => seat).filter((seat) => (table.dealtMask & (1 << seat)) === 0);
      if (undealt.length > 0) return { kind: "dealSeat", seat: undealt[0] ?? 0, seats: undealt };
      return { kind: "revealStarter" };
    }
    case "AwaitChallenge":
      return { kind: "resolveChallenge" };
    case "Revealing":
      if (table.candidate === NO_SEAT) return { kind: "idle" };
      return table.revealPrepared < table.joined ? { kind: "prepareReveal" } : { kind: "finishReveal" };
    case "Playing":
      return nowSeconds > table.turnDeadline ? { kind: "forceTimeout" } : refillAction(table);
    default:
      return { kind: "idle" };
  }
}
