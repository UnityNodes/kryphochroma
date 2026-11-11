import { readFileSync } from "node:fs";
import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, createPublicClient, http, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";

const deployment = JSON.parse(readFileSync(new URL("../../../deployments/sepolia.json", import.meta.url), "utf8")) as { KryphoTable: Hex; block: number };
const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is not set");
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const latest = await client.getBlockNumber();
const STEP = 5000n;
const logs = [];
for (let from = BigInt(deployment.block); from <= latest; from += STEP) {
  const to = from + STEP - 1n > latest ? latest : from + STEP - 1n;
  logs.push(...(await client.getLogs({ address: deployment.KryphoTable, fromBlock: from, toBlock: to })));
}
const events = parseEventLogs({ abi: kryphoTableAbi, logs });
const byTable = new Map<string, { name: string; tx: Hex; block: bigint }[]>();
for (const e of events) {
  const id = (e.args as { id?: bigint }).id;
  if (id === undefined) continue;
  const key = id.toString();
  const list = byTable.get(key) ?? [];
  list.push({ name: e.eventName, tx: e.transactionHash, block: e.blockNumber });
  byTable.set(key, list);
}
const wanted = process.argv[2];
for (const [id, list] of byTable) {
  if (wanted && id !== wanted) continue;
  const counts = new Map<string, number>();
  for (const e of list) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  const firstOf = (name: string) => list.find((e) => e.name === name);
  const lastOf = (name: string) => [...list].reverse().find((e) => e.name === name);
  process.stdout.write(
    `${JSON.stringify({
      id,
      counts: Object.fromEntries(counts),
      created: firstOf("TableCreated")?.tx,
      firstShuffle: firstOf("ShuffleProgress")?.tx,
      lastShuffle: lastOf("ShuffleProgress")?.tx,
      dealt: firstOf("Dealt")?.tx,
      firstRelay: firstOf("ActionRelayed")?.tx,
      challenge: firstOf("ChallengeResolved")?.tx,
      reshuffled: firstOf("Reshuffled")?.tx,
      abandoned: firstOf("SeatAbandoned")?.tx,
      settled: firstOf("RoundSettled")?.tx,
      blocks: [list[0]?.block, list.at(-1)?.block],
    }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`,
  );
}
