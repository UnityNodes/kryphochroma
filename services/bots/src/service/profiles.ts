import { type Profile, validProfile } from "@kryphochroma/abi";

export const MAX_PROFILES = 5000;
export const MAX_LOOKUP = 8;

export interface ProfileStore {
  readonly byAddress: ReadonlyMap<string, Profile & { readonly at: number }>;
}

export function emptyStore(): ProfileStore {
  return { byAddress: new Map() };
}

export function putProfile(store: ProfileStore, address: string, profile: Profile, now: number): ProfileStore {
  const next = new Map(store.byAddress);
  next.delete(address.toLowerCase());
  next.set(address.toLowerCase(), { ...profile, at: now });
  while (next.size > MAX_PROFILES) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return { byAddress: next };
}

export function lookup(store: ProfileStore, fixed: ReadonlyMap<string, Profile>, addresses: readonly string[]): Record<string, Profile> {
  const out: Record<string, Profile> = {};
  for (const raw of addresses.slice(0, MAX_LOOKUP)) {
    const address = raw.toLowerCase();
    const found = fixed.get(address) ?? store.byAddress.get(address);
    if (found) out[address] = { name: found.name, avatar: found.avatar };
  }
  return out;
}

export function parseAddresses(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
    .slice(0, MAX_LOOKUP);
}

export function fromDisk(text: string): ProfileStore {
  try {
    const rows = JSON.parse(text) as [string, { name?: unknown; avatar?: unknown; at?: unknown }][];
    let store = emptyStore();
    for (const [address, row] of rows) {
      const profile = validProfile(row);
      if (profile && /^0x[0-9a-f]{40}$/.test(address)) store = putProfile(store, address, profile, Number(row.at) || 0);
    }
    return store;
  } catch {
    return emptyStore();
  }
}

export function toDisk(store: ProfileStore): string {
  return JSON.stringify([...store.byAddress.entries()]);
}
