export type ShopCollisionBox = {
  halfExtents: {x: number; y: number; z: number};
  position: {x: number; y: number; z: number};
};

/**
 * Shared open-shelving geometry. The scene visuals and the physics
 * colliders both derive from these values so props can physically rest on
 * every shelf board instead of an invisible solid slab.
 */
export const SPINE_SHELF_BACKING_THICKNESS = 0.14;
export const SPINE_SHELF_HEIGHT = 4.15;
export const SPINE_SHELF_BOARD_Y_OFFSETS = [0.2, 1.12, 2.04, 2.96, 3.88];
export const SPINE_SHELF_BOARD_THICKNESS = 0.09;
export const SPINE_SHELF_BOARD_DEPTH = 1.08;
export const SPINE_SHELF_DIVIDER_THICKNESS = 0.1;
export const SPINE_SHELF_DIVIDER_DEPTH = 1.1;
export const SPINE_SHELF_DIVIDER_HEIGHT = 4.12;

export type SpineShelfSpec = {
  axis?: "x" | "z";
  bayCount?: number;
  elevation?: number;
  length: number;
  x: number;
  z: number;
};

/** Builds backing, per-board, and divider colliders for one shelf fixture. */
export const createSpineShelfCollisionBoxes = ({
  axis = "z",
  bayCount = 0,
  elevation = 0,
  length,
  x,
  z,
}: SpineShelfSpec): readonly ShopCollisionBox[] => {
  const alongX = axis === "x";
  const boxes: ShopCollisionBox[] = [
    {
      halfExtents: {
        x: (alongX ? length : SPINE_SHELF_BACKING_THICKNESS) / 2,
        y: SPINE_SHELF_HEIGHT / 2,
        z: (alongX ? SPINE_SHELF_BACKING_THICKNESS : length) / 2,
      },
      position: {x, y: elevation + SPINE_SHELF_HEIGHT / 2, z},
    },
    ...SPINE_SHELF_BOARD_Y_OFFSETS.map((offset) => ({
      halfExtents: {
        x: (alongX ? length : SPINE_SHELF_BOARD_DEPTH) / 2,
        y: SPINE_SHELF_BOARD_THICKNESS / 2,
        z: (alongX ? SPINE_SHELF_BOARD_DEPTH : length) / 2,
      },
      position: {x, y: elevation + offset, z},
    })),
  ];
  if (bayCount <= 0) return boxes;
  const bayWidth = length / bayCount;
  for (let divider = 0; divider <= bayCount; divider += 1) {
    const along = -length / 2 + divider * bayWidth;
    boxes.push({
      halfExtents: {
        x:
          (alongX ? SPINE_SHELF_DIVIDER_THICKNESS : SPINE_SHELF_DIVIDER_DEPTH) /
          2,
        y: SPINE_SHELF_DIVIDER_HEIGHT / 2,
        z:
          (alongX ? SPINE_SHELF_DIVIDER_DEPTH : SPINE_SHELF_DIVIDER_THICKNESS) /
          2,
      },
      position: {
        x: alongX ? x + along : x,
        y: elevation + SPINE_SHELF_DIVIDER_HEIGHT / 2,
        z: alongX ? z : z + along,
      },
    });
  }
  return boxes;
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

/** Face-out display wall on the north wall (mirrors #createFaceOutDisplay). */
export const FACE_OUT_DISPLAY = Object.freeze({
  backingCenter: [-2, 1.92, -10.18] as const,
  backingSize: [9.35, 3.72, 0.18] as const,
  boardCenterX: -2,
  boardYs: [0.17, 1.07, 1.97, 2.87, 3.77],
  boardSize: [9.48, 0.1, 0.88] as const,
  boardZ: -9.9,
  sideCenterY: 1.98,
  sideCenterZ: -9.92,
  sideOffsetXs: [-6.68, 2.68],
  sideSize: [0.12, 3.95, 0.66] as const,
});

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
    halfExtents: {x: 0.55, y: 2.05, z: 4.25},
    position: {x: 5.45, y: 2.05, z: -6.25},
  },
  // Open shelving (west wall, east wall, gondolas): backing + per-board
  // colliders so props rest on the visible boards instead of an invisible
  // solid slab covering the whole fixture.
  ...(
    [
      {bayCount: 9, length: 35.5, x: -11.45, z: 8.25},
      {bayCount: 8, length: 30.5, x: 11.45, z: 5.75},
      {bayCount: 7, length: 17, x: -4.2, z: 10},
      {bayCount: 7, length: 17, x: 4.2, z: 10},
      {bayCount: 5, length: 12, x: -8, z: 12},
      {bayCount: 5, length: 12, x: 8, z: 12},
    ] satisfies SpineShelfSpec[]
  ).flatMap(createSpineShelfCollisionBoxes),
  // Face-out display wall.
  {
    halfExtents: {
      x: FACE_OUT_DISPLAY.backingSize[0] / 2,
      y: FACE_OUT_DISPLAY.backingSize[1] / 2,
      z: FACE_OUT_DISPLAY.backingSize[2] / 2,
    },
    position: {
      x: FACE_OUT_DISPLAY.backingCenter[0],
      y: FACE_OUT_DISPLAY.backingCenter[1],
      z: FACE_OUT_DISPLAY.backingCenter[2],
    },
  },
  ...FACE_OUT_DISPLAY.boardYs.map((y) => ({
    halfExtents: {
      x: FACE_OUT_DISPLAY.boardSize[0] / 2,
      y: FACE_OUT_DISPLAY.boardSize[1] / 2,
      z: FACE_OUT_DISPLAY.boardSize[2] / 2,
    },
    position: {x: FACE_OUT_DISPLAY.boardCenterX, y, z: FACE_OUT_DISPLAY.boardZ},
  })),
  ...FACE_OUT_DISPLAY.sideOffsetXs.map((x) => ({
    halfExtents: {
      x: FACE_OUT_DISPLAY.sideSize[0] / 2,
      y: FACE_OUT_DISPLAY.sideSize[1] / 2,
      z: FACE_OUT_DISPLAY.sideSize[2] / 2,
    },
    position: {
      x,
      y: FACE_OUT_DISPLAY.sideCenterY,
      z: FACE_OUT_DISPLAY.sideCenterZ,
    },
  })),
  ...SHOP_TELEVISION_COLLISION_BOXES,
  ...STATIC_READING_FURNITURE_BOXES.map((box) => ({
    halfExtents: box.halfExtents,
    position: box.position,
  })),
];

/** Face-out display shelf grid used by new-arrival signage and shelves. */
export const FACE_DISPLAY_COLUMNS = 8;
export const FACE_DISPLAY_COLUMN_SPACING = 1.12;

export const RARE_ROOM_DOOR_CENTER_X = 8.4;
