const STALE_PATTERN = /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOAD_KEY = "kc-stale-reload";
const RELOAD_COOLDOWN_MS = 30_000;

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || STALE_PATTERN.test(error.message);
}

/** A redeploy removes the old chunk files, so one automatic reload fixes an open tab; the cooldown stops a loop if the reload does not help. */
export function shouldAutoReload(store: Store, now: number): boolean {
  try {
    const last = Number(store.getItem(RELOAD_KEY) ?? "0");
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
