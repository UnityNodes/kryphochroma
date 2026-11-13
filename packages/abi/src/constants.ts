export const STAGE = ["Lobby", "Shuffling", "Dealing", "Playing", "AwaitChallenge", "Revealing", "RoundOver", "MatchOver"] as const;
export type ChainStage = (typeof STAGE)[number];
export const NO_SEAT = 255;
export const NO_CARD = 255;
export const JOIN_GAS_LIMIT = 16_700_000n;
export const DECK_SIZE = 138;
export const FILL_CHUNK = 12;
export const SETUP_STEPS = Math.ceil(DECK_SIZE / FILL_CHUNK);
export const REFILL_AT = 48;
export const REFILL_MAX = 60;
export const PUBLIC_SEPOLIA_RPCS = ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"] as const;
export function rpcUrls(primary?: string): readonly string[] {
  return [...new Set([...(primary ? [primary] : []), ...PUBLIC_SEPOLIA_RPCS])];
}
