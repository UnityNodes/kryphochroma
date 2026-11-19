import {
  ACESFilmicToneMapping,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SpotLight,
  type Texture,
  WebGLRenderer,
  sRGBEncoding,
} from "three";
import { linear } from "../landing/color";
import { seeded } from "../landing/random";
import { type CardKit, createCardKit } from "./cards";
import { CARD_H, CARD_T, CARD_TINTS, CARD_W, DECK_SLAB, DECK_SLABS, LAMP_Y, ROOM_INK } from "./constants";
import { createFurniture } from "./furnish";
import type { Layout, SeatSpot } from "./layout";
import { RING_TEX_R, chalkTexture, outlineTexture, printTexture } from "./textures";

const LAMP_INTENSITY = 2.25;
const KEY_INTENSITY = 1.39;
const KEY_REACH = 20;
const RING_INK = 0.92;
const RING_FADE_S = 0.45;
const PRINT_INK = 0.46;
const OUTLINE_INK = 0.5;
const SOFT_SCALE = 0.8;
const SOFT_PIXELS = 500000;
const MAX_RATIO = { phone: 1.25, desktop: 1.75 } as const;

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly kit: CardKit;
  readonly soft: boolean;
  lite: boolean;
  dirty: boolean;
  onDirty: (() => void) | null;
  layout: Layout | null;
  readonly applyLayout: (layout: Layout) => void;
  readonly resize: (width: number, height: number, portrait: boolean) => void;
  readonly setChairs: (seats: readonly SeatSpot[]) => void;
  readonly setDeck: (slabs: number) => void;
  readonly setPileBase: (height: number) => void;
  readonly setRing: (color: number | null, instant: boolean) => void;
  readonly stepRing: (dt: number) => boolean;
  readonly sway: (time: number, amount: number) => void;
  readonly showFurniture: (on: boolean) => void;
  readonly dropToLite: () => void;
  readonly render: () => void;
  readonly stats: () => { calls: number; triangles: number };
  readonly dispose: () => void;
}

function isSoftware(renderer: WebGLRenderer): boolean {
  const context = renderer.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|software/i.test(gpu);
}

