const BOOKMARK_STORAGE_KEY = "afterleaf-reader-bookmarks-v1";
const MAX_BOOKMARK_COUNT = 10_000;

export type ReaderBookmarks = Readonly<Record<string, number>>;

const parseBookmarks = (value: unknown): ReaderBookmarks => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const bookmarks: Record<string, number> = {};
  let bookmarkCount = 0;
  for (const [publicationId, pageIndex] of Object.entries(value)) {
    if (bookmarkCount >= MAX_BOOKMARK_COUNT) break;
    if (!publicationId || !Number.isSafeInteger(pageIndex) || Number(pageIndex) < 0) continue;
    bookmarks[publicationId] = Number(pageIndex);
    bookmarkCount += 1;
  }
  return bookmarks;
};

export const loadReaderBookmarks = (storage: Pick<Storage, "getItem"> = localStorage): ReaderBookmarks => {
  try {
    const value = storage.getItem(BOOKMARK_STORAGE_KEY);
    return value ? parseBookmarks(JSON.parse(value) as unknown) : {};
  } catch {
    return {};
  }
};

export const saveReaderBookmark = (
  bookmarks: ReaderBookmarks,
  publicationId: string,
  pageIndex: number,
  storage: Pick<Storage, "setItem"> = localStorage,
) => {
  if (!publicationId || !Number.isSafeInteger(pageIndex) || pageIndex < 0) return bookmarks;
  const next: ReaderBookmarks = {...bookmarks, [publicationId]: pageIndex};
  try {
    storage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A bookmark is a convenience; a full or unavailable storage area must not
    // interrupt reading.
  }
  return next;
};
