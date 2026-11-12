import { describe, expect, it } from "vitest";
import { MAX_RPC_BATCH, checkRpcBody } from "@/lib/rpcProxy";

const call = (method: string) => ({ jsonrpc: "2.0", id: 1, method, params: [] });

describe("rpc proxy policy", () => {
  it("relays the reads and the raw transaction a game page needs, alone or batched", () => {
    expect(checkRpcBody(call("eth_call"))).toEqual({ ok: true });
    expect(checkRpcBody([call("eth_blockNumber"), call("eth_sendRawTransaction"), call("eth_getLogs")])).toEqual({ ok: true });
  });

  it("refuses methods that would spend the server quota on something else", () => {
    expect(checkRpcBody(call("eth_sendTransaction")).ok).toBe(false);
    expect(checkRpcBody(call("debug_traceTransaction")).ok).toBe(false);
    expect(checkRpcBody([call("eth_call"), call("eth_accounts")]).ok).toBe(false);
  });

  it("refuses empty, oversized and malformed bodies", () => {
    expect(checkRpcBody([]).ok).toBe(false);
    expect(checkRpcBody(Array.from({ length: MAX_RPC_BATCH + 1 }, () => call("eth_call"))).ok).toBe(false);
    expect(checkRpcBody({ method: "eth_call" }).ok).toBe(false);
    expect(checkRpcBody("eth_call").ok).toBe(false);
    expect(checkRpcBody(null).ok).toBe(false);
  });
});
