import type { Camera, Vector3 } from "three";
import type { CardBody } from "./cards";
import { CARD_H, CARD_T, CARD_W } from "./constants";
import { type Anchor, type Layout, rivalSpots } from "./layout";
import type { Targets } from "./targets";

const SEAL_GAP = 0.16;
const SEAL_MARGIN = 56;

export interface OverlayView {
  readonly root: HTMLElement;
  readonly seal: HTMLElement;
  readonly camera: Camera;
  readonly scratch: Vector3;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function px(value: number): string {
  return `${value.toFixed(1)}px`;
}

function project(view: OverlayView, layout: Layout, x: number, y: number, z: number): { x: number; y: number } {
  view.scratch.set(x, y, z).project(view.camera);
  return { x: (view.scratch.x * 0.5 + 0.5) * layout.W, y: (0.5 - view.scratch.y * 0.5) * layout.H };
}

function boxOf(view: OverlayView, layout: Layout, cx: number, cz: number, y0: number, y1: number): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const y of [y0, y1]) {
    for (const dx of [-CARD_W / 2, CARD_W / 2]) {
      for (const dz of [-CARD_H / 2, CARD_H / 2]) {
        const at = project(view, layout, cx + dx, y, cz + dz);
        box.minX = Math.min(box.minX, at.x);
        box.minY = Math.min(box.minY, at.y);
        box.maxX = Math.max(box.maxX, at.x);
        box.maxY = Math.max(box.maxY, at.y);
      }
    }
  }
  return box;
}

function fit(el: HTMLElement | null, box: Box): void {
  if (!el) return;
  el.style.transform = `translate3d(${px(box.minX)},${px(box.minY)},0)`;
  el.style.width = px(box.maxX - box.minX);
  el.style.height = px(box.maxY - box.minY);
  el.dataset.placed = "1";
}

function pin(view: OverlayView, layout: Layout, el: HTMLElement | null, anchor: Anchor): void {
  if (!el) return;
  const at = project(view, layout, anchor.x, anchor.y, anchor.z);
  el.style.transform = `translate3d(${px(at.x)},${px(at.y)},0)`;
  el.dataset.align = anchor.align;
  el.dataset.far = anchor.far ? "1" : "0";
  el.dataset.placed = "1";
}

/** The name plates, the deck button and the label of the pile are the same DOM the 2D table uses. Here they are only moved: each is pinned to the point of the table it belongs to, as the camera sees it this frame. */
export function placeOverlay(view: OverlayView, layout: Layout, targets: Targets, rivals: number, sealed: CardBody | null): void {
  const spots = rivalSpots(layout, rivals);
  targets.rows.forEach((row, i) => {
    const spot = i < rivals ? spots[i] : layout.seatNear;
    if (spot) pin(view, layout, view.root.querySelector<HTMLElement>(`.kc-seat[data-seat="${row.seat}"]`), spot.plate);
  });
  fit(view.root.querySelector<HTMLElement>("button.kc-deck"), boxOf(view, layout, layout.deck.x, layout.deck.z, 0, targets.deck.topY + CARD_T));
  const pileTop = targets.pile.cards[targets.pile.cards.length - 1]?.lie.y ?? 0;
  fit(view.root.querySelector<HTMLElement>(".kc-pile"), boxOf(view, layout, layout.pile.x, layout.pile.z, pileTop, pileTop));

  if (view.seal.hidden !== !sealed) view.seal.hidden = !sealed;
  if (!sealed) return;
  view.scratch.set(0, CARD_H / 2 + SEAL_GAP, 0).applyQuaternion(sealed.group.quaternion).add(sealed.group.position).project(view.camera);
  const x = Math.max(SEAL_MARGIN, Math.min(layout.W - SEAL_MARGIN, (view.scratch.x * 0.5 + 0.5) * layout.W));
  view.seal.style.transform = `translate3d(${px(x)},${px((0.5 - view.scratch.y * 0.5) * layout.H)},0)`;
}
