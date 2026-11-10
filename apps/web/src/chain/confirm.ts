import type { Hex, PublicClient, TransactionReceipt } from "viem";

export async function confirm(publicClient: PublicClient, hash: Hex, label: string): Promise<TransactionReceipt> {
  let replaced = false;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, onReplaced: () => (replaced = true) });
  if (replaced || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error(`${label} was replaced, please try again`);
  if (receipt.status !== "success") throw new Error(`${label} failed on chain`);
  return receipt;
}
