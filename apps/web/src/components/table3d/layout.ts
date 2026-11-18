import { BACK_RAISE, CARD_T, CHAIR_IN, GAP_MAX, GAP_OPEN, PLATE_ROOM, PORTRAIT_ASPECT, RAIL_W, RIVAL_SPACING, STRIP_MIN } from "./constants";

const PI = Math.PI;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly align: "l" | "r" | "c" | "above";
  readonly far: boolean;
}

export interface SeatSpot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly maxLen: number;
  readonly sp: number;
  readonly plate: Anchor;
  readonly chair: { readonly x: number; readonly z: number; readonly yaw: number } | null;
}

export interface FanFrame {
  readonly origin: Vec3;
  readonly lean: number;
  readonly up: Vec3;
  readonly normal: Vec3;
  readonly maxSpan: number;
  readonly radius: number;
  readonly per: number;
}

export interface TableCut {
  readonly hx: number;
  readonly z0: number;
  readonly z1: number;
  readonly r: number;
}

export interface Frame {
  readonly head: number;
  readonly dock: number;
}

export interface Layout {
  readonly W: number;
  readonly H: number;
  readonly portrait: boolean;
  readonly fov: number;
  readonly focal: number;
  readonly cardPx: number;
  readonly cam: Vec3;
  readonly look: Vec3;
  readonly fan: FanFrame;
  readonly seatLeft: SeatSpot;
  readonly seatRight: SeatSpot;
  readonly seatFar: SeatSpot;
  readonly seatNear: SeatSpot;
  readonly deck: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly pile: { readonly x: number; readonly z: number };
  readonly ring: number;
  readonly print: { readonly x: number; readonly z: number; readonly w: number; readonly d: number };
  readonly lamp: { readonly x: number; readonly z: number; readonly gain: number; readonly angle: number };
  readonly table: TableCut;
  readonly chairs: boolean;
}

export interface Lie {
  x: number;
  y: number;
  z: number;
  yaw: number;
  flip: number;
}

