import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Shape, SplineCurve, Vector2, Vector3 } from "three";
import { CHAIR_IN, FLOOR_Y, RAIL_TOP, RAIL_W } from "./constants";
import { type TableCut, clamp } from "./layout";

const PI = Math.PI;
const GRAIN_ALONG = 0.2;
const GRAIN_ACROSS = 0.85;
const FELT_REPEAT = 1.8;
const APRON_R = 0.92;
const LEG_R = 0.62;
const SEAT_Y = 6.6;
const POST_X = 2.72;
const POST_T = 0.62;
const BARREL = 0.42;
const CORNER_SEGMENTS = 10;

type Pt = readonly [number, number];

const RAIL_BRASS: readonly Pt[] = [[0, -0.03], [0, 0.012], [0.008, 0.022], [0.03, 0.024], [0.055, 0.024], [0.077, 0.022], [0.085, 0.012], [0.085, -0.03]];
const RAIL_PROFILE: readonly Pt[] = [[0.085, -0.03], [0.085, 0.03], [0.1, 0.11], [0.14, 0.185], [0.21, 0.25], [0.31, 0.3], [0.45, 0.335], [0.62, RAIL_TOP], [0.8, 0.34], [0.94, 0.305], [1.04, 0.245], [1.1, 0.16], [RAIL_W, 0.07], [1.09, -0.02], [1.04, -0.085], [0.98, -0.115]];
const RAIL_SOFFIT: readonly Pt[] = [[0.98, -0.115], [APRON_R, -0.115]];
const RAIL_APRON: readonly Pt[] = [[APRON_R, -0.115], [APRON_R, -1.25]];
const RAIL_BEAD: readonly Pt[] = [[APRON_R, -1.25], [0.95, -1.28], [0.965, -1.335], [0.95, -1.39], [APRON_R, -1.42]];
const RAIL_UNDER: readonly Pt[] = [[APRON_R, -1.42], [0.78, -1.42]];
const FELT_RINGS: readonly Pt[] = [[0, 0.34], [0.07, 0.48], [0.2, 0.7], [0.42, 0.9], [0.75, 1]];
const TABLE_LEG: readonly Pt[] = [[0, -12], [0.26, -12], [0.34, -11.85], [0.27, -11.6], [0.31, -11], [0.4, -10.8], [0.31, -10.6], [0.36, -9.5], [0.52, -5], [0.58, -3.6], [0.46, -3.1], [LEG_R, -2.9], [0.7, -2.75], [LEG_R, -2.6], [LEG_R, -1.2], [0, -1.2]];
const CHAIR_LEG: readonly Pt[] = [[0, 0], [0.25, 0], [0.33, 0.22], [0.25, 0.5], [0.23, 0.7], [0.3, 2.6], [0.36, 4], [0.3, 4.25], [0.42, 4.45], [0.33, 4.65], [0.4, 4.85], [0.44, 5], [0.44, 5.9], [0, 5.9]];
const FLOOR_RINGS = [0, 3, 5.5, 7, 8.5, 10, 12, 15, 19, 25, 34, 48, 72] as const;

interface Buf {
  readonly p: number[];
  readonly n: number[];
  readonly u: number[];
  c: number[] | null;
}

interface PathPoint {
  readonly x: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
  readonly s: number;
}

interface Path {
  readonly points: readonly PathPoint[];
  readonly total: number;
}

interface Vert {
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly u: number;
  readonly v: number;
}

function buf(): Buf {
  return { p: [], n: [], u: [], c: null };
}

