export type ClearValue = bigint | number | boolean | string | undefined;
export type BatchDecrypt = (handles: readonly `0x${string}`[]) => Promise<Readonly<Record<string, ClearValue>>>;

export interface DecryptOutcome {
  readonly values: ReadonlyMap<`0x${string}`, number>;
  readonly pending: readonly `0x${string}`[];
}

export async function decryptEach(decrypt: BatchDecrypt, handles: readonly `0x${string}`[]): Promise<DecryptOutcome> {
  const values = new Map<`0x${string}`, number>();
  if (handles.length === 0) return { values, pending: [] };
  const take = (result: Readonly<Record<string, ClearValue>>) => {
    for (const [handle, value] of Object.entries(result)) if (value !== undefined) values.set(handle as `0x${string}`, Number(value));
  };
  try {
    take(await decrypt(handles));
  } catch {
    const singles = await Promise.allSettled(handles.map((handle) => decrypt([handle])));
    for (const single of singles) if (single.status === "fulfilled") take(single.value);
  }
  return { values, pending: handles.filter((h) => !values.has(h)) };
}
