import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Log, encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";
import { toGameEvents } from "@/chain/events";

function log(eventName: string, indexed: Record<string, unknown>, data: { types: { type: string }[]; values: unknown[] }): Log {
  const topics = encodeEventTopics({ abi: kryphoTableAbi, eventName, args: indexed } as never);
  return { address: "0x0000000000000000000000000000000000000001", topics, data: encodeAbiParameters(data.types as never, data.values as never), blockNumber: 1n, transactionHash: "0x" + "1".repeat(64), logIndex: 0, blockHash: "0x" + "2".repeat(64), transactionIndex: 0, removed: false } as unknown as Log;
}

describe("chain events", () => {
  it("maps contract events to engine events for one table", () => {
    const logs = [
      log("Played", { id: 7n }, { types: [{ type: "uint8" }, { type: "uint8" }, { type: "uint8" }, { type: "uint8" }], values: [1, 3, 39, 2] }),
      log("Drew", { id: 8n }, { types: [{ type: "uint8" }, { type: "uint8" }], values: [0, 4] }),
      log("RoundSettled", { id: 7n }, { types: [{ type: "int8" }, { type: "uint16" }, { type: "uint8" }], values: [-1, 0, 5] }),
      log("ChallengeResolved", { id: 7n }, { types: [{ type: "bool" }], values: [true] }),
    ];
    expect(toGameEvents(logs, 7n)).toEqual([
      { type: "Played", seat: 1, slot: 3, card: 39, color: 2 },
      { type: "RoundSettled", winner: null, points: 0, cheaters: [0, 2] },
      { type: "ChallengeResolved", bit: true },
    ]);
  });
});
