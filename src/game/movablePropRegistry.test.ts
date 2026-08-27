import {expect, test} from "bun:test";
import {Group, Quaternion, Vector3} from "three";
import {createMovablePropRecord} from "~/game/movablePropRegistry";

test("movable prop registry records preserve placement defaults and identity", () => {
  const object = new Group();
  const currentPosition = new Vector3(1, 2, 3);
  const currentRotation = new Quaternion();
  const heldLocalPosition = new Vector3(0, -1, -2);
  const record = createMovablePropRecord(
    {
      depth: 0.4,
      heldLocalPosition,
      height: 1.2,
      id: "lamp-1",
      label: "Lamp",
      object,
      width: 0.6,
    },
    currentPosition,
    currentRotation,
  );

  expect(record).toMatchObject({
    halfDepth: 0.2,
    halfHeight: 0.6,
    halfWidth: 0.3,
    id: "lamp-1",
    label: "Lamp",
    locked: false,
    object,
    placementSupport: object,
    spawned: false,
  });
  expect(record.currentPosition).toBe(currentPosition);
  expect(record.currentRotation).toBe(currentRotation);
  expect(record.heldLocalPosition).toBe(heldLocalPosition);
});
