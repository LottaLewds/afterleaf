import {describe, expect, test} from "bun:test";

import {
  deformActiveLeafVertex,
  easeTurnProgress,
  getActiveLeafDeformation,
  getPageBlockSplit,
  getPageTurnProgress,
  normalizeTurnProgress,
  writeActiveLeafDeformation,
  writeActiveLeafPositions,
} from "~/game/PageTurnGeometry";

describe("page-turn progress", () => {
  test("clamps invalid and out-of-range progress", () => {
    expect(normalizeTurnProgress(Number.NaN)).toBe(0);
    expect(normalizeTurnProgress(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(normalizeTurnProgress(-0.2)).toBe(0);
    expect(normalizeTurnProgress(0.4)).toBe(0.4);
    expect(normalizeTurnProgress(1.2)).toBe(1);
    expect(normalizeTurnProgress(Number.POSITIVE_INFINITY)).toBe(1);
  });

  test("eases between exact rests and stays monotonic", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(easeTurnProgress);
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(samples[3]).toBeCloseTo(0.5);
    for (let index = 1; index < samples.length; index += 1)
      expect(samples[index] ?? 0).toBeGreaterThan(samples[index - 1] ?? 0);
  });

  test("reports peel, cross, and settle with local phase progress", () => {
    expect(getPageTurnProgress(0.12)).toMatchObject({
      normalized: 0.12,
      phase: "peel",
      phaseProgress: 0.5,
    });
    expect(getPageTurnProgress(0.5)).toMatchObject({
      phase: "cross",
      phaseProgress: 0.5,
    });
    expect(getPageTurnProgress(0.88)).toMatchObject({
      phase: "settle",
      phaseProgress: 0.5,
    });
    expect(getPageTurnProgress(1)).toMatchObject({
      eased: 1,
      phase: "settle",
      phaseProgress: 1,
    });
  });
});

describe("page-block split", () => {
  test("moves committed LTR pages from the right block to the left", () => {
    const split = getPageBlockSplit({
      committedPageIndex: 3,
      direction: "LTR",
      totalDepth: 1,
      totalPages: 10,
    });

    expect(split).toEqual({
      committedPageIndex: 3,
      totalPages: 10,
      turnedSide: "left",
      left: {
        pageCount: 3,
        fraction: 0.3,
        depth: 0.3,
        centerOffset: 0.15,
        surfaceOffset: 0.3,
      },
      right: {
        pageCount: 7,
        fraction: 0.7,
        depth: 0.7,
        centerOffset: 0.35,
        surfaceOffset: 0.7,
      },
    });
  });

  test("mirrors the same committed split for RTL reading", () => {
    const split = getPageBlockSplit({
      committedPageIndex: 3,
      direction: "RTL",
      totalDepth: 1,
      totalPages: 10,
    });

    expect(split.turnedSide).toBe("right");
    expect(split.left).toMatchObject({pageCount: 7, depth: 0.7});
    expect(split.right).toMatchObject({pageCount: 3, depth: 0.3});
    expect(split.left.depth + split.right.depth).toBeCloseTo(1);
  });

  test("normalizes boundaries and empty publications without epsilon blocks", () => {
    expect(
      getPageBlockSplit({
        committedPageIndex: 99,
        direction: "LTR",
        totalDepth: 0.8,
        totalPages: 8,
      }),
    ).toMatchObject({
      committedPageIndex: 8,
      left: {depth: 0.8, pageCount: 8},
      right: {centerOffset: 0, depth: 0, pageCount: 0},
    });
    expect(
      getPageBlockSplit({
        committedPageIndex: 4,
        direction: "RTL",
        totalDepth: Number.NaN,
        totalPages: 0,
      }),
    ).toMatchObject({
      committedPageIndex: 0,
      totalPages: 0,
      left: {depth: 0, fraction: 0},
      right: {depth: 0, fraction: 0},
    });
  });
});

describe("active-leaf deformation", () => {
  test("pins the spine and mirrors the source edge by reading direction", () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const deformation = getActiveLeafDeformation(progress, "LTR");
      expect(deformActiveLeafVertex(0, 0.8, 2, 3, deformation)).toMatchObject({
        x: 0,
        z: 0,
      });
    }

    expect(
      deformActiveLeafVertex(1, 0.5, 2, 3, getActiveLeafDeformation(0, "LTR"))
        .x,
    ).toBe(2);
    expect(
      deformActiveLeafVertex(1, 0.5, 2, 3, getActiveLeafDeformation(0, "RTL"))
        .x,
    ).toBe(-2);
  });

  test("crosses above the binding and settles flat on the opposite side", () => {
    const crossing = getActiveLeafDeformation(0.5, "LTR");
    const edgeAtCrossing = deformActiveLeafVertex(1, 0.5, 2, 3, crossing);
    const centerAtCrossing = deformActiveLeafVertex(0.5, 0.5, 2, 3, crossing);
    expect(edgeAtCrossing.x).toBeCloseTo(0);
    expect(edgeAtCrossing.z).toBeCloseTo(2);
    expect(centerAtCrossing.x).toBeLessThan(0);
    expect(centerAtCrossing.z).toBeCloseTo(1);

    const settled = deformActiveLeafVertex(
      1,
      0.5,
      2,
      3,
      getActiveLeafDeformation(1, "LTR"),
    );
    expect(settled.x).toBeCloseTo(-2);
    expect(settled.z).toBeCloseTo(0);

    const rtlSettled = deformActiveLeafVertex(
      1,
      0.5,
      2,
      3,
      getActiveLeafDeformation(1, "RTL"),
    );
    expect(rtlSettled.x).toBeCloseTo(2);
    expect(rtlSettled.z).toBeCloseTo(0);
  });

  test("runs backward by sampling the same curve from one to zero", () => {
    const started = deformActiveLeafVertex(
      1,
      0.5,
      2,
      3,
      getActiveLeafDeformation(1, "LTR"),
    );
    const crossing = deformActiveLeafVertex(
      1,
      0.5,
      2,
      3,
      getActiveLeafDeformation(0.5, "LTR"),
    );
    const returned = deformActiveLeafVertex(
      1,
      0.5,
      2,
      3,
      getActiveLeafDeformation(0, "LTR"),
    );
    expect(started.x).toBeCloseTo(-2);
    expect(crossing.z).toBeCloseTo(2);
    expect(returned.x).toBeCloseTo(2);
  });

  test("concentrates curl near the fore-edge with restrained torsion", () => {
    const deformation = getActiveLeafDeformation(0.5, "LTR");
    expect(deformation).toMatchObject({
      curl: 0.09,
      lift: 1,
      phase: "cross",
      sourceSide: 1,
      torsion: 0.012,
    });
    const inner = deformActiveLeafVertex(0.25, 0.5, 2, 3, deformation);
    const outer = deformActiveLeafVertex(0.75, 0.5, 2, 3, deformation);
    expect(Math.abs(outer.x)).toBeGreaterThan(Math.abs(inner.x) * 4);
    const bottom = deformActiveLeafVertex(0.75, 0, 2, 3, deformation);
    const top = deformActiveLeafVertex(0.75, 1, 2, 3, deformation);
    expect(top.x).toBeLessThan(bottom.x);
    expect(top.z).toBeCloseTo(bottom.z);
    expect(top.y).toBeCloseTo(-bottom.y);
  });

  test("updates caller-owned uniform and vertex scratch objects", () => {
    const deformation = getActiveLeafDeformation(0, "LTR");
    const writable = {...deformation};
    expect(writeActiveLeafDeformation(writable, 0.5, "RTL")).toBe(writable);
    expect(writable).toMatchObject({
      eased: 0.5,
      phase: "cross",
      sourceSide: -1,
    });

    const vertex = {x: 99, y: 99, z: 99};
    writeActiveLeafPositions(
      new Float32Array([0, 0]),
      new Float32Array(3),
      2,
      3,
      writable,
      vertex,
    );
    expect(vertex).toEqual({x: 0, y: -1.5, z: 0});
  });

  test("writes directly into a PlaneGeometry-style position buffer", () => {
    const uvs = new Float32Array([0, 0, 0.5, 0.5, 1, 1]);
    const positions = new Float32Array(9);
    const returned = writeActiveLeafPositions(
      uvs,
      positions,
      2,
      3,
      getActiveLeafDeformation(0, "LTR"),
    );

    expect(returned).toBe(positions);
    expect([...positions]).toEqual([0, -1.5, 0, 1, 0, 0, 2, 1.5, 0]);
  });
});
