export const STAGE = ["Lobby", "Shuffling", "Dealing", "Playing", "AwaitChallenge", "Revealing", "RoundOver", "MatchOver"] as const;
export type ChainStage = (typeof STAGE)[number];
export const NO_SEAT = 255;
export const SETUP_STEPS = 60;
