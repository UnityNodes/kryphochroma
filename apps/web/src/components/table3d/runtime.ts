import { HAND_START, cardOf } from "@kryphochroma/rules";
import { Box3, Raycaster, Vector2, Vector3 } from "three";
import { MS, REDUCED_FACTOR } from "@/game/flight";
import type { PlayingTransition } from "@/game/useTransitionQueue";
import { clamp01 } from "../landing/ease";
import { type CardBody, type Rows, createRows, lieHome, makeBody, setFace, stepBody } from "./cards";
import { BACK_RAISE, CARD_H, CARD_T, CARD_W } from "./constants";
import { type FrozenMoment, type TableDebug, forcedCamera, forcedHover, forcedLift, hidesFurniture, parseFreeze } from "./debug";
import { RISE, flightArrive, flightDeckToPile, flightDeckToRow, flightFanToPile, flightRowToPile, flightTurn } from "./flights";
import { type Frame, type Layout, type Lie, backRowCount, rivalSpots, solveLayout } from "./layout";
import { type TableModel, type TableMove, beginMove, endMove, planMoves } from "./model";
import { placeOverlay } from "./overlay";
import { fanPose } from "./pose";
import type { Stage } from "./stage";
import { type Targets, deckTarget, pickSlot, targetsOf } from "./targets";

const REVEAL_S = 0.74;
const TURN_S = 0.5;
const SHAKE_S = 0.42;
const DEAL_SPAN_S = 2.1;
const DEAL_STEP_S = 0.075;
const DEAL_FAN_S = 0.7;
const DEAL_ROW_S = 0.55;
const DEAL_TOP_S = 0.62;
const DEAL_PAUSE_S = 0.12;
const DRAW_ARC = 0.35;
const DEAL_ARC = 0.5;
const SWAY_HOLD_S = 6;
const PARALLAX = { x: 0.45, y: 0.2 } as const;
const KICK = 0.35;
const KICK_S = 0.95;
const LATE_MS = 50;
const LATE_FRAMES = 24;
const MAX_STEP_S = { soft: 1, gpu: 0.1 } as const;
const DEBUG_POLL_MS = 200;
const DECK_REACH = 0.06;

export interface TableInput {
  readonly model: TableModel;
  readonly playing: PlayingTransition | null;
  readonly shapes: boolean;
  readonly me: number;
}

export type FocusSource = "" | "mouse" | "touch" | "kbd";

export interface Runtime {
  readonly update: (input: TableInput) => void;
  readonly relayout: () => void;
  readonly setFocus: (slot: number | null, source: FocusSource) => void;
  readonly focus: () => { readonly slot: number | null; readonly source: FocusSource };
  readonly pick: (ndcX: number, ndcY: number, shown: boolean) => number | null;
  readonly overDeck: (ndcX: number, ndcY: number) => boolean;
  readonly playable: (slot: number) => boolean;
  readonly refuse: (slot: number) => void;
  readonly pointer: (x: number, y: number) => void;
  readonly setHidden: (hidden: boolean) => void;
  readonly wake: () => void;
  readonly dispose: () => void;
}

export interface RuntimeDom {
  readonly root: HTMLElement;
  readonly host: HTMLElement;
  readonly seal: HTMLElement;
  readonly frame: () => Frame;
}

interface Actor {
  readonly body: CardBody;
  readonly row: number;
  readonly index: number;
}

interface Pending {
  readonly move: TableMove;
  readonly at: number;
}

