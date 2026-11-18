export const ROOM_INK = "#07130e";
export const ASSET_BASE = "/landing";
export const BAND_QUERY = "(max-width: 860px)";

export function cardUrl(name: string): string {
  return `${ASSET_BASE}/cards/${name}.webp`;
}

export const CARD_W = 1;
export const CARD_H = 1.5;
export const CARD_T = 0.034;
export const BEVEL = 0.006;
export const CORNER = 0.085;
export const FACE_EPS = 0.0009;

export const INTRO = 1.9;
export const SLIDE = 1.56;
export const NUDGE = 0.34;

export const TABLE_X = 7.2;
export const TABLE_Z = 5.0;
export const LAMP_Y = 4.4;
export const LAMP_INTENSITY = 2.1;
export const VIOLET_INTENSITY = 5;

export const BASE_ASPECT = 1.6;
export const BAND_ASPECT = 1.25;
export const MAX_FOV = 64;
export const SOFT_SCALE = 0.8;
export const STABLE_MS = 60;
export const STALE_MS = 700;
export const READY_TIMEOUT_MS = 3500;

export const HAND_FACES = ["sun-4", "red-7", "teal-9", "blue-2", "violet-3", "blue-spyglass", "wild"] as const;
export const FIRST_FACE = "teal-7";
export const PEEKED_FACE = "red-draw2";
export const DRAWN_FACE = "teal-2";
export const BACK_FACE = "back";
export const HAND_SIZE = HAND_FACES.length;

export const HAND_Z = 2.6;
export const HAND_SPACING = 0.56;
export const HAND_ROLL = Math.asin(CARD_T / HAND_SPACING);
export const HAND_Y = (CARD_W / 2) * Math.sin(HAND_ROLL) + CARD_T / 2;
export const RIVAL_SPACING = 0.4;
export const RIVAL_ROLL = Math.asin(CARD_T / RIVAL_SPACING);
export const RIVAL_Y = (CARD_W / 2) * Math.sin(RIVAL_ROLL) + CARD_T / 2;

export const DEAL_ORDER_STEP = 4;
export const DEAL_GAP = 0.034;

export const PLAYED_SLOT = 1;
export const VEILED_SLOT = 4;
export const SPYGLASS_SLOT = 5;
export const DRAWN_SLOT = 4;
export const PEEK_SLOT = 4;
export const PEEK_SEAT = 0;
export const SONAR_SEAT = 2;
export const SONAR_COUNT = 3;
export const VEIL_SHOT = 3;
export const SPYGLASS_SHOT = 4;

export interface Seat {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export const SEATS: readonly [Seat, Seat, Seat] = [
  { x: -3.3, z: -0.1, yaw: -Math.PI / 2 },
  { x: 0, z: -2.7, yaw: Math.PI },
  { x: 3.3, z: -0.1, yaw: Math.PI / 2 },
];

export const DECK = { x: -1.5, z: -0.7, yaw: 0.1, n: 36, step: 0.024 } as const;
export const DECK_TOP = DECK.n * DECK.step;
export const PILE = { x: 0.6, z: -0.5 } as const;
export const VEIL = { x: -0.75, z: 0.9, yaw: 0.22 } as const;
export const PRINT = { text: "KRYPHOCHROMA", x: 0, z: 0.94, w: 4.9, d: 1.36, ink: 0.46 } as const;
