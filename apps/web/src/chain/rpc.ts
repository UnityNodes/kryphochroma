import { rpcUrls } from "@kryphochroma/abi";
import { fallback, http } from "viem";
import { SEPOLIA_RPC_URL } from "./config";

export const SEPOLIA_RPC_URLS = rpcUrls(SEPOLIA_RPC_URL);
export const RECEIPT_POLL_MS = 1000;
export const sepoliaTransport = () => fallback(SEPOLIA_RPC_URLS.map((url) => http(url)));
