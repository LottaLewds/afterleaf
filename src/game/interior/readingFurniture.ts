import {Box3, Group, Mesh, MeshStandardMaterial, Vector3} from "three";
import {
  READING_FURNITURE_BOXES,
  READING_TABLE_SIZE,
  READING_TABLE_Z_POSITIONS,
  type ReadingFurnitureBox,
} from "~/game/shopLayout";
import {BUILTIN_READING_CHAIR_ASSET_ID, BUILTIN_READING_TABLE_ASSET_ID} from "~/game/propAssetIds";
import type {AddBox} from "~/game/interior/interiorPrimitives";
import type {MovablePropRegistration, ReadingFurnitureMaterials} from "~/game/propRegistration";
import {INITIAL_WORLD_SEEDING_VERSION} from "~/game/worldSave";

/** Scene hooks the reading-furniture builders need while assembling props. */
export type ReadingFurnitureHost = {
  addBox: AddBox;
  cacheBuiltinPropTemplate: (registration: MovablePropRegistration) => void;
  createDeskLamps: (parent: Group) => Promise<void>;
  needsSeedPass: (version: number) => boolean;
  registerMovableProp: (registration: MovablePropRegistration) => void;
};

export const assembleReadingTable = (
  movableId: string,
  name: string,
  tableZ: number,
  furnitureMaterials: ReadingFurnitureMaterials,
  addBox: AddBox,
): Group => {
  const table = new Group();
  table.name = name;
  table.position.set(0, READING_TABLE_SIZE.height / 2, tableZ);
  for (const box of READING_FURNITURE_BOXES) {
    if (box.movableId !== movableId) continue;
    addBox(
      table,
      [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
      [box.position.x, box.position.y - READING_TABLE_SIZE.height / 2, box.position.z - tableZ],
      furnitureMaterials[box.material],
      true,
    );
  }
  return table;
};

export const assembleReadingChair = (
  chairBoxes: readonly ReadingFurnitureBox[],
  furnitureMaterials: ReadingFurnitureMaterials,
  name: string,
  addBox: AddBox,
  position?: readonly [x: number, y: number, z: number],
  rotationY = 0,
): {
  center: Vector3;
  group: Group;
  seat: Mesh | undefined;
  size: Vector3;
} => {
  const bounds = new Box3();
  const min = new Vector3();
  const max = new Vector3();
  for (const box of chairBoxes) {
    min.set(box.position.x - box.halfExtents.x, box.position.y - box.halfExtents.y, box.position.z - box.halfExtents.z);
    max.set(box.position.x + box.halfExtents.x, box.position.y + box.halfExtents.y, box.position.z + box.halfExtents.z);
    bounds.expandByPoint(min);
    bounds.expandByPoint(max);
  }
  if (bounds.isEmpty())
    return {
      center: new Vector3(),
      group: new Group(),
      seat: undefined,
      size: new Vector3(),
    };
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const chair = new Group();
  chair.name = name;
  if (position) chair.position.set(...position);
  else chair.position.copy(center);
  chair.rotation.y = rotationY;
  let seat: Mesh | undefined;
  for (const box of chairBoxes) {
    const mesh = addBox(
      chair,
      [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
      [box.position.x - center.x, box.position.y - center.y, box.position.z - center.z],
      furnitureMaterials[box.material],
      true,
    );
    if (box.material === "upholstery") seat = mesh;
  }
  return {center, group: chair, seat, size};
};

export const createReadingChairInstance = (
  parent: Group,
  id: string,
  chairBoxes: readonly ReadingFurnitureBox[],
  furnitureMaterials: ReadingFurnitureMaterials,
  host: ReadingFurnitureHost,
  position?: readonly [x: number, y: number, z: number],
  rotationY = 0,
) => {
  const {
    center,
    group: chair,
    seat,
    size,
  } = assembleReadingChair(chairBoxes, furnitureMaterials, id, host.addBox, position, rotationY);
  parent.add(chair);
  host.registerMovableProp({
    colliderParts: chairBoxes.map((box) => ({
      halfExtents: box.halfExtents,
      position: {
        x: box.position.x - center.x,
        y: box.position.y - center.y,
        z: box.position.z - center.z,
      },
    })),
    depth: size.z,
    staticWhenPlaced: true,
    heldLocalPosition: new Vector3(0, -1.05, -2.2),
    height: size.y,
    id,
    label: id.replaceAll("-", " "),
    object: chair,
    spawnAssetId: BUILTIN_READING_CHAIR_ASSET_ID,
    spawned: true,
    ...(seat ? {placementSupport: seat} : {}),
    rotationSnapStep: Math.PI / 2,
    templateForSpawning: true,
    width: size.x,
  });
};

export const createReadingTables = (
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  host: ReadingFurnitureHost,
): ReadingFurnitureMaterials => {
  const legMaterial = new MeshStandardMaterial({
    color: "#2b2420",
    metalness: 0.3,
    roughness: 0.58,
  });
  const upholsteryMaterial = new MeshStandardMaterial({
    color: "#556e63",
    roughness: 0.92,
  });
  const furnitureMaterials: ReadingFurnitureMaterials = {
    leg: legMaterial,
    upholstery: upholsteryMaterial,
    wood: woodMaterial,
  };

  for (const box of READING_FURNITURE_BOXES) {
    if (box.movableId) continue;
    host.addBox(
      parent,
      [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
      [box.position.x, box.position.y, box.position.z],
      furnitureMaterials[box.material],
      true,
    );
  }

  // Template sources are built even when live instances come from the
  // world save, so reading furniture stays player-spawnable everywhere.
  const templateTableZ = READING_TABLE_Z_POSITIONS[0];
  if (templateTableZ !== undefined) {
    const templateVisual = assembleReadingTable(
      "reading-table-1",
      "reading-table-template",
      templateTableZ,
      furnitureMaterials,
      host.addBox,
    );
    const tableBoxes = READING_FURNITURE_BOXES.filter((box) => box.movableId === `reading-table-1`);
    host.cacheBuiltinPropTemplate({
      colliderParts: tableBoxes.map((box) => ({
        halfExtents: box.halfExtents,
        position: {
          x: box.position.x,
          y: box.position.y - READING_TABLE_SIZE.height / 2,
          z: box.position.z - templateTableZ,
        },
      })),
      depth: READING_TABLE_SIZE.depth,
      heldLocalPosition: new Vector3(0, -1.15, -3.65),
      height: READING_TABLE_SIZE.height,
      id: BUILTIN_READING_TABLE_ASSET_ID,
      label: "reading table",
      object: templateVisual,
      rotationSnapStep: Math.PI / 2,
      spawnAssetId: BUILTIN_READING_TABLE_ASSET_ID,
      staticWhenPlaced: true,
      templateForSpawning: true,
      width: 2.4,
    });
  }
  const templateChairBoxes = READING_FURNITURE_BOXES.filter((box) => box.movableId === "reading-chair-1");
  if (templateChairBoxes.length > 0) {
    const {
      center,
      group: templateChair,
      size,
    } = assembleReadingChair(templateChairBoxes, furnitureMaterials, "reading-chair-template", host.addBox);
    host.cacheBuiltinPropTemplate({
      colliderParts: templateChairBoxes.map((box) => ({
        halfExtents: box.halfExtents,
        position: {
          x: box.position.x - center.x,
          y: box.position.y - center.y,
          z: box.position.z - center.z,
        },
      })),
      depth: size.z,
      heldLocalPosition: new Vector3(0, -1.05, -2.2),
      height: size.y,
      id: BUILTIN_READING_CHAIR_ASSET_ID,
      label: "reading chair",
      object: templateChair,
      rotationSnapStep: Math.PI / 2,
      spawnAssetId: BUILTIN_READING_CHAIR_ASSET_ID,
      staticWhenPlaced: true,
      templateForSpawning: true,
      width: size.x,
    });
  }

  if (host.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION))
    for (const [tableIndex, tableZ] of READING_TABLE_Z_POSITIONS.entries()) {
      const id = `reading-table-${tableIndex + 1}`;
      const table = assembleReadingTable(id, id, tableZ, furnitureMaterials, host.addBox);
      parent.add(table);
      const tableBoxes = READING_FURNITURE_BOXES.filter((box) => box.movableId === id);
      host.registerMovableProp({
        colliderParts: tableBoxes.map((box) => ({
          halfExtents: box.halfExtents,
          position: {
            x: box.position.x,
            y: box.position.y - READING_TABLE_SIZE.height / 2,
            z: box.position.z - tableZ,
          },
        })),
        depth: READING_TABLE_SIZE.depth,
        staticWhenPlaced: true,
        heldLocalPosition: new Vector3(0, -1.15, -3.65),
        height: READING_TABLE_SIZE.height,
        id,
        label: `reading table ${tableIndex + 1}`,
        object: table,
        rotationSnapStep: Math.PI / 2,
        spawnAssetId: BUILTIN_READING_TABLE_ASSET_ID,
        spawned: true,
        width: 2.4,
      });
    }

  if (host.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) {
    const chairIds = new Set(
      READING_FURNITURE_BOXES.flatMap((box) => (box.movableId?.startsWith("reading-chair-") ? [box.movableId] : [])),
    );
    for (const id of chairIds) {
      const chairBoxes = READING_FURNITURE_BOXES.filter((box) => box.movableId === id);
      createReadingChairInstance(parent, id, chairBoxes, furnitureMaterials, host);
    }
  }

  void host.createDeskLamps(parent);
  return furnitureMaterials;
};
