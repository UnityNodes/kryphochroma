export const STAGE = ["Lobby", "Shuffling", "Dealing", "Playing", "AwaitChallenge", "Revealing", "RoundOver", "MatchOver"] as const;
export type ChainStage = (typeof STAGE)[number];
export const NO_SEAT = 255;
export const DECK_SIZE = 138;
export const FILL_CHUNK = 23;
export const SHUFFLE_STEPS = 64;
export const SETUP_STEPS = DECK_SIZE / FILL_CHUNK + SHUFFLE_STEPS;
export const REFILL_AT = 48;
export const MIN_REFILL = 16;
export const PUBLIC_SEPOLIA_RPCS = ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"] as const;
export function rpcUrls(primary?: string): readonly string[] {
  return [...new Set([...(primary ? [primary] : []), ...PUBLIC_SEPOLIA_RPCS])];
}
