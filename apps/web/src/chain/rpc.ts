import { rpcUrls } from "@kryphochroma/abi";
import { fallback, http } from "viem";
import { SEPOLIA_RPC_URL } from "./config";

export const SEPOLIA_RPC_URLS = rpcUrls(SEPOLIA_RPC_URL);
export const RECEIPT_POLL_MS = 1000;
const RPC_TIMEOUT_MS = 15_000;
const RPC_BATCH_WAIT_MS = 16;
const DIRECT_RETRIES = 0;
const PROXY_RETRIES = 2;
export const RPC_PROXY_PATH = "/api/rpc";

/** Public Sepolia nodes rate limit per IP and some browsers or extensions block them outright, so calls made in the same tick share one HTTP request and a failed direct call falls back to our own origin. */
export const sepoliaTransport = () =>
  fallback([
    ...SEPOLIA_RPC_URLS.map((url) => http(url, { batch: { wait: RPC_BATCH_WAIT_MS }, timeout: RPC_TIMEOUT_MS, retryCount: DIRECT_RETRIES })),
    http(RPC_PROXY_PATH, { batch: { wait: RPC_BATCH_WAIT_MS }, timeout: RPC_TIMEOUT_MS, retryCount: PROXY_RETRIES }),
  ]);