function toGeometry(b: Buf): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(b.p, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(b.n, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(b.u, 2));
  if (b.c) geometry.setAttribute("color", new Float32BufferAttribute(b.c, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function add(into: Buf, b: Buf): void {
  for (const v of b.p) into.p.push(v);
  for (const v of b.n) into.n.push(v);
  for (const v of b.u) into.u.push(v);
}

function at(list: readonly number[], i: number): number {
  return list[i] ?? 0;
}

function place(b: Buf, m: Matrix4): Buf {
  const v = new Vector3();
  for (let i = 0; i < b.p.length; i += 3) {
    v.set(at(b.p, i), at(b.p, i + 1), at(b.p, i + 2)).applyMatrix4(m);
    b.p[i] = v.x;
    b.p[i + 1] = v.y;
    b.p[i + 2] = v.z;
    v.set(at(b.n, i), at(b.n, i + 1), at(b.n, i + 2)).transformDirection(m);
    b.n[i] = v.x;
    b.n[i + 1] = v.y;
    b.n[i + 2] = v.z;
  }
  return b;
}

/** The edge of the felt as a closed loop of points with outward normals; an offset keeps it a rounded rectangle. Lengths are measured on the felt edge itself, so the grain does not stretch round a corner. */
function loop(cut: TableCut, offset: number): Path {
  const cx = cut.hx - cut.r;
  const corners: readonly (readonly [number, number, number])[] = [[cx, cut.z1 - cut.r, 0], [-cx, cut.z1 - cut.r, PI / 2], [-cx, cut.z0 + cut.r, PI], [cx, cut.z0 + cut.r, PI * 1.5]];
  const points: PathPoint[] = [];
  let length = 0;
  let px = 0;
  let pz = 0;
  let first = { x: 0, z: 0 };
  for (const [ox, oz, start] of corners) {
    for (let k = 0; k <= CORNER_SEGMENTS; k++) {
      const a = start + ((PI / 2) * k) / CORNER_SEGMENTS;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const bx = ox + nx * cut.r;
      const bz = oz + nz * cut.r;
      if (points.length > 0) length += Math.hypot(bx - px, bz - pz);
      else first = { x: bx, z: bz };
      px = bx;
      pz = bz;
      points.push({ x: bx + nx * offset, z: bz + nz * offset, nx, nz, s: length });
    }
  }
  return { points, total: length + Math.hypot(first.x - px, first.z - pz) };
}

function ring(segments: number, radius: number): Path {
  const points: PathPoint[] = [];
  for (let k = 0; k < segments; k++) {
    const a = (PI * 2 * k) / segments;
    points.push({ x: 0, z: 0, nx: Math.cos(a), nz: Math.sin(a), s: a * radius });
  }
  return { points, total: PI * 2 * radius };
}

/** One profile carried round a closed path: the rail round the table and every turned leg are the same operation. A profile runs from the inside over the top to the outside, which is what fixes its normals. */
function sweep(path: Path, run: readonly Pt[], alongPath: boolean): Buf {
  const b = buf();
  const n = path.points.length;
  const m = run.length;
  const normals: Pt[] = [];
  const lengths: number[] = [0];
  const pt = (j: number): Pt => run[Math.max(0, Math.min(m - 1, j))] ?? [0, 0];
  for (let j = 0; j < m; j++) {
    const a0 = pt(j - 1);
    const a1 = pt(j + 1);
    const tx = a1[0] - a0[0];
    const ty = a1[1] - a0[1];
    const tl = Math.hypot(tx, ty) || 1;
    normals.push([-ty / tl, tx / tl]);
    if (j > 0) lengths.push(at(lengths, j - 1) + Math.hypot(pt(j)[0] - pt(j - 1)[0], pt(j)[1] - pt(j - 1)[1]));
  }
  const vert = (p: PathPoint, s: number, j: number): Vert => {
    const across = at(lengths, j);
    const normal = normals[j] ?? [0, 1];
    return {
      px: p.x + p.nx * pt(j)[0],
      py: pt(j)[1],
      pz: p.z + p.nz * pt(j)[0],
      nx: p.nx * normal[0],
      ny: normal[1],
      nz: p.nz * normal[0],
      u: (alongPath ? s : across) * GRAIN_ALONG,
      v: (alongPath ? across : s) * GRAIN_ACROSS,
    };
  };
  const emit = (v: Vert): void => {
    b.p.push(v.px, v.py, v.pz);
    b.n.push(v.nx, v.ny, v.nz);
    b.u.push(v.u, v.v);
  };
  for (let i = 0; i < n; i++) {
    const pa = path.points[i];
    const pc = path.points[(i + 1) % n];
    if (!pa || !pc) continue;
    const sc = i + 1 < n ? pc.s : path.total;
    for (let j = 0; j < m - 1; j++) {
      const A = vert(pa, pa.s, j);
      const B = vert(pc, sc, j);
      const C = vert(pc, sc, j + 1);
      const D = vert(pa, pa.s, j + 1);
      const ux = B.px - A.px;
      const uy = B.py - A.py;
      const uz = B.pz - A.pz;
      const wx = D.px - A.px;
      const wy = D.py - A.py;
      const wz = D.pz - A.pz;
      const facing = (uy * wz - uz * wy) * (A.nx + C.nx) + (uz * wx - ux * wz) * (A.ny + C.ny) + (ux * wy - uy * wx) * (A.nz + C.nz);
      const order = facing >= 0 ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
      for (const v of order) emit(v);
    }
  }
  return b;
}

function turned(profile: readonly Pt[], segments: number): Buf {
  return sweep(ring(segments, 0.3), [...profile].reverse(), false);
}

type Bend = (v: Vector3, n: Vector3) => void;

/** An extruded part taken into the shared buffer: bent if it has to follow the barrel of a chair back, moved into place, and given grain that runs along the piece the way a joiner would cut it. */
function solid(source: BufferGeometry, grainAxis: 0 | 1 | 2, m: Matrix4 | null, bend: Bend | null): Buf {
  const geometry = source.index ? source.toNonIndexed() : source;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  if (!(positions instanceof BufferAttribute) || !(normals instanceof BufferAttribute)) throw new Error("extruded part has no plain attributes");
  const b = buf();
  const v = new Vector3();
  const nn = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    nn.fromBufferAttribute(normals, i);
    if (bend) bend(v, nn);
    if (m) {
      v.applyMatrix4(m);
      nn.transformDirection(m);
    }
    b.p.push(v.x, v.y, v.z);
    b.n.push(nn.x, nn.y, nn.z);
  }
  const o1 = (grainAxis + 1) % 3;
  const o2 = (grainAxis + 2) % 3;
  const e1 = new Vector3();
  const e2 = new Vector3();
  for (let i = 0; i < b.p.length; i += 9) {
    e1.set(at(b.p, i + 3) - at(b.p, i), at(b.p, i + 4) - at(b.p, i + 1), at(b.p, i + 5) - at(b.p, i + 2));
    e2.set(at(b.p, i + 6) - at(b.p, i), at(b.p, i + 7) - at(b.p, i + 1), at(b.p, i + 8) - at(b.p, i + 2));
    e1.cross(e2);
    const f = [Math.abs(e1.x), Math.abs(e1.y), Math.abs(e1.z)];
    const end = at(f, grainAxis) > at(f, o1) && at(f, grainAxis) > at(f, o2);
    const cross = at(f, o1) > at(f, o2) ? o2 : o1;
    for (let k = 0; k < 3; k++) {
      const q = i + k * 3;
      if (end) b.u.push(at(b.p, q + o1) * GRAIN_ACROSS, at(b.p, q + o2) * GRAIN_ACROSS);
      else b.u.push(at(b.p, q + grainAxis) * GRAIN_ALONG, at(b.p, q + cross) * GRAIN_ACROSS);
    }
  }
  geometry.dispose();
  if (geometry !== source) source.dispose();
  return b;
}

function roundedPoly(points: readonly Pt[], radii: readonly number[]): Shape {
  const shape = new Shape();
  const n = points.length;
  const pt = (i: number): Pt => points[(i + n) % n] ?? [0, 0];
  for (let i = 0; i < n; i++) {
    const p = pt(i);
    const a = pt(i - 1);
    const c = pt(i + 1);
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const r = at(radii, i);
    const inX = p[0] + ((a[0] - p[0]) * r) / la;
    const inY = p[1] + ((a[1] - p[1]) * r) / la;
    if (i === 0) shape.moveTo(inX, inY);
    else shape.lineTo(inX, inY);
    shape.quadraticCurveTo(p[0], p[1], p[0] + ((c[0] - p[0]) * r) / lc, p[1] + ((c[1] - p[1]) * r) / lc);
  }
  shape.closePath();
  return shape;
}

function extrude(shape: Shape, depth: number, bevelThickness: number, bevelSize: number, bevelSegments: number, curveSegments = 1): ExtrudeGeometry {
  return new ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelThickness, bevelSize, bevelSegments, curveSegments });
}

