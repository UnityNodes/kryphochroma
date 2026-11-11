import { describe, expect, it } from "vitest";
import { createTableScan } from "../src/keeper/scan.js";

describe("table scan", () => {
  it("keeps every table that is not finished, however old", () => {
    const scan = createTableScan();
    expect(scan.ids(3n)).toEqual([1n, 2n, 3n]);
    scan.settle(1n, 3);
    scan.settle(2n, 7);
    scan.settle(3n, 0);
    expect(scan.ids(40n)).toHaveLength(39);
    expect(scan.ids(40n)).toContain(1n);
    expect(scan.ids(40n)).not.toContain(2n);
  });

  it("never brings a finished match back", () => {
    const scan = createTableScan();
    scan.settle(5n, 7);
    scan.settle(5n, 0);
    expect(scan.ids(6n)).toEqual([1n, 2n, 3n, 4n, 6n]);
  });
});
