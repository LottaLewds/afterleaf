import {expect, test} from "bun:test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SpotLight,
  Vector3,
} from "three";
import {
  CEILING_LIGHT_DEFAULT_POWER,
  CEILING_LIGHT_POWER_STEP,
  createCeilingLightTemplate,
} from "~/game/interior/lightingProps";
import type {BookPhysicsPose, ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import {MovablePropLifecycle, type MovablePropLifecycleHost} from "~/game/movablePropSystem";
import {BUILTIN_CEILING_LIGHT_ASSET_ID} from "~/game/propAssetIds";
import type {MovablePropRegistration} from "~/game/propRegistration";
import {BUILTIN_SPAWNABLE_PROP_ASSETS} from "~/game/propTemplates";
import {INITIAL_WORLD_SEEDING_VERSION, WORLD_SEEDING_VERSION, type WorldSaveV1} from "~/game/worldSave";

test("movable prop registration records targets and registers physics dimensions", () => {
  const physicsDefinitions: unknown[] = [];
  const physics = {
    addProp: (definition: unknown) => {
      physicsDefinitions.push(definition);
      return true;
    },
  } as unknown as ShopPhysicsWorld;
  const lifecycle = new MovablePropLifecycle({
    pendingWorldSave: () => undefined,
    physicsWorld: () => physics,
  } as unknown as MovablePropLifecycleHost);
  const object = new Group();
  object.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));

  const record = lifecycle.registerMovableProp({
    depth: 0.4,
    heldLocalPosition: new Vector3(0, -1, -2),
    height: 1.2,
    id: "prop-1",
    label: "Test prop",
    object,
    targetable: true,
    width: 0.6,
  });

  expect(record.id).toBe("prop-1");
  expect(lifecycle.records.get("prop-1")).toBe(record);
  expect(lifecycle.targetMeshes).toHaveLength(1);
  expect(physicsDefinitions).toEqual([
    expect.objectContaining({
      depth: 0.4,
      height: 1.2,
      id: "prop-1",
      width: 0.6,
    }),
  ]);
});

test("dropping a movable prop sends its current world rotation to physics", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const physicsPosePosition = new Vector3();
  const physicsPoseRotation = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
  const physicsPose: BookPhysicsPose = {
    position: physicsPosePosition,
    rotation: physicsPoseRotation,
  };
  let droppedPose: BookPhysicsPose | undefined;
  const physics = {
    addProp: () => true,
    dropProp: (_id: string, drop: {pose: BookPhysicsPose}) => {
      droppedPose = drop.pose;
    },
  } as unknown as ShopPhysicsWorld;
  const host = {
    camera: () => camera,
    carriedPublicationId: () => undefined,
    emitGameState: () => {},
    markWorldStateDirty: () => {},
    pendingWorldSave: () => undefined,
    physicsPose: () => physicsPose,
    physicsPosePosition: () => physicsPosePosition,
    physicsPoseRotation: () => physicsPoseRotation,
    physicsWorld: () => physics,
    playerVelocity: () => new Vector3(),
    scene: () => scene,
    viewDirection: () => new Vector3(),
  } as unknown as MovablePropLifecycleHost;
  const lifecycle = new MovablePropLifecycle(host);
  const object = new Group();
  object.rotation.set(0.25, 0.5, -0.2);
  scene.add(object);
  const record = lifecycle.registerMovableProp({
    depth: 0.4,
    heldLocalPosition: new Vector3(0, -1, -2),
    height: 1.2,
    id: "prop-rotation",
    label: "Test prop",
    object,
    targetable: true,
    width: 0.6,
  });
  lifecycle.carriedProp = record;

  lifecycle.dropCarriedProp();

  const expectedRotation = object.quaternion;
  expect(droppedPose).toBeDefined();
  expect(droppedPose?.rotation.x).toBeCloseTo(expectedRotation.x);
  expect(droppedPose?.rotation.y).toBeCloseTo(expectedRotation.y);
  expect(droppedPose?.rotation.z).toBeCloseTo(expectedRotation.z);
  expect(droppedPose?.rotation.w).toBeCloseTo(expectedRotation.w);
});

