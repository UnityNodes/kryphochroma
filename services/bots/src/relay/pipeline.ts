export const MAX_PIPELINE = 4;
const PIPED_ACTION_GAS = 1_000_000n;
const PIPED_BASE_GAS = 300_000n;

interface Keyed {
  readonly seat: number;
  readonly nonce: number;
}

export const pipeKey = (action: Keyed): string => `${action.seat}:${action.nonce}`;

/** A move waits only for the next block, not for the receipt of the batch before it: the relayer nonce orders the transactions, so a later batch lands after the earlier one even in the same block. */
export function nextBatch<T extends Keyed>(pending: readonly T[], sent: ReadonlySet<string>, pipes: number, max: number): T[] {
  if (pipes >= MAX_PIPELINE) return [];
  const after = pending.findLastIndex((action) => sent.has(pipeKey(action))) + 1;
  return pending.slice(after, after + max);
}

/** A batch behind one in flight cannot be estimated against the chain, which does not hold the earlier moves yet, so it gets a per move bound instead. */
export function pipelinedGas(actions: number, endsRound: boolean, cap: bigint): bigint {
  if (endsRound) return cap;
  const gas = PIPED_BASE_GAS + BigInt(actions) * PIPED_ACTION_GAS;
  return gas > cap ? cap : gas;
}
