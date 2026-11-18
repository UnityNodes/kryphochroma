import type { PerspectiveCamera, Vector3 } from "three";
import { PEEK_SEAT, PEEK_SLOT, SEATS, SONAR_COUNT, SONAR_SEAT, SPYGLASS_SHOT, VEIL, VEIL_SHOT } from "./constants";
import { need } from "./dom";
import { seg, smooth } from "./ease";
import { seatSlot } from "./layout";
import { type Frame, poseAt } from "./pose";
import type { Overlay } from "./state";

const SHOWN_STEP = 0.004;

export function createOverlay(root: HTMLElement): Overlay {
  const peeked = { x: 0, z: 0, yaw: 0 };
  seatSlot(SEATS[PEEK_SEAT], PEEK_SLOT, peeked);
  const spy = poseAt(SPYGLASS_SHOT);
  const lookX = spy.tx - spy.px;
  const lookZ = spy.tz - spy.pz;
  const lookLength = Math.hypot(lookX, lookZ);
  const veil = poseAt(VEIL_SHOT);
  const towardX = veil.px - VEIL.x;
  const towardZ = veil.pz - VEIL.z;
  const towardLength = Math.hypot(towardX, towardZ);
  const sonar = SEATS[SONAR_SEAT];
  return {
    tags: [
      { el: need(root, ".br-tag--veil"), x: VEIL.x + (towardX / towardLength) * 0.85, y: 0.02, z: VEIL.z + (towardZ / towardLength) * 0.85, fadeIn: [3.54, 3.64], fadeOut: [3.76, 3.86], shown: -1 },
      { el: need(root, ".br-tag--spy"), x: peeked.x + (-lookZ / lookLength) * 0.68, y: 0.92, z: peeked.z + (lookX / lookLength) * 0.68, fadeIn: [4.54, 4.62], fadeOut: [4.72, 4.8], shown: -1 },
      { el: need(root, ".br-tag--sonar"), x: sonar.x, y: 0.62, z: sonar.z, fadeIn: [5.34, 5.44], fadeOut: [5.74, 5.84], shown: -1 },
    ],
    countEl: need(root, "[data-count]"),
    scrimL: need(root, ".br-scrim--l"),
    scrimR: need(root, ".br-scrim--r"),
    shownL: -1,
    shownR: -1,
    count: -1,
  };
}

export function updateOverlay(overlay: Overlay, frame: Frame, camera: PerspectiveCamera, scratch: Vector3, width: number, height: number, shot: number, live: boolean): void {
  if (Math.abs(frame.scrimL - overlay.shownL) > SHOWN_STEP) {
    overlay.shownL = frame.scrimL;
    overlay.scrimL.style.opacity = frame.scrimL.toFixed(3);
  }
  if (Math.abs(frame.scrimR - overlay.shownR) > SHOWN_STEP) {
    overlay.shownR = frame.scrimR;
    overlay.scrimR.style.opacity = frame.scrimR.toFixed(3);
  }
  for (const tag of overlay.tags) {
    const shown = live ? smooth(seg(shot, tag.fadeIn[0], tag.fadeIn[1])) * (1 - smooth(seg(shot, tag.fadeOut[0], tag.fadeOut[1]))) : 0;
    if (shown > 0.001) {
      scratch.set(tag.x, tag.y, tag.z).project(camera);
      tag.el.style.transform = `translate3d(${((scratch.x * 0.5 + 0.5) * width).toFixed(1)}px,${((0.5 - scratch.y * 0.5) * height).toFixed(1)}px,0)`;
    }
    if (Math.abs(shown - tag.shown) > SHOWN_STEP) {
      tag.shown = shown;
      tag.el.style.opacity = shown.toFixed(3);
    }
  }
  const count = live ? Math.round(SONAR_COUNT * seg(shot, 5.4, 5.62)) : 0;
  if (count !== overlay.count) {
    overlay.count = count;
    overlay.countEl.textContent = String(count);
  }
}
