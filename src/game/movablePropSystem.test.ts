import {expect, test} from "bun:test";
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Vector3} from "three";
import type {BookPhysicsPose, ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import {MovablePropLifecycle, type MovablePropLifecycleHost} from "~/game/movablePropSystem";

test("movable prop registration records targets and registers physics dimensions", () => {
  const physicsDefinitions: unknown[] = [];
  const physics = {
    addProp: (definition: unknown) => {
      physicsDefinitions.push(definition);
      return true;
    },
  } as unknown as ShopPhysicsWorld;
  const lifecycle = new MovablePropLifecycle({
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
