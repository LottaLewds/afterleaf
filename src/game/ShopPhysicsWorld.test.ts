import {describe, expect, test} from "bun:test";

import {
  ShopPhysicsWorld,
  type BookPhysicsPose,
  type MutableBookPhysicsTransform,
  type MutablePlayerMovement,
} from "~/game/ShopPhysicsWorld";

const identityPose = (x: number, y: number, z: number): BookPhysicsPose => ({
  position: {x, y, z},
  rotation: {w: 1, x: 0, y: 0, z: 0},
});

const flatPose = (x: number, y: number, z: number): BookPhysicsPose => ({
  position: {x, y, z},
  rotation: {w: Math.SQRT1_2, x: -Math.SQRT1_2, y: 0, z: 0},
});

const createSample = (): MutableBookPhysicsTransform => ({
  position: {x: 0, y: 0, z: 0},
  rotation: {w: 1, x: 0, y: 0, z: 0},
});

const createPlayerMovement = (): MutablePlayerMovement => ({
  ceilingHit: false,
  collisionCount: 0,
  correctedDisplacement: {x: 0, y: 0, z: 0},
  eyePosition: {x: 0, y: 0, z: 0},
  grounded: false,
});

describe("ShopPhysicsWorld", () => {
  test("queues books before initialization and advances with a capped fixed step", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: identityPose(0, 1.5, 0),
          publicationId: "queued-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(physics.bookCount).toBe(1);
      expect(physics.isReady).toBe(false);
      expect(await physics.initialize()).toBe(true);
      expect(physics.isReady).toBe(true);

      const sample = createSample();
      expect(physics.sampleBookTransform("queued-book", sample)).toBe(true);
      expect(sample.position.y).toBeCloseTo(1.5);
      expect(physics.step(1 / 120)).toBe(0);
      expect(physics.interpolationAlpha).toBeCloseTo(0.5);
      expect(physics.step(1 / 120)).toBe(1);
      expect(physics.step(1)).toBe(4);
      expect(physics.interpolationAlpha).toBeCloseTo(0);

      expect(
        physics.updateBook("queued-book", {
          pose: identityPose(0.5, 1.25, 0),
          thickness: 0.14,
        }),
      ).toBe(true);
      expect(physics.sampleBookTransform("queued-book", sample)).toBe(true);
      expect(sample.position.x).toBeCloseTo(0.5);
      expect(physics.removeBook("queued-book")).toBe(true);
      expect(physics.sampleBookTransform("queued-book", sample)).toBe(false);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("interpolates book render poses between fixed physics steps", async () => {
    const physics = new ShopPhysicsWorld({
      fixedStepSeconds: 1 / 60,
      gravity: {x: 0, y: 0, z: 0},
    });
    try {
      physics.addBook({
        pose: identityPose(0, 1, 0),
        publicationId: "interpolated-book",
        thickness: 0.1,
      });
      physics.holdBook("interpolated-book");
      expect(await physics.initialize()).toBe(true);
      expect(
        physics.dropBook("interpolated-book", {
          angularVelocity: {x: 0, y: 3, z: 0},
          linearVelocity: {x: 6, y: 0, z: 0},
          pose: identityPose(0, 1, 0),
        }),
      ).toBe(true);

      const sample = createSample();
      physics.step(1 / 60);
      expect(
        physics.sampleInterpolatedBookTransform("interpolated-book", sample),
      ).toBe(true);
      expect(sample.position.x).toBeCloseTo(0);

      physics.step(1 / 120);
      physics.sampleInterpolatedBookTransform("interpolated-book", sample);
      expect(sample.position.x).toBeGreaterThan(0);
      expect(sample.position.x).toBeLessThan(0.1);
      expect(Math.abs(sample.rotation.y)).toBeGreaterThan(0);
      expect(
        Math.hypot(
          sample.rotation.w,
          sample.rotation.x,
          sample.rotation.y,
          sample.rotation.z,
        ),
      ).toBeCloseTo(1);

      physics.step(1 / 120);
      physics.sampleInterpolatedBookTransform("interpolated-book", sample);
      expect(sample.position.x).toBeCloseTo(0.1, 2);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("servos a held body, releases it dynamically, and deactivates it on the shelf", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: identityPose(0, 1, 0),
          publicationId: "task-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(physics.holdBook("task-book")).toBe(true);
      const halfSqrt = Math.SQRT1_2;
      expect(
        physics.setHeldTarget("task-book", {
          position: {x: 1, y: 2, z: -0.5},
          rotation: {w: halfSqrt, x: 0, y: halfSqrt, z: 0},
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.getBookState("task-book")).toBe("held");
      for (let index = 0; index < 120; index += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("task-book", sample)).toBe(true);
      expect(sample.position.x).toBeCloseTo(1, 1);
      expect(sample.position.y).toBeCloseTo(2, 1);
      expect(sample.position.z).toBeCloseTo(-0.5, 1);
      expect(
        Math.abs(sample.rotation.w * halfSqrt + sample.rotation.y * halfSqrt),
      ).toBeCloseTo(1, 1);
      expect(physics.getBookState("task-book")).toBe("held");

      expect(
        physics.dropBook("task-book", {
          angularVelocity: {x: 0, y: 2, z: 0},
          linearVelocity: {x: 2, y: 0, z: 0},
          pose: identityPose(0, 2, 0),
        }),
      ).toBe(true);
      physics.step(1 / 60);
      physics.sampleBookTransform("task-book", sample);
      expect(sample.position.x).toBeGreaterThan(0);
      expect(sample.position.y).toBeLessThan(2);
      expect(physics.getBookState("task-book")).toBe("dynamic");

      const shelfPose = identityPose(0, 0.58, -4.06);
      expect(physics.shelveBook("task-book", shelfPose)).toBe(true);
      for (let index = 0; index < 30; index += 1) physics.step(1 / 60);
      physics.sampleBookTransform("task-book", sample);
      expect(sample.position.x).toBeCloseTo(shelfPose.position.x);
      expect(sample.position.y).toBeCloseTo(shelfPose.position.y);
      expect(sample.position.z).toBeCloseTo(shelfPose.position.z);
      expect(physics.getBookState("task-book")).toBe("shelved");
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("snaps a held body and its interpolated pose without residual motion", async () => {
    const physics = new ShopPhysicsWorld({gravity: {x: 0, y: 0, z: 0}});
    try {
      physics.addBook({
        pose: identityPose(0, 1, 0),
        publicationId: "snapped-book",
        thickness: 0.1,
      });
      physics.holdBook("snapped-book");
      expect(await physics.initialize()).toBe(true);
      physics.setHeldTarget("snapped-book", identityPose(2, 1, 0));
      physics.step(1 / 60);

      const snappedPose = flatPose(3, 1.5, -2);
      expect(physics.snapHeldBook("snapped-book", snappedPose)).toBe(true);
      const sample = createSample();
      expect(
        physics.sampleInterpolatedBookTransform("snapped-book", sample),
      ).toBe(true);
      expect(sample).toMatchObject(snappedPose);

      physics.step(1 / 60);
      physics.sampleInterpolatedBookTransform("snapped-book", sample);
      expect(sample).toMatchObject(snappedPose);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("clears held spring velocity when release velocity is omitted", async () => {
    const physics = new ShopPhysicsWorld({gravity: {x: 0, y: 0, z: 0}});
    try {
      const dropPose = identityPose(0, 1, 0);
      physics.addBook({
        pose: dropPose,
        publicationId: "released-book",
        thickness: 0.1,
      });
      physics.holdBook("released-book");
      expect(await physics.initialize()).toBe(true);
      physics.setHeldTarget("released-book", {
        position: {x: 2, y: 1, z: 0},
        rotation: {w: Math.SQRT1_2, x: 0, y: Math.SQRT1_2, z: 0},
      });
      physics.step(1 / 60);

      expect(physics.dropBook("released-book", {pose: dropPose})).toBe(true);
      physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("released-book", sample)).toBe(true);
      expect(sample).toMatchObject(dropPose);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("extracts a held book through shelf geometry and restores collisions on drop", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: identityPose(-2.7, 0.37, 7.5),
          publicationId: "trapped-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.holdBook("trapped-book")).toBe(true);
      expect(
        physics.setHeldTarget("trapped-book", identityPose(0, 1.2, 7.5)),
      ).toBe(true);
      for (let frame = 0; frame < 90; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("trapped-book", sample)).toBe(true);
      expect(sample.position.x).toBeGreaterThan(-0.2);

      expect(
        physics.dropBook("trapped-book", {
          pose: identityPose(0, 1.2, 7.5),
        }),
      ).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);
      expect(physics.sampleBookTransform("trapped-book", sample)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0.03);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("lands a released book on floor books while ignoring held books", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: flatPose(0, 0.05, 0),
          publicationId: "floor-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: flatPose(0, 0.35, 0),
          publicationId: "held-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: flatPose(0, 0.55, 0),
          publicationId: "released-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.holdBook("held-book")).toBe(true);
      expect(physics.snapHeldBook("held-book", flatPose(0, 0.35, 0))).toBe(
        true,
      );
      expect(physics.holdBook("released-book")).toBe(true);
      expect(
        physics.dropBook("released-book", {pose: flatPose(0, 0.55, 0)}),
      ).toBe(true);
      expect(physics.setBookCollisionlessWithHeld("released-book", true)).toBe(
        true,
      );
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const floorSample = createSample();
      const heldSample = createSample();
      const releasedSample = createSample();
      expect(physics.sampleBookTransform("floor-book", floorSample)).toBe(true);
      expect(physics.sampleBookTransform("held-book", heldSample)).toBe(true);
      expect(physics.sampleBookTransform("released-book", releasedSample)).toBe(
        true,
      );
      expect(
        releasedSample.position.y - floorSample.position.y,
      ).toBeGreaterThan(0.07);
      expect(heldSample.position.y - releasedSample.position.y).toBeGreaterThan(
        0.07,
      );
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("keeps sequentially released books colliding during their hand-clearance grace", async () => {
    const physics = new ShopPhysicsWorld({gravity: {x: 0, y: 0, z: 0}});
    try {
      expect(
        physics.addBook({
          pose: identityPose(0, 1, 0),
          publicationId: "first-released-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: identityPose(-0.8, 1, 0),
          publicationId: "second-released-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);

      const releasedBooks = [
        {pose: identityPose(0, 1, 0), publicationId: "first-released-book"},
        {pose: identityPose(-0.8, 1, 0), publicationId: "second-released-book"},
      ] as const;
      for (const releasedBook of releasedBooks) {
        const publicationId = releasedBook.publicationId;
        expect(physics.holdBook(publicationId)).toBe(true);
        expect(
          physics.dropBook(publicationId, {
            ...(publicationId === "second-released-book"
              ? {linearVelocity: {x: 6, y: 0, z: 0}}
              : {}),
            pose: releasedBook.pose,
          }),
        ).toBe(true);
        expect(physics.setBookCollisionlessWithHeld(publicationId, true)).toBe(
          true,
        );
      }
      for (let frame = 0; frame < 10; frame += 1) physics.step(1 / 60);

      const firstSample = createSample();
      expect(
        physics.sampleBookTransform("first-released-book", firstSample),
      ).toBe(true);
      expect(firstSample.position.x).toBeGreaterThan(0.05);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("restores held-book collision after the release grace expires", async () => {
    const physics = new ShopPhysicsWorld({gravity: {x: 0, y: 0, z: 0}});
    try {
      expect(
        physics.addBook({
          pose: identityPose(0, 1, 0),
          publicationId: "released-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: identityPose(-1.5, 1, 0),
          publicationId: "held-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.holdBook("released-book")).toBe(true);
      expect(
        physics.dropBook("released-book", {pose: identityPose(0, 1, 0)}),
      ).toBe(true);
      expect(physics.setBookCollisionlessWithHeld("released-book", true)).toBe(
        true,
      );
      expect(physics.holdBook("held-book")).toBe(true);

      for (let frame = 0; frame < 30; frame += 1) physics.step(1 / 60);
      expect(physics.setHeldTarget("held-book", identityPose(1.5, 1, 0))).toBe(
        true,
      );
      for (let frame = 0; frame < 90; frame += 1) physics.step(1 / 60);

      const releasedSample = createSample();
      expect(physics.sampleBookTransform("released-book", releasedSample)).toBe(
        true,
      );
      expect(releasedSample.position.x).toBeGreaterThan(0.15);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("lets an extracted held book disturb books stacked above it", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: flatPose(0, 0.05, 0),
          publicationId: "held-bottom-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: flatPose(0, 0.15, 0),
          publicationId: "stacked-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.holdBook("held-bottom-book")).toBe(true);
      expect(
        physics.setHeldTarget("held-bottom-book", flatPose(0, 0.55, 0)),
      ).toBe(true);
      for (let frame = 0; frame < 45; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("stacked-book", sample)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0.2);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("respawns an escaped book with a clean dynamic pose", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: identityPose(0, 1, 0),
          publicationId: "escaped-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);

      const respawnPose = identityPose(1.25, 5.5, 14.8);
      expect(physics.respawnBook("escaped-book", respawnPose)).toBe(true);
      expect(physics.getBookState("escaped-book")).toBe("dynamic");
      const sample = createSample();
      expect(physics.sampleBookTransform("escaped-book", sample)).toBe(true);
      expect(sample.position.x).toBeCloseTo(respawnPose.position.x);
      expect(sample.position.y).toBeCloseTo(respawnPose.position.y);
      expect(sample.position.z).toBeCloseTo(respawnPose.position.z);
      expect(sample.rotation.w).toBeCloseTo(respawnPose.rotation.w);
      expect(sample.rotation.x).toBeCloseTo(respawnPose.rotation.x);
      expect(sample.rotation.y).toBeCloseTo(respawnPose.rotation.y);
      expect(sample.rotation.z).toBeCloseTo(respawnPose.rotation.z);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("uses an infinite physical floor outside the visible shop", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addBook({
          pose: identityPose(100, 1, 100),
          publicationId: "outside-floor-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("outside-floor-book", sample)).toBe(
        true,
      );
      expect(sample.position.y).toBeGreaterThan(0.03);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("lets books settle on the reading table surface", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          depth: 1.25,
          staticWhenPlaced: true,
          height: 0.91,
          id: "reading-table",
          pose: identityPose(0, 0.455, 6),
          width: 2.4,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: identityPose(0, 2, 6),
          publicationId: "table-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("table-book", sample)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0.94);
      expect(sample.position.y).toBeLessThan(0.97);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("resizes and removes simple model-style prop colliders", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          depth: 0.25,
          height: 0.25,
          id: "scaled-model",
          pose: identityPose(0, 2, 0),
          width: 0.25,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(
        physics.updatePropSize("scaled-model", {
          depth: 0.5,
          height: 1,
          width: 0.75,
        }),
      ).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("scaled-model", sample),
      ).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0.49);
      expect(sample.position.y).toBeLessThan(0.52);
      expect(physics.removeProp("scaled-model")).toBe(true);
      expect(
        physics.sampleInterpolatedPropTransform("scaled-model", sample),
      ).toBe(false);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("drops unlocked props into simulated bodies but re-pins locked ones", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          depth: 0.5,
          height: 0.5,
          id: "pinned-prop",
          pose: identityPose(0, 0.25, 0),
          width: 0.5,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);

      // An unlocked release falls under gravity like a television.
      expect(physics.holdProp("pinned-prop")).toBe(true);
      const airPose = identityPose(0, 2.4, 0);
      expect(physics.snapHeldProp("pinned-prop", airPose)).toBe(true);
      expect(physics.dropProp("pinned-prop", {pose: airPose})).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);
      const sample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("pinned-prop", sample),
      ).toBe(true);
      expect(sample.position.y).toBeLessThan(1);

      // Locking pins the prop wherever it is released, even mid-air.
      expect(physics.setPropLocked("pinned-prop", true)).toBe(true);
      expect(physics.holdProp("pinned-prop")).toBe(true);
      const pinnedPose = identityPose(1, 2.6, -1);
      expect(physics.snapHeldProp("pinned-prop", pinnedPose)).toBe(true);
      expect(physics.dropProp("pinned-prop", {pose: pinnedPose})).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);
      expect(
        physics.sampleInterpolatedPropTransform("pinned-prop", sample),
      ).toBe(true);
      expect(sample.position.x).toBeCloseTo(pinnedPose.position.x);
      expect(sample.position.y).toBeCloseTo(pinnedPose.position.y);
      expect(sample.position.z).toBeCloseTo(pinnedPose.position.z);

      // Unlocking hands the body back to the simulation.
      expect(physics.setPropLocked("pinned-prop", false)).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);
      expect(
        physics.sampleInterpolatedPropTransform("pinned-prop", sample),
      ).toBe(true);
      expect(sample.position.y).toBeLessThan(1);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("rescales multi-part prop colliders on size updates", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          colliderParts: [
            {
              halfExtents: {x: 0.1, y: 0.05, z: 0.1},
              position: {x: -0.2, y: 0, z: 0},
            },
            {
              halfExtents: {x: 0.1, y: 0.05, z: 0.1},
              position: {x: 0.2, y: 0, z: 0},
            },
          ],
          depth: 0.2,
          height: 0.1,
          id: "parted-prop",
          pose: identityPose(0, 3, 0),
          width: 0.6,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      // Size updates on part colliders used to be refused outright.
      expect(
        physics.updatePropSize("parted-prop", {
          depth: 0.4,
          height: 0.2,
          width: 1.2,
        }),
      ).toBe(true);
      expect(
        physics.updatePropSize("parted-prop", {
          depth: 0.2,
          height: 0.1,
          width: 0.6,
        }),
      ).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);
      const sample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("parted-prop", sample),
      ).toBe(true);
      expect(Number.isFinite(sample.position.x)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0);
      expect(sample.position.y).toBeLessThan(1);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("keeps released static props fixed until they are picked up again", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          depth: 0.54,
          staticWhenPlaced: true,
          height: 1.17,
          id: "reading-chair",
          pose: identityPose(0, 3, 0),
          width: 0.62,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("reading-chair", sample),
      ).toBe(true);
      expect(sample.position.y).toBeCloseTo(3);

      expect(physics.holdProp("reading-chair")).toBe(true);
      const placedPose = identityPose(1.5, 0.585, 2);
      expect(physics.snapHeldProp("reading-chair", placedPose)).toBe(true);
      expect(physics.dropProp("reading-chair", {pose: placedPose})).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);

      expect(
        physics.sampleInterpolatedPropTransform("reading-chair", sample),
      ).toBe(true);
      expect(sample.position.x).toBeCloseTo(placedPose.position.x);
      expect(sample.position.y).toBeCloseTo(placedPose.position.y);
      expect(sample.position.z).toBeCloseTo(placedPose.position.z);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("keeps a static prop collider in place during ghost placement", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          depth: 1.25,
          staticWhenPlaced: true,
          height: 1,
          id: "ghosted-table",
          pose: identityPose(0, 0.5, 0),
          width: 2.4,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: identityPose(0, 2, 0),
          publicationId: "supported-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const bookSample = createSample();
      expect(physics.sampleBookTransform("supported-book", bookSample)).toBe(
        true,
      );
      expect(bookSample.position.y).toBeGreaterThan(0.9);

      expect(physics.holdProp("ghosted-table")).toBe(true);
      const ghostPose = identityPose(4, 0.5, 0);
      expect(physics.snapHeldProp("ghosted-table", ghostPose)).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) physics.step(1 / 60);

      const propSample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("ghosted-table", propSample),
      ).toBe(true);
      expect(propSample.position.x).toBeCloseTo(ghostPose.position.x);
      expect(physics.sampleBookTransform("supported-book", bookSample)).toBe(
        true,
      );
      expect(bookSample.position.y).toBeGreaterThan(0.9);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("uses compound prop colliders instead of their full bounding box", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(
        physics.addProp({
          colliderParts: [
            {
              halfExtents: {x: 0.29, y: 0.06, z: 0.27},
              position: {x: -0.02, y: -0.105, z: 0},
            },
            {
              halfExtents: {x: 0.06, y: 0.41, z: 0.29},
              position: {x: 0.25, y: 0.175, z: 0},
            },
          ],
          depth: 0.54,
          height: 1.17,
          id: "compound-chair",
          pose: identityPose(0, 0.585, 0),
          staticWhenPlaced: true,
          width: 0.62,
        }),
      ).toBe(true);
      expect(
        physics.addBook({
          pose: identityPose(-0.1, 1.5, 0),
          publicationId: "chair-book",
          thickness: 0.08,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("chair-book", sample)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(0.89);
      expect(sample.position.y).toBeLessThan(0.93);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("supports held props and lets one heavy prop settle on another", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      for (const [id, y] of [
        ["bottom-tv", 0.5],
        ["top-tv", 1.5],
      ] as const)
        expect(
          physics.addProp({
            density: 45,
            depth: 0.8,
            height: 1,
            id,
            pose: identityPose(2, y, 0),
            width: 1,
          }),
        ).toBe(true);
      expect(physics.bookCount).toBe(0);
      expect(physics.holdProp("top-tv")).toBe(true);
      expect(physics.setHeldPropTarget("top-tv", identityPose(2, 2, 0))).toBe(
        true,
      );
      expect(await physics.initialize()).toBe(true);
      for (let frame = 0; frame < 90; frame += 1) physics.step(1 / 60);
      expect(physics.snapHeldProp("top-tv", identityPose(2, 2, 0))).toBe(true);
      const snappedSample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("top-tv", snappedSample),
      ).toBe(true);
      expect(snappedSample.position.y).toBeCloseTo(2);
      expect(physics.dropProp("top-tv", {pose: identityPose(2, 1.55, 0)})).toBe(
        true,
      );
      for (let frame = 0; frame < 180; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleInterpolatedPropTransform("top-tv", sample)).toBe(
        true,
      );
      expect(sample.position.y).toBeGreaterThan(1.45);
      expect(sample.position.y).toBeLessThan(1.6);
      expect(physics.getPropState("top-tv")).toBe("dynamic");
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("keeps ghosted props from pushing physical props", async () => {
    const physics = new ShopPhysicsWorld({gravity: {x: 0, y: 0, z: 0}});
    try {
      for (const [id, x] of [
        ["physical-prop", 0],
        ["ghost-prop", 3],
      ] as const)
        expect(
          physics.addProp({
            depth: 1,
            height: 1,
            id,
            pose: identityPose(x, 1, 0),
            width: 1,
          }),
        ).toBe(true);
      expect(physics.holdProp("ghost-prop")).toBe(true);
      expect(await physics.initialize()).toBe(true);
      expect(physics.snapHeldProp("ghost-prop", identityPose(0, 1, 0))).toBe(
        true,
      );
      for (let frame = 0; frame < 30; frame += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(
        physics.sampleInterpolatedPropTransform("physical-prop", sample),
      ).toBe(true);
      expect(sample.position.x).toBeCloseTo(0);
      expect(sample.position.y).toBeCloseTo(1);
      expect(sample.position.z).toBeCloseTo(0);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("queues the player eye position and stops its capsule at outer shelving", async () => {
    const physics = new ShopPhysicsWorld();
    try {
      expect(physics.setPlayerPosition({x: 0, y: 1.66, z: 0})).toBe(true);
      const queuedPosition = {x: 0, y: 0, z: 0};
      expect(physics.getPlayerPosition(queuedPosition)).toBe(true);
      expect(queuedPosition).toEqual({x: 0, y: 1.66, z: 0});

      const movement = createPlayerMovement();
      expect(physics.movePlayer({x: 1, y: 0, z: 0}, movement)).toBe(false);
      expect(movement.eyePosition).toEqual(queuedPosition);
      expect(await physics.initialize()).toBe(true);

      expect(physics.movePlayer({x: 14, y: 0, z: 0}, movement)).toBe(true);
      expect(movement.collisionCount).toBeGreaterThan(0);
      expect(movement.correctedDisplacement.x).toBeGreaterThan(10);
      expect(movement.correctedDisplacement.x).toBeLessThan(11);
      expect(movement.eyePosition.x).toBeCloseTo(
        movement.correctedDisplacement.x,
      );
      expect(physics.resetPlayer({x: -1, y: 1.66, z: 1})).toBe(true);
      expect(physics.getPlayerPosition(queuedPosition)).toBe(true);
      expect(queuedPosition).toEqual({x: -1, y: 1.66, z: 1});
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("crosses the overlapping top stair landing into the upper floor", async () => {
    const physics = new ShopPhysicsWorld({
      playerEyePosition: {x: 13.2, y: 6.57, z: 24.25},
    });
    const movement = createPlayerMovement();
    try {
      expect(await physics.initialize()).toBe(true);
      for (let step = 0; step < 20; step += 1)
        expect(physics.movePlayer({x: -0.05, y: -0.003, z: 0}, movement)).toBe(
          true,
        );

      expect(movement.eyePosition.x).toBeLessThan(12.5);
      expect(movement.grounded).toBe(true);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("distinguishes ceilings from walls during upward movement", async () => {
    const physics = new ShopPhysicsWorld();
    const movement = createPlayerMovement();
    try {
      expect(await physics.initialize()).toBe(true);
      expect(physics.setPlayerPosition({x: 10.5, y: 1.66, z: 0})).toBe(true);
      expect(physics.movePlayer({x: 3, y: 0.2, z: 0}, movement)).toBe(true);
      expect(movement.collisionCount).toBeGreaterThan(0);
      expect(movement.ceilingHit).toBe(false);

      expect(physics.setPlayerPosition({x: 0, y: 3, z: -5})).toBe(true);
      expect(physics.movePlayer({x: 0, y: 3, z: 0}, movement)).toBe(true);
      expect(movement.ceilingHit).toBe(true);
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("keeps shelved books physically inactive until they are selected", async () => {
    const physics = new ShopPhysicsWorld({
      playerEyePosition: {x: 0, y: 1.66, z: 2},
    });
    try {
      expect(
        physics.addBook({
          initialState: "shelved",
          pose: identityPose(0, 0.37, 0.8),
          publicationId: "inactive-book",
          thickness: 0.1,
        }),
      ).toBe(true);
      expect(await physics.initialize()).toBe(true);

      const movement = createPlayerMovement();
      expect(physics.movePlayer({x: 0, y: 0, z: -1.5}, movement)).toBe(true);
      expect(movement.correctedDisplacement.z).toBeCloseTo(-1.5);
      for (let index = 0; index < 30; index += 1) physics.step(1 / 60);

      const sample = createSample();
      expect(physics.sampleBookTransform("inactive-book", sample)).toBe(true);
      expect(sample.position.z).toBeCloseTo(0.8);
      expect(physics.getBookState("inactive-book")).toBe("shelved");

      expect(physics.holdBook("inactive-book")).toBe(true);
      expect(
        physics.setHeldTarget("inactive-book", identityPose(0, 1.2, 0.8)),
      ).toBe(true);
      for (let index = 0; index < 60; index += 1) physics.step(1 / 60);
      expect(physics.sampleBookTransform("inactive-book", sample)).toBe(true);
      expect(sample.position.y).toBeGreaterThan(1);
      expect(physics.getBookState("inactive-book")).toBe("held");
    } finally {
      physics.dispose();
    }
  }, 10_000);

  test("disposal wins over initialization that resolves late", async () => {
    let finishInitialization: (() => void) | undefined;
    const initializationGate = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    const physics = new ShopPhysicsWorld({
      initializeRapier: () => initializationGate,
    });
    physics.addBook({
      pose: identityPose(0, 1, 0),
      publicationId: "never-created",
      thickness: 0.1,
    });

    const initialization = physics.initialize();
    physics.dispose();
    finishInitialization?.();

    expect(await initialization).toBe(false);
    expect(physics.isDisposed).toBe(true);
    expect(physics.isReady).toBe(false);
    expect(physics.bookCount).toBe(0);
    expect(
      physics.addBook({
        pose: identityPose(0, 1, 0),
        publicationId: "too-late",
        thickness: 0.1,
      }),
    ).toBe(false);
  });
});
