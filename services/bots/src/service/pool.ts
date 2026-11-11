export interface PoolTable {
  readonly id: bigint;
  readonly seats: number;
  readonly joined: number;
  readonly reserved: boolean;
}

export interface PoolPlan {
  readonly start: readonly bigint[];
  readonly seat: readonly { readonly id: bigint; readonly count: number }[];
  readonly create: boolean;
}

export function planPool(tables: readonly PoolTable[], maxTables: number): PoolPlan {
  const open = tables.filter((p) => p.seats > p.joined);
  const free = open.filter((p) => !p.reserved);
  return {
    start: tables.filter((p) => p.joined === p.seats).map((p) => p.id),
    seat: free.filter((p) => p.seats - p.joined > 1).map((p) => ({ id: p.id, count: p.seats - p.joined - 1 })),
    create: free.length === 0 && open.length < maxTables,
  };
}

export function pickBots<T extends string>(bots: readonly T[], seated: readonly string[], count: number): T[] {
  const taken = new Set(seated.map((a) => a.toLowerCase()));
  return bots.filter((b) => !taken.has(b.toLowerCase())).slice(0, Math.max(0, count));
}
