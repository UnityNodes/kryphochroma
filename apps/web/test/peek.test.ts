import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, encodeAbiParameters, encodeEventTopics, pad, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { grantedHandle, lastPeek } from "@/chain/peek";

const SESSION = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TABLE = "0x48A3d82cC5580A68E9E3D9D28Af41B39c9C76CE4" as const;
const HANDLE = `0x${"ab".repeat(32)}` as Hex;
const ALLOWED = toEventSelector("Allowed(address,address,bytes32)");
const HASH = `0x${"cd".repeat(32)}` as Hex;

const allowed = (logIndex: number, account: Hex, handle: Hex = HANDLE) => ({ logIndex, topics: [ALLOWED, pad(TABLE), pad(account)] as [Hex, ...Hex[]], data: handle });

function peeked(id: bigint, seat: number, target: number, slot: number, logIndex: number, blockNumber = 100n) {
  const topics = encodeEventTopics({ abi: kryphoTableAbi, eventName: "Peeked", args: { id } }) as [Hex, ...Hex[]];
  const data = encodeAbiParameters([{ type: "uint8" }, { type: "uint8" }, { type: "uint8" }], [seat, target, slot]);
  return { address: TABLE, topics, data, logIndex, blockNumber, transactionHash: HASH, blockHash: HASH, transactionIndex: 0, removed: false } as const;
}

describe("granted handle", () => {
  it("reads the handle from the access grant right before the peek", () => {
    expect(grantedHandle([allowed(3, OTHER, `0x${"ee".repeat(32)}`), allowed(7, SESSION), { logIndex: 8, topics: ["0x00"], data: "0x" }], 8, SESSION)).toBe(HANDLE);
  });

  it("matches the session whatever its letter case", () => {
    expect(grantedHandle([allowed(7, SESSION.toUpperCase().replace("0X", "0x") as Hex)], 8, SESSION)).toBe(HANDLE);
  });

  it("refuses a grant made to someone else", () => {
    expect(grantedHandle([allowed(7, OTHER)], 8, SESSION)).toBeNull();
  });

  it("refuses a log that is not an access grant or sits elsewhere in the transaction", () => {
    expect(grantedHandle([{ logIndex: 7, topics: [HASH, pad(TABLE), pad(SESSION)], data: HANDLE }], 8, SESSION)).toBeNull();
    expect(grantedHandle([allowed(5, SESSION)], 8, SESSION)).toBeNull();
    expect(grantedHandle([], 0, SESSION)).toBeNull();
  });
});

describe("last peek", () => {
  it("finds my peek with the place of its log", () => {
    expect(lastPeek([peeked(4n, 1, 0, 6, 12, 555n)], 4n, 1)).toEqual({ seat: 0, slot: 6, hash: HASH, logIndex: 12, block: 555n });
  });

  it("skips peeks by other seats and at other tables", () => {
    expect(lastPeek([peeked(4n, 2, 0, 6, 12), peeked(9n, 1, 0, 6, 13)], 4n, 1)).toBeNull();
  });

  it("keeps the latest of several", () => {
    expect(lastPeek([peeked(4n, 1, 0, 6, 12), peeked(4n, 1, 2, 3, 40)], 4n, 1)?.slot).toBe(3);
  });
});
