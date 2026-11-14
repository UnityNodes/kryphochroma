import { rpcUrls } from "@kryphochroma/abi";
import { fallback, http, type Transport } from "viem";

const STALE_BLOCK_CODE = -32001;
const STALE_TRIES = 5;
const STALE_RETRY_MS = 400;
const CAUSE_DEPTH = 6;

interface Chained {
  readonly code?: unknown;
  readonly cause?: unknown;
}

export function isStaleBlock(error: unknown): boolean {
  let current = error as Chained | null | undefined;
  for (let depth = 0; current && depth < CAUSE_DEPTH; depth++) {
    if (current.code === STALE_BLOCK_CODE) return true;
    current = current.cause as Chained | null | undefined;
  }
  return false;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A public node can be a second behind the block another node just reported and answers a call pinned to that block with "not found". Asking again shortly after gets the answer, where failing costs the keeper or the relay a whole pass and the player a block. */
export async function retryStale<T>(call: () => Promise<T>, sleep: (ms: number) => Promise<void> = wait): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= STALE_TRIES || !isStaleBlock(error)) throw error;
      await sleep(STALE_RETRY_MS);
    }
  }
}

export function rpcTransport(primary: string): Transport {
  const inner = fallback(rpcUrls(primary).map((url) => http(url)));
  return (params) => {
    const base = inner(params);
    const request = ((args, options) => retryStale(() => base.request(args as never, options))) as typeof base.request;
    return { ...base, request };
  };
}
