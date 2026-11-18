import type { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Group, InstancedMesh, LoadingManager, PerspectiveCamera, Raycaster, Scene, SpotLight, Texture, Vector2, Vector3, WebGLRenderer } from "three";
import type { Slot, TablePoint } from "./layout";
import type { Frame } from "./pose";

export const SHOT_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"] as const;
export type ShotKey = (typeof SHOT_KEYS)[number];
export type Progress = Record<ShotKey | "c", number>;

export function isShotKey(key: string): key is ShotKey {
  return (SHOT_KEYS as readonly string[]).includes(key);
}

export interface CardRig {
  readonly pivot: Group;
  readonly tilt: Group;
  readonly flip: Group;
  hover: number;
  jit: number;
  rest: boolean;
  rx: number;
  rz: number;
  ryaw: number;
}

export interface Rig {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly spot: SpotLight;
  readonly violet: SpotLight;
  readonly manager: LoadingManager;
  readonly textures: Texture[];
  readonly hand: readonly CardRig[];
  readonly rivals: readonly CardRig[];
  readonly first: CardRig;
  readonly draws: readonly CardRig[];
  readonly deckTop: CardRig;
  readonly deckStack: InstancedMesh;
  readonly soft: boolean;
}

export interface Tag {
  readonly el: HTMLElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fadeIn: readonly [number, number];
  readonly fadeOut: readonly [number, number];
  shown: number;
}

export interface Overlay {
  readonly tags: readonly Tag[];
  readonly countEl: HTMLElement;
  readonly scrimL: HTMLElement;
  readonly scrimR: HTMLElement;
  shownL: number;
  shownR: number;
  count: number;
}

export interface Room {
  readonly root: HTMLElement;
  readonly stageEl: HTMLElement;
  readonly reduced: boolean;
  readonly mq: MediaQueryList;
  readonly prog: Progress;
  readonly cur: Frame;
  readonly slot: Slot;
  readonly hit: TablePoint;
  readonly vec: Vector3;
  readonly ndc: Vector2;
  readonly ray: Raycaster;
  readonly trig: ScrollTrigger[];
  readonly step: FrameRequestCallback;
  closeTrig: ScrollTrigger | null;
  rig: Rig | null;
  overlay: Overlay | null;
  still: boolean;
  band: boolean;
  ready: boolean;
  onstage: boolean;
  docHidden: boolean;
  raf: number;
  timer: number;
  t0: number;
  last: number;
  time: number;
  W: number;
  H: number;
  px: number;
  py: number;
  ptx: number;
  pty: number;
  pin: boolean;
  pdirty: boolean;
  hover: number;
  held: number;
  lite: boolean;
  soft: boolean;
  tier: number;
  seenT: number;
  seenC: number;
  moved: number;
  drawn: number;
  drew: boolean;
  slow: number;
  busy: boolean;
  force: boolean;
  lastT: number;
  lastC: number;
}
