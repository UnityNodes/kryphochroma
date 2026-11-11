import { kryphoTableAbi, peekField } from "@kryphochroma/abi";
import { type Hand, type Move, botCatchTarget, chooseMove } from "@kryphochroma/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, type PublicClient, createWalletClient } from "viem";
import { rpcTransport } from "../rpc.js";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { type ChainSeat, type ChainTable, toPublicState } from "@kryphochroma/abi";

const THINK_MS = [600, 1500] as const;
const BOT_GAS_LIMIT = 4_000_000n;
const BOT_GAS_PRICE = 5_000_000n;

export interface BotPlayer {
  readonly address: Hex;
  readonly act: (id: bigint) => Promise<"acted" | "waiting" | "done">;
  readonly join: (id: bigint) => Promise<boolean>;
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);

function functionFor(move: Move, seat: number, handles: readonly Hex[]): { functionName: string; args: (id: bigint) => readonly unknown[] } {
  switch (move.type) {
    case "play":
      return { functionName: "play", args: (id) => [id, move.slot, move.card, move.peek ? peekField(move.peek.seat, move.peek.slot) : (move.color ?? 0), handles[move.slot]] };
    case "veil":
      return { functionName: "veil", args: (id) => [id, move.slot, move.claim, handles[move.slot]] };
    case "doubt":
      return { functionName: "doubtVeil", args: (id) => [id] };
    case "draw":
      return { functionName: "draw", args: (id) => [id] };
    case "pass":
      return { functionName: "pass", args: (id) => [id] };
    case "take":
      return { functionName: "takeDraws", args: (id) => [id] };
    case "mono":
      return { functionName: "sayMono", args: (id) => [id, seat] };
    case "accept":
      return { functionName: "acceptDrawFour", args: (id) => [id] };
    case "challenge":
      return { functionName: "challengeDrawFour", args: (id) => [id] };
  }
}

export function createBot(privateKey: Hex, table: Hex, publicClient: PublicClient, rpcUrl: string): BotPlayer {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: rpcTransport(rpcUrl) });
  const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } }));
  const plain = new Map<Hex, number>();
  let permitted = false;
  let minBlock = 0n;
  let snapshot = 0n;

  const read = (functionName: string, args: readonly unknown[]) =>
    publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName, args, blockNumber: snapshot } as never) as Promise<unknown>;

  async function pinSnapshot(): Promise<boolean> {
    const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
    if (latest < minBlock) return false;
    snapshot = latest;
    return true;
  }

  async function send(functionName: string, args: readonly unknown[]): Promise<boolean> {
    const request = { address: table, abi: kryphoTableAbi, functionName, args, account, chain: sepolia } as never;
    try {
      await publicClient.simulateContract({ ...(request as object), blockNumber: snapshot } as never);
    } catch (error) {
      log({ event: "skip", bot: account.address, functionName, reason: (error as Error).message.slice(0, 160) });
      return false;
    }
    const hash = await walletClient.writeContract({ ...(request as object), gas: BOT_GAS_LIMIT, gasPrice: BOT_GAS_PRICE } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    minBlock = receipt.blockNumber;
    log({ event: "tx", bot: account.address, functionName, args, hash, status: receipt.status });
    return receipt.status === "success";
  }

  let lastHandles: readonly Hex[] = [];

  async function myHand(id: bigint, seat: number, slots: number): Promise<Hand> {
    const handles = (await read("handOf", [id, seat])) as readonly Hex[];
    lastHandles = handles;
    const missing = handles.filter((h, i) => (slots & (1 << i)) !== 0 && !plain.has(h));
    if (missing.length > 0) {
      if (!permitted) {
        await sdk.permits.grantPermit([table]);
        permitted = true;
      }
      const values = await sdk.decryption.decryptValues(missing.map((encryptedValue) => ({ encryptedValue, contractAddress: table })));
      for (const [handle, value] of Object.entries(values)) plain.set(handle as Hex, Number(value));
    }
    return handles.map((h, i) => ((slots & (1 << i)) !== 0 ? (plain.get(h) ?? null) : null));
  }

  async function act(id: bigint): Promise<"acted" | "waiting" | "done"> {
    if (!(await pinSnapshot())) return "waiting";
    const table = (await read("getTable", [id])) as ChainTable;
    if (table.stage === 7) return "done";
    const seats = await Promise.all(Array.from({ length: table.joined }, (_, i) => read("getSeat", [id, i]))) as (ChainSeat & { player: Hex })[];
    const seat = seats.findIndex((s) => s.player.toLowerCase() === account.address.toLowerCase());
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const pub = toPublicState(table, seats, discard);
    if (seat < 0 || !pub || pub.stage !== "Playing") return "waiting";
    const target = botCatchTarget(pub, seat);
    if (target !== null && (await send("catchMono", [id, target]))) return "acted";
    const mySeat = seats[seat];
    if (!mySeat) return "waiting";
    const hand = await myHand(id, seat, Number(mySeat.slots));
    const move = chooseMove(pub, seat, hand);
    if (!move) return "waiting";
    await new Promise((r) => setTimeout(r, THINK_MS[0] + Math.random() * (THINK_MS[1] - THINK_MS[0])));
    const call = functionFor(move, seat, lastHandles);
    return (await send(call.functionName, call.args(id))) ? "acted" : "waiting";
  }

  async function join(id: bigint): Promise<boolean> {
    if (!(await pinSnapshot())) return false;
    return send("join", [id, account.address]);
  }

  return { address: account.address, act, join };
}
