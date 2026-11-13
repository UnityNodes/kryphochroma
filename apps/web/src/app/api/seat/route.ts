import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw.table !== "string" || !/^[0-9]{1,12}$/.test(raw.table)) return Response.json({ error: "bad table" }, { status: 400 });
  if (typeof raw.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(raw.signature)) return Response.json({ error: "bad signature" }, { status: 400 });
  return forward(request, "/seat", { table: raw.table, signature: raw.signature });
}