export function createRuntime(stage: Stage, dom: RuntimeDom, reduced: boolean, debug: TableDebug | undefined, first: TableInput): Runtime {
  const { scene, kit, camera } = stage;
  const rows: Rows = createRows(scene, kit);
  const hand = new Map<number, CardBody>();
  const pile = new Map<number, CardBody>();
  const actors = new Set<Actor>();
  const deckTop = makeBody(scene, kit);
  const ray = new Raycaster();
  const ndc = new Vector2();
  const deckBox = new Box3();
  const scratch = new Vector3();
  const overlay = { root: dom.root, seal: dom.seal, camera, scratch: new Vector3() };

  let input = first;
  let view: TableModel = first.model;
  let layout: Layout | null = null;
  let targets: Targets | null = null;
  let hiddenRows: number[] = [];
  let pending: Pending[] = [];
  let playedId = -1;
  let moveClock = 0;
  let generation = 0;
  let deckExtra = 0;
  let focusSlot: number | null = null;
  let focusSource: FocusSource = "";
  let frozen: FrozenMoment | null = null;
  let frozenKey: unknown;
  let viewKey = "";
  let time = 0;
  let last = 0;
  let raf = 0;
  let poll = 0;
  let hidden = document.hidden;
  let disposed = false;
  let snap = true;
  let force = true;
  let kick = 1;
  let swayUntil = 0;
  let slow = 0;
  let frames = 0;
  let px = 0;
  let py = 0;
  let ptx = 0;
  let pty = 0;

  const me = () => input.me;
  const cut = () => reduced || frozen !== null;

  function wake(): void {
    if (raf || hidden || disposed) return;
    raf = requestAnimationFrame(tick);
  }

  function drop(body: CardBody): void {
    scene.remove(body.group);
  }

  function clearCards(): void {
    for (const body of hand.values()) drop(body);
    for (const body of pile.values()) drop(body);
    for (const actor of actors) drop(actor.body);
    hand.clear();
    pile.clear();
    actors.clear();
    hiddenRows = [];
    pending = [];
    deckExtra = 0;
  }

  function rowIndexOf(model: TableModel, seat: number): number {
    const index = model.rivals.findIndex((row) => row.seat === seat);
    if (index >= 0) return index;
    return model.own?.seat === seat ? model.rivals.length : -1;
  }

  function rowCount(model: TableModel, row: number): number {
    return (row < model.rivals.length ? model.rivals[row]?.count : model.own?.count) ?? 0;
  }

  function isMine(seat: number): boolean {
    return view.own === null && seat === me();
  }

  function deckLie(): Lie {
    const active = layout;
    const top = active ? deckTarget(active, view.deck + deckExtra).top : null;
    return top ?? { x: active?.deck.x ?? 0, y: 0.02, z: active?.deck.z ?? 0, yaw: active?.deck.yaw ?? 0, flip: Math.PI };
  }

  function riseFor(model: TableModel): number {
    return layout && backRowCount(model.hand.length, layout.fan.per) > 0 ? RISE + BACK_RAISE + 0.12 : RISE;
  }

  function sameSeats(a: TableModel, b: TableModel): boolean {
    return a.rivals.length === b.rivals.length && a.rivals.every((row, i) => row.seat === b.rivals[i]?.seat) && (a.own === null) === (b.own === null);
  }

  function freshDeal(model: TableModel, before: TableModel | null): boolean {
    const dealt = model.rivals.every((row) => row.count === HAND_START) && (model.own ? model.own.count === HAND_START : model.hand.length === HAND_START);
    if (!dealt || model.pile.length === 0) return false;
    return before === null || before.round !== model.round || before.pile.length > model.pile.length;
  }

  /** A new round is dealt card by card off the deck, round the table, and the first card is turned onto the pile last. Nothing waits for it: the cards can be played as soon as the state says so. */
  function startDeal(model: TableModel): void {
    clearCards();
    const counts = [...model.rivals.map((row) => row.count), ...(model.own ? [model.own.count] : [])];
    const total = model.hand.length + counts.reduce((sum, count) => sum + count, 0);
    const step = Math.min(DEAL_STEP_S, DEAL_SPAN_S / Math.max(1, total));
    hiddenRows = [...counts];
    deckExtra = total + 1;
    const landed = () => {
      deckExtra = Math.max(0, deckExtra - 1);
    };
    let order = 0;
    for (let j = 0; j < Math.max(model.hand.length, ...counts); j++) {
      const mine = model.hand[j];
      if (mine) {
        const body = makeBody(scene, kit);
        setFace(body, kit, mine.card >= 0 ? mine.card : null, input.shapes);
        hand.set(mine.slot, body);
        flightArrive(body, { dur: DEAL_FAN_S, delay: order++ * step, from: deckLie(), rise: riseFor(model), arc: DEAL_ARC, done: landed });
      }
      counts.forEach((count, row) => {
        if (j >= count) return;
        const actor: Actor = { body: makeBody(scene, kit), row, index: j };
        actors.add(actor);
        flightDeckToRow(actor.body, deckLie(), {
          dur: DEAL_ROW_S,
          delay: order++ * step,
          done: () => {
            actors.delete(actor);
            drop(actor.body);
            hiddenRows[row] = Math.max(0, (hiddenRows[row] ?? 0) - 1);
            landed();
          },
        });
      });
    }
    const top = model.pile.length - 1;
    const topCard = model.pile[top];
    if (topCard === undefined) return;
    const body = makeBody(scene, kit);
    setFace(body, kit, topCard, input.shapes);
    body.faceDown = model.veiled;
    pile.set(top, body);
    flightDeckToPile(body, deckLie(), { dur: DEAL_TOP_S, delay: (order - 1) * step + DEAL_FAN_S + DEAL_PAUSE_S, done: landed });
  }

  function sync(model: TableModel): void {
    const before = view;
    generation++;
    for (const item of pending.splice(0)) runMove(item.move);
    if (!sameSeats(before, model)) clearCards();
    view = model;
    if (!cut() && !stage.soft && freshDeal(model, generation === 1 ? null : before)) startDeal(model);
    force = true;
  }

  function begin(playing: PlayingTransition): void {
    for (const item of pending.splice(0)) runMove(item.move);
    const plan = planMoves(playing.events, playing.after, me(), view.own !== null);
    const factor = reduced ? REDUCED_FACTOR : 1;
    pending = plan.moves.map((move) => ({ move, at: (move.at * factor) / 1000 }));
    moveClock = time;
  }

  function playMove(move: Extract<TableMove, { kind: "play" }>, seconds: number, settle: () => void): void {
    const index = view.pile.length;
    let body: CardBody;
    let flying = false;
    if (isMine(move.seat)) {
      const held = hand.get(move.slot);
      body = held ?? makeBody(scene, kit);
      hand.delete(move.slot);
      const interrupted = body.flight;
      body.flight = null;
      interrupted?.done?.();
      kick = 0;
      if (body.faceCard === null) setFace(body, kit, move.card, input.shapes);
      if (focusSlot === move.slot) focusSlot = null;
      if (held?.placed && seconds > 0) {
        const tall = body.row === 0 && (targets?.fan.some((spot) => spot.row === 1) ?? false);
        const spin = (index % 2 === 0 ? -1 : 1) * (0.7 + ((index * 37) % 50) / 100);
        flightFanToPile(body, tall, spin, { dur: seconds, done: settle });
        flying = true;
      }
    } else {
      const row = rowIndexOf(view, move.seat);
      const end = rowCount(view, row) - 1 - (hiddenRows[row] ?? 0);
      const from = rows.current(row, end) ?? targets?.rows[row]?.spots[end];
      body = makeBody(scene, kit);
      setFace(body, kit, move.card, input.shapes);
      if (from && seconds > 0) {
        flightRowToPile(body, { ...from }, { dur: seconds, done: settle });
        flying = true;
      }
    }
    body.faceDown = move.faceDown;
    body.sealedAt = -1;
    const covered = pile.get(index);
    if (covered) drop(covered);
    pile.set(index, body);
    view = beginMove(view, move, me());
    if (!flying) {
      body.flight = null;
      body.placed = false;
      settle();
    }
  }

  function drawMove(move: Extract<TableMove, { kind: "draw" }>, seconds: number, settle: () => void): void {
    const from = deckLie();
    view = beginMove(view, move, me());
    if (isMine(move.seat)) {
      const known = hand.get(move.slot);
      if (known) drop(known);
      const body = makeBody(scene, kit);
      hand.set(move.slot, body);
      if (seconds > 0) flightArrive(body, { dur: seconds, from, rise: riseFor(view), arc: DRAW_ARC, done: settle });
      else settle();
      return;
    }
    const row = rowIndexOf(view, move.seat);
    if (row < 0 || seconds <= 0) return;
    hiddenRows[row] = (hiddenRows[row] ?? 0) + 1;
    const actor: Actor = { body: makeBody(scene, kit), row, index: rowCount(view, row) - 1 };
    actors.add(actor);
    flightDeckToRow(actor.body, from, {
      dur: seconds,
      done: () => {
        if (!actors.delete(actor)) return;
        drop(actor.body);
        hiddenRows[row] = Math.max(0, (hiddenRows[row] ?? 0) - 1);
      },
    });
  }

  /** An event turned into movement. The model changes the moment the card leaves, so everything else closes up or makes room while it is in the air, and again when it lands. A landing that comes after the game has moved on changes nothing: the state it would have set is already there or already gone. */
  function runMove(move: TableMove): void {
    const born = generation;
    const seconds = cut() && frozen === null ? 0 : move.dur / 1000;
    const settle = () => {
      if (born === generation) view = endMove(view, move, me());
      force = true;
    };
    if (move.kind === "refill") view = beginMove(view, move, me());
    else if (move.kind === "play") playMove(move, seconds, settle);
    else drawMove(move, seconds, settle);
    force = true;
  }

  function reveal(body: CardBody): void {
    flightArrive(body, { dur: REVEAL_S, from: null, rise: riseFor(view), arc: 0 });
  }

  function reconcileHand(active: Layout, next: Targets): CardBody | null {
    let sealed: CardBody | null = null;
    for (const spot of next.fan) {
      let body = hand.get(spot.slot);
      if (!body) {
        body = makeBody(scene, kit);
        hand.set(spot.slot, body);
      }
      body.row = spot.row;
      if (spot.sealed && body.faceCard !== null) setFace(body, kit, null, input.shapes);
      if (!spot.sealed && body.faceCard !== spot.card && !body.flight) {
        const turning = body.faceCard === null && body.placed && !snap && !cut();
        setFace(body, kit, spot.card, input.shapes);
        if (turning) reveal(body);
      }
      const sealedLook = body.faceCard === null;
      if (sealedLook && !body.flight && body.placed) {
        if (body.sealedAt < 0) body.sealedAt = time;
        sealed = body;
      } else if (!sealedLook) {
        body.sealedAt = -1;
      }
      const wobble = sealedLook && body.sealedAt >= 0 && !cut() && !stage.lite ? 0.022 * Math.sin((time - body.sealedAt) * 7.5) : 0;
      const shaken = body.shake > 0 ? { ...spot, x: spot.x + 0.1 * Math.sin(body.shake * 44) * (body.shake / SHAKE_S) } : spot;
      fanPose(active.fan, shaken, next.back, sealedLook, wobble, body.home.p, body.home.q);
    }
    for (const [slot, body] of hand) {
      if (next.fan.some((spot) => spot.slot === slot)) continue;
      drop(body);
      hand.delete(slot);
    }
    return sealed;
  }

  function reconcilePile(next: Targets): void {
    for (const spot of next.pile.cards) {
      let body = pile.get(spot.index);
      if (!body) {
        body = makeBody(scene, kit);
        body.faceDown = spot.faceDown;
        pile.set(spot.index, body);
      }
      if (body.faceCard !== spot.card && !body.flight) setFace(body, kit, spot.card, input.shapes);
      if (body.faceDown !== spot.faceDown) {
        const turning = !body.flight && body.placed && !snap && !cut();
        body.faceDown = spot.faceDown;
        if (turning) flightTurn(body, { ...body.lie }, { dur: TURN_S });
      }
      body.lie = spot.lie;
      lieHome(body);
    }
    for (const [index, body] of pile) {
      if (body.flight || next.pile.cards.some((spot) => spot.index === index)) continue;
      drop(body);
      pile.delete(index);
    }
    stage.setPileBase(next.pile.base);
  }

  function reconcile(active: Layout): CardBody | null {
    const next = targetsOf(view, active, focusSlot);
    targets = next;
    const sealed = reconcileHand(active, next);
    reconcilePile(next);
    const deck = deckTarget(active, view.deck + deckExtra);
    stage.setDeck(deck.slabs);
    if (deck.top) {
      deckTop.lie = deck.top;
      lieHome(deckTop);
    } else {
      deckTop.placed = false;
    }
    deckTop.group.visible = deck.top !== null;
    for (const actor of actors) {
      const spot = next.rows[actor.row]?.spots[actor.index];
      if (!spot) continue;
      actor.body.lie = spot;
      lieHome(actor.body);
    }
    return sealed;
  }

  function stepCards(dt: number): boolean {
    const dones: (() => void)[] = [];
    let busy = false;
    const jump = snap || cut();
    for (const body of hand.values()) busy = stepBody(body, dt, jump, dones) || busy;
    for (const body of pile.values()) busy = stepBody(body, dt, jump, dones) || busy;
    for (const actor of actors) busy = stepBody(actor.body, dt, jump, dones) || busy;
    if (deckTop.group.visible) busy = stepBody(deckTop, dt, true, dones) || busy;
    busy = rows.step(targets?.rows.map((row) => row.spots) ?? [], hiddenRows, dt, jump) || busy;
    for (const done of dones) done();
    return (busy || dones.length > 0) && frozen === null;
  }

  function advance(seconds: number): void {
    const push = (body: CardBody) => {
      if (body.flight) body.flight.t += seconds;
    };
    for (const body of hand.values()) push(body);
    for (const body of pile.values()) push(body);
    for (const actor of actors) push(actor.body);
  }

  function settleFrame(): void {
    if (!layout) return;
    reconcile(layout);
    stepCards(0);
    snap = false;
  }

  /** Stills for checking on a machine that draws a frame a second: a moment of any move can be staged on the cards that are on the table and held there. While it is held the game underneath goes on, and the table catches up with it when the hold is lifted. */
  function applyFreeze(): void {
    frozenKey = debug?.freeze;
    const moment = parseFreeze(debug);
    frozen = null;
    focusSlot = null;
    focusSource = "";
    clearCards();
    view = input.model;
    generation++;
    snap = true;
    force = true;
    if (!moment || !layout) return;
    frozen = moment;
    if (moment.name === "deal") {
      startDeal(view);
      settleFrame();
      advance((DEAL_SPAN_S + DEAL_FAN_S + DEAL_TOP_S) * moment.at);
      return;
    }
    settleFrame();
    const rival = view.rivals[0]?.seat ?? -1;
    const slot = Math.max(-1, ...view.hand.map((card) => card.slot)) + 1;
    const color = view.color ?? 0;
    const duration = (move: TableMove) => (move.dur / 1000) * moment.at;
    if (moment.name === "play" || moment.name === "veil") {
      const card = view.hand.find((c) => c.playable) ?? view.hand[0];
      if (!card) return;
      const move: TableMove = { kind: "play", at: 0, dur: MS.play, seat: me(), slot: card.slot, card: card.card, faceDown: moment.name === "veil", color };
      runMove(move);
      settleFrame();
      advance(duration(move));
    } else if (moment.name === "rival" || moment.name === "rivaldraw") {
      const move: TableMove = moment.name === "rival" ? { kind: "play", at: 0, dur: MS.play, seat: rival, slot: 0, card: cardOf(color, 2), faceDown: false, color } : { kind: "draw", at: 0, dur: MS.draw, seat: rival, slot: 0, card: null };
      runMove(move);
      settleFrame();
      advance(duration(move));
    } else if (moment.name === "draw" || moment.name === "sealed" || moment.name === "reveal") {
      const move: TableMove = { kind: "draw", at: 0, dur: MS.draw, seat: me(), slot, card: null };
      runMove(move);
      settleFrame();
      advance(moment.name === "draw" ? duration(move) : move.dur / 1000);
      if (moment.name === "draw") return;
      settleFrame();
      if (moment.name === "sealed") return;
      const body = hand.get(slot);
      if (!body) return;
      view = { ...view, hand: view.hand.map((card) => (card.slot === slot ? { ...card, card: cardOf(color, 5) } : card)) };
      setFace(body, kit, cardOf(color, 5), input.shapes);
      reveal(body);
      settleFrame();
      advance(REVEAL_S * moment.at);
    }
  }

  function applyView(): void {
    const forced = forcedCamera(debug);
    viewKey = JSON.stringify([debug?.camera ?? 0, debug?.lift ?? 1, debug?.bare ?? 0]);
    camera.fov = forced?.fov ?? layout?.fov ?? camera.fov;
    camera.updateProjectionMatrix();
    stage.renderer.toneMappingExposure = forcedLift(debug);
    stage.showFurniture(!hidesFurniture(debug));
    dom.root.classList.toggle("kc-3d-bare", forced !== null);
    force = true;
  }

  function aim(active: Layout, kicking: number): void {
    scratch.set(active.pile.x - active.cam.x, -active.cam.y, active.pile.z - active.cam.z).normalize();
    camera.position.set(active.cam.x, active.cam.y, active.cam.z).addScaledVector(scratch, kicking);
    camera.position.x += px * PARALLAX.x;
    camera.position.y += py * PARALLAX.y;
    camera.lookAt(active.look.x, active.look.y, active.look.z);
    const forced = forcedCamera(debug);
    if (forced) {
      camera.position.set(...forced.p);
      camera.lookAt(...forced.t);
    }
    camera.updateMatrixWorld();
  }

  function tick(now: number): void {
    raf = 0;
    if (disposed || !layout) return;
    const active = layout;
    const late = last > 0 && now - last > LATE_MS;
    const dt = frozen ? 0 : last > 0 ? Math.min(stage.soft ? MAX_STEP_S.soft : MAX_STEP_S.gpu, (now - last) / 1000) : 1 / 60;
    last = now;
    if (debug && debug.freeze !== frozenKey) applyFreeze();
    if (debug && JSON.stringify([debug.camera ?? 0, debug.lift ?? 1, debug.bare ?? 0]) !== viewKey) applyView();
    const hover = forcedHover(debug);
    const hovered = hover === null ? focusSlot : (targets?.fan[hover]?.slot ?? focusSlot);
    if (hovered !== focusSlot) {
      focusSlot = hovered;
      force = true;
    }

    time += dt;
    while (frozen === null && pending[0] && pending[0].at <= time - moveClock) {
      const next = pending.shift();
      if (next) runMove(next.move);
    }

    const still = cut() || stage.soft;
    const ease = still ? 1 : 1 - Math.exp(-dt * 5);
    const moved = Math.abs(ptx - px) > 0.002 || Math.abs(pty - py) > 0.002;
    px += (ptx - px) * ease;
    py += (pty - py) * ease;

    const sealed = reconcile(active);
    const busy = stepCards(dt);
    snap = false;
    stage.setRing(view.color, cut() || stage.soft);
    const ringBusy = stage.stepRing(dt);
    const kicking = kick < 1 && !cut();
    if (kicking) kick = Math.min(1, kick + dt / KICK_S);
    if (busy) swayUntil = time + SWAY_HOLD_S;
    const sway = cut() || stage.lite ? 0 : clamp01((swayUntil - time) / 2);
    const wobbling = sealed !== null && !cut() && !stage.lite;
    const live = busy || ringBusy || moved || kicking || sway > 0 || wobbling;

    if (live || stage.dirty || force) {
      force = false;
      aim(active, cut() ? 0 : Math.sin(Math.PI * kick) * KICK);
      stage.sway(time, sway);
      stage.render();
      frames++;
      if (targets) placeOverlay(overlay, active, targets, view.rivals.length, sealed);
      if (late && !stage.soft && frozen === null) {
        slow++;
        if (slow > LATE_FRAMES) stage.dropToLite();
      } else if (slow > 0) {
        slow--;
      }
    }
    if (live || pending.length > 0 || stage.dirty || force) wake();
    else last = 0;
  }

  function relayout(): void {
    const width = dom.host.clientWidth;
    const height = dom.host.clientHeight;
    if (width < 2 || height < 2 || disposed) return;
    layout = solveLayout(width, height, dom.frame());
    dom.root.classList.toggle("kc-3d-portrait", layout.portrait);
    stage.resize(width, height, layout.portrait);
    stage.applyLayout(layout);
    stage.setChairs(layout.chairs ? rivalSpots(layout, view.rivals.length) : []);
    snap = true;
    force = true;
    wake();
  }

  function update(next: TableInput): void {
    const shapesChanged = next.shapes !== input.shapes;
    const seatsChanged = next.model.rivals.length !== input.model.rivals.length;
    input = next;
    if (shapesChanged) {
      for (const body of [...hand.values(), ...pile.values()]) if (body.faceCard !== null) setFace(body, kit, body.faceCard, next.shapes);
    }
    if (frozen === null) {
      if (next.playing && next.playing.id !== playedId) {
        playedId = next.playing.id;
        begin(next.playing);
      } else if (!next.playing) {
        sync(next.model);
      }
    }
    if (seatsChanged && layout) stage.setChairs(layout.chairs ? rivalSpots(layout, next.model.rivals.length) : []);
    force = true;
    wake();
  }

  if (debug) {
    poll = window.setInterval(() => {
      if (debug.freeze !== frozenKey || JSON.stringify([debug.camera ?? 0, debug.lift ?? 1, debug.bare ?? 0]) !== viewKey || forcedHover(debug) !== null) wake();
    }, DEBUG_POLL_MS);
    debug.state = () => {
      const active = layout;
      const corner = (body: CardBody, lx: number, ly: number): [number, number] => {
        scratch.set(lx, ly, 0).applyQuaternion(body.group.quaternion).add(body.group.position).project(camera);
        return [Math.round((scratch.x * 0.5 + 0.5) * (active?.W ?? 0)), Math.round((0.5 - scratch.y * 0.5) * (active?.H ?? 0))];
      };
      return {
        soft: stage.soft,
        lite: stage.lite,
        running: raf !== 0,
        frames,
        pending: pending.length,
        playing: input.playing !== null,
        frozen: frozen?.name ?? null,
        portrait: active?.portrait ?? false,
        per: active?.fan.per ?? 0,
        stats: stage.stats(),
        deck: view.deck,
        pile: view.pile.length,
        rivals: view.rivals.map((row) => row.count),
        flying: [...hand.values(), ...pile.values(), ...[...actors].map((actor) => actor.body)].filter((body) => body.flight).length,
        hand: (targets?.fan ?? []).map((spot) => {
          const body = hand.get(spot.slot);
          return { slot: spot.slot, row: spot.row, sealed: spot.sealed, playable: spot.playable, held: spot.slot === focusSlot, tap: body ? corner(body, -0.4, 0.5) : null, box: body ? [corner(body, -0.5, 0.75), corner(body, 0.5, -0.75)] : null };
        }),
      };
    };
    /** What a frame costs on this machine: each one is waited for with a read of one pixel, since a draw call returns long before a software renderer is done. */
    debug.measure = (frames) => {
      const gl = stage.renderer.getContext();
      const pixel = new Uint8Array(4);
      stage.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const start = performance.now();
      for (let i = 0; i < frames; i++) {
        stage.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      return Math.round((performance.now() - start) / Math.max(1, frames));
    };
  }

  stage.onDirty = wake;
  relayout();
  sync(first.model);
  wake();

  return {
    update,
    relayout,
    setFocus: (slot, source) => {
      if (slot === focusSlot && source === focusSource) return;
      focusSlot = slot;
      focusSource = slot === null ? "" : source;
      force = true;
      wake();
    },
    focus: () => ({ slot: focusSlot, source: focusSource }),
    pick: (x, y, shown) => {
      if (!layout || frozen) return null;
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      const rest = shown && targets ? targets : targetsOf(view, layout, null);
      return pickSlot(layout, rest, ray.ray.origin, ray.ray.direction, shown ? null : focusSlot, shown);
    },
    overDeck: (x, y) => {
      if (!layout || !targets?.deck.top || frozen) return false;
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      const { deck } = layout;
      deckBox.min.set(deck.x - CARD_W / 2 - DECK_REACH, 0, deck.z - CARD_H / 2 - DECK_REACH);
      deckBox.max.set(deck.x + CARD_W / 2 + DECK_REACH, targets.deck.topY + CARD_T, deck.z + CARD_H / 2 + DECK_REACH);
      return ray.ray.intersectsBox(deckBox);
    },
    playable: (slot) => view.hand.some((card) => card.slot === slot && card.playable),
    refuse: (slot) => {
      const body = hand.get(slot);
      if (!body || reduced) return;
      body.shake = SHAKE_S;
      wake();
    },
    pointer: (x, y) => {
      ptx = x;
      pty = y;
      swayUntil = time + SWAY_HOLD_S;
      wake();
    },
    setHidden: (value) => {
      hidden = value;
      if (hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      } else {
        force = true;
        wake();
      }
    },
    wake,
    dispose: () => {
      disposed = true;
      stage.onDirty = null;
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      if (debug) {
        delete debug.state;
        delete debug.measure;
      }
    },
  };
}
