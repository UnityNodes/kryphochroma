import { admit, botsUrl } from "../proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const refused = admit(request, "/open");
  if (refused) return refused;
  try {
    const res = await fetch(`${botsUrl}/open`, { signal: AbortSignal.timeout(15_000) });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ tables: [] }, { status: 503 });
  }
}
