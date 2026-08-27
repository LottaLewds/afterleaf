import {describe, expect, test} from "bun:test";

import {
  detectActivePictureRect,
  FULL_ACTIVE_PICTURE_RECT,
  getActivePictureConsensus,
  type ActivePictureRect,
} from "~/tv/activePicture";

const createFrame = (width: number, height: number, activeStart = 0, activeEnd = width) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = activeStart; x < activeEnd; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 160;
      pixels[offset + 1] = 100;
      pixels[offset + 2] = 70;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
};

describe("TV active-picture detection", () => {
  test("detects 4:3 pillarboxing baked into a 16:9 frame", () => {
    const width = 160;
    const height = 90;
    const pixels = createFrame(width, height, 20, 140);

    expect(detectActivePictureRect(pixels, width, height)).toEqual({
      height: 1,
      width: 0.75,
      x: 0.125,
      y: 0,
    });
  });

  test("leaves a visible frame without matching pillar bars uncropped", () => {
    const pixels = createFrame(160, 90);
    expect(detectActivePictureRect(pixels, 160, 90)).toEqual(FULL_ACTIVE_PICTURE_RECT);
  });

  test("does not make a crop decision from a black frame", () => {
    const pixels = new Uint8ClampedArray(160 * 90 * 4);
    expect(detectActivePictureRect(pixels, 160, 90)).toBeUndefined();
  });

  test("rejects dark edges that do not describe a 4:3 picture", () => {
    const pixels = createFrame(160, 90, 8, 152);
    expect(detectActivePictureRect(pixels, 160, 90)).toEqual(FULL_ACTIVE_PICTURE_RECT);
  });

  test("requires a stable crop across multiple frames", () => {
    const full = FULL_ACTIVE_PICTURE_RECT;
    const crop: ActivePictureRect = {
      height: 1,
      width: 0.75,
      x: 0.125,
      y: 0,
    };
    expect(getActivePictureConsensus([full, crop, crop, crop], 4)).toBeUndefined();
    expect(getActivePictureConsensus([full, crop, crop, crop, crop], 4)).toEqual(crop);
  });
});
