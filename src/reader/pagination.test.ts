import {describe, expect, test} from "bun:test";

import {
  clampPageIndex,
  formatPageCounter,
  getAdjacentSpreadStart,
  getArrowNavigation,
  getReaderSpread,
  getReaderSpreadSides,
  getReaderWindow,
  getSparsePreloadPageIndices,
  orderSpreadPages,
} from "~/reader/pagination";

describe("reader pagination", () => {
  test("clamps page indexes to the publication", () => {
    expect(clampPageIndex(-4, 8)).toBe(0);
    expect(clampPageIndex(3.9, 8)).toBe(3);
    expect(clampPageIndex(20, 8)).toBe(7);
    expect(clampPageIndex(4, 0)).toBe(0);
  });

  test("keeps the cover separate and pairs later pages in spread layout", () => {
    expect(getReaderSpread(0, 8, "spread")).toEqual({
      start: 0,
      pageIndices: [0],
    });
    expect(getReaderSpread(1, 8, "spread")).toEqual({
      start: 1,
      pageIndices: [1, 2],
    });
    expect(getReaderSpread(2, 8, "spread")).toEqual({
      start: 1,
      pageIndices: [1, 2],
    });
    expect(getReaderSpread(7, 8, "spread")).toEqual({
      start: 7,
      pageIndices: [7],
    });
    expect(getReaderSpread(2, 8, "single")).toEqual({
      start: 2,
      pageIndices: [2],
    });
  });

  test("isolates wide pages and leaves an unprinted side when parity requires it", () => {
    const widePages = new Set([2, 5]);
    expect(getReaderSpread(1, 9, "spread", widePages)).toEqual({
      start: 1,
      pageIndices: [1],
    });
    expect(getReaderSpread(2, 9, "spread", widePages)).toEqual({
      start: 2,
      pageIndices: [2],
    });
    expect(getReaderSpread(3, 9, "spread", widePages)).toEqual({
      start: 3,
      pageIndices: [3, 4],
    });
    expect(getReaderSpread(5, 9, "spread", widePages)).toEqual({
      start: 5,
      pageIndices: [5],
    });
    expect(getReaderSpreadSides(2, 9, "RTL", widePages)).toEqual({
      left: 2,
      right: 2,
    });
    expect(getReaderSpreadSides(1, 9, "RTL", widePages)).toEqual({right: 1});
    expect(getAdjacentSpreadStart(1, 9, "spread", "forward", widePages)).toBe(2);
    expect(getAdjacentSpreadStart(2, 9, "spread", "forward", widePages)).toBe(3);
    expect(getAdjacentSpreadStart(3, 9, "spread", "backward", widePages)).toBe(2);
  });

  test("keeps the visible spread plus the previous and next four pages", () => {
    expect(getReaderWindow(2, 12, "spread")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(getReaderWindow(5, 12, "spread")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getReaderWindow(11, 12, "spread")).toEqual([7, 8, 9, 10, 11]);
    expect(getReaderWindow(5, 12, "single")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(getReaderWindow(0, 0, "spread")).toEqual([]);
  });

  test("moves between complete spreads without passing either boundary", () => {
    expect(getAdjacentSpreadStart(0, 8, "spread", "forward")).toBe(1);
    expect(getAdjacentSpreadStart(1, 8, "spread", "forward")).toBe(3);
    expect(getAdjacentSpreadStart(3, 8, "spread", "backward")).toBe(1);
    expect(getAdjacentSpreadStart(7, 8, "spread", "forward")).toBe(7);
    expect(getAdjacentSpreadStart(0, 8, "spread", "backward")).toBe(0);
  });

  test("selects six pages in each direction for sparse HTTP preloading", () => {
    expect(getSparsePreloadPageIndices(5, 12, "forward")).toEqual([7, 8, 9, 10, 11]);
    expect(getSparsePreloadPageIndices(5, 12, "backward")).toEqual([0, 1, 2, 3, 4]);
    expect(getSparsePreloadPageIndices(0, 8, "forward")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getSparsePreloadPageIndices(0, 8, "backward")).toEqual([]);
    expect(getSparsePreloadPageIndices(7, 8, "forward")).toEqual([]);
    expect(getSparsePreloadPageIndices(1, 12, "forward")).toEqual([3, 4, 5, 6, 7, 8]);
    expect(getSparsePreloadPageIndices(2, 9, "forward", undefined, new Set([2, 5]))).toEqual([3, 4, 5, 6, 7, 8]);
    expect(getSparsePreloadPageIndices(2, 9, "backward", undefined, new Set([2, 5]))).toEqual([0, 1]);
  });

  test("maps physical arrow keys to each reading direction", () => {
    expect(getArrowNavigation("ArrowRight", "LTR")).toBe("forward");
    expect(getArrowNavigation("ArrowLeft", "LTR")).toBe("backward");
    expect(getArrowNavigation("ArrowLeft", "RTL")).toBe("forward");
    expect(getArrowNavigation("ArrowRight", "RTL")).toBe("backward");
    expect(orderSpreadPages([3, 4], "LTR")).toEqual([3, 4]);
    expect(orderSpreadPages([3, 4], "RTL")).toEqual([4, 3]);
  });

  test("places singleton covers on opposite physical book sides", () => {
    expect(getReaderSpreadSides(0, 8, "LTR")).toEqual({right: 0});
    expect(getReaderSpreadSides(7, 8, "LTR")).toEqual({left: 7});
    expect(getReaderSpreadSides(0, 8, "RTL")).toEqual({left: 0});
    expect(getReaderSpreadSides(7, 8, "RTL")).toEqual({right: 7});
    expect(getReaderSpreadSides(3, 8, "LTR")).toEqual({left: 3, right: 4});
    expect(getReaderSpreadSides(3, 8, "RTL")).toEqual({left: 4, right: 3});
  });

  test("formats single pages, spreads, and empty publications", () => {
    expect(formatPageCounter([0], 12)).toBe("Page 1 of 12");
    expect(formatPageCounter([3, 4], 12)).toBe("Pages 4\u20135 of 12");
    expect(formatPageCounter([], 0)).toBe("No pages");
  });
});
