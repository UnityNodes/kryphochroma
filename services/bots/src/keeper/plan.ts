import { NO_SEAT, SETUP_STEPS, STAGE } from "@kryphochroma/abi";

export interface TableView {
  readonly stage: number;
  readonly joined: number;
  readonly setupStep: number;
  readonly dealtMask: number;
  readonly turnDeadline: bigint;
  readonly candidate: number;
  readonly revealPrepared: number;
}

export type KeeperAction =
  | { readonly kind: "setupStep"; readonly remaining: number }
  | { readonly kind: "dealSeat"; readonly seat: number }
  | { readonly kind: "revealStarter" }
  | { readonly kind: "resolveChallenge" }
  | { readonly kind: "prepareReveal" }
  | { readonly kind: "finishReveal" }
  | { readonly kind: "forceTimeout" }
  | { readonly kind: "idle" };

const stageName = (stage: number): string => STAGE[stage] ?? "Unknown";

export function nextKeeperAction(table: TableView, nowSeconds: bigint): KeeperAction {
  switch (stageName(table.stage)) {
    case "Shuffling":
      return { kind: "setupStep", remaining: SETUP_STEPS - table.setupStep };
    case "Dealing": {
      for (let seat = 0; seat < table.joined; seat++) {
        if ((table.dealtMask & (1 << seat)) === 0) return { kind: "dealSeat", seat };
      }
      return { kind: "revealStarter" };
    }
    case "AwaitChallenge":
      return { kind: "resolveChallenge" };
    case "Revealing":
      if (table.candidate === NO_SEAT) return { kind: "idle" };
      return table.revealPrepared < table.joined ? { kind: "prepareReveal" } : { kind: "finishReveal" };
    case "Playing":
      return nowSeconds > table.turnDeadline ? { kind: "forceTimeout" } : { kind: "idle" };
    default:
      return { kind: "idle" };
  }
}
