export type ShopCollisionBox = {
  halfExtents: {x: number; y: number; z: number};
  position: {x: number; y: number; z: number};
};

export type ReadingFurnitureMaterial = "leg" | "upholstery" | "wood";

export type ReadingFurnitureBox = ShopCollisionBox & {
  material: ReadingFurnitureMaterial;
  movableId?: string;
};

export const READING_TABLE_Z_POSITIONS = [6, 14] as const;
export const READING_TABLE_SIZE = {depth: 1.25, height: 0.91, width: 2.65};
export const SHOP_STAIR_DOOR_HEIGHT = 2.6;
export const SHOP_STAIR_LOWER_FLIGHT_CENTER_Z = 26.65;
export const SHOP_STAIR_OPENING_WIDTH = 2.4;
export const SHOP_STAIR_UPPER_FLIGHT_CENTER_Z = 24.25;
export const SHOP_MODEL_TELEVISION_SCALE = 2;
export const SHOP_MODEL_TELEVISION_SIZE = {
  depth: 0.388 * SHOP_MODEL_TELEVISION_SCALE,
  height: 0.453 * SHOP_MODEL_TELEVISION_SCALE,
  width: 0.468 * SHOP_MODEL_TELEVISION_SCALE,
} as const;

const createReadingFurnitureBoxes = () => {
  const boxes: ReadingFurnitureBox[] = [];
  let chairIndex = 0;
  for (const [tableIndex, tableZ] of READING_TABLE_Z_POSITIONS.entries()) {
    const movableId = `reading-table-${tableIndex + 1}`;
    boxes.push({
      halfExtents: {x: 1.325, y: 0.07, z: 0.625},
      material: "wood",
      movableId,
      position: {x: 0, y: 0.84, z: tableZ},
    });
    for (const x of [-1.08, 1.08])
      for (const zOffset of [-0.42, 0.42])
        boxes.push({
          halfExtents: {x: 0.055, y: 0.4, z: 0.055},
          material: "leg",
          movableId,
          position: {x, y: 0.4, z: tableZ + zOffset},
        });

    for (const x of [-1.72, 1.72])
      for (const zOffset of [-0.34, 0.34]) {
        const chairZ = tableZ + zOffset;
        const normal = x < 0 ? -1 : 1;
        const movableId = `reading-chair-${(chairIndex += 1)}`;
        boxes.push(
          {
            halfExtents: {x: 0.29, y: 0.06, z: 0.27},
            material: "upholstery",
            movableId,
            position: {x, y: 0.48, z: chairZ},
          },
          {
            halfExtents: {x: 0.06, y: 0.41, z: 0.29},
            material: "wood",
            movableId,
            position: {x: x + normal * 0.27, y: 0.76, z: chairZ},
          },
        );
        for (const legZOffset of [-0.2, 0.2])
          boxes.push({
            halfExtents: {x: 0.04, y: 0.225, z: 0.04},
            material: "leg",
            movableId,
            position: {x, y: 0.225, z: chairZ + legZOffset},
          });
      }
  }
  return boxes;
};

export const READING_FURNITURE_BOXES = createReadingFurnitureBoxes();
export const STATIC_READING_FURNITURE_BOXES = READING_FURNITURE_BOXES.filter(
  (box) => box.movableId === undefined,
);

const SHOP_TELEVISION_FOOTPRINT = {
  maxX: 1.75,
  maxZ: 27.84,
  minX: -1.75,
  minZ: 26.64,
} as const;

// The arcade cabinet is a movable physics prop, so it no longer bakes a
// static footprint or collision box into the shop layout; its prop body
// blocks the player and books wherever it is placed.

export const SHOP_TELEVISION_COLLISION_BOXES: readonly ShopCollisionBox[] = [
  {
    halfExtents: {x: 1.65, y: 1.08, z: 0.55},
    position: {x: 0, y: 2.36, z: 27.24},
  },
  {
    halfExtents: {x: 1.74, y: 0.08, z: 0.525},
    position: {x: 0, y: 1.2, z: 27.22},
  },
  ...[-1.38, 1.38].flatMap((x) =>
    [26.93, 27.55].map((z) => ({
      halfExtents: {x: 0.09, y: 0.54, z: 0.09},
      position: {x, y: 0.58, z},
    })),
  ),
  {
    halfExtents: {x: 1.5, y: 0.05, z: 0.45},
    position: {x: 0, y: 0.15, z: 27.22},
  },
];

