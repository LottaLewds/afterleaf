import {describe, expect, test} from "bun:test";

import {
  createStackableStairBoxes,
  createStackableStairRailBoxes,
  SHOP_ATRIUM,
  SHOP_ATRIUM_RAIL_FLOOR_INSET,
  SHOP_ATRIUM_RAIL_BOXES,
  SHOP_EXPANSION_COLLISION_BOXES,
  SHOP_EXPANSION_WALL_BOXES,
  SHOP_STAIR_RAIL_INSET,
  SHOP_STAIR_ROOM,
  SHOP_STOREY_HEIGHT,
  SHOP_THEATRE,
  SHOP_THEATRE_DOOR_WIDTH,
  SHOP_THEATRE_HALL,
  SHOP_TV_CAVE,
  SHOP_TV_CAVE_DOOR_CENTER_Z,
  SHOP_TV_CAVE_DOOR_WIDTH,
  SHOP_TV_CAVE_HALL,
  SHOP_UPPER_CEILING_Y,
  SHOP_UPPER_FLOOR_BOXES,
  SHOP_UPPER_STACK_CENTER_X,
  SHOP_UPPER_STACK_LENGTH,
  SHOP_UPPER_STACK_ZS,
  type ShopExpansionBox,
} from "~/game/shopExpansionLayout";
import {
  SHOP_COLLISION_BOXES,
  SHOP_STAIR_DOOR_HEIGHT,
  SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
  SHOP_STAIR_OPENING_WIDTH,
  SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
} from "~/game/shopLayout";

const boxContainsPlanarPoint = (box: ShopExpansionBox, x: number, z: number) =>
  Math.abs(x - box.position[0]) <= box.size[0] / 2 &&
  Math.abs(z - box.position[2]) <= box.size[2] / 2;

