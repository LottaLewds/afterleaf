import {
  SHOP_STAIR_DOOR_HEIGHT,
  SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
  SHOP_STAIR_OPENING_WIDTH,
  SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
  type ShopCollisionBox,
} from "~/game/shopLayout";

export const SHOP_STOREY_HEIGHT = 4.9;
export const SHOP_UPPER_FLOOR_Y = SHOP_STOREY_HEIGHT;
export const SHOP_UPPER_CEILING_Y = SHOP_STOREY_HEIGHT * 2;

const UPPER_WALL_HEIGHT = SHOP_UPPER_CEILING_Y - SHOP_UPPER_FLOOR_Y;
const UPPER_WALL_CENTER_Y = SHOP_UPPER_FLOOR_Y + UPPER_WALL_HEIGHT / 2;
const UPPER_DOOR_HEADER_HEIGHT = UPPER_WALL_HEIGHT - SHOP_STAIR_DOOR_HEIGHT;
const UPPER_DOOR_HEADER_CENTER_Y =
  SHOP_UPPER_FLOOR_Y + SHOP_STAIR_DOOR_HEIGHT + UPPER_DOOR_HEADER_HEIGHT / 2;

export const SHOP_ATRIUM = Object.freeze({
  maxX: 5.4,
  maxZ: 18.5,
  minX: -5.4,
  minZ: 1,
});
export const SHOP_ATRIUM_RAIL_FLOOR_INSET = 0.08;

export const SHOP_THEATRE = Object.freeze({
  centerX: -25.5,
  centerZ: 18.5,
  depth: 16,
  width: 17,
});
export const SHOP_THEATRE_DOOR_WIDTH = 3;
export const SHOP_THEATRE_HALL = Object.freeze({
  centerX: -14.75,
  centerZ: SHOP_THEATRE.centerZ,
  depth: SHOP_THEATRE_DOOR_WIDTH,
  width: 4.5,
});

export const SHOP_TV_CAVE = Object.freeze({
  centerX: 20,
  centerZ: 18.3,
  depth: 9,
  width: 7,
});
/**
 * Vertical centers of the open TV-cave shelf boards. Shared by the visual
 * shelving and its collision boxes so props can physically rest on every
 * board instead of an invisible solid slab.
 */
export const SHOP_TV_CAVE_SHELF_BOARD_Y_CENTERS = [5.02, 6.32, 7.62, 8.92];
export const SHOP_TV_CAVE_DOOR_CENTER_Z = 20.75;
export const SHOP_TV_CAVE_DOOR_WIDTH = 3;
export const SHOP_TV_CAVE_HALL = Object.freeze({
  centerX: 14.5,
  centerZ: SHOP_TV_CAVE_DOOR_CENTER_Z,
  depth: SHOP_TV_CAVE_DOOR_WIDTH,
  width: 4,
});

const TV_CAVE_MAX_X = SHOP_TV_CAVE.centerX + SHOP_TV_CAVE.width / 2;
const TV_CAVE_MAX_Z = SHOP_TV_CAVE.centerZ + SHOP_TV_CAVE.depth / 2;
const TV_CAVE_MIN_X = SHOP_TV_CAVE.centerX - SHOP_TV_CAVE.width / 2;
const TV_CAVE_MIN_Z = SHOP_TV_CAVE.centerZ - SHOP_TV_CAVE.depth / 2;
const TV_CAVE_DOOR_MAX_Z =
  SHOP_TV_CAVE_DOOR_CENTER_Z + SHOP_TV_CAVE_DOOR_WIDTH / 2;
const TV_CAVE_DOOR_MIN_Z =
  SHOP_TV_CAVE_DOOR_CENTER_Z - SHOP_TV_CAVE_DOOR_WIDTH / 2;
const THEATRE_DOOR_MAX_Z = SHOP_THEATRE.centerZ + SHOP_THEATRE_DOOR_WIDTH / 2;
const THEATRE_DOOR_MIN_Z = SHOP_THEATRE.centerZ - SHOP_THEATRE_DOOR_WIDTH / 2;
const THEATRE_MAX_X = SHOP_THEATRE.centerX + SHOP_THEATRE.width / 2;
const THEATRE_MAX_Y = 15.9;
const THEATRE_DOOR_HEADER_HEIGHT =
  THEATRE_MAX_Y - SHOP_UPPER_FLOOR_Y - SHOP_STAIR_DOOR_HEIGHT;
