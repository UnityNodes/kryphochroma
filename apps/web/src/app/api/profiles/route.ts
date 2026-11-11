import { admit, botsUrl } from "../proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const refused = admit(request, "/profiles");
  if (refused) return refused;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
    .slice(0, 8);
  try {
    const res = await fetch(`${botsUrl}/profiles?ids=${ids.join(",")}`, { signal: AbortSignal.timeout(10_000) });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ profiles: {} }, { status: 503 });
  }
}
