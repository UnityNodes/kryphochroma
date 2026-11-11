export interface DripPolicy {
  readonly perAddressMs: number;
  readonly dailyCap: number;
}

export interface DripLedger {
  readonly lastByAddress: ReadonlyMap<string, number>;
  readonly dayStart: number;
  readonly count: number;
}

const DAY_MS = 86_400_000;

export type DripDecision = { readonly ok: true; readonly ledger: DripLedger } | { readonly ok: false; readonly reason: "too-soon" | "daily-cap" | "bad-address" };

export function decideDrip(ledger: DripLedger, address: string, now: number, policy: DripPolicy): DripDecision {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return { ok: false, reason: "bad-address" };
  const key = address.toLowerCase();
  const fresh = now - ledger.dayStart >= DAY_MS ? { ...ledger, dayStart: now, count: 0 } : ledger;
  if (fresh.count >= policy.dailyCap) return { ok: false, reason: "daily-cap" };
  const last = fresh.lastByAddress.get(key);
  if (last !== undefined && now - last < policy.perAddressMs) return { ok: false, reason: "too-soon" };
  const lastByAddress = new Map(fresh.lastByAddress);
  lastByAddress.set(key, now);
  return { ok: true, ledger: { lastByAddress, dayStart: fresh.dayStart, count: fresh.count + 1 } };
}

export function releaseDrip(ledger: DripLedger, address: string): DripLedger {
  const key = address.toLowerCase();
  if (!ledger.lastByAddress.has(key)) return ledger;
  const lastByAddress = new Map(ledger.lastByAddress);
  lastByAddress.delete(key);
  return { lastByAddress, dayStart: ledger.dayStart, count: Math.max(0, ledger.count - 1) };
}
