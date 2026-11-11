import { kryphoTableAbi } from "@kryphochroma/abi";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const [tableArg, seatArg] = process.argv.slice(2);
const transport = http(process.env.SEPOLIA_RPC_URL);
const publicClient = createPublicClient({ chain: sepolia, transport });
const table = process.env.TABLE_ADDRESS as Hex;
const id = BigInt(tableArg ?? "1");
const seatIndex = Number(seatArg ?? "0");
const seat = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "getSeat", args: [id, seatIndex] } as never)) as { session: Hex; slots: number };
const key = (process.env.BOT_KEYS ?? "").split(",").find((k) => privateKeyToAccount(k as Hex).address.toLowerCase() === seat.session.toLowerCase()) as Hex | undefined;
if (!key) throw new Error("seat is not one of our bots");
const account = privateKeyToAccount(key);
const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient, walletClient: createWalletClient({ account, chain: sepolia, transport }), relayers: { [zamaSepolia.id]: node() } }));
const hand = (await publicClient.readContract({ address: table, abi: kryphoTableAbi, functionName: "handOf", args: [id, seatIndex] } as never)) as readonly Hex[];
const handles = hand.filter((_, i) => (Number(seat.slots) & (1 << i)) !== 0);
await sdk.permits.grantPermit([table]);
const tryDecrypt = async (label: string, batch: readonly Hex[]) => {
  const started = Date.now();
  try {
    await sdk.decryption.decryptValues(batch.map((encryptedValue) => ({ encryptedValue, contractAddress: table })));
    process.stdout.write(`${label} ok ${batch.length} in ${Date.now() - started}ms\n`);
  } catch (error) {
    process.stdout.write(`${label} fail ${batch.length} in ${Date.now() - started}ms ${(error as Error).message.slice(0, 160)}\n`);
  }
};
await tryDecrypt("all", handles);
for (const [i, h] of handles.entries()) await tryDecrypt(`slot ${i}`, [h]);
