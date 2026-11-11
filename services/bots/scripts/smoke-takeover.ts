import { readFileSync } from "node:fs";
import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const service = process.env.SMOKE_SERVICE ?? "http://127.0.0.1:3320";
const deployment = JSON.parse(readFileSync(new URL("../../../deployments/sepolia.json", import.meta.url), "utf8")) as { KryphoTable: Hex; takeover: Hex };
const table = deployment.KryphoTable;
const rpcUrl = env("SEPOLIA_RPC_URL");
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const creator = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: creator, chain: sepolia, transport: http(rpcUrl) });
const say = (row: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...row }, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);
const post = async (path: string, body: unknown) => (await fetch(`${service}${path}`, { method: "POST", body: JSON.stringify(body) })).json();
const read = (functionName: string, args: readonly unknown[]) => publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName, args } as never) as Promise<Record<string, unknown>>;
const send = async (functionName: string, args: readonly unknown[]) => {
  const hash = await wallet.writeContract({ address: table, abi: kryphoTableAbi, functionName, args, gas: 2_000_000n, gasPrice: 5_000_000n } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed ${hash}`);
  return receipt;
};

say({ event: "drip", creator: creator.address, result: await post("/drip", { address: creator.address }) });
while ((await publicClient.getBalance({ address: creator.address })) === 0n) await new Promise((r) => setTimeout(r, 3000));
const created = await send("createTable", [{ seats: 2, turnTimeout: 30, targetScore: 500, singleRound: true, stackDrawTwo: false }]);
const id = (parseEventLogs({ abi: kryphoTableAbi, logs: created.logs, eventName: "TableCreated" })[0]?.args as { id: bigint }).id;
await send("join", [id, privateKeyToAccount(generatePrivateKey()).address]);
say({ event: "fill", id, result: await post("/fill", { id: id.toString() }) });
await send("start", [id]);
say({ event: "started", id });

const deadline = Date.now() + 30 * 60_000;
let handedOver = false;
let botActed = 0;
let lastNonce = 0;
while (Date.now() < deadline) {
  const t = await read("getTable", [id]);
  const seat = await read("getSeat", [id, 0]);
  const nonces = (await read("noncesOf", [id])) as unknown as readonly number[];
  if (!handedOver && seat.abandoned) {
    handedOver = (seat.session as string).toLowerCase() === deployment.takeover.toLowerCase();
    say({ event: "abandoned", handedOver, session: seat.session });
  }
  if (handedOver && Number(nonces[0]) > lastNonce) {
    botActed += Number(nonces[0]) - lastNonce;
    lastNonce = Number(nonces[0]);
    say({ event: "takeover-acted", relayedForSeat0: lastNonce, stage: t.stage, handSize: seat.handSize });
  }
  if (Number(t.stage) >= 6 || botActed >= 3) break;
  await new Promise((r) => setTimeout(r, 6000));
}
say({ event: "done", id, handedOver, botActed });
if (!handedOver || botActed === 0) process.exit(1);
