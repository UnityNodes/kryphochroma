import { CARD_H, CARD_W, HAND_SIZE, HAND_SPACING, HAND_Y, HAND_Z, NUDGE, RIVAL_SPACING, type Seat } from "./constants";

export interface Slot {
  x: number;
  z: number;
  yaw: number;
}

export interface RestCard {
  readonly rest: boolean;
  readonly rx: number;
  readonly rz: number;
  readonly ryaw: number;
}

export interface TablePoint {
  x: number;
  z: number;
}

export function handSlot(slot: number, count: number, out: Slot): void {
  const off = slot - (count - 1) / 2;
  out.x = off * HAND_SPACING;
  out.z = HAND_Z + 0.03 * off * off;
  out.yaw = -off * 0.045;
}

export function seatSlot(seat: Seat, slot: number, out: Slot): void {
  const off = (slot - (HAND_SIZE - 1) / 2) * RIVAL_SPACING;
  out.x = seat.x + Math.cos(seat.yaw) * off;
  out.z = seat.z - Math.sin(seat.yaw) * off;
  out.yaw = seat.yaw;
}

export function handPlaneHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: TablePoint): boolean {
  if (dy > -0.0001) return false;
  const k = (HAND_Y - oy) / dy;
  out.x = ox + dx * k;
  out.z = oz + dz * k;
  return true;
}

/** The card under the pointer is found from where each hand card rests, not from where it is drawn: a card that moves when hovered would otherwise slide out from under the pointer and flicker. The card already held keeps the strip it slid out of. */
export function pickHandAt(x: number, z: number, cards: readonly RestCard[], held: number): number {
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (!card || !card.rest) continue;
    const dx = x - card.rx;
    const dz = z - card.rz;
    const cos = Math.cos(card.ryaw);
    const sin = Math.sin(card.ryaw);
    const across = dx * cos - dz * sin;
    const along = -dx * sin - dz * cos;
    if (Math.abs(across) <= CARD_W / 2 && along >= -CARD_H / 2 && along <= CARD_H / 2 + (i === held ? NUDGE : 0)) return i;
  }
  return -1;
}
