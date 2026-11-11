import { rpcUrls } from "@kryphochroma/abi";
import { fallback, http } from "viem";
import { SEPOLIA_RPC_URL } from "./config";

export const SEPOLIA_RPC_URLS = rpcUrls(SEPOLIA_RPC_URL);
export const RECEIPT_POLL_MS = 1000;
const RPC_TIMEOUT_MS = 15_000;
const RPC_BATCH_WAIT_MS = 16;

/** Public Sepolia nodes rate limit per IP, so calls made in the same tick share one HTTP request. */
export const sepoliaTransport = () => fallback(SEPOLIA_RPC_URLS.map((url) => http(url, { batch: { wait: RPC_BATCH_WAIT_MS }, timeout: RPC_TIMEOUT_MS })));