const THEATRE_DOOR_HEADER_CENTER_Y =
  SHOP_UPPER_FLOOR_Y + SHOP_STAIR_DOOR_HEIGHT + THEATRE_DOOR_HEADER_HEIGHT / 2;

export type ShopExpansionBox = {
  position: readonly [x: number, y: number, z: number];
  size: readonly [width: number, height: number, depth: number];
};

const collisionBox = (box: ShopExpansionBox): ShopCollisionBox => ({
  halfExtents: {
    x: box.size[0] / 2,
    y: box.size[1] / 2,
    z: box.size[2] / 2,
  },
  position: {x: box.position[0], y: box.position[1], z: box.position[2]},
});

const STAIR_STEP_COUNT = 11;
const STAIR_FLIGHT_RISE = SHOP_STOREY_HEIGHT / 2;
const STAIR_STEP_RISE = STAIR_FLIGHT_RISE / STAIR_STEP_COUNT;
const STAIR_STEP_RUN = 4.6 / STAIR_STEP_COUNT;
const STAIR_TURN_CENTER_Z =
  (SHOP_STAIR_LOWER_FLIGHT_CENTER_Z + SHOP_STAIR_UPPER_FLIGHT_CENTER_Z) / 2;

export const SHOP_UPPER_STACK_CENTER_X = 9.5;
export const SHOP_UPPER_STACK_LENGTH = 4.6;
export const SHOP_UPPER_STACK_ZS = [3.2, 6.45, 9.7, 12.95, 16.2] as const;
export const SHOP_STAIR_RAIL_INSET = 0.07;
export const SHOP_STAIR_ROOM = Object.freeze({
  maxX: 19.5,
  maxZ: 28,
  minX: 12.5,
  minZ: 22.8,
});

/**
 * One U-shaped switchback stair module connects any storey to the one above
 * it. Reusing the same footprint for another integer level lets the stair
 * tower grow in either direction without changing the surrounding rooms.
 */
export const createStackableStairBoxes = (
  level: number,
): readonly ShopExpansionBox[] => {
  const baseY = level * SHOP_STOREY_HEIGHT;
  const firstFlight = Array.from({length: STAIR_STEP_COUNT}, (_, index) => {
    const height = STAIR_STEP_RISE * (index + 1);
    return {
      position: [
        13 + STAIR_STEP_RUN * (index + 0.5),
        baseY + height / 2,
        SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
      ],
      size: [STAIR_STEP_RUN + 0.015, height, 2.1],
    } as const;
  });
  const secondFlight = Array.from({length: STAIR_STEP_COUNT}, (_, index) => {
    const height = STAIR_FLIGHT_RISE + STAIR_STEP_RISE * (index + 1);
    return {
      position: [
        17.6 - STAIR_STEP_RUN * (index + 0.5),
        baseY + height / 2,
        SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
      ],
      size: [STAIR_STEP_RUN + 0.015, height, 2.1],
    } as const;
  });
  return [
    ...firstFlight,
    {
      position: [18.3, baseY + STAIR_FLIGHT_RISE - 0.09, STAIR_TURN_CENTER_Z],
      size: [1.4, 0.18, 4.5],
    },
    ...secondFlight,
    {
      position: [
        12.85,
        baseY + SHOP_STOREY_HEIGHT - 0.09,
        SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
      ],
      size: [1.3, 0.18, 2.4],
    },
  ];
};

