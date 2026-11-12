import { rpcUrls } from "@kryphochroma/abi";
import { checkRpcBody } from "@/lib/rpcProxy";
import { admit } from "../proxy";

export const dynamic = "force-dynamic";

const UPSTREAMS = rpcUrls(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL);
const UPSTREAM_TIMEOUT_MS = 12_000;

const rpcError = (message: string, status: number) => Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message } }, { status });

export async function POST(request: Request): Promise<Response> {
  const refused = admit(request, "/rpc");
  if (refused) return refused;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError("bad json", 400);
  }
  const check = checkRpcBody(body);
  if (!check.ok) return rpcError(check.error, 400);
  const payload = JSON.stringify(body);
  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, { method: "POST", body: payload, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (res.status === 429 || res.status >= 500) continue;
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    } catch {
      continue;
    }
  }
  return rpcError("no Sepolia node answered", 502);
}
