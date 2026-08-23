import {isSparseLibraryPageUrl} from "~/content/libraryUpdate/activeLibraryRoutes";
import {readerPageSourceUrl} from "~/reader/pageSpreadDetection";
import {
  READER_PAGE_BUFFER_SIZE,
  READER_SPARSE_PRELOAD_PAGE_COUNT,
  getSparsePreloadPageIndices,
  getReaderWindow,
} from "~/reader/pagination";

export type ReaderPagePreloadPlan = {
  httpUrls: readonly string[];
  textureUrls: readonly string[];
};

export const createReaderPagePreloadPlan = (options: {
  pageCount: number;
  pageIndex: number;
  pageUrl: (pageIndex: number) => string | undefined;
  requestedUrls: ReadonlySet<string>;
  widePageIndices: ReadonlySet<number>;
}): ReaderPagePreloadPlan => {
  const requestedSources = new Set(
    [...options.requestedUrls].map(readerPageSourceUrl),
  );
  const textureUrls = getReaderWindow(
    options.pageIndex,
    options.pageCount,
    "spread",
    READER_PAGE_BUFFER_SIZE,
    options.widePageIndices,
  ).flatMap((pageIndex) => {
    const url = options.pageUrl(pageIndex);
    return !url ||
      isSparseLibraryPageUrl(url) ||
      requestedSources.has(readerPageSourceUrl(url))
      ? []
      : [url];
  });
  const sparsePreloadUrls = [
    // Forward first: reading usually advances, so start those fetches first.
    ...getSparsePreloadPageIndices(
      options.pageIndex,
      options.pageCount,
      "forward",
      READER_SPARSE_PRELOAD_PAGE_COUNT,
      options.widePageIndices,
    ),
    ...getSparsePreloadPageIndices(
      options.pageIndex,
      options.pageCount,
      "backward",
      READER_SPARSE_PRELOAD_PAGE_COUNT,
      options.widePageIndices,
    ),
  ].flatMap((pageIndex) => {
    const url = options.pageUrl(pageIndex);
    return url &&
      isSparseLibraryPageUrl(url) &&
      !requestedSources.has(readerPageSourceUrl(url))
      ? [url]
      : [];
  });

  return {
    httpUrls: [...textureUrls, ...sparsePreloadUrls],
    textureUrls,
  };
};