describe("shop expansion layout", () => {
  test("leaves the atrium open while supporting every side of its walkway", () => {
    const mainFloorBoxes = SHOP_UPPER_FLOOR_BOXES.slice(0, 4);
    const supported = (x: number, z: number) =>
      mainFloorBoxes.some((box) => boxContainsPlanarPoint(box, x, z));

    expect(supported(0, (SHOP_ATRIUM.minZ + SHOP_ATRIUM.maxZ) / 2)).toBe(false);
    expect(supported(-8, 10)).toBe(true);
    expect(supported(8, 10)).toBe(true);
    expect(supported(0, -5)).toBe(true);
    expect(supported(0, 23)).toBe(true);
  });

  test("centers and encloses the theatre hallway", () => {
    const hallwayFloor = SHOP_UPPER_FLOOR_BOXES.find(
      (box) => box.position[0] === SHOP_THEATRE_HALL.centerX,
    );
    const hallwayCeiling = SHOP_EXPANSION_WALL_BOXES.find(
      (box) =>
        box.position[0] === SHOP_THEATRE_HALL.centerX && box.size[1] === 0.18,
    );
    expect(hallwayFloor).toBeDefined();
    expect(hallwayCeiling).toBeDefined();
    expect(hallwayFloor?.position[2]).toBe(SHOP_THEATRE_HALL.centerZ);
    expect(hallwayFloor?.size[0]).toBe(SHOP_THEATRE_HALL.width);
    expect(hallwayFloor?.size[2]).toBe(SHOP_THEATRE_HALL.depth);
    expect(hallwayCeiling?.position[2]).toBe(SHOP_THEATRE_HALL.centerZ);
    expect(hallwayCeiling?.size[0]).toBe(SHOP_THEATRE_HALL.width);
    expect(hallwayCeiling?.size[2]).toBe(SHOP_THEATRE_HALL.depth);
    expect(SHOP_UPPER_FLOOR_BOXES.every((box) => box.size[1] === 0.18)).toBe(
      true,
    );

    const hallwaySideWalls = SHOP_EXPANSION_WALL_BOXES.filter(
      (box) =>
        box.position[0] === SHOP_THEATRE_HALL.centerX &&
        box.position[1] === 6.2,
    ).sort((first, second) => first.position[2] - second.position[2]);
    const [northHallWall, southHallWall] = hallwaySideWalls;
    expect(northHallWall).toBeDefined();
    expect(southHallWall).toBeDefined();
    expect(northHallWall?.position[2]).toBeCloseTo(
      SHOP_THEATRE_HALL.centerZ - SHOP_THEATRE_HALL.depth / 2,
    );
    expect(southHallWall?.position[2]).toBeCloseTo(
      SHOP_THEATRE_HALL.centerZ + SHOP_THEATRE_HALL.depth / 2,
    );

    const theatreMaxX = SHOP_THEATRE.centerX + SHOP_THEATRE.width / 2;
    const theatreDoorHeader = SHOP_EXPANSION_WALL_BOXES.find(
      (box) =>
        box.position[0] === theatreMaxX &&
        box.position[2] === SHOP_THEATRE.centerZ &&
        box.size[2] === SHOP_THEATRE_DOOR_WIDTH,
    );
    expect(theatreDoorHeader).toBeDefined();
    expect(
      (theatreDoorHeader?.position[1] ?? 0) -
        (theatreDoorHeader?.size[1] ?? 0) / 2,
    ).toBeCloseTo(SHOP_STOREY_HEIGHT + SHOP_STAIR_DOOR_HEIGHT);
  });

  test("stacks identical U-shaped stair modules at exact storey intervals", () => {
    const groundLevel = createStackableStairBoxes(0);
    const nextLevel = createStackableStairBoxes(1);
    const previousLevel = createStackableStairBoxes(-1);

    expect(groundLevel).toHaveLength(24);
    expect(nextLevel).toHaveLength(groundLevel.length);
    expect(previousLevel).toHaveLength(groundLevel.length);
    for (const [index, groundBox] of groundLevel.entries()) {
      const nextBox = nextLevel[index];
      const previousBox = previousLevel[index];
      expect(nextBox).toBeDefined();
      expect(previousBox).toBeDefined();
      if (!nextBox || !previousBox) continue;
      expect(nextBox.size).toEqual(groundBox.size);
      expect(previousBox.size).toEqual(groundBox.size);
      expect(nextBox.position[0]).toBe(groundBox.position[0]);
      expect(previousBox.position[0]).toBe(groundBox.position[0]);
      expect(nextBox.position[1] - groundBox.position[1]).toBeCloseTo(
        SHOP_STOREY_HEIGHT,
      );
      expect(previousBox.position[1] - groundBox.position[1]).toBeCloseTo(
        -SHOP_STOREY_HEIGHT,
      );
      expect(nextBox.position[2]).toBe(groundBox.position[2]);
      expect(previousBox.position[2]).toBe(groundBox.position[2]);
    }

    const firstFlightStart = groundLevel[0];
    const firstFlightEnd = groundLevel[10];
    const turnLanding = groundLevel[11];
    const secondFlightStart = groundLevel[12];
    const secondFlightEnd = groundLevel[22];
    expect(firstFlightStart).toBeDefined();
    expect(firstFlightEnd).toBeDefined();
    expect(turnLanding).toBeDefined();
    expect(secondFlightStart).toBeDefined();
    expect(secondFlightEnd).toBeDefined();
    if (
      !firstFlightStart ||
      !firstFlightEnd ||
      !turnLanding ||
      !secondFlightStart ||
      !secondFlightEnd
    )
      return;
    expect(firstFlightEnd.position[0]).toBeGreaterThan(
      firstFlightStart.position[0],
    );
    expect(firstFlightEnd.position[2]).toBe(firstFlightStart.position[2]);
    expect(firstFlightStart.position[2]).toBe(SHOP_STAIR_LOWER_FLIGHT_CENTER_Z);
    expect(turnLanding.position[1] + turnLanding.size[1] / 2).toBeCloseTo(
      SHOP_STOREY_HEIGHT / 2,
    );
    expect(secondFlightEnd.position[0]).toBeLessThan(
      secondFlightStart.position[0],
    );
    expect(secondFlightEnd.position[2]).toBe(secondFlightStart.position[2]);
    expect(secondFlightStart.position[2]).toBe(
      SHOP_STAIR_UPPER_FLIGHT_CENTER_Z,
    );
    const gapBetweenFlights =
      Math.abs(firstFlightStart.position[2] - secondFlightStart.position[2]) -
      firstFlightStart.size[2] / 2 -
      secondFlightStart.size[2] / 2;
    expect(gapBetweenFlights).toBeCloseTo(0.3);

    const topLanding = groundLevel.at(-1);
    expect(topLanding).toBeDefined();
    if (!topLanding) return;
    expect(topLanding.position[1] + topLanding.size[1] / 2).toBeCloseTo(
      SHOP_STOREY_HEIGHT,
    );
    expect(topLanding.position[0] - topLanding.size[0] / 2).toBeLessThan(
      SHOP_STAIR_ROOM.minX,
    );
  });

  test("extends upper walls and door headers all the way to the roof", () => {
    const upperWallCenter = (SHOP_STOREY_HEIGHT + SHOP_UPPER_CEILING_Y) / 2;
    const mainUpperWalls = SHOP_EXPANSION_WALL_BOXES.filter((box) => {
      const bottom = box.position[1] - box.size[1] / 2;
      return (
        box.position[1] === upperWallCenter ||
        (box.size[1] > 2 &&
          Math.abs(bottom - (SHOP_STOREY_HEIGHT + SHOP_STAIR_DOOR_HEIGHT)) <
            1e-6)
      );
    });

    expect(mainUpperWalls.length).toBeGreaterThan(0);
    for (const wall of mainUpperWalls)
      expect(wall.position[1] + wall.size[1] / 2).toBeGreaterThanOrEqual(
        SHOP_UPPER_CEILING_Y,
      );
  });

  test("aligns right-side stair openings with their flights", () => {
    const halfOpening = SHOP_STAIR_OPENING_WIDTH / 2;
    const groundSideWalls = SHOP_COLLISION_BOXES.filter(
      (box) =>
        box.position.x === 12.5 &&
        box.position.y - box.halfExtents.y < 1.5 &&
        box.position.y + box.halfExtents.y > 1.5,
    );
    const blocksGroundDoor = groundSideWalls.some(
      (box) =>
        Math.abs(SHOP_STAIR_LOWER_FLIGHT_CENTER_Z - box.position.z) <
        box.halfExtents.z,
    );
    expect(blocksGroundDoor).toBe(false);
    expect(
      groundSideWalls.some(
        (box) =>
          Math.abs(
            SHOP_STAIR_LOWER_FLIGHT_CENTER_Z -
              halfOpening -
              0.05 -
              box.position.z,
          ) < box.halfExtents.z,
      ),
    ).toBe(true);

    const upperSideWalls = SHOP_EXPANSION_COLLISION_BOXES.filter(
      (box) =>
        box.position.x === 12.5 &&
        box.position.y - box.halfExtents.y < SHOP_STOREY_HEIGHT + 1.5 &&
        box.position.y + box.halfExtents.y > SHOP_STOREY_HEIGHT + 1.5,
    );
    expect(
      upperSideWalls.some(
        (box) =>
          Math.abs(SHOP_STAIR_UPPER_FLIGHT_CENTER_Z - box.position.z) <
          box.halfExtents.z,
      ),
    ).toBe(false);
  });

  test("keeps stair guards on the treads and encloses the turn landing", () => {
    const stairs = createStackableStairBoxes(0);
    const rails = createStackableStairRailBoxes(0);
    const flightSteps = [...stairs.slice(0, 11), ...stairs.slice(12, 23)];

    expect(rails).toHaveLength(flightSteps.length * 2 + 3 + 2);
    for (const [index, step] of flightSteps.entries()) {
      const stepTop = step.position[1] + step.size[1] / 2;
      for (const rail of rails.slice(index * 2, index * 2 + 2)) {
        expect(rail?.position[0]).toBe(step.position[0]);
        expect(
          Math.abs((rail?.position[2] ?? 0) - step.position[2]),
        ).toBeCloseTo(step.size[2] / 2 - SHOP_STAIR_RAIL_INSET);
        expect((rail?.position[1] ?? 0) - (rail?.size[1] ?? 0) / 2).toBeCloseTo(
          stepTop,
        );
      }
    }

    const turnRails = rails.slice(flightSteps.length * 2, -2);
    expect(turnRails).toHaveLength(3);
    expect(turnRails.filter((rail) => rail.size[0] === 0.12)).toHaveLength(1);
    expect(turnRails.filter((rail) => rail.size[2] === 0.12)).toHaveLength(2);
  });

  test("shrinks the stair tower around the compact U-shaped module", () => {
    expect(SHOP_STAIR_ROOM.maxZ - SHOP_STAIR_ROOM.minZ).toBeLessThan(6);
    for (const box of createStackableStairBoxes(0)) {
      expect(box.position[2] - box.size[2] / 2).toBeGreaterThanOrEqual(
        SHOP_STAIR_ROOM.minZ,
      );
      expect(box.position[2] + box.size[2] / 2).toBeLessThanOrEqual(
        SHOP_STAIR_ROOM.maxZ,
      );
    }
  });

  test("insets the TV room outside the shop beside the stair exit", () => {
    const tvMinX = SHOP_TV_CAVE.centerX - SHOP_TV_CAVE.width / 2;
    const tvMaxZ = SHOP_TV_CAVE.centerZ + SHOP_TV_CAVE.depth / 2;
    const doorMaxZ = SHOP_TV_CAVE_DOOR_CENTER_Z + SHOP_TV_CAVE_DOOR_WIDTH / 2;
    const stairDoorMinZ =
      SHOP_STAIR_UPPER_FLIGHT_CENTER_Z - SHOP_STAIR_OPENING_WIDTH / 2;
    const hallMinX = SHOP_TV_CAVE_HALL.centerX - SHOP_TV_CAVE_HALL.width / 2;
    const hallMaxX = SHOP_TV_CAVE_HALL.centerX + SHOP_TV_CAVE_HALL.width / 2;

    expect(tvMinX).toBeGreaterThan(12.5);
    expect(hallMinX).toBe(12.5);
    expect(hallMaxX).toBe(tvMinX);
    expect(tvMaxZ).toBe(SHOP_STAIR_ROOM.minZ);
    expect(doorMaxZ).toBeLessThan(stairDoorMinZ);
    expect(
      SHOP_UPPER_FLOOR_BOXES.some(
        (box) =>
          box.position[0] === SHOP_TV_CAVE.centerX &&
          box.position[2] === SHOP_TV_CAVE.centerZ,
      ),
    ).toBe(true);
    expect(
      SHOP_UPPER_FLOOR_BOXES.some(
        (box) =>
          box.position[0] === SHOP_TV_CAVE_HALL.centerX &&
          box.position[2] === SHOP_TV_CAVE_HALL.centerZ,
      ),
    ).toBe(true);

    const upperEastWallSegments = SHOP_EXPANSION_WALL_BOXES.filter(
      (box) =>
        box.position[0] === 12.5 &&
        box.position[1] > SHOP_STOREY_HEIGHT &&
        box.size[0] === 0.18 &&
        box.size[1] > SHOP_STAIR_DOOR_HEIGHT,
    );
    expect(
      upperEastWallSegments.some((box) =>
        boxContainsPlanarPoint(box, 12.5, SHOP_TV_CAVE_DOOR_CENTER_Z),
      ),
    ).toBe(false);
    expect(
      upperEastWallSegments.some((box) =>
        boxContainsPlanarPoint(box, 12.5, SHOP_STAIR_UPPER_FLIGHT_CENTER_Z),
      ),
    ).toBe(false);
  });

  test("keeps atrium rail collision entirely on supported floor", () => {
    const [west, east, north, south] = SHOP_ATRIUM_RAIL_BOXES;
    expect(west).toBeDefined();
    expect(east).toBeDefined();
    expect(north).toBeDefined();
    expect(south).toBeDefined();
    if (!west || !east || !north || !south) return;
    expect(west.position[0]).toBeLessThan(SHOP_ATRIUM.minX);
    expect(east.position[0]).toBeGreaterThan(SHOP_ATRIUM.maxX);
    expect(north.position[2]).toBeLessThan(SHOP_ATRIUM.minZ);
    expect(south.position[2]).toBeGreaterThan(SHOP_ATRIUM.maxZ);
    expect(west.position[2] - west.size[2] / 2).toBeCloseTo(
      SHOP_ATRIUM.minZ - SHOP_ATRIUM_RAIL_FLOOR_INSET,
    );
    expect(west.position[2] + west.size[2] / 2).toBeCloseTo(
      SHOP_ATRIUM.maxZ + SHOP_ATRIUM_RAIL_FLOOR_INSET,
    );
    expect(north.position[0] - north.size[0] / 2).toBeCloseTo(
      SHOP_ATRIUM.minX - SHOP_ATRIUM_RAIL_FLOOR_INSET,
    );
    expect(north.position[0] + north.size[0] / 2).toBeCloseTo(
      SHOP_ATRIUM.maxX + SHOP_ATRIUM_RAIL_FLOOR_INSET,
    );
  });

  test("provides repeated back-to-back shelf stacks off the atrium walkway", () => {
    for (const x of [-SHOP_UPPER_STACK_CENTER_X, SHOP_UPPER_STACK_CENTER_X])
      for (const z of SHOP_UPPER_STACK_ZS)
        expect(
          SHOP_EXPANSION_COLLISION_BOXES.some(
            (box) =>
              box.position.x === x &&
              box.position.z === z &&
              box.halfExtents.x * 2 === SHOP_UPPER_STACK_LENGTH,
          ),
        ).toBe(true);
  });
});
