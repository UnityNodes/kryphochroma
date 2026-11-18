import type { Runtime } from "./runtime";

const SCRUB_PX = 10;
const CLICK_SLOP_PX = 8;

export interface InputDom {
  readonly root: HTMLElement;
  readonly host: HTMLElement;
}

function mirrorButton(root: HTMLElement, slot: number): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`.kc-hand button[data-slot="${slot}"]`);
}

function slotOf(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const value = target.closest<HTMLElement>(".kc-hand button[data-slot]")?.dataset.slot;
  return value === undefined ? null : Number(value);
}

/** Pointer, touch and keyboard all end in a click on the hidden hand button of that card, so the fan can never play a card the buttons would not: the colour picker, the spyglass and the veil open exactly as they do from the 2D hand. A mouse plays the card it points at. A finger raises a card first and plays it on the second tap, and a sideways drag runs along a crowded fan. */
export function bindInput(dom: InputDom, table: Runtime): () => void {
  const { root, host } = dom;
  let down: { x: number; y: number } | null = null;
  let scrub = false;
  let tapPlay = false;
  let tapDeck = false;
  let inside = false;
  const point = { x: 0, y: 0 };

  const locate = (event: PointerEvent): boolean => {
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    point.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    point.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    inside = Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    return true;
  };
  const pick = (shown: boolean): number | null => (inside ? table.pick(point.x, point.y, shown) : null);
  const deck = (): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>("button.kc-deck");
  const onDeck = (): boolean => inside && table.overDeck(point.x, point.y);
  const play = (slot: number | null): void => {
    if (slot === null) return;
    if (!table.playable(slot)) table.refuse(slot);
    mirrorButton(root, slot)?.click();
  };

  const onMove = (event: PointerEvent): void => {
    if (!locate(event)) return;
    if (event.pointerType === "mouse") {
      table.pointer(Math.max(-1, Math.min(1, point.x)), Math.max(-1, Math.min(1, point.y)));
      const slot = pick(false);
      if (slot !== null || table.focus().source === "mouse") table.setFocus(slot, "mouse");
      host.style.cursor = (slot !== null && table.playable(slot)) || (slot === null && onDeck() && deck()?.disabled === false) ? "pointer" : "";
    } else if (down) {
      if (Math.abs(event.clientX - down.x) > SCRUB_PX) scrub = true;
      const slot = scrub ? pick(false) : null;
      if (slot !== null) table.setFocus(slot, "touch");
    }
  };
  const onDown = (event: PointerEvent): void => {
    if (!locate(event)) return;
    down = { x: event.clientX, y: event.clientY };
    scrub = false;
    tapPlay = false;
    tapDeck = onDeck();
    if (event.pointerType === "mouse") return;
    const slot = pick(true);
    if (slot !== null && slot === table.focus().slot) tapPlay = true;
    else table.setFocus(slot ?? pick(false), "touch");
    tapDeck = tapDeck && table.focus().slot === null;
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
  };
  const onUp = (event: PointerEvent): void => {
    if (!down) return;
    locate(event);
    const from = down;
    down = null;
    if (event.pointerType === "mouse") {
      if (Math.abs(event.clientX - from.x) > CLICK_SLOP_PX || Math.abs(event.clientY - from.y) > CLICK_SLOP_PX) return;
      const slot = pick(false);
      if (slot !== null) play(slot);
      else if (tapDeck && onDeck()) deck()?.click();
    } else if (!scrub && tapPlay) {
      play(table.focus().slot);
    } else if (!scrub && tapDeck && onDeck()) {
      deck()?.click();
    }
  };
  const onCancel = (): void => {
    down = null;
  };
  const onLeave = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") return;
    inside = false;
    table.pointer(0, 0);
    if (table.focus().source === "mouse") table.setFocus(null, "");
  };
  const onFocusIn = (event: FocusEvent): void => {
    const slot = slotOf(event.target);
    if (slot !== null) table.setFocus(slot, "kbd");
  };
  const onFocusOut = (event: FocusEvent): void => {
    if (table.focus().source === "kbd" && slotOf(event.relatedTarget) === null) table.setFocus(null, "");
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && table.focus().source !== "kbd") table.setFocus(null, "");
  };

  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onCancel);
  host.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  window.addEventListener("keydown", onKey);
  return () => {
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerdown", onDown);
    host.removeEventListener("pointerup", onUp);
    host.removeEventListener("pointercancel", onCancel);
    host.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    window.removeEventListener("keydown", onKey);
    host.style.cursor = "";
  };
}
