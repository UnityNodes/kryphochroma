const BOTS_URL = process.env.BOTS_URL ?? "http://127.0.0.1:3320";
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

const ACT_LIMIT_PER_WINDOW = 240;

function allowed(key: string, limit: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) return false;
  hits.set(key, [...recent, now]);
  return true;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export const botsUrl = BOTS_URL;

export async function forward(request: Request, path: "/drip" | "/fill" | "/act" | "/quick", body: Record<string, unknown>): Promise<Response> {
  const ip = clientIp(request);
  const limit = path === "/act" ? ACT_LIMIT_PER_WINDOW : LIMIT_PER_WINDOW;
  if (!allowed(`${path}:${ip}`, limit, Date.now())) return Response.json({ error: "slow down" }, { status: 429 });
  try {
    const res = await fetch(`${BOTS_URL}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "bots service unavailable" }, { status: 503 });
  }
}
