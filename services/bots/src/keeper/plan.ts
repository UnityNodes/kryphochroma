import { DECK_SIZE, FILL_CHUNK, MIN_REFILL, NO_CARD, NO_SEAT, REFILL_AT, SETUP_STEPS, SHUFFLE_STEPS, STAGE } from "@kryphochroma/abi";

export interface TableView {
  readonly stage: number;
  readonly joined: number;
  readonly setupStep: number;
  readonly dealtMask: number;
  readonly turnDeadline: bigint;
  readonly candidate: number;
  readonly revealPrepared: number;
  readonly creator?: string;
  readonly topCard?: number;
  readonly deckPtr?: number;
  readonly deckEnd?: number;
  readonly refillSize?: number;
  readonly refillStep?: number;
  readonly spare?: number;
}

export type KeeperAction =
  | { readonly kind: "setupStep"; readonly remaining: number }
  | { readonly kind: "deal"; readonly reveal: boolean }
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
  if (fresh < MIN_REFILL && deckEnd > deckPtr) return { kind: "idle" };
  return { kind: "reshuffleStep", remaining: Math.ceil(fresh / FILL_CHUNK) + SHUFFLE_STEPS };
}

const stageName = (stage: number): string => STAGE[stage] ?? "Unknown";
const needsStarter = (table: TableView): boolean => Number(table.topCard ?? NO_CARD) === NO_CARD;

export function nextKeeperAction(table: TableView, nowSeconds: bigint, poolOwner?: string): KeeperAction {
  switch (stageName(table.stage)) {
    case "Lobby":
      if (table.setupStep === SETUP_STEPS && needsStarter(table)) return { kind: "revealStarter" };
      if (poolOwner && table.setupStep < SETUP_STEPS && (table.creator?.toLowerCase() === poolOwner.toLowerCase() || table.joined >= 1)) {
        return { kind: "setupStep", remaining: SETUP_STEPS - table.setupStep };
      }
      return { kind: "idle" };
    case "Shuffling":
      return { kind: "setupStep", remaining: SETUP_STEPS - table.setupStep };
    case "Dealing":
      if (table.dealtMask === 0) return { kind: "deal", reveal: needsStarter(table) };
      return needsStarter(table) ? { kind: "revealStarter" } : { kind: "idle" };
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

export interface PlannedAction {
  readonly id: bigint;
  readonly stage: number;
  readonly action: KeeperAction;
}

const BACKGROUND_KINDS = new Set<KeeperAction["kind"]>(["setupStep", "reshuffleStep"]);

function backgroundRank(entry: PlannedAction): number {
  if (stageName(entry.stage) === "Shuffling") return 0;
  if (stageName(entry.stage) === "Lobby") return 1;
  return 2;
}

const remainingOf = (p: PlannedAction): number => ("remaining" in p.action ? p.action.remaining : 0);

/** Block gas only fits a few shuffle steps, so lobbies are finished one at a time, most advanced first, instead of all crawling forward together. */
export function scheduleKeeper(planned: readonly PlannedAction[]): { readonly urgent: readonly PlannedAction[]; readonly background: readonly PlannedAction[] } {
  const active = planned.filter((p) => p.action.kind !== "idle");
  const urgent = active.filter((p) => !BACKGROUND_KINDS.has(p.action.kind));
  const sorted = [...active.filter((p) => BACKGROUND_KINDS.has(p.action.kind))].sort(
    (a, b) => backgroundRank(a) - backgroundRank(b) || remainingOf(a) - remainingOf(b) || Number(a.id - b.id),
  );
  const firstLobby = sorted.find((p) => stageName(p.stage) === "Lobby");
  const background = sorted.filter((p) => stageName(p.stage) !== "Lobby" || p === firstLobby);
  return { urgent, background };
}

