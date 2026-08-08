import {describe, expect, test} from "bun:test";

import {getTvContentMapping, getTvContentScale} from "~/tv/aspect";

describe("TV content aspect ratio", () => {
  test("fills a 16:9 screen", () => {
    expect(getTvContentScale(1_920, 1_080)).toEqual({x: 1, y: 1});
  });

  test("pillarboxes 4:3 content", () => {
    expect(getTvContentScale(640, 480)).toEqual({x: 0.75, y: 1});
  });

  test("letterboxes content wider than 16:9", () => {
    expect(getTvContentScale(2_560, 1_080)).toEqual({x: 1, y: 0.75});
  });

  test("letterboxes 16:9 content on a 4:3 CRT", () => {
    expect(getTvContentScale(1_920, 1_080, 4 / 3)).toEqual({x: 1, y: 0.75});
  });

  test("fills a 4:3 CRT with 4:3 content", () => {
    expect(getTvContentScale(640, 480, 4 / 3)).toEqual({x: 1, y: 1});
  });

  test("fills the screen across harmless metadata rounding", () => {
    expect(getTvContentScale(1_919, 1_080)).toEqual({x: 1, y: 1});
    expect(getTvContentScale(639, 480, 4 / 3)).toEqual({x: 1, y: 1});
  });

  test("falls back to filling the screen before metadata is available", () => {
    expect(getTvContentScale(0, 0)).toEqual({x: 1, y: 1});
  });

  test("contains content inside a symmetric screen safe area", () => {
    const mapping = getTvContentMapping(1_920, 1_080, 4 / 3, {
      bottom: 0.04,
      left: 0.04,
      right: 0.04,
      top: 0.04,
    });

    expect(mapping.center.x).toBeCloseTo(0.5);
    expect(mapping.center.y).toBeCloseTo(0.5);
    expect(mapping.scale.x).toBeCloseTo(0.92);
    expect(mapping.scale.y).toBeCloseTo(0.69);
  });

  test("centers content within an asymmetric screen safe area", () => {
    const mapping = getTvContentMapping(4, 3, 4 / 3, {
      bottom: 0.02,
      left: 0.05,
      right: 0.03,
      top: 0.04,
    });

    expect(mapping.center.x).toBeCloseTo(0.51);
    expect(mapping.center.y).toBeCloseTo(0.49);
    expect(mapping.scale.x).toBeCloseTo(0.92);
    expect(mapping.scale.y).toBeCloseTo(0.92);
  });

  test("ignores invalid screen safe areas", () => {
    expect(
      getTvContentMapping(1_920, 1_080, 16 / 9, {
        bottom: 0,
        left: 0.6,
        right: 0.6,
        top: 0,
      }),
    ).toEqual({
      center: {x: 0.5, y: 0.5},
      scale: {x: 1, y: 1},
    });
  });
});
