import {describe, expect, test} from "bun:test";
import {physicalBookDepth, physicalBookWidth} from "~/game/bookDimensions";

describe("physicalBookDepth", () => {
  test("keeps a typical magazine thin relative to its rendered height", () => {
    expect(physicalBookDepth(6.42, 0.74)).toBeCloseTo(0.0185, 4);
    expect(physicalBookDepth(6.42, 3.12)).toBeCloseTo(0.078, 3);
  });

  test("bounds malformed, paper-thin, and unusually thick metadata", () => {
    expect(physicalBookDepth(Number.NaN, 0.74)).toBeCloseTo(0.023, 3);
    expect(physicalBookDepth(undefined, 0.74)).toBeCloseTo(0.023, 3);
    expect(physicalBookDepth(0, 0.74)).toBeCloseTo(0.0115, 4);
    expect(physicalBookDepth(80, 0.74)).toBeCloseTo(0.0691, 4);
  });
});

describe("physicalBookWidth", () => {
  test("preserves inferred trim ratios while bounding malformed values", () => {
    expect(physicalBookWidth(0.725, 0.74)).toBeCloseTo(0.5365);
    expect(physicalBookWidth(undefined, 0.74)).toBeCloseTo(0.5);
    expect(physicalBookWidth(Number.NaN, 0.74)).toBeCloseTo(0.5);
    expect(physicalBookWidth(4, 0.74)).toBeCloseTo(1.11);
  });
});
