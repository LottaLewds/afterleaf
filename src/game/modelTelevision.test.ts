import {describe, expect, test} from "bun:test";
import {Group, Mesh, PlaneGeometry} from "three";

import {
  findModelTelevisionScreen,
  getInitialModelAnimationIndex,
  getModelTelevisionScreenAspect,
} from "~/game/modelTelevision";

describe("getInitialModelAnimationIndex", () => {
  const animations = [{name: "Idle"}, {name: "Attract"}];

  test("restores a named animation", () => {
    expect(getInitialModelAnimationIndex(animations, "Attract")).toBe(1);
  });

  test("preserves disabled animation state", () => {
    expect(getInitialModelAnimationIndex(animations, null)).toBe(-1);
  });

  test("falls back to the first animation", () => {
    expect(getInitialModelAnimationIndex(animations)).toBe(0);
    expect(getInitialModelAnimationIndex(animations, "Missing")).toBe(0);
  });
});

describe("findModelTelevisionScreen", () => {
  test("uses the first mesh below the named screen node", () => {
    const root = new Group();
    const screenRoot = new Group();
    const screen = new Mesh(new PlaneGeometry(4, 3));
    const secondMesh = new Mesh(new PlaneGeometry(16, 9));
    screenRoot.name = "TVScreen";
    screenRoot.add(screen, secondMesh);
    root.add(screenRoot);

    expect(findModelTelevisionScreen(root, "TVScreen")).toBe(screen);
  });

  test("accepts the named node when it is itself a mesh", () => {
    const root = new Group();
    const screen = new Mesh(new PlaneGeometry(16, 9));
    screen.name = "TVScreen";
    root.add(screen);

    expect(findModelTelevisionScreen(root, "TVScreen")).toBe(screen);
  });
});

describe("getModelTelevisionScreenAspect", () => {
  test("includes nested non-uniform model scale", () => {
    const root = new Group();
    const screenParent = new Group();
    const screen = new Mesh(new PlaneGeometry(4, 3));
    root.scale.set(2, 3, 1);
    screenParent.scale.set(0.5, 2, 1);
    screenParent.add(screen);
    root.add(screenParent);

    expect(getModelTelevisionScreenAspect(screen)).toBeCloseTo(2 / 9);
  });

  test("rejects a screen without measurable height", () => {
    const screen = new Mesh(new PlaneGeometry(4, 0));

    expect(getModelTelevisionScreenAspect(screen)).toBeUndefined();
  });
});
