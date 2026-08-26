import {expect, test} from "bun:test";
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3} from "three";
import type {ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import {
  MovablePropLifecycle,
  type MovablePropLifecycleHost,
} from "~/game/movablePropSystem";

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
