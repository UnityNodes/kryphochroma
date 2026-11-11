export interface PoolTable {
  readonly id: bigint;
  readonly seats: number;
  readonly joined: number;
  readonly reserved: boolean;
  readonly setupStep: number;
}

export interface PoolPlan {
  readonly start: readonly bigint[];
  readonly create: readonly number[];
}

export const SPARE_BY_SEATS: Readonly<Record<number, number>> = { 4: 2, 3: 1, 2: 1 };

const isSpare = (p: PoolTable): boolean => p.joined === 0 && !p.reserved;

export function planPool(tables: readonly PoolTable[], maxTables: number): PoolPlan {
  const start = tables.filter((p) => p.joined === p.seats).map((p) => p.id);
  const create: number[] = [];
  let total = tables.length - start.length;
  for (const [seats, want] of Object.entries(SPARE_BY_SEATS).sort(([a], [b]) => Number(b) - Number(a))) {
    const have = tables.filter((p) => p.seats === Number(seats) && isSpare(p)).length;
    for (let k = have; k < want && total < maxTables; k++, total++) create.push(Number(seats));
  }
  return { start, create };
}

export function pickReady(tables: readonly PoolTable[], seats: number): PoolTable | null {
  const spare = tables.filter((p) => p.seats === seats && isSpare(p)).sort((a, b) => b.setupStep - a.setupStep || Number(a.id - b.id));
  return spare[0] ?? null;
}

export function pickBots<T extends string>(bots: readonly T[], seated: readonly string[], count: number): T[] {
  const taken = new Set(seated.map((a) => a.toLowerCase()));
  return bots.filter((b) => !taken.has(b.toLowerCase())).slice(0, Math.max(0, count));
}
