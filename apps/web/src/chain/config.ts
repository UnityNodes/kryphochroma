import type { Hex } from "viem";

export const TABLE_ADDRESS = (process.env.NEXT_PUBLIC_DEPLOYED_TABLE || process.env.NEXT_PUBLIC_TABLE_ADDRESS || "") as Hex;
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
export const EXPLORER = "https://sepolia.etherscan.io";
export const BURNER_GAS_PRICE = 5_000_000n;
export const BURNER_GAS_LIMIT = 4_000_000n;