export const createStackableStairRailBoxes = (
  level: number,
): readonly ShopExpansionBox[] => {
  const stairs = createStackableStairBoxes(level);
  const railHeight = 1.1;
  const railThickness = 0.12;
  const rails: ShopExpansionBox[] = [];
  for (const flight of [stairs.slice(0, 11), stairs.slice(12, 23)])
    for (const step of flight) {
      const stepTop = step.position[1] + step.size[1] / 2;
      for (const side of [-1, 1] as const)
        rails.push({
          position: [
            step.position[0],
            stepTop + railHeight / 2,
            step.position[2] +
              side * (step.size[2] / 2 - SHOP_STAIR_RAIL_INSET),
          ],
          size: [step.size[0], railHeight, railThickness],
        });
    }

  const turnLanding = stairs[11];
  if (turnLanding) {
    const top = turnLanding.position[1] + turnLanding.size[1] / 2;
    rails.push({
      position: [
        turnLanding.position[0] +
          turnLanding.size[0] / 2 -
          SHOP_STAIR_RAIL_INSET,
        top + railHeight / 2,
        turnLanding.position[2],
      ],
      size: [
        railThickness,
        railHeight,
        turnLanding.size[2] - SHOP_STAIR_RAIL_INSET * 2,
      ],
    });
    for (const side of [-1, 1] as const)
      rails.push({
        position: [
          turnLanding.position[0],
          top + railHeight / 2,
          turnLanding.position[2] +
            side * (turnLanding.size[2] / 2 - SHOP_STAIR_RAIL_INSET),
        ],
        size: [
          turnLanding.size[0] - SHOP_STAIR_RAIL_INSET * 2,
          railHeight,
          railThickness,
        ],
      });
  }

  const topLanding = stairs.at(-1);
  if (topLanding) {
    const top = topLanding.position[1] + topLanding.size[1] / 2;
    for (const side of [-1, 1] as const)
      rails.push({
        position: [
          topLanding.position[0],
          top + railHeight / 2,
          topLanding.position[2] +
            side * (topLanding.size[2] / 2 - SHOP_STAIR_RAIL_INSET),
        ],
        size: [
          topLanding.size[0] - SHOP_STAIR_RAIL_INSET * 2,
          railHeight,
          railThickness,
        ],
      });
  }
  return rails;
};

export const SHOP_UPPER_FLOOR_BOXES: readonly ShopExpansionBox[] = [
  {position: [0, 4.81, -4.75], size: [25, 0.18, 11.5]},
  {position: [0, 4.81, 23.25], size: [25, 0.18, 9.5]},
  {position: [-8.95, 4.81, 9.75], size: [7.1, 0.18, 17.5]},
  {position: [8.95, 4.81, 9.75], size: [7.1, 0.18, 17.5]},
  {
    position: [SHOP_THEATRE_HALL.centerX, 4.81, SHOP_THEATRE_HALL.centerZ],
    size: [SHOP_THEATRE_HALL.width, 0.18, SHOP_THEATRE_HALL.depth],
  },
  {
    position: [SHOP_THEATRE.centerX, 4.81, SHOP_THEATRE.centerZ],
    size: [SHOP_THEATRE.width, 0.18, SHOP_THEATRE.depth],
  },
  {
    position: [SHOP_TV_CAVE_HALL.centerX, 4.81, SHOP_TV_CAVE_HALL.centerZ],
    size: [SHOP_TV_CAVE_HALL.width, 0.18, SHOP_TV_CAVE_HALL.depth],
  },
  {
    position: [SHOP_TV_CAVE.centerX, 4.81, SHOP_TV_CAVE.centerZ],
    size: [SHOP_TV_CAVE.width, 0.18, SHOP_TV_CAVE.depth],
  },
];

export const SHOP_ATRIUM_RAIL_BOXES: readonly ShopExpansionBox[] = [
  {
    position: [SHOP_ATRIUM.minX - SHOP_ATRIUM_RAIL_FLOOR_INSET, 5.53, 9.75],
    size: [
      0.14,
      1.26,
      SHOP_ATRIUM.maxZ - SHOP_ATRIUM.minZ + SHOP_ATRIUM_RAIL_FLOOR_INSET * 2,
    ],
  },
  {
    position: [SHOP_ATRIUM.maxX + SHOP_ATRIUM_RAIL_FLOOR_INSET, 5.53, 9.75],
    size: [
      0.14,
      1.26,
      SHOP_ATRIUM.maxZ - SHOP_ATRIUM.minZ + SHOP_ATRIUM_RAIL_FLOOR_INSET * 2,
    ],
  },
  {
    position: [0, 5.53, SHOP_ATRIUM.minZ - SHOP_ATRIUM_RAIL_FLOOR_INSET],
    size: [
      SHOP_ATRIUM.maxX - SHOP_ATRIUM.minX + SHOP_ATRIUM_RAIL_FLOOR_INSET * 2,
      1.26,
      0.14,
    ],
  },
  {
    position: [0, 5.53, SHOP_ATRIUM.maxZ + SHOP_ATRIUM_RAIL_FLOOR_INSET],
    size: [
      SHOP_ATRIUM.maxX - SHOP_ATRIUM.minX + SHOP_ATRIUM_RAIL_FLOOR_INSET * 2,
      1.26,
      0.14,
    ],
  },
];

