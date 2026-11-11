import { admit, botsUrl } from "../proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9]{1,12}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const refused = admit(request, "/stream");
  if (refused) return refused;
  try {
    const upstream = await fetch(`${botsUrl}/stream?id=${id}`, { signal: request.signal });
    if (!upstream.ok || !upstream.body) return Response.json({ error: "stream unavailable" }, { status: 503 });
    return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
  } catch {
    return Response.json({ error: "stream unavailable" }, { status: 503 });
  }
}