export interface SeatRow {
  readonly sp: number;
  readonly roll: number;
  readonly y: number;
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

function anchor(x: number, z: number, align: Anchor["align"], y = 0.02, far = false): Anchor {
  return { x, y, z, align, far };
}

/** Everything on the table is placed from the camera backwards: the fan is put where a card of the wanted pixel width sits at the wanted screen height, then the camera is derived from it, and the seats take what the frustum leaves at their depth. A phone gets a different room, not a smaller one. On a desktop the lens is a normal 32 degrees and the hand is held over the near rail, which leaves the far rail and the chair behind it headroom at the top of the frame. The table itself is cut to the frame, so its rail is always in the picture. The far seat's name goes on the rail beyond its row; a short phone has no rail left under the header, so there the name keeps its place under the row. */
export function solveLayout(W: number, H: number, frame: Frame): Layout {
  const asp = W / H;
  const portrait = asp < PORTRAIT_ASPECT;
  const fov = portrait ? 40 : 32;
  const elev = ((portrait ? 62 : 45) * PI) / 180;
  const lean = elev - ((portrait ? 4 : 5) * PI) / 180;
  const focal = H / 2 / Math.tan((fov * PI) / 360);
  const cardPx = portrait ? Math.min(W * 0.25, H * 0.12) : clamp(H * 0.165, 92, Math.min(190, W * 0.14));
  const fanMaxPx = portrait ? W - 32 : Math.min(W * 0.66, cardPx * 6.6);
  const maxSpan = Math.max(0.6, (fanMaxPx - cardPx) / cardPx);
  const radius = Math.max(6, maxSpan * 3);
  const sagPx = radius * (1 - Math.cos(Math.asin(Math.min(0.9, maxSpan / 2 / radius)))) * cardPx;
  const fanCy = H - frame.dock - cardPx * 0.75 - sagPx - cardPx * 0.08;
  const beta = Math.atan((fanCy - H / 2) / focal);
  const pitch = elev - beta;
  const dist = focal / cardPx;

  const origin: Vec3 = { x: 0, y: portrait ? 0.66 : 1.85, z: portrait ? 4.05 : 4.55 };
  const cam: Vec3 = { x: 0, y: origin.y + dist * Math.sin(elev), z: origin.z + dist * Math.cos(elev) };
  const fwd = { y: -Math.sin(pitch), z: -Math.cos(pitch) };
  const reach = cam.y / Math.sin(pitch);
  const look: Vec3 = { x: 0, y: cam.y + fwd.y * reach, z: cam.z + fwd.z * reach };

  const screenY = (y: number, z: number): number => {
    const dy = y - cam.y;
    const dz = z - cam.z;
    return H / 2 - (focal * (dy * Math.cos(pitch) - dz * Math.sin(pitch))) / (dy * fwd.y + dz * fwd.z);
  };
  const halfWidth = (z: number): number => (-cam.y * fwd.y + (z - cam.z) * fwd.z) * Math.tan((fov * PI) / 360) * asp;

  const fan: FanFrame = {
    origin,
    lean,
    up: { x: 0, y: Math.cos(lean), z: -Math.sin(lean) },
    normal: { x: 0, y: Math.sin(lean), z: Math.cos(lean) },
    maxSpan,
    radius,
    per: Math.floor(maxSpan / STRIP_MIN) + 1,
  };
  const reachIn = RAIL_W - CHAIR_IN;
  const base = { W, H, portrait, fov, focal, cardPx, cam, look, fan, chairs: !portrait };

  if (portrait) {
    const xs = clamp(halfWidth(-1.6) - 0.75 - 0.16, 1.5, 2.6);
    const table: TableCut = { hx: xs + 0.95, z0: -5.0, z1: 5.0, r: 0.9 };
    const farOnRail = screenY(0, -4.75) - frame.head >= PLATE_ROOM;
    const pw = Math.min(3.7, halfWidth(2.4) * 2 - 0.5);
    return {
      ...base,
      table,
      seatLeft: { x: -xs, z: -1.6, yaw: -PI / 2, maxLen: 1.9, sp: 0.3, plate: anchor(-xs + 0.92, -1.6, "l"), chair: null },
      seatRight: { x: xs, z: -1.6, yaw: PI / 2, maxLen: 1.9, sp: 0.3, plate: anchor(xs - 0.92, -1.6, "r"), chair: null },
      seatFar: { x: 0, z: -4.0, yaw: PI, maxLen: 2.3, sp: 0.34, plate: farOnRail ? anchor(0, table.z0 - 0.12, "c", 0.18, true) : anchor(0, -2.86, "c"), chair: null },
      seatNear: { x: 0, z: 2.75, yaw: 0, maxLen: 2.3, sp: 0.34, plate: anchor(0, 3.9, "c"), chair: null },
      deck: { x: -0.95, z: 1.15, yaw: 0.1 },
      pile: { x: 0.55, z: 0.3 },
      ring: 0.85,
      print: { x: 0, z: 2.45, w: pw, d: (pw * 1.36) / 4.9 },
      lamp: { x: 0, z: -1.3, gain: 1.18, angle: 1.06 },
    };
  }
  const hw = halfWidth(-1);
  const xs = Math.max(clamp(hw - 1.3, 2.7, 3.75), Math.min(4.6, hw - 5.3));
  const table: TableCut = { hx: xs + 1.1, z0: -4.6, z1: 4.0, r: 1.3 };
  return {
    ...base,
    table,
    seatLeft: { x: -xs, z: -1.0, yaw: -PI / 2, maxLen: 3.0, sp: RIVAL_SPACING, plate: anchor(-xs, -3.3, "above"), chair: { x: -table.hx - reachIn, z: -1.0, yaw: PI / 2 } },
    seatRight: { x: xs, z: -1.0, yaw: PI / 2, maxLen: 3.0, sp: RIVAL_SPACING, plate: anchor(xs, -3.3, "above"), chair: { x: table.hx + reachIn, z: -1.0, yaw: -PI / 2 } },
    seatFar: { x: 0, z: -3.6, yaw: PI, maxLen: 3.0, sp: 0.34, plate: anchor(0, table.z0 - 0.3, "c", 0.3, true), chair: { x: 0, z: table.z0 - reachIn, yaw: 0 } },
    seatNear: { x: 0, z: 2.2, yaw: 0, maxLen: 3.0, sp: 0.34, plate: anchor(0, 3.3, "c"), chair: null },
    deck: { x: -1.9, z: -1.9, yaw: 0.1 },
    pile: { x: 0.85, z: -1.0 },
    ring: 1.0,
    print: { x: 0, z: 0.62, w: 4.5, d: 1.24 },
    lamp: { x: 0, z: -0.7, gain: 1, angle: 1.1 },
  };
}

/** Rivals sit where the 2D table puts them: one opposite, two at the sides, three round the table. */
export function rivalSpots(layout: Layout, rivals: number): readonly SeatSpot[] {
  if (rivals <= 1) return [layout.seatFar];
  if (rivals === 2) return [layout.seatLeft, layout.seatRight];
  return [layout.seatLeft, layout.seatFar, layout.seatRight];
}

/** One row of sealed cards, shingled on the felt: every card is rolled about its long axis so one edge rests on the baize and the other on its neighbour. The spacing closes up as the hand grows, so the row never outgrows its place. */
export function seatRow(seat: SeatSpot, count: number): SeatRow {
  const sp = count > 1 ? Math.min(seat.sp, seat.maxLen / (count - 1)) : seat.sp;
  const roll = Math.asin(Math.min(0.75, CARD_T / sp));
  return { sp, roll, y: 0.5 * Math.sin(roll) + CARD_T / 2 };
}

export function seatSlot(seat: SeatSpot, row: SeatRow, index: number, count: number): Lie {
  const off = (index - (count - 1) / 2) * row.sp;
  return { x: seat.x + Math.cos(seat.yaw) * off, y: row.y, z: seat.z - Math.sin(seat.yaw) * off, yaw: seat.yaw, flip: PI + row.roll };
}

export interface FanRow {
  readonly xs: readonly number[];
  readonly gap: number;
  readonly roll: number;
}

/** A fan row in its own plane. Cards overlap leftwards, so each shows its left strip with the corner index. When one card is held, the gap after it opens to uncover it and the others close up; the held card stays where its resting strip was whenever the fan has room, so the pointer that chose it is still on it. */
export function rowLayout(fan: FanFrame, count: number, focus: number): FanRow {
  const gap = count > 1 ? Math.min(GAP_MAX, fan.maxSpan / (count - 1)) : 0;
  let worst = gap;
  if (count > 2 && (count - 2) * gap + GAP_OPEN > fan.maxSpan) worst = (fan.maxSpan - GAP_OPEN) / (count - 2);
  const roll = count > 1 ? Math.asin(Math.min(0.7, (CARD_T * 1.25) / Math.max(worst, 0.05))) : 0;
  const rest0 = (-(count - 1) * gap) / 2;
  const open = focus >= 0 && focus < count - 1;
  const gapOpen = Math.max(gap, GAP_OPEN);
  let closed = gap;
  let x = rest0;
  if (open) {
    let total = (count - 2) * gap + gapOpen;
    if (total > fan.maxSpan) {
      closed = worst;
      total = fan.maxSpan;
    }
    const half = Math.max(fan.maxSpan / 2, total / 2);
    x = clamp(rest0 + focus * gap - focus * closed, -half, half - total);
  }
  const xs: number[] = [];
  for (let i = 0; i < count; i++) {
    xs.push(x);
    x += open && i === focus ? gapOpen : closed;
  }
  return { xs, gap, roll };
}

/** How many cards stand in the second fan behind the first. One row holds what still shows a readable strip of every card; past that the hand is split in two. */
export function backRowCount(count: number, per: number): number {
  return count > per ? Math.floor(count / 2) : 0;
}

/** How far the second fan stands behind the first: far enough that the rolled edges of the two rows never meet. */
export function backOffset(rollFront: number, rollBack: number): number {
  return 0.5 * Math.sin(rollFront) + 0.5 * Math.sin(rollBack) + 0.07;
}

export function fanPoint(fan: FanFrame, x: number, lift: number, row: 0 | 1, back: number): Vec3 {
  const th = x / fan.radius;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const px = fan.radius * s + s * lift;
  const py = fan.radius * (c - 1) + c * lift + (row === 1 ? BACK_RAISE : 0);
  const depth = row === 1 ? -back : 0;
  return {
    x: fan.origin.x + px + fan.normal.x * depth,
    y: fan.origin.y + fan.up.y * py + fan.normal.y * depth,
    z: fan.origin.z + fan.up.z * py + fan.normal.z * depth,
  };
}

/** Which card of a fan row a point of that row's plane falls on, topmost first. px and py are measured along the fan's right and up from the row's origin. */
export function rowHit(fan: FanFrame, xs: readonly number[], lifts: readonly number[], px: number, py: number, held: number, heldLift: number): number {
  for (let i = xs.length - 1; i >= 0; i--) {
    const th = (xs[i] ?? 0) / fan.radius;
    const s = Math.sin(th);
    const c = Math.cos(th);
    const dx = px - fan.radius * s;
    const dy = py - fan.radius * (c - 1);
    const u = dx * c - dy * s;
    const v = dx * s + dy * c;
    if (Math.abs(u) <= 0.5 && v >= -0.75 && v <= 0.75 + (lifts[i] ?? 0) + (i === held ? heldLift : 0)) return i;
  }
  return -1;
}

/** Where a ray meets the plane of a fan row, in that row's own right and up coordinates. A ray that runs away from the plane has no point. */
export function rowPlanePoint(fan: FanFrame, row: 0 | 1, back: number, origin: Vec3, dir: Vec3): { x: number; y: number } | null {
  const depth = row === 1 ? -back : 0;
  const raise = row === 1 ? BACK_RAISE : 0;
  const ox = fan.origin.x + fan.normal.x * depth;
  const oy = fan.origin.y + fan.up.y * raise + fan.normal.y * depth;
  const oz = fan.origin.z + fan.up.z * raise + fan.normal.z * depth;
  const den = dir.x * fan.normal.x + dir.y * fan.normal.y + dir.z * fan.normal.z;
  if (den > -1e-5) return null;
  const t = ((ox - origin.x) * fan.normal.x + (oy - origin.y) * fan.normal.y + (oz - origin.z) * fan.normal.z) / den;
  const hx = origin.x + dir.x * t - ox;
  const hy = origin.y + dir.y * t - oy;
  const hz = origin.z + dir.z * t - oz;
  return { x: hx, y: hy * fan.up.y + hz * fan.up.z };
}
