import { forward } from "../proxy";

export async function POST(request: Request): Promise<Response> {
  return forward(request, "/quick", {});
}
