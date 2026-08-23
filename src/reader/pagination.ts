export type ReaderLayout = "single" | "spread";
export type ReaderDirection = "LTR" | "RTL";
export type ReaderNavigation = "backward" | "forward";

export type ReaderSpread = {
  readonly start: number;
  readonly pageIndices: readonly number[];
};

export type ReaderSpreadSides = {
  readonly left?: number;
  readonly right?: number;
};

export const READER_PAGE_BUFFER_SIZE = 4;
export const READER_PAGE_TEXTURE_CACHE_SIZE = READER_PAGE_BUFFER_SIZE * 2 + 2;
export const READER_SPARSE_PRELOAD_PAGE_COUNT = 6;
const EMPTY_WIDE_PAGE_INDICES: ReadonlySet<number> = new Set();

const normalizePageCount = (pageCount: number) =>
  Math.max(0, Math.trunc(pageCount));

export const clampPageIndex = (pageIndex: number, pageCount: number) => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0) return 0;
  return Math.min(normalizedPageCount - 1, Math.max(0, Math.trunc(pageIndex)));
};

export const getReaderSpread = (
  pageIndex: number,
  pageCount: number,
  layout: ReaderLayout,
  widePageIndices: ReadonlySet<number> = EMPTY_WIDE_PAGE_INDICES,
): ReaderSpread => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0) return {start: 0, pageIndices: []};

  const currentPage = clampPageIndex(pageIndex, normalizedPageCount);
  if (layout === "single" || currentPage === 0)
    return {start: currentPage, pageIndices: [currentPage]};

  let start = 1;
  while (start < normalizedPageCount) {
    const startsWideSpread = widePageIndices.has(start);
    const nextPage = start + 1;
    const endsBeforeWideSpread = widePageIndices.has(nextPage);
    // Never put half of a detected spread on the reverse of the preceding
    // leaf. The ordinary page becomes a singleton with an unprinted face.
    const length = startsWideSpread || endsBeforeWideSpread ? 1 : 2;
    if (currentPage < start + length) {
      const pageIndices = [start];
      if (length === 2 && nextPage < normalizedPageCount)
        pageIndices.push(nextPage);
      return {start, pageIndices};
    }
    start += length;
  }

  return {start: currentPage, pageIndices: [currentPage]};
};

export const getReaderWindow = (
  pageIndex: number,
  pageCount: number,
  layout: ReaderLayout,
  bufferSize = READER_PAGE_BUFFER_SIZE,
  widePageIndices: ReadonlySet<number> = EMPTY_WIDE_PAGE_INDICES,
): readonly number[] => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0) return [];

  const spread = getReaderSpread(
    pageIndex,
    normalizedPageCount,
    layout,
    widePageIndices,
  );
  const lastVisiblePage = spread.pageIndices.at(-1) ?? spread.start;
  const normalizedBufferSize = Math.max(0, Math.trunc(bufferSize));
  const firstPage = Math.max(0, spread.start - normalizedBufferSize);
  const lastPage = Math.min(
    normalizedPageCount - 1,
    lastVisiblePage + normalizedBufferSize,
  );

  return Array.from(
    {length: lastPage - firstPage + 1},
    (_, offset) => firstPage + offset,
  );
};

// Pages adjacent to the current spread in the given direction, used for
// sparse-library HTTP preloading so pages land on disk before they are shown.
export const getSparsePreloadPageIndices = (
  pageIndex: number,
  pageCount: number,
  navigation: ReaderNavigation,
  count = READER_SPARSE_PRELOAD_PAGE_COUNT,
  widePageIndices: ReadonlySet<number> = EMPTY_WIDE_PAGE_INDICES,
): readonly number[] => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0) return [];

  const spread = getReaderSpread(
    pageIndex,
    normalizedPageCount,
    "spread",
    widePageIndices,
  );
  const normalizedCount = Math.max(0, Math.trunc(count));
  if (navigation === "backward") {
    const firstPage = Math.max(0, spread.start - normalizedCount);
    return Array.from(
      {length: spread.start - firstPage},
      (_, offset) => firstPage + offset,
    );
  }
  const lastVisiblePage = spread.pageIndices.at(-1) ?? spread.start;
  const lastPage = Math.min(
    normalizedPageCount - 1,
    lastVisiblePage + normalizedCount,
  );
  return Array.from(
    {length: lastPage - lastVisiblePage},
    (_, offset) => lastVisiblePage + offset + 1,
  );
};

export const getAdjacentSpreadStart = (
  pageIndex: number,
  pageCount: number,
  layout: ReaderLayout,
  navigation: ReaderNavigation,
  widePageIndices: ReadonlySet<number> = EMPTY_WIDE_PAGE_INDICES,
) => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0) return 0;

  const spread = getReaderSpread(
    pageIndex,
    normalizedPageCount,
    layout,
    widePageIndices,
  );
  if (navigation === "backward") {
    if (spread.start === 0) return 0;
    return getReaderSpread(
      spread.start - 1,
      normalizedPageCount,
      layout,
      widePageIndices,
    ).start;
  }

  const lastVisiblePage = spread.pageIndices.at(-1) ?? spread.start;
  if (lastVisiblePage >= normalizedPageCount - 1) return spread.start;
  return getReaderSpread(
    lastVisiblePage + 1,
    normalizedPageCount,
    layout,
    widePageIndices,
  ).start;
};

export const getArrowNavigation = (
  key: "ArrowLeft" | "ArrowRight",
  direction: ReaderDirection,
): ReaderNavigation => {
  if (direction === "LTR") return key === "ArrowRight" ? "forward" : "backward";
  return key === "ArrowLeft" ? "forward" : "backward";
};

export const orderSpreadPages = (
  pageIndices: readonly number[],
  direction: ReaderDirection,
) => (direction === "RTL" ? pageIndices.toReversed() : pageIndices);

export const getReaderSpreadSides = (
  pageIndex: number,
  pageCount: number,
  direction: ReaderDirection,
  widePageIndices: ReadonlySet<number> = EMPTY_WIDE_PAGE_INDICES,
): ReaderSpreadSides => {
  const spread = getReaderSpread(
    pageIndex,
    pageCount,
    "spread",
    widePageIndices,
  );
  if (widePageIndices.has(spread.start))
    return {left: spread.start, right: spread.start};
  const visualPages = orderSpreadPages(spread.pageIndices, direction);
  const firstPage = visualPages[0];
  const secondPage = visualPages[1];
  if (firstPage === undefined) return {};
  if (secondPage !== undefined) return {left: firstPage, right: secondPage};

  const pageIsOnSourceSide = spread.start === 0;
  const pageIsOnRight =
    direction === "LTR" ? pageIsOnSourceSide : !pageIsOnSourceSide;
  return pageIsOnRight ? {right: firstPage} : {left: firstPage};
};

export const formatPageCounter = (
  pageIndices: readonly number[],
  pageCount: number,
) => {
  const normalizedPageCount = normalizePageCount(pageCount);
  if (normalizedPageCount === 0 || pageIndices.length === 0) return "No pages";

  const firstPage = (pageIndices[0] ?? 0) + 1;
  const lastPage = (pageIndices.at(-1) ?? firstPage - 1) + 1;
  const visiblePages =
    firstPage === lastPage
      ? `Page ${firstPage}`
      : `Pages ${firstPage}\u2013${lastPage}`;
  return `${visiblePages} of ${normalizedPageCount}`;
};
