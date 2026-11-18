import type { Card } from "@kryphochroma/rules";
import { BufferAttribute, type BufferGeometry, ExtrudeGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Quaternion, type Scene, Shape, ShapeGeometry, type Texture, TextureLoader, Vector3, sRGBEncoding } from "three";
import { linear } from "../landing/color";
import { BEVEL, CARD_H, CARD_T, CARD_W, CORNER, FACE_EPS } from "./constants";
import { BACK_URL, faceUrl } from "./faces";
import type { Lie } from "./layout";
import { lieQuat } from "./pose";

const ROW_CAPACITY = 4 * 24;
const EASE_RATE = 13;
const REST = 1e-7;

export interface Flight {
  t: number;
  readonly dur: number;
  readonly fn: (body: CardBody, p: number) => void;
  readonly init?: (body: CardBody) => void;
  readonly done?: () => void;
  started: boolean;
}

export interface CardBody {
  readonly group: Group;
  readonly face: Mesh;
  readonly back: Mesh;
  readonly home: { readonly p: Vector3; readonly q: Quaternion };
  lie: Lie;
  flight: Flight | null;
  placed: boolean;
  faceCard: Card | null;
  faceDown: boolean;
  row: 0 | 1;
  shake: number;
  sealedAt: number;
}

export interface CardKit {
  readonly bodyGeo: BufferGeometry;
  readonly frontGeo: BufferGeometry;
  readonly backGeo: BufferGeometry;
  readonly bodyMat: MeshStandardMaterial;
  readonly backMat: MeshStandardMaterial;
  readonly faceMaterial: (card: Card, shapes: boolean) => MeshStandardMaterial;
  readonly dispose: () => void;
}