export const SHOP_BOUNDS = {
  maxX: 10.9,
  maxZ: 27.35,
  minX: -10.9,
  minZ: -9.35,
} as const;

export const SHOP_INTERIOR_FOOTPRINTS = [
  {maxX: -3.65, maxZ: 18.5, minX: -4.75, minZ: 1.5},
  {maxX: 4.75, maxZ: 18.5, minX: 3.65, minZ: 1.5},
  {maxX: -7.45, maxZ: 18, minX: -8.55, minZ: 6},
  {maxX: 8.55, maxZ: 18, minX: 7.45, minZ: 6},
  {maxX: 6, maxZ: -2, minX: 4.9, minZ: -10.5},
  {maxX: 7.5, maxZ: -1.88, minX: 5.45, minZ: -2.12},
  {maxX: 11, maxZ: -1.88, minX: 9.3, minZ: -2.12},
  SHOP_TELEVISION_FOOTPRINT,
  ...STATIC_READING_FURNITURE_BOXES.map((box) => ({
    maxX: box.position.x + box.halfExtents.x,
    maxZ: box.position.z + box.halfExtents.z,
    minX: box.position.x - box.halfExtents.x,
    minZ: box.position.z - box.halfExtents.z,
  })),
] as const;

export const SHOP_COLLISION_BOXES: readonly ShopCollisionBox[] = [
  {
    halfExtents: {x: 13, y: 2.4, z: 0.12},
    position: {x: 0, y: 2.4, z: -10.5},
  },
  {
    halfExtents: {x: 13, y: 2.4, z: 0.12},
    position: {x: 0, y: 2.4, z: 28},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 18.75},
    position: {x: -11.45, y: 2.05, z: 8.75},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 15.25},
    position: {x: 11.45, y: 2.05, z: 5.75},
  },
  {
    halfExtents: {
      x: 0.12,
      y: 2.4,
      z:
        (SHOP_STAIR_LOWER_FLIGHT_CENTER_Z -
          SHOP_STAIR_OPENING_WIDTH / 2 +
          10.5) /
        2,
    },
    position: {
      x: 12.5,
      y: 2.4,
      z:
        (-10.5 +
          SHOP_STAIR_LOWER_FLIGHT_CENTER_Z -
          SHOP_STAIR_OPENING_WIDTH / 2) /
        2,
    },
  },
  {
    halfExtents: {
      x: 0.12,
      y: 2.4,
      z:
        (28 - SHOP_STAIR_LOWER_FLIGHT_CENTER_Z - SHOP_STAIR_OPENING_WIDTH / 2) /
        2,
    },
    position: {
      x: 12.5,
      y: 2.4,
      z:
        (28 + SHOP_STAIR_LOWER_FLIGHT_CENTER_Z + SHOP_STAIR_OPENING_WIDTH / 2) /
        2,
    },
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 8.5},
    position: {x: -4.2, y: 2.05, z: 10},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 8.5},
    position: {x: 4.2, y: 2.05, z: 10},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 6},
    position: {x: -8, y: 2.05, z: 12},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 6},
    position: {x: 8, y: 2.05, z: 12},
  },
  {
    halfExtents: {x: 0.55, y: 2.05, z: 4.25},
    position: {x: 5.45, y: 2.05, z: -6.25},
  },
  {
    halfExtents: {x: 1.025, y: 2.05, z: 0.12},
    position: {x: 6.475, y: 2.05, z: -2},
  },
  {
    halfExtents: {x: 0.85, y: 2.05, z: 0.12},
    position: {x: 10.15, y: 2.05, z: -2},
  },
  ...SHOP_TELEVISION_COLLISION_BOXES,
  ...STATIC_READING_FURNITURE_BOXES.map((box) => ({
    halfExtents: box.halfExtents,
    position: box.position,
  })),
];
