export type TableViewMode = "2d" | "3d";

export const VIEW_STORAGE_KEY = "kc-table-view";
export const VIEW_PARAM = "view";
export const DEFAULT_VIEW: TableViewMode = "2d";

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

export function parseView(value: unknown): TableViewMode | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return lower === "2d" || lower === "3d" ? lower : null;
}

/** A link can force a view for one visit without touching what the player chose before, so the address wins over the stored choice and the stored choice over the default. */
export function resolveView(search: string, stored: string | null): TableViewMode {
  return parseView(new URLSearchParams(search).get(VIEW_PARAM)) ?? parseView(stored) ?? DEFAULT_VIEW;
}

/** Storage throws in private windows and when site data is blocked, and the table must open all the same. */
export function readStoredView(storage: ViewStorage | undefined): string | null {
  try {
    return storage?.getItem(VIEW_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeView(storage: ViewStorage | undefined, mode: TableViewMode): void {
  try {
    storage?.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    return;
  }
}
