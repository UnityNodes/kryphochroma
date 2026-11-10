import { readFileSync, writeFileSync } from "node:fs";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Abi, type Hex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const address = env("SPIKE_ADDRESS") as Hex;
const abi = (JSON.parse(readFileSync(new URL("../../../contracts/artifacts/contracts/spike/DeckSpike.sol/DeckSpike.json", import.meta.url), "utf8")) as { abi: Abi }).abi;
const transport = http(env("SEPOLIA_RPC_URL"));
const publicClient = createPublicClient({ chain: sepolia, transport });
const account = privateKeyToAccount(env("DEPLOYER_PRIVATE_KEY") as Hex);
const walletClient = createWalletClient({ account, chain: sepolia, transport });
const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } }));
const rows: Record<string, unknown>[] = [];
const log = (row: Record<string, unknown>) => {
  rows.push(row);
  writeFileSync(env("SPIKE_OUT"), JSON.stringify(rows, null, 2));
  process.stdout.write(`${JSON.stringify(row)}\n`);
};

async function send(functionName: string, args: readonly unknown[]) {
  const started = Date.now();
  const hash = await walletClient.writeContract({ address, abi, functionName, args, chain: sepolia, account, gas: 16_000_000n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  log({ action: functionName, args: args.map(String), tx: hash, gas: receipt.gasUsed.toString(), status: receipt.status, mineMs: Date.now() - started });
  return receipt;
}

await sdk.permits.grantPermit([address]);
const handCount = Number(await publicClient.readContract({ address, abi, functionName: "handCount", args: [] }));
await send("shufflePairs", [1, 0, 27]);
await send("shufflePairs", [1, 27, 27]);
await send("deal", [1, account.address, true]);
const receiptAt = Date.now();
const handle = (await publicClient.readContract({ address, abi, functionName: "handAt", args: [handCount] })) as Hex;
let attempts = 0;
for (;;) {
  attempts += 1;
  try {
    await sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress: address }]);
    log({ action: "decrypt fresh card after shuffle + deal", msAfterDealReceipt: Date.now() - receiptAt, attempts });
    break;
  } catch (error) {
    if (Date.now() - receiptAt > 300_000) {
      log({ action: "decrypt fresh card timed out", error: String((error as Error).message).slice(0, 160) });
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
