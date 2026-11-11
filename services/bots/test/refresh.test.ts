import type { PublicClient, WalletClient } from "viem";
import { describe, expect, it } from "vitest";
import { createRelay } from "../src/relay/hub.js";

function fakeChain(heights: bigint[]) {
  const reads: { functionName: string; blockNumber: bigint | undefined }[] = [];
  const publicClient = {
    getBlockNumber: async () => heights.shift() ?? 0n,
    readContract: async ({ functionName, blockNumber }: { functionName: string; blockNumber: bigint | undefined }) => {
      reads.push({ functionName, blockNumber });
      if (functionName === "getTable") return { stage: 0, joined: 0, monoWindow: 255, monoBlock: 0n };
      return [];
    },
  } as unknown as PublicClient;
  const relay = createRelay({ publicClient, relayer: {} as WalletClient, table: "0x0000000000000000000000000000000000000001", rpcUrl: "http://127.0.0.1:1", botKeys: [], log: () => undefined });
  return { relay, reads };
}

describe("hub refresh", () => {
  it("reads the table, seats, discard and nonces at one block", async () => {
    const { relay, reads } = fakeChain([100n]);
    await relay.refresh(8n);
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads.map((r) => r.blockNumber))).toEqual(new Set([100n]));
  });

  it("ignores a node that answers with an older block than the hub already saw", async () => {
    const { relay, reads } = fakeChain([100n, 99n]);
    await relay.refresh(8n);
    const before = reads.length;
    await relay.refresh(8n);
    expect(reads.length).toBe(before);
  });
});
