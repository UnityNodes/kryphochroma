const BOTS_URL = process.env.BOTS_URL ?? "http://127.0.0.1:3320";
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function allowed(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT_PER_WINDOW) return false;
  hits.set(ip, [...recent, now]);
  return true;
}

export async function forward(request: Request, path: "/drip" | "/fill", body: Record<string, string>): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  if (!allowed(ip, Date.now())) return Response.json({ error: "slow down" }, { status: 429 });
  try {
    const res = await fetch(`${BOTS_URL}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "bots service unavailable" }, { status: 503 });
  }
}