function outline(points: readonly Pt[]): Vector2[] {
  return points.map(([x, y]) => new Vector2(x, y));
}

export interface TableGeometry {
  readonly wood: BufferGeometry;
  readonly brass: BufferGeometry;
  readonly felt: BufferGeometry;
}

/** The felt is sunk below a rail with an armrest profile, a brass inlay between them, an apron and four turned legs. Rail, apron and legs are one mesh. The felt darkens toward the rail through vertex colours: the lamp hangs over the middle, so a cast shadow of the rail would fall outwards and never show. */
export function tableGeometry(cut: TableCut): TableGeometry {
  const path = loop(cut, 0);
  const wood = buf();
  for (const run of [RAIL_PROFILE, RAIL_SOFFIT, RAIL_APRON, RAIL_BEAD, RAIL_UNDER]) add(wood, sweep(path, run, true));
  const d = (cut.r + APRON_R - LEG_R - 0.12) / Math.SQRT2;
  const cx = cut.hx - cut.r + d;
  const m = new Matrix4();
  const legs: readonly Pt[] = [[cx, cut.z0 + cut.r - d], [-cx, cut.z0 + cut.r - d], [cx, cut.z1 - cut.r + d], [-cx, cut.z1 - cut.r + d]];
  for (const [x, z] of legs) add(wood, place(turned(TABLE_LEG, 12), m.makeTranslation(x, 0, z)));

  const felt = buf();
  const shades: number[] = [];
  felt.c = shades;
  const rings = FELT_RINGS.map(([inset]) => loop(cut, -inset).points);
  const vertex = (p: { readonly x: number; readonly z: number }, shade: number): void => {
    felt.p.push(p.x, 0, p.z);
    felt.n.push(0, 1, 0);
    felt.u.push(p.x * FELT_REPEAT, p.z * FELT_REPEAT);
    shades.push(shade, shade, shade);
  };
  type P = { readonly x: number; readonly z: number };
  const triangle = (a: P, sa: number, b: P, sb: number, c: P, sc: number): void => {
    const up = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    vertex(a, sa);
    if (up >= 0) {
      vertex(b, sb);
      vertex(c, sc);
    } else {
      vertex(c, sc);
      vertex(b, sb);
    }
  };
  const count = rings[0]?.length ?? 0;
  for (let r = 0; r < rings.length - 1; r++) {
    const outer = rings[r] ?? [];
    const inner = rings[r + 1] ?? [];
    const s0 = FELT_RINGS[r]?.[1] ?? 1;
    const s1 = FELT_RINGS[r + 1]?.[1] ?? 1;
    for (let k = 0; k < count; k++) {
      const k2 = (k + 1) % count;
      const a = outer[k];
      const b = outer[k2];
      const c = inner[k2];
      const e = inner[k];
      if (!a || !b || !c || !e) continue;
      triangle(a, s0, b, s0, c, s1);
      triangle(a, s0, c, s1, e, s1);
    }
  }
  const innermost = rings[rings.length - 1] ?? [];
  const mid = { x: 0, z: (cut.z0 + cut.z1) / 2 };
  for (let q = 0; q < count; q++) {
    const a = innermost[q];
    const b = innermost[(q + 1) % count];
    if (a && b) triangle(mid, 1, a, 1, b, 1);
  }
  return { wood: toGeometry(wood), brass: toGeometry(sweep(path, RAIL_BRASS, true)), felt: toGeometry(felt) };
}

