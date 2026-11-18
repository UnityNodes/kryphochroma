import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, VIEW_STORAGE_KEY, parseView, readStoredView, resolveView, storeView } from "@/game/tableView";

function storageWith(value: string | null): Pick<Storage, "getItem" | "setItem"> {
  let held = value;
  return {
    getItem: (key) => (key === VIEW_STORAGE_KEY ? held : null),
    setItem: (key, next) => {
      if (key === VIEW_STORAGE_KEY) held = next;
    },
  };
}

const broken: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is blocked");
  },
};

describe("table view preference", () => {
  it("is 2d by default", () => {
    expect(DEFAULT_VIEW).toBe("2d");
    expect(resolveView("", null)).toBe("2d");
  });

  it("accepts only the two known views", () => {
    expect(parseView("3d")).toBe("3d");
    expect(parseView("2D")).toBe("2d");
    expect(parseView("4d")).toBeNull();
    expect(parseView(null)).toBeNull();
    expect(parseView(3)).toBeNull();
  });

  it("lets the url beat the stored choice and the stored choice beat the default", () => {
    expect(resolveView("?view=3d", "2d")).toBe("3d");
    expect(resolveView("?view=2d", "3d")).toBe("2d");
    expect(resolveView("?seats=2", "3d")).toBe("3d");
    expect(resolveView("?seats=2&view=3d", null)).toBe("3d");
  });

  it("ignores a bad url value and a bad stored value", () => {
    expect(resolveView("?view=vr", "3d")).toBe("3d");
    expect(resolveView("?view=vr", "holo")).toBe("2d");
    expect(resolveView("", "")).toBe("2d");
  });

  it("reads and writes storage without ever throwing", () => {
    const storage = storageWith(null);
    expect(readStoredView(storage)).toBeNull();
    storeView(storage, "3d");
    expect(readStoredView(storage)).toBe("3d");
    expect(readStoredView(broken)).toBeNull();
    expect(() => storeView(broken, "3d")).not.toThrow();
    expect(readStoredView(undefined)).toBeNull();
  });
});
