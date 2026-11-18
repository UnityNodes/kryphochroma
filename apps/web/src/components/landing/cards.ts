import { BufferAttribute, ExtrudeGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, type Scene, Shape, ShapeGeometry, type Texture, type TextureLoader, sRGBEncoding } from "three";
import { BACK_FACE, BEVEL, CARD_H, CARD_T, CARD_W, CORNER, DECK, DRAWN_FACE, FACE_EPS, FIRST_FACE, HAND_FACES, PEEKED_FACE, cardUrl } from "./constants";
import { linear } from "./color";
import type { CardRig } from "./state";

export interface CardKit {
  readonly bodyGeo: ExtrudeGeometry;
  readonly faceGeo: ShapeGeometry;
  readonly bodyMat: MeshStandardMaterial;
  readonly backMat: MeshStandardMaterial;
  readonly faces: ReadonlyMap<string, MeshStandardMaterial>;
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
  const geometry = new ExtrudeGeometry(roundedRect(CARD_W - BEVEL * 2, CARD_H - BEVEL * 2, CORNER - BEVEL), {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function faceGeometry(): ShapeGeometry {
  const geometry = new ShapeGeometry(roundedRect(CARD_W - BEVEL * 2 - 0.004, CARD_H - BEVEL * 2 - 0.004, CORNER - BEVEL), 5);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  if (!(position instanceof BufferAttribute) || !(uv instanceof BufferAttribute)) throw new Error("card face geometry has no plain attributes");
  for (let v = 0; v < position.count; v++) {
    uv.setXY(v, position.getX(v) / CARD_W + 0.5, position.getY(v) / CARD_H + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function buildCardKit(loader: TextureLoader, anisotropy: number, textures: Texture[]): CardKit {
  const faceMaterial = (name: string): MeshStandardMaterial => {
    const texture = loader.load(cardUrl(name));
    texture.encoding = sRGBEncoding;
    texture.anisotropy = anisotropy;
    textures.push(texture);
    return new MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0 });
  };
  const backMat = faceMaterial(BACK_FACE);
  const faces = new Map<string, MeshStandardMaterial>();
  for (const name of [...HAND_FACES, FIRST_FACE, PEEKED_FACE, DRAWN_FACE]) faces.set(name, faceMaterial(name));
  return {
    bodyGeo: bodyGeometry(),
    faceGeo: faceGeometry(),
    bodyMat: new MeshStandardMaterial({ color: linear("#f1e3c3"), roughness: 0.8, metalness: 0 }),
    backMat,
    faces,
  };
}

export function faceOf(kit: CardKit, name: string): MeshStandardMaterial {
  const material = kit.faces.get(name);
  if (!material) throw new Error(`no card face ${name}`);
  return material;
}

export function makeCard(scene: Scene, kit: CardKit, front: MeshStandardMaterial | null): CardRig {
  const pivot = new Group();
  const tilt = new Group();
  const flip = new Group();
  const body = new Mesh(kit.bodyGeo, kit.bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  const back = new Mesh(kit.faceGeo, kit.backMat);
  back.rotation.y = Math.PI;
  back.position.z = -(CARD_T / 2 + FACE_EPS);
  back.receiveShadow = true;
  flip.add(body);
  flip.add(back);
  if (front) {
    const face = new Mesh(kit.faceGeo, front);
    face.position.z = CARD_T / 2 + FACE_EPS;
    face.receiveShadow = true;
    flip.add(face);
  }
  tilt.add(flip);
  pivot.add(tilt);
  scene.add(pivot);
  return { pivot, tilt, flip, hover: 0, jit: 0, rest: false, rx: 0, rz: 0, ryaw: 0 };
}

export function place(card: CardRig, x: number, y: number, z: number, yaw: number, tilt: number, flip: number, visible: boolean): void {
  card.pivot.visible = visible;
  if (!visible) return;
  card.pivot.position.set(x, y, z);
  card.pivot.rotation.y = yaw;
  card.tilt.rotation.x = -Math.PI / 2 + tilt;
  card.flip.rotation.y = flip;
}

export function buildDeckStack(kit: CardKit, rnd: () => number): InstancedMesh {
  const stack = new InstancedMesh(kit.bodyGeo, kit.bodyMat, DECK.n);
  const dummy = new Object3D();
  dummy.rotation.order = "YXZ";
  for (let k = 0; k < DECK.n; k++) {
    const x = DECK.x + (rnd() - 0.5) * 0.022;
    const z = DECK.z + (rnd() - 0.5) * 0.022;
    dummy.position.set(x, DECK.step * (k + 0.5), z);
    dummy.rotation.set(-Math.PI / 2, DECK.yaw + (rnd() - 0.5) * 0.05, 0);
    dummy.scale.set(1, 1, DECK.step / CARD_T);
    dummy.updateMatrix();
    stack.setMatrixAt(k, dummy.matrix);
  }
  stack.instanceMatrix.needsUpdate = true;
  stack.castShadow = true;
  stack.receiveShadow = true;
  return stack;
}
