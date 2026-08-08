import {describe, expect, test} from "bun:test";

import {getArtFrameImageMapping} from "~/artFrames/aspect";

describe("digital art frame image mapping", () => {
  test("contains mismatched images without cropping", () => {
    expect(getArtFrameImageMapping(1, 2, "contain")).toEqual({
      contentScaleX: 0.5,
      contentScaleY: 1,
      sourceMaximumX: 1,
      sourceMaximumY: 1,
      sourceMinimumX: 0,
      sourceMinimumY: 0,
    });
    expect(getArtFrameImageMapping(4, 2, "contain")).toEqual({
      contentScaleX: 1,
      contentScaleY: 0.5,
      sourceMaximumX: 1,
      sourceMaximumY: 1,
      sourceMinimumX: 0,
      sourceMinimumY: 0,
    });
  });

  test("covers the frame with a centered crop", () => {
    expect(getArtFrameImageMapping(4, 2, "cover")).toEqual({
      contentScaleX: 1,
      contentScaleY: 1,
      sourceMaximumX: 0.75,
      sourceMaximumY: 1,
      sourceMinimumX: 0.25,
      sourceMinimumY: 0,
    });
    expect(getArtFrameImageMapping(1, 2, "cover")).toEqual({
      contentScaleX: 1,
      contentScaleY: 1,
      sourceMaximumX: 1,
      sourceMaximumY: 0.75,
      sourceMinimumX: 0,
      sourceMinimumY: 0.25,
    });
  });
});
