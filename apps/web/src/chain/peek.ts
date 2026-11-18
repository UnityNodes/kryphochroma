import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, type Log, parseEventLogs, toEventSelector } from "viem";

const ALLOWED_TOPIC = toEventSelector("Allowed(address,address,bytes32)");
const ADDRESS_HEX = 40;

export interface PeekLog {
  readonly seat: number;
  readonly slot: number;
  readonly hash: Hex;
  readonly logIndex: number;
  readonly block: bigint;
}

export interface GrantLog {
  readonly logIndex: number | null;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export function lastPeek(logs: readonly Log[], id: bigint, seat: number): PeekLog | null {
  const mine = parseEventLogs({ abi: kryphoTableAbi, logs: [...logs], eventName: "Peeked" }).filter((l) => l.args.id === id && Number(l.args.seat) === seat);
  const last = mine[mine.length - 1];
  if (!last || last.transactionHash === null || last.logIndex === null || last.blockNumber === null) return null;
  return { seat: Number(last.args.target), slot: Number(last.args.slot), hash: last.transactionHash, logIndex: last.logIndex, block: last.blockNumber };
}

/** A hand slot is reused: once the rival plays the peeked card and draws, the same slot holds a new card the peeker has no access to, and reading the slot a block later asked the KMS for that card forever. The contract grants access right before it reports the peek, so the grant in the same transaction names the exact card. */
export function grantedHandle(logs: readonly GrantLog[], peekedIndex: number, session: Hex): Hex | null {
  const grant = logs.find((log) => log.logIndex === peekedIndex - 1);
  const account = grant?.topics[2];
  if (!grant || !account || grant.topics[0] !== ALLOWED_TOPIC) return null;
  if (account.slice(-ADDRESS_HEX).toLowerCase() !== session.slice(-ADDRESS_HEX).toLowerCase()) return null;
  return grant.data;
}