/** The floor only has to say that the table stands somewhere. It is a disc of boards that the light dies on, and the lamp's shadow of the table is painted into its vertices because no shadow map reaches that far down. */
export function floorGeometry(cut: TableCut): BufferGeometry {
  const b = buf();
  const shades: number[] = [];
  b.c = shades;
  const segments = 48;
  const cz = (cut.z0 + cut.z1) / 2;
  const hx = cut.hx + RAIL_W;
  const hz = (cut.z1 - cut.z0) / 2 + RAIL_W;
  const vertex = (radius: number, k: number): void => {
    const a = (PI * 2 * k) / segments;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const t = clamp(Math.hypot(Math.max(0, Math.abs(x) - hx), Math.max(0, Math.abs(z) - hz)) / 5, 0, 1);
    const shade = 0.1 + 0.9 * t * t * (3 - 2 * t);
    b.p.push(x, 0, z + cz);
    b.n.push(0, 1, 0);
    b.u.push(x / 7.6, (z + cz) / 30);
    shades.push(shade, shade, shade);
  };
  for (let r = 0; r < FLOOR_RINGS.length - 1; r++) {
    const r0 = FLOOR_RINGS[r] ?? 0;
    const r1 = FLOOR_RINGS[r + 1] ?? 0;
    for (let k = 0; k < segments; k++) {
      if (r0 > 0) {
        vertex(r0, k);
        vertex(r0, k + 1);
        vertex(r1, k + 1);
      }
      vertex(r0, k);
      vertex(r1, k + 1);
      vertex(r1, k);
    }
  }
  return toGeometry(b);
}

