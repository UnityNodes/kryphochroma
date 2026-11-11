import { describe, expect, it } from "vitest";
import { tableCode, tableIdFromCode, tablePath } from "@/lib/invite";

describe("invite links", () => {
  it("turns a table id into two words and back", () => {
    expect(tableCode(3)).toBe("blue-otter");
    expect(tablePath(3n)).toBe("/j/blue-otter");
    for (let id = 0; id < 3000; id++) expect(tableIdFromCode(tableCode(id))).toBe(BigInt(id));
  });

  it("keeps codes unique past the first 256 tables", () => {
    const codes = new Set(Array.from({ length: 1000 }, (_, id) => tableCode(id)));
    expect(codes.size).toBe(1000);
    expect(tableCode(256)).toBe("amber-otter-1");
  });

  it("refuses anything that is not a code", () => {
    expect(tableIdFromCode("blue")).toBeNull();
    expect(tableIdFromCode("blue-dragon")).toBeNull();
    expect(tableIdFromCode("blue-otter-0")).toBeNull();
    expect(tableIdFromCode("../etc")).toBeNull();
    expect(tableIdFromCode("BLUE-OTTER")).toBe(3n);
  });
});
