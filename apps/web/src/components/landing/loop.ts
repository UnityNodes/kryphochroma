import { updateCards } from "./choreography";
import { BASE_ASPECT, INTRO, LAMP_INTENSITY, PORTRAIT_ASPECT, SOFT_SCALE, STABLE_MS, STALE_MS, VIOLET_INTENSITY } from "./constants";
import { forcedHover, forcedIntro, forcedShot, forcesHq, readDebug } from "./debug";
import { seg, smooth } from "./ease";
import { handPlaneHit, pickHandAt } from "./layout";
import { updateOverlay } from "./overlay";
import { PORTRAIT, WIDE, fitFov, framePose } from "./pose";
import { type Rig, type Room, SHOT_KEYS } from "./state";

const IDLE_STEP = 0.0003;
const POINTER_STEP = 0.002;
const HOVER_STEP = 0.004;

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

function pickHand(room: Room, rig: Rig): number {
  room.ray.setFromCamera(room.ndc, rig.camera);
  const { origin, direction } = room.ray.ray;
  if (!handPlaneHit(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, room.hit)) return -1;
  return pickHandAt(room.hit.x, room.hit.z, rig.hand, room.held);
}

function aimCamera(room: Room, rig: Rig): void {
  const frame = room.cur;
  const camera = rig.camera;
  camera.position.set(frame.px + room.px * 0.14, frame.py + room.py * 0.05, frame.pz);
  camera.lookAt(frame.tx, frame.ty, frame.tz);
  camera.fov = fitFov(frame.fov, room.W / room.H, room.portrait ? PORTRAIT_ASPECT : BASE_ASPECT);
  camera.setViewOffset(room.W, room.H, -frame.ox * room.W, -frame.oy * room.H, room.W, room.H);
  camera.updateMatrixWorld();
}

function aimLights(room: Room, rig: Rig, shot: number, closing: boolean): void {
  const frame = room.cur;
  const sway = room.still || room.lite ? 0 : 1;
  rig.spot.target.position.set(
    frame.lx + room.px * 0.55 + Math.sin(room.time * 0.8) * 0.07 * sway,
    0,
    frame.lz - room.py * 0.4 + Math.cos(room.time * 0.63) * 0.05 * sway,
  );
  rig.spot.intensity = LAMP_INTENSITY * frame.lamp;
  rig.violet.intensity = closing ? 0 : VIOLET_INTENSITY * smooth(seg(shot, 6.22, 6.46)) * (1 - smooth(seg(shot, 6.8, 6.98)));
}

function easeHover(room: Room, rig: Rig, dt: number): void {
  if (room.pdirty) {
    room.pdirty = false;
    room.held = room.hover;
    room.hover = -1;
    if (!room.portrait && room.pin) room.hover = pickHand(room, rig);
  }
  const forced = forcedHover(readDebug(window));
  if (forced !== null) room.hover = forced;
  const k = room.soft ? 1 : 1 - Math.exp(-dt * 9);
  let busy = false;
  for (let i = 0; i < rig.hand.length; i++) {
    const card = rig.hand[i];
    if (!card) continue;
    const gap = (i === room.hover ? 1 : 0) - card.hover;
    card.hover += gap * k;
    if (gap > HOVER_STEP || gap < -HOVER_STEP) busy = true;
  }
  room.busy = busy;
}

export function draw(room: Room, rig: Rig, elapsed: number, dt: number, scroll: number, close: number): void {
  const shot = room.still ? 0 : scroll;
  const closeProgress = room.still ? 0 : close;
  const t = room.still || room.soft ? INTRO : elapsed;
  const closing = closeProgress > 0.0005;
  framePose(room.cur, shot, closing, closeProgress, room.portrait ? PORTRAIT : WIDE);
  const k = room.soft ? 1 : 1 - Math.exp(-dt * 5);
  room.px += (room.ptx - room.px) * k;
  room.py += (room.pty - room.py) * k;

  aimCamera(room, rig);
  aimLights(room, rig, shot, closing);
  easeHover(room, rig, dt);
  room.lastT = shot;
  room.lastC = closeProgress;
  room.force = false;

  updateCards(rig, room.slot, t, shot, closing);
  if (room.overlay) updateOverlay(room.overlay, room.cur, rig.camera, room.vec, room.W, room.H, shot, !closing && !room.still);
  rig.renderer.render(rig.scene, rig.camera);
}

