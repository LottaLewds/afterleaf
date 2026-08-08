import {describe, expect, test} from "bun:test";

import {
  clampLookDeltaMagnitude,
  dampLookAngles,
  getPlanarMovement,
  isPlausiblePointerMovement,
  isPointInsideShopObstacle,
  resolvePlayerGrounded,
  resolveShopMovement,
  transitionBookInteraction,
  updateLookAngles,
  wrapYaw,
  type BookInteractionState,
  type PlanarPoint,
  type ShopCollisionWorld,
} from "~/game/shopGameplay";

const expectPointClose = (actual: PlanarPoint, expected: PlanarPoint) => {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.z).toBeCloseTo(expected.z);
};

describe("first-person shop movement", () => {
  test("identifies implausible pointer-lock movement spikes", () => {
    expect(isPlausiblePointerMovement(24, -18)).toBe(true);
    expect(isPlausiblePointerMovement(256, -256)).toBe(true);
    expect(isPlausiblePointerMovement(257, 0)).toBe(false);
    expect(isPlausiblePointerMovement(0, -257)).toBe(false);
    expect(isPlausiblePointerMovement(Number.NaN, 0)).toBe(false);
    expect(isPlausiblePointerMovement(0, Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("caps aggregate angular movement without dropping its direction", () => {
    const output = {pitch: 0, yaw: 0};
    expect(clampLookDeltaMagnitude(0.03, -0.04, 0.1, output)).toBe(output);
    expect(output).toEqual({pitch: -0.04, yaw: 0.03});

    clampLookDeltaMagnitude(3, 4, 2, output);
    expect(output.yaw).toBeCloseTo(1.2);
    expect(output.pitch).toBeCloseTo(1.6);
    expect(Math.hypot(output.yaw, output.pitch)).toBeCloseTo(2);

    clampLookDeltaMagnitude(Number.NaN, 1, 2, output);
    expect(output).toEqual({pitch: 0, yaw: 0});
  });

  test("does not retain a directional ground contact while ascending", () => {
    expect(resolvePlayerGrounded(6.2, true, false)).toBe(false);
    expect(resolvePlayerGrounded(-0.1, true, false)).toBe(true);
    expect(resolvePlayerGrounded(-0.1, false, true)).toBe(true);
  });

  test("maps local movement through camera yaw", () => {
    const output = {x: 0, z: 0};

    expect(getPlanarMovement({forward: 1, right: 0}, 0, 3, output)).toBe(
      output,
    );
    expectPointClose(output, {x: 0, z: -3});

    getPlanarMovement({forward: 1, right: 0}, Math.PI / 2, 3, output);
    expectPointClose(output, {x: -3, z: 0});

    getPlanarMovement({forward: 0, right: 1}, Math.PI / 2, 3, output);
    expectPointClose(output, {x: 0, z: -3});
  });

  test("normalizes diagonal input but preserves analog input below unit length", () => {
    const output = {x: 0, z: 0};
    getPlanarMovement({forward: 1, right: 1}, 0, 4, output);
    expect(Math.hypot(output.x, output.z)).toBeCloseTo(4);

    getPlanarMovement({forward: 0.25, right: 0}, 0, 4, output);
    expectPointClose(output, {x: 0, z: -1});
  });

  test("wraps yaw and clamps pitch into a caller-owned object", () => {
    expect(wrapYaw(Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapYaw(-Math.PI * 3)).toBeCloseTo(-Math.PI);

    const output = {pitch: 0, yaw: 0};
    expect(
      updateLookAngles({pitch: 0.2, yaw: Math.PI - 0.1}, 0.2, 2, output, 1.2),
    ).toBe(output);
    expect(output.yaw).toBeCloseTo(-Math.PI + 0.1);
    expect(output.pitch).toBe(1.2);
  });

  test("smooths look angles at render cadence across the yaw seam", () => {
    const output = {pitch: 0, yaw: 0};
    expect(
      dampLookAngles(
        {pitch: 0, yaw: Math.PI - 0.1},
        {pitch: 1, yaw: -Math.PI + 0.1},
        Math.log(2),
        1,
        output,
      ),
    ).toBe(output);
    expect(output.pitch).toBeCloseTo(0.5);
    expect(Math.abs(output.yaw)).toBeCloseTo(Math.PI);
  });
});

describe("shop collision", () => {
  const world: ShopCollisionWorld = {
    bounds: {maxX: 5, maxZ: 8, minX: -5, minZ: -8},
    obstacles: [{maxX: 1, maxZ: 1, minX: -1, minZ: -1}],
  };

  test("keeps the player circle inside the shop walls", () => {
    const output = {x: 0, z: 0};
    expect(
      resolveShopMovement({x: 4, z: 7}, {x: 10, z: 10}, 0.4, world, output),
    ).toBe(output);
    expectPointClose(output, {x: 4.6, z: 7.6});
  });

  test("sweeps into shelf faces without tunnelling", () => {
    const output = {x: 0, z: 0};
    resolveShopMovement({x: -4, z: 0}, {x: 8, z: 0}, 0.5, world, output);
    expectPointClose(output, {x: -1.5, z: 0});
  });

  test("separates axes so diagonal movement slides along a shelf", () => {
    const output = {x: 0, z: 0};
    resolveShopMovement({x: -2, z: 0}, {x: 2, z: 3}, 0.5, world, output);
    expectPointClose(output, {x: -1.5, z: 3});
  });

  test("uses circle corners rather than a box-expanded obstacle", () => {
    const output = {x: 0, z: 0};
    resolveShopMovement({x: -2, z: -1.4}, {x: 1, z: 0}, 0.5, world, output);
    expect(output.x).toBeCloseTo(-1.3);
    expect(output.z).toBeCloseTo(-1.4);
  });

  test("detects points inside shelf footprints with optional clearance", () => {
    const shelf = {maxX: 2, maxZ: 4, minX: 1, minZ: 3};
    expect(isPointInsideShopObstacle({x: 1.5, z: 3.5}, shelf)).toBe(true);
    expect(isPointInsideShopObstacle({x: 0.8, z: 3.5}, shelf)).toBe(false);
    expect(isPointInsideShopObstacle({x: 0.8, z: 3.5}, shelf, 0.25)).toBe(true);
  });
});

describe("book interaction state", () => {
  test("moves a floor book through carried to a shelf", () => {
    const floor: BookInteractionState = {status: "floor"};
    const pickedUp = transitionBookInteraction(floor, {type: "pick-up"});
    expect(pickedUp).toEqual({ok: true, state: {status: "carried"}});
    if (!pickedUp.ok) throw new Error("Expected pick-up to succeed");

    expect(
      transitionBookInteraction(pickedUp.state, {
        shelfId: "east-display",
        slotIndex: 4,
        type: "shelve",
      }),
    ).toEqual({
      ok: true,
      state: {shelfId: "east-display", slotIndex: 4, status: "shelved"},
    });
  });

  test("returns carried books to the floor", () => {
    expect(
      transitionBookInteraction({status: "carried"}, {type: "drop"}),
    ).toEqual({ok: true, state: {status: "floor"}});
  });

  test("picks up a book from a shelf", () => {
    expect(
      transitionBookInteraction(
        {shelfId: "east-display", slotIndex: 4, status: "shelved"},
        {type: "pick-up"},
      ),
    ).toEqual({ok: true, state: {status: "carried"}});
  });

  test("rejects invalid transitions without replacing the current state", () => {
    const floor: BookInteractionState = {status: "floor"};
    const invalidDrop = transitionBookInteraction(floor, {type: "drop"});
    expect(invalidDrop).toEqual({
      error: "book-not-carried",
      ok: false,
      state: floor,
    });
    expect(invalidDrop.state).toBe(floor);

    const carried: BookInteractionState = {status: "carried"};
    const invalidShelf = transitionBookInteraction(carried, {
      shelfId: "",
      slotIndex: -1,
      type: "shelve",
    });
    expect(invalidShelf).toEqual({
      error: "invalid-shelf-slot",
      ok: false,
      state: carried,
    });
    expect(invalidShelf.state).toBe(carried);

    const shelved: BookInteractionState = {
      shelfId: "east-display",
      slotIndex: 0,
      status: "shelved",
    };
    const pickedUp = transitionBookInteraction(shelved, {type: "pick-up"});
    expect(pickedUp).toEqual({ok: true, state: {status: "carried"}});
    if (!pickedUp.ok) throw new Error("Expected shelf pick-up to succeed");
    expect(
      transitionBookInteraction(pickedUp.state, {type: "pick-up"}),
    ).toEqual({
      error: "book-not-pickable",
      ok: false,
      state: pickedUp.state,
    });
  });
});