export const SHOP_EXPANSION_WALL_BOXES: readonly ShopExpansionBox[] = [
  {
    position: [0, UPPER_WALL_CENTER_Y, -10.5],
    size: [25, UPPER_WALL_HEIGHT, 0.18],
  },
  {position: [0, UPPER_WALL_CENTER_Y, 28], size: [25, UPPER_WALL_HEIGHT, 0.18]},
  {
    position: [-12.5, UPPER_WALL_CENTER_Y, (-10.5 + THEATRE_DOOR_MIN_Z) / 2],
    size: [0.18, UPPER_WALL_HEIGHT, THEATRE_DOOR_MIN_Z + 10.5],
  },
  {
    position: [-12.5, UPPER_WALL_CENTER_Y, (THEATRE_DOOR_MAX_Z + 28) / 2],
    size: [0.18, UPPER_WALL_HEIGHT, 28 - THEATRE_DOOR_MAX_Z],
  },
  {
    position: [12.5, UPPER_WALL_CENTER_Y, (-10.5 + TV_CAVE_DOOR_MIN_Z) / 2],
    size: [0.18, UPPER_WALL_HEIGHT, TV_CAVE_DOOR_MIN_Z + 10.5],
  },
  {
    position: [12.5, UPPER_WALL_CENTER_Y, (TV_CAVE_DOOR_MAX_Z + 23.05) / 2],
    size: [0.18, UPPER_WALL_HEIGHT, 23.05 - TV_CAVE_DOOR_MAX_Z],
  },
  {
    position: [12.5, UPPER_WALL_CENTER_Y, 26.725],
    size: [0.18, UPPER_WALL_HEIGHT, 2.55],
  },
  {
    position: [SHOP_THEATRE_HALL.centerX, 6.2, THEATRE_DOOR_MIN_Z],
    size: [SHOP_THEATRE_HALL.width, 2.6, 0.18],
  },
  {
    position: [SHOP_THEATRE_HALL.centerX, 6.2, THEATRE_DOOR_MAX_Z],
    size: [SHOP_THEATRE_HALL.width, 2.6, 0.18],
  },
  {
    position: [SHOP_THEATRE_HALL.centerX, 7.59, SHOP_THEATRE_HALL.centerZ],
    size: [SHOP_THEATRE_HALL.width, 0.18, SHOP_THEATRE_HALL.depth],
  },
  {position: [-34, 10.4, 18.5], size: [0.22, 11, 16]},
  {position: [-25.5, 10.4, 10.5], size: [17, 11, 0.22]},
  {position: [-25.5, 10.4, 26.5], size: [17, 11, 0.22]},
  {
    position: [THEATRE_MAX_X, 10.4, (10.5 + THEATRE_DOOR_MIN_Z) / 2],
    size: [0.22, 11, THEATRE_DOOR_MIN_Z - 10.5],
  },
  {
    position: [THEATRE_MAX_X, 10.4, (THEATRE_DOOR_MAX_Z + 26.5) / 2],
    size: [0.22, 11, 26.5 - THEATRE_DOOR_MAX_Z],
  },
  {
    position: [
      THEATRE_MAX_X,
      THEATRE_DOOR_HEADER_CENTER_Y,
      SHOP_THEATRE.centerZ,
    ],
    size: [0.22, THEATRE_DOOR_HEADER_HEIGHT, SHOP_THEATRE_DOOR_WIDTH],
  },
  {
    position: [SHOP_TV_CAVE_HALL.centerX, 6.2, TV_CAVE_DOOR_MIN_Z],
    size: [SHOP_TV_CAVE_HALL.width, 2.6, 0.18],
  },
  {
    position: [SHOP_TV_CAVE_HALL.centerX, 6.2, TV_CAVE_DOOR_MAX_Z],
    size: [SHOP_TV_CAVE_HALL.width, 2.6, 0.18],
  },
  {
    position: [SHOP_TV_CAVE_HALL.centerX, 7.59, SHOP_TV_CAVE_HALL.centerZ],
    size: [SHOP_TV_CAVE_HALL.width, 0.18, SHOP_TV_CAVE_HALL.depth],
  },
  {
    position: [TV_CAVE_MAX_X, UPPER_WALL_CENTER_Y, SHOP_TV_CAVE.centerZ],
    size: [0.22, UPPER_WALL_HEIGHT, SHOP_TV_CAVE.depth],
  },
  {
    position: [SHOP_TV_CAVE.centerX, UPPER_WALL_CENTER_Y, TV_CAVE_MIN_Z],
    size: [SHOP_TV_CAVE.width, UPPER_WALL_HEIGHT, 0.22],
  },
  {
    position: [
      TV_CAVE_MIN_X,
      UPPER_WALL_CENTER_Y,
      (TV_CAVE_MIN_Z + TV_CAVE_DOOR_MIN_Z) / 2,
    ],
    size: [0.22, UPPER_WALL_HEIGHT, TV_CAVE_DOOR_MIN_Z - TV_CAVE_MIN_Z],
  },
  {
    position: [
      TV_CAVE_MIN_X,
      UPPER_WALL_CENTER_Y,
      (TV_CAVE_DOOR_MAX_Z + TV_CAVE_MAX_Z) / 2,
    ],
    size: [0.22, UPPER_WALL_HEIGHT, TV_CAVE_MAX_Z - TV_CAVE_DOOR_MAX_Z],
  },
  {
    position: [
      (SHOP_STAIR_ROOM.maxX + TV_CAVE_MAX_X) / 2,
      UPPER_WALL_CENTER_Y,
      TV_CAVE_MAX_Z,
    ],
    size: [TV_CAVE_MAX_X - SHOP_STAIR_ROOM.maxX, UPPER_WALL_HEIGHT, 0.22],
  },
  {
    position: [-12.5, UPPER_DOOR_HEADER_CENTER_Y, SHOP_THEATRE.centerZ],
    size: [0.18, UPPER_DOOR_HEADER_HEIGHT, SHOP_THEATRE_DOOR_WIDTH],
  },
  {
    position: [
      12.5,
      UPPER_DOOR_HEADER_CENTER_Y,
      SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
    ],
    size: [0.18, UPPER_DOOR_HEADER_HEIGHT, SHOP_STAIR_OPENING_WIDTH],
  },
  {
    position: [12.5, UPPER_DOOR_HEADER_CENTER_Y, SHOP_TV_CAVE_DOOR_CENTER_Z],
    size: [0.18, UPPER_DOOR_HEADER_HEIGHT, SHOP_TV_CAVE_DOOR_WIDTH],
  },
  {
    position: [
      TV_CAVE_MIN_X,
      UPPER_DOOR_HEADER_CENTER_Y,
      SHOP_TV_CAVE_DOOR_CENTER_Z,
    ],
    size: [0.22, UPPER_DOOR_HEADER_HEIGHT, SHOP_TV_CAVE_DOOR_WIDTH],
  },
  {
    position: [
      12.5,
      (SHOP_STAIR_DOOR_HEIGHT + 4.8) / 2,
      SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
    ],
    size: [0.18, 4.8 - SHOP_STAIR_DOOR_HEIGHT, SHOP_STAIR_OPENING_WIDTH],
  },
  {
    position: [
      SHOP_STAIR_ROOM.maxX,
      4.9,
      (SHOP_STAIR_ROOM.minZ + SHOP_STAIR_ROOM.maxZ) / 2,
    ],
    size: [0.18, 9.8, SHOP_STAIR_ROOM.maxZ - SHOP_STAIR_ROOM.minZ],
  },
  {
    position: [
      (SHOP_STAIR_ROOM.minX + SHOP_STAIR_ROOM.maxX) / 2,
      4.9,
      SHOP_STAIR_ROOM.maxZ,
    ],
    size: [SHOP_STAIR_ROOM.maxX - SHOP_STAIR_ROOM.minX, 9.8, 0.18],
  },
  {
    position: [
      (SHOP_STAIR_ROOM.minX + SHOP_STAIR_ROOM.maxX) / 2,
      4.9,
      SHOP_STAIR_ROOM.minZ,
    ],
    size: [SHOP_STAIR_ROOM.maxX - SHOP_STAIR_ROOM.minX, 9.8, 0.18],
  },
];