function postCentre(y: number): number {
  if (y < SEAT_Y) return -2.98 - 0.74 * Math.pow((SEAT_Y - y) / SEAT_Y, 1.3);
  return -2.98 - 1.1 * Math.pow((y - SEAT_Y) / 6.4, 1.7);
}

function postSlope(y: number): number {
  return (-1.1 * 1.7 * Math.pow(Math.max(0, y - SEAT_Y) / 6.4, 0.7)) / 6.4;
}

function postDepth(y: number): number {
  if (y < SEAT_Y) return 0.9 - (0.3 * (SEAT_Y - y)) / SEAT_Y;
  return 0.9 - 0.4 * Math.min(1, (y - SEAT_Y) / 5.4);
}

/** The back of the chair is a shallow barrel: crest, cross rail and splat are cut flat and then pressed onto the curve the posts lean along, so the three pieces and the two posts stay one surface. */
function barrel(v: Vector3, n: Vector3): void {
  const k = BARREL / (POST_X * POST_X);
  const nz = n.z;
  v.z += postCentre(v.y) - BARREL + k * v.x * v.x;
  n.x -= 2 * k * v.x * nz;
  n.y -= postSlope(v.y) * nz;
  n.normalize();
}

function crestOutline(): Pt[] {
  const width = 3.42;
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 - 1;
    const x = width * Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 2.2));
    const e = Math.abs(x) / width;
    const yt = 13.45 - 0.55 * Math.pow(e, 2.2);
    const yb = 12.42 + 0.1 * (1 - e * e);
    const mid = (yt + yb) / 2;
    const half = ((yt - yb) / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(e, 8)));
    top.push([x, mid + half]);
    if (i > 0 && i < steps) bottom.push([x, mid - half]);
  }
  return [...top, ...bottom.reverse()];
}

function crossRailOutline(): Pt[] {
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const x = -POST_X + (2 * POST_X * i) / steps;
    const e = x / POST_X;
    top.push([x, 9.78]);
    bottom.push([x, 9.0 + 0.16 * (1 - e * e)]);
  }
  return [...top, ...bottom.reverse()];
}

function splatOutline(): Pt[] {
  const curve = new SplineCurve(outline([[0.72, 9.5], [0.5, 9.8], [0.42, 10.12], [0.6, 10.6], [0.98, 11.1], [1.02, 11.4], [0.74, 11.86], [0.6, 12.18], [0.82, 12.62]]));
  const right = curve.getPoints(28);
  return [...right.map((p): Pt => [p.x, p.y]), ...[...right].reverse().map((p): Pt => [-p.x, p.y])];
}

function postOutline(): Pt[] {
  const front: Pt[] = [];
  const back: Pt[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const y = (13 * i) / steps;
    const c = postCentre(y);
    const w = postDepth(y) - 0.1;
    front.push([-(c + w / 2), y]);
    back.push([-(c - w / 2), y]);
  }
  return [...front, ...back.reverse()];
}

