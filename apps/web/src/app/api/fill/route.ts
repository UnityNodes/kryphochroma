import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string" || !/^[0-9]{1,12}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  return forward(request, "/fill", { id });
}