const upperFixtureBoxes: readonly ShopExpansionBox[] = [
  {position: [-11.45, 6.95, -5], size: [1.1, 4.1, 9]},
  {position: [11.45, 6.95, -5], size: [1.1, 4.1, 9]},
  ...[-SHOP_UPPER_STACK_CENTER_X, SHOP_UPPER_STACK_CENTER_X].flatMap((x) =>
    SHOP_UPPER_STACK_ZS.map((z) => ({
      position: [x, 6.95, z] as const,
      size: [SHOP_UPPER_STACK_LENGTH, 4.1, 1.1] as const,
    })),
  ),
  {position: [-8.25, 5.27, 23], size: [2.7, 0.92, 1.3]},
  {position: [-3.5, 5.27, 23], size: [2.7, 0.92, 1.3]},
  ...[
    {height: 0.4, x: -22},
    {height: 0.26, x: -26.2},
    {height: 0.12, x: -30},
  ].flatMap((row) =>
    [14.25, 22.75].map((z) => ({
      position: [row.x, SHOP_UPPER_FLOOR_Y + row.height + 0.62, z] as const,
      size: [0.9, 1.24, 5.5] as const,
    })),
  ),
  ...[
    {height: 0.4, platformCenterX: -20.85, platformWidth: 7.7},
    {height: 0.26, platformCenterX: -26.2, platformWidth: 3},
    {height: 0.12, platformCenterX: -30.7, platformWidth: 6},
  ].flatMap((row) =>
    [14, 23].map((z) => ({
      position: [
        row.platformCenterX,
        SHOP_UPPER_FLOOR_Y + row.height / 2,
        z,
      ] as const,
      size: [row.platformWidth, row.height, 6.4] as const,
    })),
  ),
  // Open TV-cave shelving: backing panels plus one thin collider per shelf
  // board, mirroring the visible boards so any prop can rest on any board.
  ...([
    // Backing panels.
    {position: [23.03, 6.95, 18.3], size: [0.34, 4.05, 8.2]},
    {position: [16.97, 6.95, 16.45], size: [0.34, 4.05, 4.7]},
    {
      position: [SHOP_TV_CAVE.centerX, 6.95, 14.27],
      size: [6.45, 4.05, 0.34],
    },
    {
      position: [SHOP_TV_CAVE.centerX, 6.95, 22.33],
      size: [6.45, 4.05, 0.34],
    },
    // Shelf boards.
    ...SHOP_TV_CAVE_SHELF_BOARD_Y_CENTERS.flatMap((y): ShopExpansionBox[] => [
      {position: [22.6, y, 18.3], size: [8.2, 0.1, 1.2]},
      {position: [17.4, y, 16.45], size: [4.7, 0.1, 1.2]},
      {position: [SHOP_TV_CAVE.centerX, y, 14.7], size: [6.45, 0.1, 1.2]},
      {position: [SHOP_TV_CAVE.centerX, y, 21.9], size: [6.45, 0.1, 1.2]},
    ]),
  ] satisfies readonly ShopExpansionBox[]),
];

export const SHOP_EXPANSION_COLLISION_BOXES: readonly ShopCollisionBox[] = [
  ...SHOP_UPPER_FLOOR_BOXES,
  ...SHOP_ATRIUM_RAIL_BOXES,
  ...SHOP_EXPANSION_WALL_BOXES,
  ...upperFixtureBoxes,
  ...createStackableStairBoxes(0),
  ...createStackableStairRailBoxes(0),
].map(collisionBox);