export function resize(room: Room): void {
  const rig = room.rig;
  if (!rig) return;
  const width = room.stageEl.clientWidth;
  const height = room.stageEl.clientHeight;
  if (width < 2 || height < 2) return;
  room.portrait = room.mq.matches;
  room.W = width;
  room.H = height;
  let ratio = Math.min(window.devicePixelRatio || 1, room.portrait ? 1.25 : 1.75);
  if (room.soft) {
    if (width * height > 500000) ratio = SOFT_SCALE;
  } else if (room.lite) {
    ratio = room.tier > 0 ? 0.7 : Math.min(ratio, 1);
  }
  rig.renderer.setPixelRatio(ratio);
  rig.renderer.setSize(width, height, false);
  room.force = true;
  if (room.ready && room.still) draw(room, rig, INTRO, 0, 0, 0);
}

function downgradeIfSlow(room: Room, cost: number): void {
  room.slow = cost > (room.lite ? 110 : 50) ? room.slow + 1 : room.slow > 0 ? room.slow - 1 : 0;
  if (room.slow > 24 && room.tier < 1) {
    room.tier = room.lite ? 1 : 0;
    room.lite = true;
    room.slow = 0;
    resize(room);
  }
}

function canSkipFrame(room: Room, now: number, shot: number, close: number): boolean {
  if (!room.lite || room.force) return false;
  if (!room.busy && !room.pdirty && Math.abs(shot - room.lastT) < IDLE_STEP && Math.abs(close - room.lastC) < IDLE_STEP && Math.abs(room.ptx - room.px) < POINTER_STEP && Math.abs(room.pty - room.py) < POINTER_STEP) return true;
  if (!room.soft) return false;
  if (shot !== room.seenT || close !== room.seenC) {
    room.seenT = shot;
    room.seenC = close;
    room.moved = now;
  }
  return now - room.moved < STABLE_MS && now - room.drawn < STALE_MS;
}

function scrollShot(room: Room): number {
  let shot = 0;
  if (room.soft && room.closeTrig) {
    for (const trigger of room.trig) shot += trigger.progress;
  } else {
    for (const key of SHOT_KEYS) shot += room.prog[key];
  }
  return shot;
}

export function tick(room: Room, now: number): void {
  const rig = room.rig;
  if (!rig) return;
  room.raf = requestAnimationFrame(room.step);
  const cost = now - room.last;
  const measured = room.drew && now - room.t0 > INTRO * 1000 + 1000;
  room.drew = false;
  room.last = now;
  if (!room.ready || room.docHidden || !room.onstage) return;
  const debug = readDebug(window);
  const pinned = forcedShot(debug);
  const shot = pinned ?? scrollShot(room);
  const close = pinned !== null ? 0 : room.soft && room.closeTrig ? room.closeTrig.progress : room.prog.c;
  if (measured && !room.soft && !forcesHq(debug)) downgradeIfSlow(room, cost);
  if (canSkipFrame(room, now, shot, close)) return;
  const dt = Math.min(Math.max((now - room.drawn) / 1000, 0), 0.1);
  room.drawn = now;
  room.drew = true;
  room.time += dt;
  draw(room, rig, forcedIntro(debug) ?? (now - room.t0) / 1000, dt, shot, close);
}

export function startLoop(room: Room): () => void {
  const resizer = new ResizeObserver(() => resize(room));
  resizer.observe(room.stageEl);
  resize(room);

  const seen = new Map<Element, boolean>();
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      let any = false;
      for (const on of seen.values()) if (on) any = true;
      room.onstage = any;
    },
    { rootMargin: "10% 0px 10% 0px" },
  );
  for (const section of room.root.querySelectorAll("[data-shot], [data-close]")) watcher.observe(section);

  const onVisibility = () => {
    room.docHidden = document.hidden;
  };
  const onPointer = (event: PointerEvent) => {
    const rect = room.stageEl.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    room.pin = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1;
    room.ndc.set(nx, ny);
    room.ptx = clampUnit(nx);
    room.pty = clampUnit(ny);
    room.pdirty = true;
  };
  const onLeave = () => {
    room.pin = false;
    room.pdirty = true;
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (!room.still) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }

  return () => {
    cancelAnimationFrame(room.raf);
    resizer.disconnect();
    watcher.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
  };
}
