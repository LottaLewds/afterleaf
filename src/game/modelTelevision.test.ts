import {describe, expect, test} from "bun:test";
import {Group, Mesh, PlaneGeometry} from "three";

import {
  findModelTelevisionScreen,
  getInitialModelAnimationIndex,
  getModelTelevisionScreenAspect,
  normalizeModelScreenUvs,
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

describe("normalizeModelScreenUvs", () => {
  test("rescales a partial UV range into the full 0..1 span", () => {
    const geometry = new PlaneGeometry(4, 3);
    const uvs = geometry.getAttribute("uv");
    // Simulate a texture atlas window from (0.25, 0.25) to (0.75, 0.75).
    for (let index = 0; index < uvs.count; index += 1)
      uvs.setXY(index, 0.25 + uvs.getX(index) * 0.5, 0.25 + uvs.getY(index) * 0.5);
    const screen = new Mesh(geometry);
    const previousGeometry = normalizeModelScreenUvs(screen);
    expect(previousGeometry).toBe(geometry);
    expect(screen.geometry).not.toBe(geometry);

    const normalized = screen.geometry.getAttribute("uv");
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < normalized.count; index += 1) {
      minU = Math.min(minU, normalized.getX(index));
      maxU = Math.max(maxU, normalized.getX(index));
    }
    expect(minU).toBeCloseTo(0);
    expect(maxU).toBeCloseTo(1);
  });

  test("leaves screens without usable UV ranges untouched", () => {
    const screen = new Mesh(new PlaneGeometry(4, 3));
    screen.geometry.deleteAttribute("uv");
    expect(normalizeModelScreenUvs(screen)).toBeUndefined();

    const degenerate = new Mesh(new PlaneGeometry(4, 3));
    const degenerateUvs = degenerate.geometry.getAttribute("uv");
    for (let index = 0; index < degenerateUvs.count; index += 1) degenerateUvs.setXY(index, 0.5, 0.5);
    const original = degenerate.geometry;
    expect(normalizeModelScreenUvs(degenerate)).toBeUndefined();
    expect(degenerate.geometry).toBe(original);
  });
});
