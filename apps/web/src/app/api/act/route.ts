import { forward } from "../proxy";

const ALLOWED = ["table", "seat", "kind", "slot", "card", "color", "seenHandle", "nonce", "signature"] as const;

export async function POST(request: Request): Promise<Response> {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return Response.json({ error: "bad action" }, { status: 400 });
  const action = Object.fromEntries(ALLOWED.map((key) => [key, raw[key]]));
  return forward(request, "/act", action);
}
