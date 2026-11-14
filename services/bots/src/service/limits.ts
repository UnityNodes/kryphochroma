const DAY_MS = 86_400_000;

export interface DailyCount {
  readonly day: number;
  readonly count: number;
}

export const emptyDay = (now: number): DailyCount => ({ day: Math.floor(now / DAY_MS), count: 0 });

/** Anything the service pays for on behalf of an anonymous caller is counted per day, so a script can not drain a funded key faster than one day's allowance. */
export function takeDaily(counter: DailyCount, now: number, cap: number): { readonly ok: boolean; readonly counter: DailyCount } {
  const day = Math.floor(now / DAY_MS);
  const current = counter.day === day ? counter : { day, count: 0 };
  if (current.count >= cap) return { ok: false, counter: current };
  return { ok: true, counter: { day, count: current.count + 1 } };
}

/** A fixed price stops every move the moment the Sepolia base fee rises above it, so the price follows the base fee with headroom; the cap keeps a fee spike from emptying the relayer in a few games. */
export function relayGasPrice(baseFee: bigint, floor: bigint, cap: bigint): bigint {
  const wanted = baseFee * 2n;
  const price = wanted > floor ? wanted : floor;
  return price > cap ? cap : price;
}

/** Two requests that arrive together both read the pool before either reserves a table, so reservations run one at a time. */
export function serial(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