function build(renderer: WebGLRenderer, canvas: HTMLCanvasElement, forceHq: boolean, phone: boolean, textures: Texture[]): Stage {
  const soft = !forceHq && isSoftware(renderer);
  renderer.outputEncoding = sRGBEncoding;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = soft ? PCFShadowMap : PCFSoftShadowMap;
  renderer.setClearColor(ROOM_INK, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1.6, 0.6, 80);
  scene.fog = new Fog(ROOM_INK, 27, 60);
  scene.add(new HemisphereLight(linear("#41705f"), linear("#050a08"), 0.5));

  const spot = new SpotLight(linear("#ffe2b8"), LAMP_INTENSITY, 17, 0.98, 0.9, 1.1);
  spot.castShadow = true;
  const lampMap = phone || soft ? 1024 : 2048;
  spot.shadow.mapSize.set(lampMap, lampMap);
  spot.shadow.camera.near = 1;
  spot.shadow.camera.far = 14;
  spot.shadow.bias = -0.0005;
  spot.shadow.normalBias = 0.012;
  scene.add(spot, spot.target);

  /** The hanging lamp sits behind a hand that is held up to the player, so on its own it would only rim the cards. A second, shadowed light from over the player's shoulder is what reads the faces; it is aimed at the fan and nothing else, and it stops short of the floor, where its shadow map ends. */
  const key = new SpotLight(linear("#fff0dc"), KEY_INTENSITY, KEY_REACH, 0.5, 0.6, 0.3);
  key.castShadow = !soft;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 22;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  scene.add(key, key.target);

  const furniture = createFurniture(scene, textures, !soft);
  const chalk = chalkTexture();
  const stage: { dirty: boolean; onDirty: (() => void) | null } = { dirty: true, onDirty: null };
  const touch = () => {
    stage.dirty = true;
    stage.onDirty?.();
  };
  const print = printTexture(touch);
  const outline = outlineTexture();
  textures.push(chalk, print, outline);

  const printMesh = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: print, transparent: true, opacity: PRINT_INK, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  printMesh.rotation.x = -Math.PI / 2;
  printMesh.receiveShadow = true;
  printMesh.renderOrder = 1;
  scene.add(printMesh);

  const emptyDeck = new Mesh(new PlaneGeometry(CARD_W, CARD_H), new MeshStandardMaterial({ map: outline, color: linear("#f4e6c8"), transparent: true, opacity: OUTLINE_INK, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  emptyDeck.receiveShadow = true;
  emptyDeck.renderOrder = 1;
  emptyDeck.visible = false;
  scene.add(emptyDeck);

  const ringGeo = new PlaneGeometry(1, 1);
  const ringMesh = (): Mesh<PlaneGeometry, MeshStandardMaterial> => {
    const mesh = new Mesh(ringGeo, new MeshStandardMaterial({ map: chalk, emissiveMap: chalk, emissive: 0x000000, transparent: true, opacity: 0, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  };
  const ringA = ringMesh();
  const ringB = ringMesh();
  let ringT = 1;
  let ringColor: number | null = null;

  const kit = createCardKit(Math.min(8, renderer.capabilities.getMaxAnisotropy()), touch);
  const stack = new InstancedMesh(kit.bodyGeo, kit.bodyMat, DECK_SLABS);
  stack.castShadow = true;
  stack.receiveShadow = true;
  stack.count = 0;
  scene.add(stack);
  const base = new Mesh(kit.bodyGeo, kit.bodyMat);
  base.rotation.x = -Math.PI / 2;
  base.rotation.z = 0.06;
  base.castShadow = true;
  base.receiveShadow = true;
  base.visible = false;
  scene.add(base);

  const swayBase = { x: 0, z: 0 };
  let phoneNow = phone;

  const self: Stage = Object.assign(stage, {
    renderer,
    canvas,
    scene,
    camera,
    kit,
    soft,
    lite: soft,
    layout: null as Layout | null,
    applyLayout: (layout: Layout) => {
      self.layout = layout;
      camera.fov = layout.fov;
      camera.aspect = layout.W / layout.H;
      camera.position.set(layout.cam.x, layout.cam.y, layout.cam.z);
      camera.lookAt(layout.look.x, layout.look.y, layout.look.z);
      camera.updateProjectionMatrix();

      spot.position.set(layout.lamp.x, LAMP_Y, layout.lamp.z);
      spot.intensity = LAMP_INTENSITY * layout.lamp.gain;
      spot.angle = layout.lamp.angle;
      swayBase.x = layout.lamp.x;
      swayBase.z = layout.lamp.z;
      self.sway(0, 0);

      furniture.setCut(layout.table);

      const fan = layout.fan;
      key.position.set(fan.origin.x - 2.4, fan.origin.y + fan.normal.y * 6.2 + fan.up.y * 4.2, fan.origin.z + fan.normal.z * 6.2 + fan.up.z * 4.2);
      key.target.position.set(fan.origin.x, fan.origin.y + fan.up.y * 0.4, fan.origin.z + fan.up.z * 0.4);
      key.angle = Math.min(0.72, Math.atan((fan.maxSpan / 2 + 1.25) / 7.8) + 0.05);

      printMesh.scale.set(layout.print.w, layout.print.d, 1);
      printMesh.position.set(layout.print.x, 0.003, layout.print.z);

      const ringScale = (layout.ring / RING_TEX_R) * 2;
      ringA.scale.set(ringScale, ringScale, 1);
      ringB.scale.set(ringScale, ringScale, 1);
      ringA.position.set(layout.pile.x, 0.004, layout.pile.z);
      ringB.position.set(layout.pile.x, 0.0045, layout.pile.z);
      emptyDeck.position.set(layout.deck.x, 0.003, layout.deck.z);
      emptyDeck.rotation.set(-Math.PI / 2, 0, layout.deck.yaw);
      base.position.x = layout.pile.x;
      base.position.z = layout.pile.z;

      const rnd = seeded(77);
      const dummy = new Object3D();
      dummy.rotation.order = "YXZ";
      for (let k = 0; k < DECK_SLABS; k++) {
        dummy.position.set(layout.deck.x + (rnd() - 0.5) * 0.022, DECK_SLAB * (k + 0.5), layout.deck.z + (rnd() - 0.5) * 0.022);
        dummy.rotation.set(-Math.PI / 2, layout.deck.yaw + (rnd() - 0.5) * 0.05, 0);
        dummy.scale.set(1, 1, DECK_SLAB / CARD_T);
        dummy.updateMatrix();
        stack.setMatrixAt(k, dummy.matrix);
      }
      stack.instanceMatrix.needsUpdate = true;
      stage.dirty = true;
    },
    resize: (width: number, height: number, portrait: boolean) => {
      phoneNow = portrait;
      let ratio = Math.min(window.devicePixelRatio || 1, phoneNow ? MAX_RATIO.phone : MAX_RATIO.desktop);
      if (soft) {
        if (width * height > SOFT_PIXELS) ratio = SOFT_SCALE;
      } else if (self.lite) {
        ratio = Math.min(ratio, 1);
      }
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      stage.dirty = true;
    },
    setChairs: (seats: readonly SeatSpot[]) => {
      furniture.setChairs(seats.flatMap((seat) => (seat.chair ? [seat.chair] : [])));
      stage.dirty = true;
    },
    setDeck: (slabs: number) => {
      if (stack.count === slabs && emptyDeck.visible === (slabs === 0)) return;
      stack.count = slabs;
      emptyDeck.visible = slabs === 0;
      stage.dirty = true;
    },
    setPileBase: (height: number) => {
      const visible = height > 0.004;
      if (base.visible === visible && Math.abs(base.position.y - height / 2) < 1e-6) return;
      base.visible = visible;
      base.position.y = height / 2;
      base.scale.set(1, 1, Math.max(0.01, height / CARD_T));
      stage.dirty = true;
    },
    setRing: (color: number | null, instant: boolean) => {
      if (color === ringColor) return;
      ringColor = color;
      const hex = color === null ? undefined : CARD_TINTS[color];
      ringB.material.color.copy(ringA.material.color);
      ringB.material.emissive.copy(ringA.material.emissive);
      ringB.rotation.z = ringA.rotation.z;
      ringB.material.opacity = ringA.material.opacity;
      if (hex) {
        ringA.material.color.copy(linear(hex)).multiplyScalar(1.05);
        ringA.material.emissive.copy(linear(hex)).multiplyScalar(0.22);
        ringA.rotation.z = ringB.rotation.z + 1.9;
      }
      ringT = instant ? 1 : 0;
      self.stepRing(0);
      stage.dirty = true;
    },
    stepRing: (dt: number) => {
      if (ringT < 1) ringT = Math.min(1, ringT + dt / RING_FADE_S);
      const e = ringT * ringT * (3 - 2 * ringT);
      ringA.material.opacity = ringColor === null ? 0 : RING_INK * e;
      ringB.material.opacity = Math.min(ringB.material.opacity, RING_INK * (1 - e));
      ringB.visible = ringB.material.opacity > 0.003;
      return ringT < 1;
    },
    sway: (time: number, amount: number) => {
      spot.target.position.set(swayBase.x + Math.sin(time * 0.8) * 0.07 * amount, 0, swayBase.z + Math.cos(time * 0.63) * 0.05 * amount);
    },
    showFurniture: (on: boolean) => {
      furniture.show(on);
      stage.dirty = true;
    },
    /** Called when frames keep coming late on a real GPU: the second shadow map and the extra pixels go first, the table stays. */
    dropToLite: () => {
      if (self.lite) return;
      self.lite = true;
      key.castShadow = false;
      renderer.shadowMap.type = PCFShadowMap;
      scene.traverse((object) => {
        if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) object.material.needsUpdate = true;
      });
      if (self.layout) self.resize(self.layout.W, self.layout.H, phoneNow);
    },
    render: () => {
      stage.dirty = false;
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose: () => {
      const seen = new Set<{ dispose(): void }>();
      const once = (item: { dispose(): void }) => {
        if (seen.has(item)) return;
        seen.add(item);
        item.dispose();
      };
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          once(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) once(material);
        }
        if (object instanceof SpotLight) object.shadow.map?.dispose();
      });
      kit.dispose();
      for (const texture of textures) texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  });
  return self;
}

/** Every mount draws on a canvas of its own. A canvas whose context was thrown away on unmount can not be given a new one, and in development React mounts the table twice. */
export function createStage(host: HTMLElement, forceHq: boolean, phone: boolean): Stage | null {
  const canvas = document.createElement("canvas");
  canvas.className = "kc-3d-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const textures: Texture[] = [];
  try {
    const stage = build(renderer, canvas, forceHq, phone, textures);
    host.prepend(canvas);
    return stage;
  } catch (error) {
    console.error(error);
    for (const texture of textures) texture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
}