test("adjusts registered ceiling-light power in lumen steps", () => {
  let dirtyCount = 0;
  let emittedCount = 0;
  const physics = {
    addProp: () => true,
    setPropLocked: () => {},
  } as unknown as ShopPhysicsWorld;
  const lifecycle = new MovablePropLifecycle({
    emitGameState: () => {
      emittedCount += 1;
    },
    markWorldStateDirty: () => {
      dirtyCount += 1;
    },
    pendingWorldSave: () => undefined,
    physicsWorld: () => physics,
  } as unknown as MovablePropLifecycleHost);
  const light = new SpotLight();
  light.power = CEILING_LIGHT_DEFAULT_POWER;
  const record = lifecycle.registerMovableProp({
    adjustableLight: {light},
    depth: 0.4,
    heldLocalPosition: new Vector3(0, -1, -2),
    height: 1.2,
    id: "ceiling-light-1",
    label: "ceiling light",
    object: new Group(),
    targetable: true,
    width: 0.6,
  });

  expect(lifecycle.adjustCeilingLightPower(record, 1)).toBe(true);
  expect(light.power).toBeCloseTo(CEILING_LIGHT_DEFAULT_POWER + CEILING_LIGHT_POWER_STEP);
  expect(dirtyCount).toBe(1);
  expect(emittedCount).toBe(1);

  lifecycle.setCeilingLightPower(record, 0);
  expect(light.power).toBe(0);
});

test("applies a pending model save when a default prop registers during restore", () => {
  const scene = new Scene();
  const physics = {
    addProp: () => true,
    updatePropPose: () => {},
  } as unknown as ShopPhysicsWorld;
  const lifecycle = new MovablePropLifecycle({
    pendingWorldSave: () => undefined,
    physicsWorld: () => physics,
    scene: () => scene,
  } as unknown as MovablePropLifecycleHost);
  lifecycle.pendingModelPropSaves = [
    {
      assetId: "builtin:desk-lamp",
      id: "desk-lamp-1",
      lightPower: 840,
      pose: {
        position: {x: 4, y: 1.2, z: -3},
        quaternion: {w: 1, x: 0, y: 0, z: 0},
      },
      scale: 1,
    },
  ];
  const object = new Group();
  scene.add(object);
  const light = new SpotLight();

  const record = lifecycle.registerMovableProp({
    adjustableLight: {light},
    depth: 0.4,
    heldLocalPosition: new Vector3(0, -1, -2),
    height: 1.2,
    id: "desk-lamp-1",
    label: "desk lamp 1",
    modelBaseSize: new Vector3(0.4, 1.2, 0.4),
    modelScale: 1,
    object,
    targetable: true,
    width: 0.4,
  });

  expect(record.object.position).toEqual(new Vector3(4, 1.2, -3));
  expect(light.power).toBeCloseTo(840);
  expect(lifecycle.pendingModelPropSaves).toHaveLength(0);
});

test("initializes a restored ceiling light with its saved lumen value", async () => {
  const scene = new Scene();
  const physics = {
    addProp: () => true,
    setPropLocked: () => {},
  } as unknown as ShopPhysicsWorld;
  const camera = new PerspectiveCamera();
  const viewDirection = new Vector3();
  const lifecycle = new MovablePropLifecycle({
    camera: () => camera,
    pendingWorldSave: () => undefined,
    physicsWorld: () => physics,
    scene: () => scene,
    viewDirection: () => viewDirection,
  } as unknown as MovablePropLifecycleHost);
  createCeilingLightTemplate({
    cacheBuiltinPropTemplate: (registration: MovablePropRegistration) =>
      lifecycle.cacheBuiltinPropTemplate(registration),
  } as unknown as Parameters<typeof createCeilingLightTemplate>[0]);
  const asset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((candidate) => candidate.id === BUILTIN_CEILING_LIGHT_ASSET_ID);
  if (!asset) throw new Error("Expected the builtin ceiling-light asset");

  const record = await lifecycle.createSpawnableProp(
    asset,
    "saved-ceiling-light",
    1,
    {
      position: {x: 1, y: 4.47, z: 2},
      quaternion: {w: 1, x: 0, y: 0, z: 0},
    },
    undefined,
    297.5929188601028,
  );

  expect(record.adjustableLight?.light.power).toBeCloseTo(297.5929188601028);
});

test("retains the loaded seeding version after the persistence layer consumes the save", () => {
  let pendingSave: WorldSaveV1 | undefined = {seedingVersion: WORLD_SEEDING_VERSION} as WorldSaveV1;
  const lifecycle = new MovablePropLifecycle({
    pendingWorldSave: () => pendingSave,
  } as unknown as MovablePropLifecycleHost);

  expect(lifecycle.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)).toBe(false);
  pendingSave = undefined;
  expect(lifecycle.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)).toBe(false);
});
