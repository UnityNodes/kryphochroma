import { STAGE } from "@kryphochroma/abi";

const MATCH_OVER = STAGE.indexOf("MatchOver");

export interface TableScan {
  readonly ids: (count: bigint) => readonly bigint[];
  readonly settle: (id: bigint, stage: number) => void;
}

/** A finished match never changes again, so only those ids are skipped; a window of recent ids would lose a long game or an old spare table once enough newer tables exist. */
export function createTableScan(): TableScan {
  const finished = new Set<bigint>();
  return {
    ids: (count) => {
      const live: bigint[] = [];
      for (let id = 1n; id <= count; id++) if (!finished.has(id)) live.push(id);
      return live;
    },
    settle: (id, stage) => {
      if (stage === MATCH_OVER) finished.add(id);
    },
  };
}
