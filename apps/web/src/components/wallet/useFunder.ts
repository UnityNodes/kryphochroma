"use client";

import { sepolia } from "viem/chains";
import { useAccount, useWalletClient } from "wagmi";
import type { Funder } from "@/chain/seat";

export type FunderState = { readonly ready: true; readonly funder: Funder } | { readonly ready: false; readonly reason: "wrong-chain" | "loading" };

export function useFunder(): FunderState {
  const { address, chainId, isConnected } = useAccount();
  const { data: wallet } = useWalletClient();
  if (!isConnected || !address) return { ready: true, funder: { kind: "guest" } };
  if (chainId !== sepolia.id) return { ready: false, reason: "wrong-chain" };
  if (!wallet) return { ready: false, reason: "loading" };
  return { ready: true, funder: { kind: "wallet", wallet, address } };
}
