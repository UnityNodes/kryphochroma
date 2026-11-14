import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Deployment } from "./content";

interface Record {
  readonly KryphoTable?: string;
  readonly takeover?: string;
  readonly block?: number;
  readonly libraries?: { readonly KryphoDeck?: string; readonly KryphoScore?: string; readonly KryphoRadio?: string; readonly KryphoLobby?: string; readonly KryphoHand?: string };
}

export function readDeployment(): Deployment {
  let record: Record = {};
  try {
    record = JSON.parse(readFileSync(join(process.cwd(), "../../deployments/sepolia.json"), "utf8")) as Record;
  } catch {
    record = {};
  }
  return {
    table: record.KryphoTable ?? process.env.NEXT_PUBLIC_TABLE_ADDRESS ?? "",
    deck: record.libraries?.KryphoDeck ?? "",
    score: record.libraries?.KryphoScore ?? "",
    radio: record.libraries?.KryphoRadio ?? "",
    lobby: record.libraries?.KryphoLobby ?? "",
    hand: record.libraries?.KryphoHand ?? "",
    takeover: record.takeover ?? "",
    block: record.block ?? 0,
  };
}
