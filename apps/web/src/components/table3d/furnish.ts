import { BufferGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PointLight, type Scene, type Texture } from "three";
import { linear } from "../landing/color";
import { feltTexture } from "../landing/textures";
import { FLOOR_Y } from "./constants";
import { chairGeometry, floorGeometry, tableGeometry } from "./furniture";
import type { TableCut } from "./layout";
import { boardsTexture, woodTexture } from "./textures";

const BOUNCE_INTENSITY = 0.75;
const BOUNCE_REACH = 44;
const BOUNCE_Y = -1.2;
const MAX_CHAIRS = 3;

export interface ChairSpot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface Furniture {
  readonly setCut: (cut: TableCut) => void;
  readonly setChairs: (spots: readonly ChairSpot[]) => void;
  readonly show: (on: boolean) => void;
}

/** The table, the floor under it and the chairs round it are one set shared by the game and the landing page, so both show the same room. The floor is left out where WebGL is drawn in software. */
export function createFurniture(scene: Scene, textures: Texture[], withFloor: boolean): Furniture {
  const feltTex = feltTexture();
  feltTex.repeat.set(1, 1);
  const wood = woodTexture();
  const boards = boardsTexture();
  textures.push(feltTex, wood, boards);

  const felt = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: linear("#235a47"), roughness: 1, metalness: 0, map: feltTex, bumpMap: feltTex, bumpScale: 0.006, vertexColors: true }));
  felt.receiveShadow = true;
  const rail = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ map: wood, roughness: 0.38, metalness: 0 }));
  rail.castShadow = true;
  rail.receiveShadow = true;
  const inlay = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: linear("#b48c3c"), roughness: 0.3, metalness: 0.6 }));
  inlay.receiveShadow = true;
  const floor = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ map: boards, roughness: 0.66, metalness: 0, vertexColors: true }));
  floor.position.y = FLOOR_Y;
  floor.visible = withFloor;
  scene.add(felt, rail, inlay, floor);

  /** Nothing outside the table is inside the lamp's cone. What a room shows there is the light the baize throws back, so one unshadowed light sits under the felt plane: it reaches the rail's inner face, the chairs and the floor, and can not touch the felt or a card lying on it. */
  const bounce = new PointLight(linear("#ffd9a6"), BOUNCE_INTENSITY, BOUNCE_REACH, 1.2);
  scene.add(bounce);

  const chair = chairGeometry();
  const chairWood = new InstancedMesh(chair.wood, new MeshStandardMaterial({ map: wood, color: linear("#ece6e0"), roughness: 0.42, metalness: 0, vertexColors: true }), MAX_CHAIRS);
  const chairPad = new InstancedMesh(chair.pad, new MeshStandardMaterial({ color: linear("#24110d"), roughness: 0.55, metalness: 0, vertexColors: true }), MAX_CHAIRS);
  for (const mesh of [chairWood, chairPad]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }

  let cutKey = "";
  return {
    setCut: (cut: TableCut) => {
      bounce.position.set(0, BOUNCE_Y, (cut.z0 + cut.z1) / 2 - 0.4);
      const key = [cut.hx, cut.z0, cut.z1, cut.r].join();
      if (key === cutKey) return;
      cutKey = key;
      const made = tableGeometry(cut);
      for (const mesh of [felt, rail, inlay, floor]) mesh.geometry.dispose();
      felt.geometry = made.felt;
      rail.geometry = made.wood;
      inlay.geometry = made.brass;
      floor.geometry = floorGeometry(cut);
    },
    /** Chairs stand only where somebody sits: an empty side of the table shows its rail and the dark behind it. */
    setChairs: (spots: readonly ChairSpot[]) => {
      const dummy = new Object3D();
      const count = Math.min(spots.length, MAX_CHAIRS);
      for (let i = 0; i < count; i++) {
        const spot = spots[i];
        if (!spot) continue;
        dummy.position.set(spot.x, FLOOR_Y, spot.z);
        dummy.rotation.set(0, spot.yaw, 0);
        dummy.updateMatrix();
        chairWood.setMatrixAt(i, dummy.matrix);
        chairPad.setMatrixAt(i, dummy.matrix);
      }
      chairWood.count = count;
      chairPad.count = count;
      chairWood.instanceMatrix.needsUpdate = true;
      chairPad.instanceMatrix.needsUpdate = true;
    },
    show: (on: boolean) => {
      rail.visible = on;
      inlay.visible = on;
      floor.visible = on && withFloor;
      chairWood.visible = on;
      chairPad.visible = on;
    },
  };
}
