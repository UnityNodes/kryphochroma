import { readFileSync, writeFileSync } from "node:fs";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Abi, type Hex, createPublicClient, createWalletClient, encodeAbiParameters, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const address = env("SPIKE_ADDRESS") as Hex;
const artifact = JSON.parse(readFileSync(new URL("../../../contracts/artifacts/contracts/spike/DeckSpike.sol/DeckSpike.json", import.meta.url), "utf8")) as { abi: Abi };
const abi = artifact.abi;
const transport = http(env("SEPOLIA_RPC_URL"));
const publicClient = createPublicClient({ chain: sepolia, transport });
const rows: Record<string, unknown>[] = [];
const log = (row: Record<string, unknown>) => {
  rows.push(row);
  writeFileSync(env("SPIKE_OUT"), JSON.stringify(rows, null, 2));
  process.stdout.write(`${JSON.stringify(row)}\n`);
};

function sdkFor(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const config = createConfig({ chains: [zamaSepolia], publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } });
  return { sdk: new ZamaSDK(config), walletClient, account };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

async function retry<T>(fn: () => Promise<T>, timeoutMs = 300_000): Promise<{ value: T; ms: number; attempts: number }> {
  const started = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      return { value: await fn(), ms: Date.now() - started, attempts };
    } catch (error) {
      if (Date.now() - started > timeoutMs) throw error;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const player = sdkFor(env("DEPLOYER_PRIVATE_KEY") as Hex);
const stranger = sdkFor(env("KEEPER_PRIVATE_KEY") as Hex);
const hand0 = (await publicClient.readContract({ address, abi, functionName: "handAt", args: [0] })) as Hex;

const permit = await timed(() => player.sdk.permits.grantPermit([address]));
log({ action: "grant permit (burner signs locally)", ms: permit.ms });

const own = await retry(() => player.sdk.decryption.decryptValues([{ encryptedValue: hand0, contractAddress: address }]));
const card = Number(Object.values(own.value)[0]);
log({ action: "user decrypt own hand[0]", ms: own.ms, attempts: own.attempts, validCard: card >= 0 && card <= 0x4e });

let strangerDenied = false;
try {
  await stranger.sdk.permits.grantPermit([address]);
  await stranger.sdk.decryption.decryptValues([{ encryptedValue: hand0, contractAddress: address }]);
} catch (error) {
  strangerDenied = true;
  log({ action: "stranger decrypt denied", reason: String((error as Error).message).slice(0, 160) });
}
if (!strangerDenied) log({ action: "stranger decrypt NOT denied" });

const startHash = await player.walletClient.writeContract({ address, abi, functionName: "startReveal", args: [], chain: sepolia, account: player.account });
const startReceipt = await publicClient.waitForTransactionReceipt({ hash: startHash });
log({ action: "makePubliclyDecryptable", tx: startHash, gas: startReceipt.gasUsed.toString() });

const bit = (await publicClient.readContract({ address, abi, functionName: "bit", args: [] })) as Hex;
const pub = await retry(() => player.sdk.decryption.decryptPublicValues([bit]));
log({ action: "public decrypt bit", ms: pub.ms, attempts: pub.attempts, value: pub.value.clearValues[bit] });

const forged = encodeAbiParameters([{ type: "bool" }], [!pub.value.clearValues[bit]]);
let forgedRejected = false;
try {
  await publicClient.estimateContractGas({ address, abi, functionName: "finishReveal", args: [forged, pub.value.decryptionProof], account: player.account });
} catch {
  forgedRejected = true;
}
log({ action: "forged value rejected", ok: forgedRejected });

const finishHash = await player.walletClient.writeContract({ address, abi, functionName: "finishReveal", args: [pub.value.abiEncodedClearValues, pub.value.decryptionProof], chain: sepolia, account: player.account });
const finishReceipt = await publicClient.waitForTransactionReceipt({ hash: finishHash });
log({ action: "checkSignatures", tx: finishHash, gas: finishReceipt.gasUsed.toString(), status: finishReceipt.status });

let replayRejected = false;
try {
  await publicClient.estimateContractGas({ address, abi, functionName: "finishReveal", args: [pub.value.abiEncodedClearValues, pub.value.decryptionProof], account: player.account });
} catch {
  replayRejected = true;
}
log({ action: "replayed proof rejected", ok: replayRejected });
