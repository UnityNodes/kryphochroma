import { readFileSync, writeFileSync } from "node:fs";
import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createBot } from "../src/player/run.js";
import { loadKeeperConfig, runKeeper } from "../src/keeper/run.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const deployment = JSON.parse(readFileSync(new URL("../../../deployments/sepolia.json", import.meta.url), "utf8")) as { KryphoTable: Hex };
const table = deployment.KryphoTable;
const rpcUrl = env("SEPOLIA_RPC_URL");
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const keeper = privateKeyToAccount(env("KEEPER_PRIVATE_KEY") as Hex);
const keeperWallet = createWalletClient({ account: keeper, chain: sepolia, transport: http(rpcUrl) });
const botKeys = env("BOT_KEYS").split(",").slice(0, Number(process.env.SMOKE_SEATS ?? "2")) as Hex[];
const bots = botKeys.map((key) => createBot(key, table, publicClient, rpcUrl));
const out = env("SMOKE_OUT");
const log: Record<string, unknown>[] = [];
const note = (row: Record<string, unknown>) => {
  log.push({ at: new Date().toISOString(), ...row });
  writeFileSync(out, JSON.stringify(log, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
};

for (const bot of bots) {
  const balance = await publicClient.getBalance({ address: bot.address });
  if (balance < parseEther("0.005")) {
    const hash = await keeperWallet.sendTransaction({ to: bot.address, value: parseEther("0.01") });
    await publicClient.waitForTransactionReceipt({ hash });
    note({ event: "fund", bot: bot.address, hash });
  }
}

const creatorKey = botKeys[0];
if (!creatorKey) throw new Error("no bots");
const creator = createWalletClient({ account: privateKeyToAccount(creatorKey), chain: sepolia, transport: http(rpcUrl) });
const createHash = await creator.writeContract({
  address: table,
  abi: kryphoTableAbi,
  functionName: "createTable",
  args: [{ seats: bots.length, turnTimeout: 300, targetScore: 500, singleRound: true, stackDrawTwo: false }],
});
await publicClient.waitForTransactionReceipt({ hash: createHash });
const id = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "tableCount" })) as bigint;
note({ event: "created", id, hash: createHash });
for (const key of botKeys) {
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: sepolia, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({ address: table, abi: kryphoTableAbi, functionName: "join", args: [id, wallet.account.address] });
  await publicClient.waitForTransactionReceipt({ hash });
  note({ event: "joined", bot: wallet.account.address, hash });
}
const startHash = await creator.writeContract({ address: table, abi: kryphoTableAbi, functionName: "start", args: [id] });
await publicClient.waitForTransactionReceipt({ hash: startHash });
note({ event: "started", hash: startHash });

const stage = async () => Number(((await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as { stage: number }).stage);
const finished = async () => (await stage()) === 7;
const started = Date.now();
const playing = (async () => {
  while (!(await finished())) {
    for (const bot of bots) {
      try {
        await bot.act(id);
      } catch (error) {
        note({ event: "bot-error", bot: bot.address, message: (error as Error).message.slice(0, 200) });
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
})();
await Promise.all([runKeeper({ ...loadKeeperConfig({ ...process.env, TABLE_ADDRESS: table }), pollMs: 3000 }, process.env, finished), playing]);
const result = await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getTable", args: [id] });
note({ event: "finished", id, minutes: ((Date.now() - started) / 60000).toFixed(1), table: result });
