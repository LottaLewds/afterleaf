import {afterEach, describe, expect, test} from "bun:test";

import {
  clearDetectedWideReaderPagesForTests,
  detectWideReaderPage,
  getWideReaderPageIndices,
  isWideReaderPage,
  mirrorReaderPageHorizontalRange,
  readerPageHalf,
  readerPageSourceUrl,
  readerPageTextureUrl,
} from "~/reader/pageSpreadDetection";

afterEach(clearDetectedWideReaderPagesForTests);

describe("reader page spread detection", () => {
  test("detects an image shaped like two ordinary pages", () => {
    expect(detectWideReaderPage("page-2.webp", 2_484, 1_805, 0.688)).toBe(true);
    expect(isWideReaderPage("page-2.webp")).toBe(true);
    expect(getWideReaderPageIndices(["cover.webp", "page-2.webp"])).toEqual(new Set([1]));
  });

  test("does not classify ordinary portrait pages or the cover", () => {
    expect(detectWideReaderPage("page.webp", 1_242, 1_805, 0.688)).toBe(false);
    detectWideReaderPage("cover.webp", 2_484, 1_805, 0.688);
    expect(getWideReaderPageIndices(["cover.webp", "page.webp"])).toEqual(new Set());
  });

  test("creates stable texture variants for the two image halves", () => {
    const url = "/page.webp?revision=1";
    const left = readerPageTextureUrl(url, "left");
    const right = readerPageTextureUrl(url, "right");
    expect(readerPageSourceUrl(left)).toBe(url);
    expect(readerPageHalf(left)).toBe("left");
    expect(readerPageHalf(right)).toBe("right");
  });

  test("mirrors only the selected horizontal texture range", () => {
    expect(mirrorReaderPageHorizontalRange(0, 1)).toEqual({
      offset: 1,
      repeat: -1,
    });
    expect(mirrorReaderPageHorizontalRange(0, 0.5)).toEqual({
      offset: 0.5,
      repeat: -0.5,
    });
    expect(mirrorReaderPageHorizontalRange(0.5, 0.5)).toEqual({
      offset: 1,
      repeat: -0.5,
    });
  });
});
