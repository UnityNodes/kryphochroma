import { describe, expect, it } from "vitest";
import { backTarget } from "../src/lib/backTarget";

describe("backTarget", () => {
  it("has no back link on the landing page", () => {
    expect(backTarget("/")).toBeNull();
  });

  it("sends the table picker and top pages home", () => {
    expect(backTarget("/new")).toEqual({ href: "/", label: "Home" });
    expect(backTarget("/secret")).toEqual({ href: "/", label: "Home" });
    expect(backTarget("/docs")).toEqual({ href: "/", label: "Home" });
  });

  it("sends a lobby or a table back to the table picker", () => {
    expect(backTarget("/j/teal-otter")).toEqual({ href: "/new", label: "Tables" });
    expect(backTarget("/t/23/watch")).toEqual({ href: "/new", label: "Tables" });
  });

  it("sends a docs page back to the docs index", () => {
    expect(backTarget("/docs/rules")).toEqual({ href: "/docs", label: "Docs" });
  });
});
