import { validProfile } from "@kryphochroma/abi";
import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown; signature?: unknown };
  const profile = validProfile(body);
  if (!profile || typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) return Response.json({ error: "bad profile" }, { status: 400 });
  return forward(request, "/profile", { ...profile, signature: body.signature });
}