function bobbin(length: number): Pt[] {
  return [[0, 0], [0.19, 0], [0.19, length * 0.06], [0.15, length * 0.1], [0.24, length * 0.32], [0.27, length * 0.5], [0.24, length * 0.68], [0.15, length * 0.9], [0.19, length * 0.94], [0.19, length], [0, length]];
}

/** A pulled up chair is mostly under the table, where the lamp never reaches. No shadow map covers it, so that shade is painted into the chair: every chair stands the same distance in from the rail, which is what lets one painted copy serve them all. */
function shadeUnderTable(b: Buf): void {
  const shades: number[] = [];
  for (let i = 0; i < b.p.length; i += 3) {
    const tz = clamp((at(b.p, i + 2) + CHAIR_IN + 0.9) / 1.2, 0, 1);
    const ty = 1 - clamp((at(b.p, i + 1) + FLOOR_Y + 1.0) / 1.2, 0, 1);
    const s = 1 - 0.86 * tz * tz * (3 - 2 * tz) * ty * ty * (3 - 2 * ty);
    shades.push(s, s, s);
  }
  b.c = shades;
}

export interface ChairGeometry {
  readonly wood: BufferGeometry;
  readonly pad: BufferGeometry;
}

/** One armless chair: raked back posts cut from a curved board, a tapered crest, a cross rail and a vase splat pressed onto one barrel curve, a framed seat with a leather pad, turned front legs and bobbin stretchers. One geometry, drawn instanced. */
export function chairGeometry(): ChairGeometry {
  const wood = buf();
  const pad = buf();
  const m = new Matrix4();
  const r = new Matrix4();

  for (const side of [-1, 1]) {
    m.makeTranslation(side * POST_X - POST_T / 2 + 0.05, 0, 0).multiply(r.makeRotationY(PI / 2));
    add(wood, solid(extrude(new Shape(outline(postOutline())), POST_T - 0.1, 0.05, 0.05, 2), 1, m, null));
    add(wood, place(turned(CHAIR_LEG, 12), m.makeTranslation(side * 2.95, 0, 2.62)));
    m.makeTranslation(side * 2.9, 2.4, -3.3).multiply(r.makeRotationX(PI / 2));
    add(wood, place(turned(bobbin(5.92), 8), m));
  }
  m.makeTranslation(-2.9, 2.4, -0.2).multiply(r.makeRotationZ(-PI / 2));
  add(wood, place(turned(bobbin(5.8), 8), m));
  m.makeTranslation(-2.6, 3.8, postCentre(3.8)).multiply(r.makeRotationZ(-PI / 2));
  add(wood, place(turned(bobbin(5.2), 8), m));

  const crest = extrude(new Shape(outline(crestOutline())), 0.5, 0.07, 0.06, 2);
  crest.translate(0, 0, -0.25);
  add(wood, solid(crest, 0, null, barrel));

  const crossRail = extrude(new Shape(outline(crossRailOutline())), 0.32, 0.05, 0.04, 2);
  crossRail.translate(0, 0, -0.16);
  add(wood, solid(crossRail, 0, null, barrel));

  const splat = extrude(new Shape(outline(splatOutline())), 0.18, 0.05, 0.04, 2);
  splat.translate(0, 0, -0.09);
  add(wood, solid(splat, 1, null, barrel));

  m.makeTranslation(0, 5.82, 0).multiply(r.makeRotationX(-PI / 2));
  add(wood, solid(extrude(roundedPoly([[-2.97, 2.94], [2.97, 2.94], [3.34, -3.04], [-3.34, -3.04]], [0.15, 0.15, 0.5, 0.5]), 0.76, 0.07, 0.06, 2, 6), 2, m, null));

  m.makeTranslation(0, 6.8, 0).multiply(r.makeRotationX(-PI / 2));
  add(pad, solid(extrude(roundedPoly([[-2.5, 2.42], [2.5, 2.42], [2.86, -2.56], [-2.86, -2.56]], [0.3, 0.3, 0.45, 0.45]), 0.1, 0.18, 0.2, 4, 6), 2, m, null));

  shadeUnderTable(wood);
  shadeUnderTable(pad);
  return { wood: toGeometry(wood), pad: toGeometry(pad) };
}
