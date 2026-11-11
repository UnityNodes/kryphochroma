const ADJECTIVES = ["amber", "sunny", "teal", "blue", "violet", "red", "silent", "hidden", "sealed", "velvet", "lucky", "wild", "quiet", "golden", "misty", "cosmic"] as const;
const NOUNS = ["otter", "raven", "lynx", "heron", "comet", "ember", "lotus", "moth", "orca", "panda", "quail", "tiger", "viper", "wren", "koala", "fox"] as const;
const BLOCK = ADJECTIVES.length * NOUNS.length;

export function tableCode(id: bigint | number | string): string {
  const n = BigInt(id);
  const adjective = ADJECTIVES[Number(n % BigInt(ADJECTIVES.length))];
  const noun = NOUNS[Number((n / BigInt(ADJECTIVES.length)) % BigInt(NOUNS.length))];
  const lap = n / BigInt(BLOCK);
  return lap > 0n ? `${adjective}-${noun}-${lap}` : `${adjective}-${noun}`;
}

export function tableIdFromCode(code: string): bigint | null {
  const match = /^([a-z]+)-([a-z]+)(?:-([1-9][0-9]{0,9}))?$/.exec(code.toLowerCase());
  if (!match) return null;
  const a = ADJECTIVES.indexOf(match[1] as (typeof ADJECTIVES)[number]);
  const b = NOUNS.indexOf(match[2] as (typeof NOUNS)[number]);
  if (a < 0 || b < 0) return null;
  return BigInt(a) + BigInt(ADJECTIVES.length) * BigInt(b) + BigInt(BLOCK) * BigInt(match[3] ?? 0);
}

export function tablePath(id: bigint | number | string): string {
  return `/j/${tableCode(id)}`;
}
