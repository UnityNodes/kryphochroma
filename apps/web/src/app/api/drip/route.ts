import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const { address } = (await request.json().catch(() => ({}))) as { address?: unknown };
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) return Response.json({ error: "bad address" }, { status: 400 });
  return forward(request, "/drip", { address });
}
