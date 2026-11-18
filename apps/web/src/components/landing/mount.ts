import { Raycaster, Vector2, Vector3 } from "three";
import { BAND_QUERY, INTRO, READY_TIMEOUT_MS } from "./constants";
import { forcesHq, readDebug } from "./debug";
import { need } from "./dom";
import { draw, startLoop, tick } from "./loop";
import { refreshMotion, setupMotion } from "./motion";
import { createOverlay } from "./overlay";
import { blankFrame } from "./pose";
import { createRig, disposeRig } from "./scene";
import type { Rig, Room } from "./state";
import { setupUi } from "./ui";

export interface MountOptions {
  readonly reducedMotion: boolean;
}

function createRoom(root: HTMLElement, reduced: boolean): Room {
  const room: Room = {
    root,
    stageEl: need(root, ".br-stage"),
    reduced,
    mq: window.matchMedia(BAND_QUERY),
    prog: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0, c: 0 },
    cur: blankFrame(),
    slot: { x: 0, z: 0, yaw: 0 },
    hit: { x: 0, z: 0 },
    vec: new Vector3(),
    ndc: new Vector2(),
    ray: new Raycaster(),
    trig: [],
    step: (now) => tick(room, now),
    closeTrig: null,
    rig: null,
    overlay: null,
    still: reduced,
    band: false,
    ready: false,
    onstage: true,
    docHidden: document.hidden,
    raf: 0,
    timer: 0,
    t0: 0,
    last: 0,
    time: 0,
    W: 2,
    H: 2,
    px: 0,
    py: 0,
    ptx: 0,
    pty: 0,
    pin: false,
    pdirty: false,
    hover: -1,
    held: -1,
    lite: false,
    soft: false,
    tier: -1,
    seenT: -9,
    seenC: -9,
    moved: 0,
    drawn: 0,
    drew: false,
    slow: 0,
    busy: false,
    force: true,
    lastT: -9,
    lastC: -9,
  };
  return room;
}

function buildScene(room: Room): boolean {
  room.band = room.mq.matches;
  const rig = createRig(room.stageEl, room.band, forcesHq(readDebug(window)));
  if (!rig) return false;
  room.rig = rig;
  room.soft = rig.soft;
  room.lite = rig.soft;
  try {
    room.overlay = createOverlay(room.root);
  } catch (error) {
    console.error(error);
    disposeRig(rig);
    room.rig = null;
    return false;
  }
  return true;
}

/** The first frame waits for the card faces so the deal is not played with blank cards, but never longer than a few seconds: a face that fails to load must not leave the table empty. */
function startWhenLoaded(room: Room, rig: Rig, isMounted: () => boolean): void {
  const go = () => {
    if (room.ready || !isMounted() || !room.rig) return;
    window.clearTimeout(room.timer);
    room.ready = true;
    room.t0 = performance.now();
    room.last = room.t0;
    room.drawn = room.t0;
    if (room.still) draw(room, rig, INTRO, 0, 0, 0);
    else room.raf = requestAnimationFrame(room.step);
    refreshMotion();
  };
  rig.manager.onLoad = go;
  room.timer = window.setTimeout(go, READY_TIMEOUT_MS);
}

function build(room: Room, teardowns: (() => void)[], isMounted: () => boolean): void {
  const root = room.root;
  root.classList.add("is-live");
  teardowns.push(setupUi(root, room.reduced));

  const hasScene = buildScene(room);
  teardowns.push(() => {
    if (room.rig) disposeRig(room.rig);
    room.rig = null;
    root.classList.remove("no-gl", "is-still");
  });
  if (!hasScene) {
    room.still = true;
    root.classList.add("no-gl");
  }
  if (room.still) root.classList.add("is-still");
  if (hasScene) teardowns.push(startLoop(room));
  teardowns.push(setupMotion(room));

  if (room.rig) startWhenLoaded(room, room.rig, isMounted);
  else refreshMotion();
  document.fonts.ready.then(() => {
    if (isMounted()) refreshMotion();
  });
}

export function mountLanding(root: HTMLElement, options: MountOptions): () => void {
  const room = createRoom(root, options.reducedMotion);
  const teardowns: (() => void)[] = [];
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    window.clearTimeout(room.timer);
    for (const teardown of teardowns.reverse()) teardown();
  };
  try {
    build(room, teardowns, () => mounted);
  } catch (error) {
    unmount();
    throw error;
  }
  return unmount;
}
