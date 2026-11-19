import {
  ACESFilmicToneMapping,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Fog,
  HemisphereLight,
  LatheGeometry,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SpotLight,
  type Texture,
  TextureLoader,
  Vector2,
  type WebGLRenderTarget,
  WebGLRenderer,
  sRGBEncoding,
} from "three";
import { buildCardKit, buildDeckStack, faceOf, makeCard, place } from "./cards";
import { linear } from "./color";
import { createFurniture } from "../table3d/furnish";
import { BASE_ASPECT, CARD_T, CHAIRS, DECK, DECK_TOP, DRAWN_FACE, FIRST_FACE, FOG_FAR, FOG_NEAR, HAND_FACES, HAND_SIZE, LAMP_INTENSITY, LAMP_Y, PEEKED_FACE, PEEK_SEAT, PEEK_SLOT, PRINT, ROOM_INK, SEATS, TABLE_CUT } from "./constants";
import { seeded } from "./random";
import type { CardRig, Rig } from "./state";
import { printTexture } from "./textures";

interface Lights {
  readonly spot: SpotLight;
  readonly violet: SpotLight;
}

function isSoftware(renderer: WebGLRenderer): boolean {
  const context = renderer.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|software/i.test(gpu);
}

function addLights(scene: Scene, shadowSize: number): Lights {
  scene.add(new HemisphereLight(linear("#41705f"), linear("#050a08"), 0.5));

  const spot = new SpotLight(linear("#ffe2b8"), LAMP_INTENSITY, 16, 0.92, 0.9, 1.1);
  spot.position.set(0, LAMP_Y, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(shadowSize, shadowSize);
  spot.shadow.camera.near = 1;
  spot.shadow.camera.far = 14;
  spot.shadow.bias = -0.0005;
  spot.shadow.normalBias = 0.012;
  scene.add(spot);
  scene.add(spot.target);

  const violet = new SpotLight(linear("#9b4fc9"), 0, 14, 0.6, 1, 1);
  violet.position.set(0.4, 4.2, 5.0);
  violet.target.position.set(0, 0, 2.7);
  scene.add(violet);
  scene.add(violet.target);
  return { spot, violet };
}

function addTable(scene: Scene, textures: Texture[], withFloor: boolean): void {
  const furniture = createFurniture(scene, textures, withFloor);
  furniture.setCut(TABLE_CUT);
  furniture.setChairs(CHAIRS);

  const name = printTexture();
  textures.push(name);
  const print = new Mesh(
    new PlaneGeometry(PRINT.w, PRINT.d),
    new MeshStandardMaterial({ map: name, transparent: true, opacity: PRINT.ink, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  print.rotation.x = -Math.PI / 2;
  print.position.set(PRINT.x, 0.003, PRINT.z);
  print.receiveShadow = true;
  print.renderOrder = 1;
  scene.add(print);
}

function addLamp(scene: Scene): void {
  const profile = [new Vector2(0.22, 1.0), new Vector2(0.4, 0.92), new Vector2(1.5, 0.14), new Vector2(1.62, 0)];
  const shade = new Mesh(new LatheGeometry(profile, 40), new MeshStandardMaterial({ color: linear("#0f3327"), roughness: 0.45, metalness: 0.1, side: DoubleSide }));
  shade.position.y = LAMP_Y + 0.15;
  scene.add(shade);
  const bulb = new Mesh(new CircleGeometry(1.05, 32), new MeshBasicMaterial({ color: linear("#f5c777") }));
  bulb.rotation.x = Math.PI / 2;
  bulb.position.y = LAMP_Y + 0.49;
  scene.add(bulb);
  const cord = new Mesh(new CylinderGeometry(0.025, 0.025, 6, 6), new MeshStandardMaterial({ color: linear("#0a0a0a"), roughness: 0.8 }));
  cord.position.y = LAMP_Y + 4.1;
  scene.add(cord);
}

function addCards(scene: Scene, renderer: WebGLRenderer, manager: LoadingManager, textures: Texture[]): Pick<Rig, "hand" | "rivals" | "first" | "draws" | "deckTop" | "deckStack"> {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const kit = buildCardKit(new TextureLoader(manager), anisotropy, textures);
  const rnd = seeded(77);

  const hand = HAND_FACES.map((name) => makeCard(scene, kit, faceOf(kit, name)));
  const rivals: CardRig[] = [];
  for (let seat = 0; seat < SEATS.length; seat++) {
    for (let slot = 0; slot < HAND_SIZE; slot++) {
      const card = makeCard(scene, kit, seat === PEEK_SEAT && slot === PEEK_SLOT ? faceOf(kit, PEEKED_FACE) : null);
      card.jit = (rnd() - 0.5) * 0.06;
      rivals.push(card);
    }
  }
  const first = makeCard(scene, kit, faceOf(kit, FIRST_FACE));
  const draws = [makeCard(scene, kit, null), makeCard(scene, kit, null), makeCard(scene, kit, faceOf(kit, DRAWN_FACE))];
  const deckTop = makeCard(scene, kit, null);
  place(deckTop, DECK.x, DECK_TOP + CARD_T / 2, DECK.z, DECK.yaw, 0, Math.PI, true);
  const deckStack = buildDeckStack(kit, rnd);
  scene.add(deckStack);
  return { hand, rivals, first, draws, deckTop, deckStack };
}

function disposeParts(renderer: WebGLRenderer, canvas: HTMLCanvasElement, scene: Scene, textures: readonly Texture[], manager: LoadingManager): void {
  const seen = new Set<{ dispose(): void }>();
  const once = (item: { dispose(): void }) => {
    if (seen.has(item)) return;
    seen.add(item);
    item.dispose();
  };
  manager.onLoad = () => undefined;
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      once(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) once(material);
    }
    if (object instanceof SpotLight) {
      const map: WebGLRenderTarget | null = object.shadow.map;
      map?.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

/** Every mount draws on a canvas of its own. A canvas whose context was thrown away on unmount can not be given a new one, and in development React mounts the page twice. */
export function createRig(stage: HTMLElement, band: boolean, forceHq: boolean): Rig | null {
  const canvas = document.createElement("canvas");
  canvas.className = "br-canvas";
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    console.warn("Landing: WebGL is not available, showing the still page.");
    return null;
  }
  const scene = new Scene();
  const manager = new LoadingManager();
  const textures: Texture[] = [];
  try {
    const soft = !forceHq && isSoftware(renderer);
    renderer.outputEncoding = sRGBEncoding;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = soft ? PCFShadowMap : PCFSoftShadowMap;
    renderer.setClearColor(ROOM_INK, 1);

    const camera = new PerspectiveCamera(30, BASE_ASPECT, 0.4, 60);
    const lights = addLights(scene, band || soft ? 1024 : 2048);
    scene.fog = new Fog(ROOM_INK, FOG_NEAR, FOG_FAR);
    addTable(scene, textures, !soft);
    addLamp(scene);
    const cards = addCards(scene, renderer, manager, textures);
    stage.prepend(canvas);
    return { renderer, canvas, scene, camera, manager, textures, soft, ...lights, ...cards };
  } catch (error) {
    console.error(error);
    disposeParts(renderer, canvas, scene, textures, manager);
    return null;
  }
}

export function disposeRig(rig: Rig): void {
  disposeParts(rig.renderer, rig.canvas, rig.scene, rig.textures, rig.manager);
}
