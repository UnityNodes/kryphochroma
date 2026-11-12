import { describe, expect, it } from "vitest";
import { isStaleBuildError, shouldAutoReload } from "@/lib/staleBuild";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

describe("stale build after a redeploy", () => {
  it("recognises missing chunk errors and nothing else", () => {
    const chunk = new Error("Loading chunk 3vhl failed.");
    chunk.name = "ChunkLoadError";
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new Error("Failed to fetch dynamically imported module: https://x/_next/a.js"))).toBe(true);
    expect(isStaleBuildError(new Error("Cannot read properties of null"))).toBe(false);
    expect(isStaleBuildError("ChunkLoadError")).toBe(false);
  });

  it("reloads once, then waits out the cooldown so a broken deploy can not loop", () => {
    const store = memory();
    expect(shouldAutoReload(store, 1_000_000)).toBe(true);
    expect(shouldAutoReload(store, 1_010_000)).toBe(false);
    expect(shouldAutoReload(store, 1_040_000)).toBe(true);
  });

  it("does not reload when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined };
    expect(shouldAutoReload(blocked, 1)).toBe(false);
  });
});
