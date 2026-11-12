export const RPC_METHODS: ReadonlySet<string> = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_sendRawTransaction",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

export const MAX_RPC_BATCH = 50;

export type RpcCheck = { readonly ok: true } | { readonly ok: false; readonly error: string };

const isCall = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const { jsonrpc, method } = value as { jsonrpc?: unknown; method?: unknown };
  return jsonrpc === "2.0" && typeof method === "string" && RPC_METHODS.has(method);
};

/** The proxy spends the server's RPC quota, so it relays only the reads and the raw transaction submit a game page needs. */
export function checkRpcBody(body: unknown): RpcCheck {
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_RPC_BATCH) return { ok: false, error: "bad batch size" };
    return body.every(isCall) ? { ok: true } : { ok: false, error: "method not allowed" };
  }
  return isCall(body) ? { ok: true } : { ok: false, error: "method not allowed" };
}
