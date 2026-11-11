import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const { seats } = (await request.json().catch(() => ({}))) as { seats?: unknown };
  if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 2 || seats > 4) return Response.json({ error: "bad seats" }, { status: 400 });
  return forward(request, "/friends", { seats });
}
