import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const { id, signature } = (await request.json().catch(() => ({}))) as { id?: unknown; signature?: unknown };
  if (typeof id !== "string" || !/^[0-9]{1,12}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return Response.json({ error: "bad signature" }, { status: 400 });
  return forward(request, "/fill", { id, signature });
}