function roundedRect(w: number, h: number, r: number): Shape {
  const shape = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function bodyGeometry(): ExtrudeGeometry {
  const depth = CARD_T - BEVEL * 2;
  const geometry = new ExtrudeGeometry(roundedRect(CARD_W - BEVEL * 2, CARD_H - BEVEL * 2, CORNER - BEVEL), { depth, steps: 1, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 5 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function faceGeometry(): ShapeGeometry {
  const geometry = new ShapeGeometry(roundedRect(CARD_W - BEVEL * 2 - 0.004, CARD_H - BEVEL * 2 - 0.004, CORNER - BEVEL), 5);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  if (!(position instanceof BufferAttribute) || !(uv instanceof BufferAttribute)) throw new Error("card face geometry has no plain attributes");
  for (let v = 0; v < position.count; v++) uv.setXY(v, position.getX(v) / CARD_W + 0.5, position.getY(v) / CARD_H + 0.5);
  uv.needsUpdate = true;
  return geometry;
}

/** A face image is fetched the first time a card with that face is on the table: a round shows a few dozen of the 142, and a phone should not download the rest. */
export function createCardKit(anisotropy: number, onLoad: () => void): CardKit {
  const loader = new TextureLoader();
  const textures: Texture[] = [];
  const materials = new Map<string, MeshStandardMaterial>();
  const material = (url: string): MeshStandardMaterial => {
    const known = materials.get(url);
    if (known) return known;
    const texture = loader.load(url, onLoad, undefined, () => console.warn(`Table: card image ${url} did not load.`));
    texture.encoding = sRGBEncoding;
    texture.anisotropy = anisotropy;
    textures.push(texture);
    const made = new MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0 });
    materials.set(url, made);
    return made;
  };
  const face = faceGeometry();
  const frontGeo = face.clone().translate(0, 0, CARD_T / 2 + FACE_EPS);
  const backGeo = face.clone().rotateY(Math.PI).translate(0, 0, -(CARD_T / 2 + FACE_EPS));
  face.dispose();
  const bodyGeo = bodyGeometry();
  const bodyMat = new MeshStandardMaterial({ color: linear("#f1e3c3"), roughness: 0.8, metalness: 0 });
  return {
    bodyGeo,
    frontGeo,
    backGeo,
    bodyMat,
    backMat: material(BACK_URL),
    faceMaterial: (card, shapes) => material(faceUrl(card, shapes)),
    dispose: () => {
      for (const texture of textures) texture.dispose();
      for (const made of materials.values()) made.dispose();
      bodyMat.dispose();
      bodyGeo.dispose();
      frontGeo.dispose();
      backGeo.dispose();
    },
  };
}

export function makeBody(scene: Scene, kit: CardKit): CardBody {
  const group = new Group();
  const body = new Mesh(kit.bodyGeo, kit.bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  const back = new Mesh(kit.backGeo, kit.backMat);
  back.receiveShadow = true;
  const face = new Mesh(kit.frontGeo, kit.backMat);
  face.receiveShadow = true;
  face.visible = false;
  group.add(body, back, face);
  group.visible = false;
  scene.add(group);
  return { group, face, back, home: { p: new Vector3(), q: new Quaternion() }, lie: { x: 0, y: 0, z: 0, yaw: 0, flip: 0 }, flight: null, placed: false, faceCard: null, faceDown: false, row: 0, shake: 0, sealedAt: -1 };
}

export function setFace(body: CardBody, kit: CardKit, card: Card | null, shapes: boolean): void {
  body.faceCard = card;
  body.face.visible = card !== null;
  if (card !== null) body.face.material = kit.faceMaterial(card, shapes);
}

export function lieHome(body: CardBody): void {
  body.home.p.set(body.lie.x, body.lie.y, body.lie.z);
  lieQuat(body.lie.yaw, body.lie.flip, body.home.q);
}

/** Moves one card for one frame: a scripted flight if it has one, else an ease toward where it belongs. Returns whether it is still moving, which is what keeps the next frame coming. */
export function stepBody(body: CardBody, dt: number, snap: boolean, dones: (() => void)[]): boolean {
  let busy = false;
  if (body.shake > 0) {
    body.shake = Math.max(0, body.shake - dt);
    busy = true;
  }
  const flight = body.flight;
  if (flight) {
    flight.t += dt;
    if (flight.t < 0) return true;
    if (!flight.started) {
      flight.started = true;
      flight.init?.(body);
    }
    const p = flight.dur > 0 ? Math.min(1, flight.t / flight.dur) : 1;
    body.group.visible = true;
    body.placed = true;
    if (p >= 1) {
      body.flight = null;
      body.group.position.copy(body.home.p);
      body.group.quaternion.copy(body.home.q);
      if (flight.done) dones.push(flight.done);
    } else {
      flight.fn(body, p);
    }
    return true;
  }
  if (!body.placed || snap) {
    body.group.position.copy(body.home.p);
    body.group.quaternion.copy(body.home.q);
    body.placed = true;
    body.group.visible = true;
    return busy;
  }
  const off = body.group.position.distanceToSquared(body.home.p);
  const turn = 1 - Math.abs(body.group.quaternion.dot(body.home.q));
  if (off > REST || turn > REST) {
    const k = 1 - Math.exp(-dt * EASE_RATE);
    body.group.position.lerp(body.home.p, k);
    body.group.quaternion.slerp(body.home.q, k);
    return true;
  }
  return busy;
}

export interface Rows {
  readonly meshes: readonly InstancedMesh[];
  readonly step: (targets: readonly (readonly Lie[])[], hidden: readonly number[], dt: number, snap: boolean) => boolean;
  readonly current: (row: number, index: number) => Lie | null;
}

/** Every rival card is the same sealed back, so all rows are two instanced meshes, bodies and backs, however many seats and cards there are. Each instance eases toward its slot on its own, which is the whole reflow when a row grows or closes up. */
export function createRows(scene: Scene, kit: CardKit): Rows {
  const bodies = new InstancedMesh(kit.bodyGeo, kit.bodyMat, ROW_CAPACITY);
  const backs = new InstancedMesh(kit.backGeo, kit.backMat, ROW_CAPACITY);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  backs.receiveShadow = true;
  for (const mesh of [bodies, backs]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const now: Lie[][] = [];
  const dummy = new Object3D();
  const step: Rows["step"] = (targets, hidden, dt, snap) => {
    const k = snap ? 1 : 1 - Math.exp(-dt * EASE_RATE);
    let busy = false;
    let used = 0;
    now.length = targets.length;
    for (let r = 0; r < targets.length; r++) {
      const row = targets[r] ?? [];
      const held = (now[r] ??= []);
      const shown = Math.max(0, row.length - (hidden[r] ?? 0));
      held.length = Math.min(held.length, shown);
      for (let j = 0; j < shown && used < ROW_CAPACITY; j++) {
        const to = row[j];
        if (!to) continue;
        let at = held[j];
        if (!at) {
          at = { ...to };
          held[j] = at;
        } else {
          const far = Math.abs(to.x - at.x) + Math.abs(to.y - at.y) + Math.abs(to.z - at.z) + Math.abs(to.yaw - at.yaw) + Math.abs(to.flip - at.flip);
          if (far > 1e-4) {
            at.x += (to.x - at.x) * k;
            at.y += (to.y - at.y) * k;
            at.z += (to.z - at.z) * k;
            at.yaw += (to.yaw - at.yaw) * k;
            at.flip += (to.flip - at.flip) * k;
            busy = true;
          }
        }
        dummy.position.set(at.x, at.y, at.z);
        lieQuat(at.yaw, at.flip, dummy.quaternion);
        dummy.updateMatrix();
        bodies.setMatrixAt(used, dummy.matrix);
        backs.setMatrixAt(used, dummy.matrix);
        used++;
      }
    }
    bodies.count = used;
    backs.count = used;
    bodies.instanceMatrix.needsUpdate = true;
    backs.instanceMatrix.needsUpdate = true;
    return busy;
  };
  return { meshes: [bodies, backs], step, current: (row, index) => now[row]?.[index] ?? null };
}
