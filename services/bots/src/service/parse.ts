import { ACTION_KIND, type SignedAction, peekField } from "@kryphochroma/abi";

const TABLE_ID = /^[0-9]{1,12}$/;
const MAX_SEAT = 3;
const MAX_SLOT = 23;
const MAX_BYTE = 255;
const MAX_NONCE = 2 ** 32 - 1;
const MAX_ACTION_KIND = Math.max(...Object.values(ACTION_KIND));
const MAX_COLOR_FIELD = peekField(MAX_SEAT, MAX_SLOT);

export function parseTableId(raw: unknown, knownTables: bigint): bigint {
  const text = String(raw ?? "");
  if (!TABLE_ID.test(text)) throw new Error("bad table");
  const id = BigInt(text);
  if (id < 1n || id > knownTables) throw new Error("unknown table");
  return id;
}

function int(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error("bad field");
  return n;
}

function hex(value: unknown, length: number): `0x${string}` {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${length}}$`).test(value)) throw new Error("bad hex");
  return value as `0x${string}`;
}

export function parseSignedAction(raw: Record<string, unknown>, knownTables: bigint): SignedAction {
  return {
    table: parseTableId(raw.table, knownTables),
    seat: int(raw.seat, MAX_SEAT),
    kind: int(raw.kind, MAX_ACTION_KIND),
    slot: int(raw.slot, MAX_SLOT),
    card: int(raw.card, MAX_BYTE),
    color: int(raw.color, MAX_COLOR_FIELD),
    seenHandle: hex(raw.seenHandle, 64),
    nonce: int(raw.nonce, MAX_NONCE),
    signature: hex(raw.signature, 130),
  };
}
