const BOTS_URL = process.env.BOTS_URL ?? "http://127.0.0.1:3320";
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 6;
const ACT_LIMIT_PER_WINDOW = 240;
const STREAM_LIMIT_PER_WINDOW = 30;
const OPEN_LIMIT_PER_WINDOW = 30;
const GLOBAL_LIMIT_PER_WINDOW: Record<string, number> = { "/drip": 60, "/quick": 60, "/fill": 60, "/act": 6000, "/stream": 600, "/open": 600 };
const PRUNE_EVERY = 500;
const UPSTREAM_TIMEOUT_MS: Record<string, number> = { "/fill": 120_000, "/drip": 60_000, "/quick": 30_000, "/act": 15_000 };
const hits = new Map<string, number[]>();
let calls = 0;

function prune(now: number): void {
  for (const [key, times] of hits) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}

export function allowed(key: string, limit: number, now: number): boolean {
  calls += 1;
  if (calls % PRUNE_EVERY === 0) prune(now);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function normalizeIp(ip: string): string {
  if (!ip.includes(":")) return ip;
  const groups = ip.split("::")[0]?.split(":") ?? [];
  return `${groups.slice(0, 4).join(":")}::/64`;
}

export function clientIp(request: Request): string {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return normalizeIp(raw);
}

export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return new URL(origin).host === request.headers.get("host");
}

export function admit(request: Request, path: string): Response | null {
  if (request.method === "POST" && !sameOrigin(request)) return Response.json({ error: "cross-site request" }, { status: 403 });
  const now = Date.now();
  const limit = path === "/act" ? ACT_LIMIT_PER_WINDOW : path === "/stream" ? STREAM_LIMIT_PER_WINDOW : path === "/open" ? OPEN_LIMIT_PER_WINDOW : LIMIT_PER_WINDOW;
  if (!allowed(`global:${path}`, GLOBAL_LIMIT_PER_WINDOW[path] ?? LIMIT_PER_WINDOW, now)) return Response.json({ error: "busy, try again in a minute" }, { status: 429 });
  if (!allowed(`${path}:${clientIp(request)}`, limit, now)) return Response.json({ error: "slow down" }, { status: 429 });
  return null;
}

export const botsUrl = BOTS_URL;

export async function forward(request: Request, path: "/drip" | "/fill" | "/act" | "/quick", body: Record<string, unknown>): Promise<Response> {
  const refused = admit(request, path);
  if (refused) return refused;
  try {
    const res = await fetch(`${BOTS_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS[path] ?? 30_000),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "bots service unavailable" }, { status: 503 });
  }
}
