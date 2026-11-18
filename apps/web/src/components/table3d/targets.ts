import type { Card } from "@kryphochroma/rules";
import { seeded } from "../landing/random";
import { CARD_T, DECK_GAP, DECK_PER_CARD, DECK_SLAB, DECK_SLABS, LIFT_HOVER, LIFT_HOVER_BACK, LIFT_PLAYABLE, LIFT_SEALED, PILE_BASE_MAX, PILE_SHOWN, PILE_STEP } from "./constants";
import { type Layout, type Lie, type SeatSpot, type Vec3, backOffset, backRowCount, rivalSpots, rowHit, rowLayout, rowPlanePoint, seatRow, seatSlot } from "./layout";
import type { HandCard, RowModel, TableModel } from "./model";

const ROW_JITTER = 0.06;
const PILE_SCATTER = { x: 0.16, z: 0.14, yaw: 0.9 } as const;

export interface FanSpot {
  readonly slot: number;
  readonly card: Card;
  readonly x: number;
  readonly lift: number;
  readonly restLift: number;
  readonly roll: number;
  readonly row: 0 | 1;
  readonly sealed: boolean;
  readonly playable: boolean;
}

export interface RowTarget {
  readonly seat: number;
  readonly spots: readonly Lie[];
}

export interface PileSpot {
  readonly index: number;
  readonly card: Card;
  readonly faceDown: boolean;
  readonly lie: Lie;
}

export interface DeckTarget {
  readonly slabs: number;
  readonly topY: number;
  readonly top: Lie | null;
}

export interface Targets {
  readonly fan: readonly FanSpot[];
  readonly back: number;
  readonly rows: readonly RowTarget[];
  readonly deck: DeckTarget;
  readonly pile: { readonly base: number; readonly cards: readonly PileSpot[] };
}

function fanRow(layout: Layout, cards: readonly HandCard[], row: 0 | 1, focus: number | null): FanSpot[] {
  const placed = rowLayout(layout.fan, cards.length, cards.findIndex((c) => c.slot === focus));
  return cards.map((c, i) => {
    const sealed = c.card < 0;
    const restLift = (c.playable ? LIFT_PLAYABLE : 0) + (sealed ? LIFT_SEALED : 0);
    const lift = c.slot === focus ? (row === 1 ? LIFT_HOVER_BACK : LIFT_HOVER) + (sealed ? LIFT_SEALED : 0) : restLift;
    return { slot: c.slot, card: c.card, x: placed.xs[i] ?? 0, lift, restLift, roll: placed.roll, row, sealed, playable: c.playable };
  });
}

function rowOf(spot: SeatSpot, row: RowModel, order: number): RowTarget {
  const shape = seatRow(spot, row.count);
  const rnd = seeded(101 + order * 977);
  const spots: Lie[] = [];
  for (let j = 0; j < row.count; j++) {
    const lie = seatSlot(spot, shape, j, row.count);
    lie.yaw += (rnd() - 0.5) * ROW_JITTER;
    spots.push(lie);
  }
  return { seat: row.seat, spots };
}

export function deckTarget(layout: Layout, count: number): DeckTarget {
  const slabs = count > 0 ? Math.max(1, Math.min(DECK_SLABS, Math.ceil((count * DECK_PER_CARD) / DECK_SLAB))) : 0;
  const topY = slabs * DECK_SLAB;
  return { slabs, topY, top: count > 0 ? { x: layout.deck.x, y: topY + CARD_T / 2 + DECK_GAP, z: layout.deck.z, yaw: layout.deck.yaw, flip: Math.PI } : null };
}

/** A pile card lies where its place in the discard says, so the same card rests the same way after a resize or a switch of view. */
export function pileLie(layout: Layout, index: number, hidden: number, base: number, faceDown: boolean): Lie {
  const rnd = seeded(7919 * (index + 1));
  rnd();
  return {
    x: layout.pile.x + (rnd() - 0.5) * PILE_SCATTER.x,
    y: base + CARD_T / 2 + (index - hidden) * PILE_STEP,
    z: layout.pile.z + (rnd() - 0.5) * PILE_SCATTER.z,
    yaw: (rnd() - 0.5) * PILE_SCATTER.yaw,
    flip: faceDown ? Math.PI : 0,
  };
}

/** Where every card belongs for a given state of the game and size of the view. The scene eases toward this; the events only decide how a card travels there. */
export function targetsOf(model: TableModel, layout: Layout, focus: number | null): Targets {
  const backCount = backRowCount(model.hand.length, layout.fan.per);
  const backRow = fanRow(layout, model.hand.slice(0, backCount), 1, focus);
  const frontRow = fanRow(layout, model.hand.slice(backCount), 0, focus);
  const spots = rivalSpots(layout, model.rivals.length);
  const rows = model.rivals.flatMap((row, i) => {
    const spot = spots[i];
    return spot ? [rowOf(spot, row, i)] : [];
  });
  if (model.own) rows.push(rowOf(layout.seatNear, model.own, spots.length));
  const hidden = Math.max(0, model.pile.length - PILE_SHOWN);
  const base = Math.min(hidden * DECK_PER_CARD, PILE_BASE_MAX);
  const top = model.pile.length - 1;
  return {
    fan: [...backRow, ...frontRow],
    back: backOffset(frontRow[0]?.roll ?? 0, backRow[0]?.roll ?? 0),
    rows,
    deck: deckTarget(layout, model.deck),
    pile: {
      base,
      cards: model.pile.slice(hidden).map((card, i) => {
        const index = hidden + i;
        const faceDown = model.veiled && index === top;
        return { index, card, faceDown, lie: pileLie(layout, index, hidden, base, faceDown) };
      }),
    },
  };
}

/** The fan card a ray from the camera lands on, front row first. Pass the fan at rest and the held slot to keep a raised card under a moving pointer; pass the fan as it is shown and no held slot for a tap, because a finger lands on what the eye sees. */
export function pickSlot(layout: Layout, targets: Targets, origin: Vec3, dir: Vec3, held: number | null, shown: boolean): number | null {
  for (const row of [0, 1] as const) {
    const spots = targets.fan.filter((spot) => spot.row === row);
    if (spots.length === 0) continue;
    const point = rowPlanePoint(layout.fan, row, targets.back, origin, dir);
    if (!point) continue;
    const hit = rowHit(
      layout.fan,
      spots.map((spot) => spot.x),
      spots.map((spot) => (shown ? spot.lift : spot.restLift)),
      point.x,
      point.y,
      spots.findIndex((spot) => spot.slot === held),
      row === 1 ? LIFT_HOVER_BACK : LIFT_HOVER,
    );
    const spot = spots[hit];
    if (spot) return spot.slot;
  }
  return null;
}
