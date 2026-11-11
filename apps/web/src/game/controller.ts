import type { GameState, Move } from "@kryphochroma/rules";
import type { Anchors } from "./flight";
import type { FeedLine } from "./offline";

export interface TableController {
  readonly mode: "practice" | "chain";
  readonly state: GameState;
  readonly me: number;
  readonly names: readonly string[];
  readonly avatars?: readonly (string | null)[];
  readonly busy: boolean;
  readonly feed: readonly FeedLine[];
  readonly anchors: Anchors;
  readonly act: (move: Move) => Promise<string | null>;
  readonly catchSeat: (target: number) => void;
  readonly restart?: () => void;
  readonly chips?: readonly string[];
  readonly watching?: boolean;
  readonly secretColor?: number | null;
  readonly peek?: { readonly seat: number; readonly slot: number; readonly card: number | null } | null;
  readonly clearPeek?: () => void;
  readonly sonar?: SonarReading | null;
  readonly clearSonar?: () => void;
}

export interface SonarReading {
  readonly target: number;
  readonly color: number;
  readonly count: number | null;
}
