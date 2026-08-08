export type ReaderPageHalf = "left" | "right";

const MIN_SPREAD_WIDTH_FACTOR = 1.6;
const PAGE_HALF_FRAGMENT = "afterleaf-page-half=";
const widePageUrls = new Set<string>();
const listeners = new Set<(url: string) => void>();
let detectionRevision = 0;
const pageIndexCache = new WeakMap<
  readonly string[],
  {indices: ReadonlySet<number>; revision: number}
>();

export const readerPageSourceUrl = (url: string) => {
  const fragmentIndex = url.indexOf(`#${PAGE_HALF_FRAGMENT}`);
  return fragmentIndex < 0 ? url : url.slice(0, fragmentIndex);
};

export const readerPageHalf = (url: string): ReaderPageHalf | undefined => {
  const fragmentIndex = url.indexOf(`#${PAGE_HALF_FRAGMENT}`);
  if (fragmentIndex < 0) return;
  const half = url.slice(fragmentIndex + PAGE_HALF_FRAGMENT.length + 1);
  return half === "left" || half === "right" ? half : undefined;
};

export const readerPageTextureUrl = (
  url: string,
  half: ReaderPageHalf | undefined,
) =>
  half
    ? `${readerPageSourceUrl(url)}#${PAGE_HALF_FRAGMENT}${half}`
    : readerPageSourceUrl(url);

export const mirrorReaderPageHorizontalRange = (
  offset: number,
  repeat: number,
) => ({offset: offset + repeat, repeat: -repeat});

export const isWideReaderPage = (url: string) =>
  widePageUrls.has(readerPageSourceUrl(url));

export const detectWideReaderPage = (
  url: string,
  width: number,
  height: number,
  singlePageAspectRatio: number,
) => {
  if (
    !url ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(singlePageAspectRatio) ||
    width <= 0 ||
    height <= 0 ||
    singlePageAspectRatio <= 0 ||
    width / height < singlePageAspectRatio * MIN_SPREAD_WIDTH_FACTOR
  )
    return false;

  const sourceUrl = readerPageSourceUrl(url);
  if (widePageUrls.has(sourceUrl)) return true;
  widePageUrls.add(sourceUrl);
  detectionRevision += 1;
  for (const listener of listeners) listener(sourceUrl);
  return true;
};

export const getWideReaderPageIndices = (pages: readonly string[]) => {
  const cached = pageIndexCache.get(pages);
  if (cached?.revision === detectionRevision) return cached.indices;
  const indices = new Set<number>();
  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index];
    if (page && isWideReaderPage(page)) indices.add(index);
  }
  pageIndexCache.set(pages, {indices, revision: detectionRevision});
  return indices;
};

export const subscribeToWideReaderPages = (listener: (url: string) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearDetectedWideReaderPagesForTests = () => {
  widePageUrls.clear();
  detectionRevision += 1;
};
