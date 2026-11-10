import { cardBack, cardFace } from "@kryphochroma/cards";
import { type GameEvent, type GameState } from "@kryphochroma/rules";
import { animate } from "motion";
import { HUMAN } from "./offline";

export const MS = { deal: 380, stagger: 70, play: 540, draw: 440 } as const;
const ARC_PX = 50;
const PEAK_SCALE = 1.12;
const REDUCED_FACTOR = 0.25;

export type Anchors = Map<string, HTMLElement>;

export const anchorKey = {
  hand: (slot: number) => `hand-${slot}`,
  handBox: "hand-box",
  fan: (seat: number) => `fan-${seat}`,
  deck: "deck",
  pile: "pile",
} as const;

function factor(): number {
  if (typeof window === "undefined") return 1;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? REDUCED_FACTOR : 1;
}

interface Flight {
  readonly front: string | null;
  readonly back: string | null;
  readonly from: DOMRect;
  readonly to: DOMRect;
  readonly rotateTo: number;
  readonly flip: boolean;
  readonly duration: number;
  readonly delay: number;
}

async function fly(flight: Flight): Promise<void> {
  const el = document.createElement("div");
  el.className = "kc-flyer";
  const faces = [flight.front ? `<div class="kc-f">${flight.front}</div>` : "", flight.back ? `<div class="kc-f${flight.front ? " kc-bk" : ""}">${flight.back}</div>` : ""];
  el.innerHTML = `<div class="kc-in">${faces.join("")}</div>`;
  document.body.append(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const at = (r: DOMRect) => ({ x: r.left + r.width / 2 - w / 2, y: r.top + r.height / 2 - h / 2, s: r.width / w });
  const a = at(flight.from);
  const b = at(flight.to);
  const peakY = Math.min(a.y, b.y) - ARC_PX;
  const k = factor();
  const options = { duration: (flight.duration * k) / 1000, delay: (flight.delay * k) / 1000, ease: [0.3, 0.7, 0.2, 1] as const };
  const moves: Promise<unknown>[] = [
    animate(el, { x: [a.x, (a.x + b.x) / 2, b.x], y: [a.y, peakY, b.y], scale: [a.s, Math.max(a.s, b.s) * PEAK_SCALE, b.s], rotate: [0, flight.rotateTo / 2 - 8, flight.rotateTo] }, options).finished,
  ];
  const inner = el.firstElementChild;
  if (flight.flip && inner instanceof HTMLElement) {
    moves.push(animate(inner, { rotateY: [180, 0] }, { ...options, ease: "easeInOut" }).finished);
  }
  await Promise.all(moves);
  el.remove();
}

export function pileTilt(index: number): number {
  return ((index * 73) % 35) - 17;
}

function rectOf(anchors: Anchors, key: string): DOMRect | null {
  return anchors.get(key)?.getBoundingClientRect() ?? null;
}

function centered(rect: DOMRect, width: number, height: number): DOMRect {
  return new DOMRect(rect.left + rect.width / 2 - width / 2, rect.top + rect.height / 2 - height / 2, width, height);
}

const MINI_SCALE = 0.55;

export async function animateEvents(before: GameState, after: GameState, events: readonly GameEvent[], anchors: Anchors, colorBlind: boolean): Promise<void> {
  const deck = rectOf(anchors, anchorKey.deck);
  const pile = rectOf(anchors, anchorKey.pile);
  if (!deck || !pile) return;
  const draws: Promise<void>[] = [];
  let drawIndex = 0;
  let pileIndex = before.pub.discard.length;
  for (const event of events) {
    if (event.type === "Played") {
      await Promise.all(draws.splice(0));
      const source = event.seat === HUMAN ? anchors.get(anchorKey.hand(event.slot)) : anchors.get(anchorKey.fan(event.seat));
      const raw = source?.getBoundingClientRect();
      if (!raw) continue;
      const from = event.seat === HUMAN ? raw : centered(raw, pile.width * MINI_SCALE, pile.height * MINI_SCALE);
      if (event.seat === HUMAN && source) source.style.visibility = "hidden";
      await fly({
        front: cardFace(event.card, { colorBlind }),
        back: event.seat === HUMAN ? null : cardBack(),
        from,
        to: pile,
        rotateTo: pileTilt(pileIndex++),
        flip: event.seat !== HUMAN,
        duration: MS.play,
        delay: 0,
      });
    } else if (event.type === "Drew") {
      const zone = event.seat === HUMAN ? rectOf(anchors, anchorKey.handBox) : rectOf(anchors, anchorKey.fan(event.seat));
      if (!zone) continue;
      const scale = event.seat === HUMAN ? 1 : MINI_SCALE;
      const target = centered(zone, deck.width * scale, deck.height * scale);
      const card = event.seat === HUMAN ? (after.hands[HUMAN]?.[event.slot] ?? null) : null;
      draws.push(
        fly({
          front: card === null ? null : cardFace(card, { colorBlind }),
          back: cardBack(),
          from: deck,
          to: target,
          rotateTo: 0,
          flip: card !== null,
          duration: MS.draw,
          delay: MS.stagger * drawIndex++,
        }),
      );
    }
  }
  await Promise.all(draws);
}
