import {
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import {
  RARE_ROOM_CENTER_X,
  RARE_ROOM_CENTER_Z,
  RARE_ROOM_DOOR_CENTER_X,
} from "~/game/shopLayout";
import {SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";
import type {AddBox} from "~/game/interior/interiorPrimitives";
/** Callback signature for building a spine-shelf fixture. */
export type CreateSpineShelfFixture = (
  parent: Group,
  id: string,
  x: number,
  z: number,
  length: number,
  bayCount: number,
  faceNormals: readonly (-1 | 1)[],
  woodMaterial: MeshStandardMaterial,
  backingMaterial: MeshStandardMaterial,
  edgeMaterial: MeshStandardMaterial,
  backingThickness?: number,
) => void;

export type AutomaticDoor = {
  centerX: number;
  centerZ: number;
  open: number;
  openAngle: number;
  pivot: Group;
};

export const RARE_ROOM_DOOR_Z = -1.92;

/** Thickness of the special-collection room's shelf backing. */
export const SPECIAL_COLLECTION_BACKING_THICKNESS = 0.22;

/**
 * Runtime door state for the upper hallway and the special-collection
 * room: pivots damp toward open when the player is near.
 */
export class DoorSystem {
  readonly rareRoomPivot = new Group();
  #rareRoomOpen = 0;
  readonly #hallway: AutomaticDoor[] = [];

  registerHallwayDoor(door: AutomaticDoor): void {
    this.#hallway.push(door);
  }

  updateRareRoom(deltaSeconds: number, cameraX: number, cameraZ: number) {
    const distance = Math.hypot(
      cameraX - RARE_ROOM_DOOR_CENTER_X,
      cameraZ - RARE_ROOM_DOOR_Z,
    );
    const target = distance < 3.35 ? 1 : 0;
    this.#rareRoomOpen = MathUtils.damp(
      this.#rareRoomOpen,
      target,
      target > 0 ? 9 : 5,
      deltaSeconds,
    );
    this.rareRoomPivot.rotation.y = this.#rareRoomOpen * Math.PI * 0.52;
  }

  updateHallway(deltaSeconds: number, cameraX: number, cameraZ: number) {
    for (const door of this.#hallway) {
      const distance = Math.hypot(
        cameraX - door.centerX,
        cameraZ - door.centerZ,
      );
      const target = distance < 3.35 ? 1 : 0;
      door.open = MathUtils.damp(
        door.open,
        target,
        target > 0 ? 9 : 5,
        deltaSeconds,
      );
      door.pivot.rotation.y = door.open * door.openAngle;
    }
  }
}

export const createHallwayDoor = (
  parent: Group,
  id: string,
  centerX: number,
  centerZ: number,
  wallAxis: "x" | "z",
  corridorDirection: -1 | 1,
  woodMaterial: MeshStandardMaterial,
  addBox: AddBox,
): AutomaticDoor[] => {
  const frameMaterial = woodMaterial.clone();
  frameMaterial.color.set("#3d302a");
  const doorMaterial = woodMaterial.clone();
  doorMaterial.color.set("#594038");
  const frameThickness = 0.18;
  const framePostOffset = 1.42;
  const frameHeaderCenterY = SHOP_UPPER_FLOOR_Y + 2.52;
  const leafHalfWidth = framePostOffset - frameThickness / 2;
  const leafHeight =
    frameHeaderCenterY - frameThickness / 2 - SHOP_UPPER_FLOOR_Y;
  const frameCenterY = SHOP_UPPER_FLOOR_Y + 1.3;
  const doorGroup = new Group();
  doorGroup.name = `upper-hallway-door-${id}`;
  // Door leaves rotate with their pivots during play; they are not static
  // architecture even though their materials match nearby trim.
  doorGroup.userData.excludeFromStaticBatch = true;
  doorGroup.position.set(centerX, 0, centerZ);
  if (wallAxis === "z") doorGroup.rotation.y = Math.PI / 2;
  parent.add(doorGroup);
  for (const z of [-framePostOffset, framePostOffset])
    addBox(
      doorGroup,
      [frameThickness, 2.6, frameThickness],
      [0, frameCenterY, z],
      frameMaterial,
      true,
    );
  addBox(
    doorGroup,
    [frameThickness, frameThickness, 3],
    [0, frameHeaderCenterY, 0],
    frameMaterial,
    true,
  );
  const doors: AutomaticDoor[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new Group();
    pivot.name = `upper-hallway-door-${id}-${side < 0 ? "first" : "second"}`;
    pivot.position.set(0, SHOP_UPPER_FLOOR_Y, side * leafHalfWidth);
    doorGroup.add(pivot);

    const leafCenterZ = (-side * leafHalfWidth) / 2;
    addBox(
      pivot,
      [0.12, leafHeight, leafHalfWidth],
      [0, leafHeight / 2, leafCenterZ],
      doorMaterial,
      true,
    );
    for (const face of [-1, 1] as const)
      for (const y of [0.68, 1.72])
        addBox(
          pivot,
          [0.055, 0.76, 0.92],
          [face * 0.085, y, leafCenterZ],
          frameMaterial,
          true,
        );
    for (const face of [-1, 1] as const)
      addBox(
        pivot,
        [0.1, 0.09, 0.09],
        [face * 0.13, 1.16, -side * 1.08],
        frameMaterial,
      );
    doors.push({
      centerX,
      centerZ,
      open: 0,
      openAngle: -corridorDirection * side * Math.PI * 0.5,
      pivot,
    });
  }
  return doors;
};

export const createRareRoom = (
  parent: Group,
  wallMaterial: MeshStandardMaterial,
  woodMaterial: MeshStandardMaterial,
  shelfBackingMaterial: MeshStandardMaterial,
  shelfEdgeMaterial: MeshStandardMaterial,
  deps: {
    addBox: AddBox;
    createSpineShelfFixture: CreateSpineShelfFixture;
    signs: {createRareRoomSignSlot(parent: Group): void};
    doors: DoorSystem;
  },
) => {
  const carpetMaterial = new MeshStandardMaterial({
    color: "#4d2528",
    roughness: 1,
  });
  const carpet = new Mesh(new PlaneGeometry(5.25, 8.15), carpetMaterial);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(RARE_ROOM_CENTER_X, 0.012, RARE_ROOM_CENTER_Z);
  carpet.receiveShadow = true;
  parent.add(carpet);

  deps.addBox(
    parent,
    [0.18, 4.55, 8.5],
    [5.45, 2.275, RARE_ROOM_CENTER_Z],
    wallMaterial,
  );

  deps.createSpineShelfFixture(
    parent,
    "special-collection",
    5.45,
    RARE_ROOM_CENTER_Z,
    8.1,
    4,
    [-1, 1],
    woodMaterial,
    shelfBackingMaterial,
    shelfEdgeMaterial,
    SPECIAL_COLLECTION_BACKING_THICKNESS,
  );
  deps.addBox(parent, [2.05, 4.55, 0.18], [6.475, 2.275, -2], wallMaterial);
  deps.addBox(parent, [1.7, 4.55, 0.18], [10.15, 2.275, -2], wallMaterial);
  deps.addBox(parent, [2.1, 1.45, 0.18], [8.4, 3.825, -2], wallMaterial);

  const frameMaterial = woodMaterial.clone();
  frameMaterial.color.set("#7d6658");
  frameMaterial.roughness = 0.8;
  deps.addBox(
    parent,
    [0.16, 3.05, 0.28],
    [7.43, 1.525, -1.98],
    frameMaterial,
    true,
  );
  deps.addBox(
    parent,
    [0.16, 3.05, 0.28],
    [9.37, 1.525, -1.98],
    frameMaterial,
    true,
  );
  deps.addBox(
    parent,
    [2.1, 0.18, 0.28],
    [8.4, 3.01, -1.98],
    frameMaterial,
    true,
  );

  const door = deps.doors.rareRoomPivot;
  door.name = "special-collection-door";
  // The door pivot animates at runtime; keep the entire subtree out of the
  // static interior batch so its leaf meshes follow the pivot rotation.
  door.userData.excludeFromStaticBatch = true;
  door.position.set(7.52, 0, RARE_ROOM_DOOR_Z);
  parent.add(door);
  const doorMaterial = woodMaterial.clone();
  doorMaterial.color.set("#d6b499");
  doorMaterial.roughness = 0.72;
  deps.addBox(door, [1.77, 2.9, 0.12], [0.885, 1.45, 0], doorMaterial, true);
  for (const side of [-1, 1])
    for (const y of [0.75, 2.05])
      deps.addBox(
        door,
        [1.29, 0.9, 0.055],
        [0.885, y, side * 0.085],
        frameMaterial,
        true,
      );
  const handleMaterial = new MeshStandardMaterial({
    color: "#b89a55",
    metalness: 0.82,
    roughness: 0.26,
  });
  const handleGeometry = new CylinderGeometry(0.055, 0.055, 0.16, 14);
  for (const side of [-1, 1]) {
    const handle = new Mesh(handleGeometry, handleMaterial);
    handle.position.set(1.5, 1.42, side * 0.13);
    handle.rotation.x = Math.PI / 2;
    handle.castShadow = true;
    door.add(handle);
  }

  deps.signs.createRareRoomSignSlot(parent);
};
