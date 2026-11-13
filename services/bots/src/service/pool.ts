import { SETUP_STEPS } from "@kryphochroma/abi";

export interface PoolTable {
  readonly id: bigint;
  readonly seats: number;
  readonly joined: number;
  readonly reserved: boolean;
  readonly setupStep: number;
  readonly starter: boolean;
  readonly bots?: number;
}

export interface PoolPlan {
  readonly create: readonly number[];
  readonly preseat: readonly bigint[];
}

/** Every spare table costs seventy shuffle transactions of encrypted swaps on the shared testnet, so the pool keeps only what covers a few players arriving at once. */
export const SPARE_BY_SEATS: Readonly<Record<number, number>> = { 4: 2, 3: 1, 2: 1 };
export const QUICK_SEATS = 4;
export const PRESEATED_QUICK = 2;

const isSpare = (p: PoolTable): boolean => p.joined === 0 && !p.reserved;
const dealsOnJoin = (p: PoolTable): boolean => p.setupStep >= SETUP_STEPS && p.starter;
const isQuick = (p: PoolTable): boolean => p.seats === QUICK_SEATS && !p.reserved && p.joined === QUICK_SEATS - 1 && (p.bots ?? 0) === QUICK_SEATS - 1 && dealsOnJoin(p);

/** A quick game table waits with its three bots already seated and its deck shuffled, so the player's own join fills it and deals in the same block. */
export function pickQuick(tables: readonly PoolTable[]): PoolTable | null {
  return [...tables].filter(isQuick).sort((a, b) => Number(a.id - b.id))[0] ?? null;
}

export function planPool(tables: readonly PoolTable[], maxTables: number): PoolPlan {
  const create: number[] = [];
  let total = tables.length;
  for (const [seats, want] of Object.entries(SPARE_BY_SEATS).sort(([a], [b]) => Number(b) - Number(a))) {
    const have = tables.filter((p) => p.seats === Number(seats) && isSpare(p)).length;
    for (let k = have; k < want && total < maxTables; k++, total++) create.push(Number(seats));
  }
  const quick = tables.filter(isQuick).length;
  const candidates = tables.filter((p) => p.seats === QUICK_SEATS && isSpare(p) && dealsOnJoin(p)).sort((a, b) => Number(a.id - b.id));
  const preseat = candidates.slice(0, Math.max(0, PRESEATED_QUICK - quick)).map((p) => p.id);
  return { create, preseat };
}

export function pickReady(tables: readonly PoolTable[], seats: number): PoolTable | null {
  const spare = tables.filter((p) => p.seats === seats && isSpare(p)).sort((a, b) => b.setupStep - a.setupStep || Number(b.starter) - Number(a.starter) || Number(a.id - b.id));
  return spare[0] ?? null;
}

export function pickBots<T extends string>(bots: readonly T[], seated: readonly string[], count: number): T[] {
  const taken = new Set(seated.map((a) => a.toLowerCase()));
  return bots.filter((b) => !taken.has(b.toLowerCase())).slice(0, Math.max(0, count));
}
