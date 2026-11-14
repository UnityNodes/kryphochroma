import { describe, expect, it } from "vitest";
import { admit, sameOrigin } from "@/app/api/proxy";

const post = (ip: string, headers: Record<string, string> = {}) => new Request("https://game.test/api/drip", { method: "POST", headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": ip, ...headers } });

describe("api admission", () => {
  it("does not let one address spend the allowance everyone shares", async () => {
    const statuses: (number | null)[] = [];
    for (let i = 0; i < 100; i++) statuses.push(admit(post("10.0.0.1"), "/drip")?.status ?? null);
    expect(statuses.filter((s) => s === null)).toHaveLength(6);
    const others = Array.from({ length: 54 }, (_, i) => admit(post(`10.0.1.${i}`), "/drip"));
    expect(others.every((r) => r === null)).toBe(true);
    const over = admit(post("10.0.2.1"), "/drip");
    expect(over?.status).toBe(429);
    expect(await over?.json()).toEqual({ error: "busy, try again in a minute" });
  });

  it("refuses a cross site post and a malformed origin without throwing", () => {
    expect(admit(new Request("https://game.test/api/act", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }), "/act")?.status).toBe(403);
    expect(sameOrigin(new Request("https://game.test/api/act", { method: "POST", headers: { origin: "null", host: "game.test" } }))).toBe(false);
    expect(sameOrigin(new Request("https://game.test/api/act", { method: "POST", headers: { origin: "https://game.test", host: "game.test" } }))).toBe(true);
  });
});
