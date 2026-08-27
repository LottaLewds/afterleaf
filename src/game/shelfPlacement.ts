export type SpineShelfBook = {
  center: number;
  id: string;
  width: number;
};

export type ShelfPresentation = "face" | "spine";

export type SpineShelfPlacement = SpineShelfBook & {
  slotIndex: number;
};

export type SpineShelfInsertion = {
  center: number;
  id: string;
  width: number;
};

export type SpineShelfBounds = {
  max: number;
  min: number;
};

const safeWidth = (width: number) => (Number.isFinite(width) ? Math.max(0, width) : 0);

/** Places a spine book so its rear edge stays on the shelf's back plane. */
export const spineShelfBookNormalOffset = (bookWidth: number, backInset: number) =>
  safeWidth(bookWidth) / 2 - safeWidth(backInset);

/**
 * Finds the closest spine at a shelf coordinate while giving thin books a
 * practical minimum pointer target. The visual book width remains unchanged.
 */
export const findSpineShelfBookAtOffset = (
  books: readonly SpineShelfBook[],
  offset: number,
  minimumTargetWidth: number,
) => {
  if (!Number.isFinite(offset)) return undefined;
  const safeMinimumTargetWidth = safeWidth(minimumTargetWidth);
  let closestBook: SpineShelfBook | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const book of books) {
    const width = safeWidth(book.width);
    if (!book.id || width <= 0) continue;
    const distance = Math.abs(book.center - offset);
    if (distance > Math.max(width, safeMinimumTargetWidth) / 2 || distance >= closestDistance) continue;
    closestBook = book;
    closestDistance = distance;
  }
  return closestBook;
};

/** Finds a book beside the current one using stable shelf-coordinate order. */
export const findAdjacentShelfBook = (books: readonly SpineShelfBook[], currentId: string, direction: -1 | 1) => {
  const orderedBooks = books
    .filter((book) => book.id && safeWidth(book.width) > 0)
    .toSorted((first, second) =>
      first.center === second.center ? first.id.localeCompare(second.id) : first.center - second.center,
    );
  const currentIndex = orderedBooks.findIndex((book) => book.id === currentId);
  if (currentIndex < 0) return undefined;
  return orderedBooks[currentIndex + direction];
};

/**
 * Inserts a variable-width book at the requested shelf coordinate. Existing
 * gaps are preserved, while only the overlapping chains are pushed outwards.
 */
export const insertSpineShelfBook = (
  books: readonly SpineShelfBook[],
  insertion: Readonly<SpineShelfInsertion>,
  bounds: Readonly<SpineShelfBounds>,
  gap = 0,
): readonly SpineShelfPlacement[] | undefined => {
  const minimum = Math.min(bounds.min, bounds.max);
  const maximum = Math.max(bounds.min, bounds.max);
  const safeGap = safeWidth(gap);
  const insertionWidth = safeWidth(insertion.width);
  if (!insertion.id || insertionWidth <= 0 || maximum <= minimum) return undefined;

  const orderedBooks = books
    .filter((book) => book.id !== insertion.id && safeWidth(book.width) > 0)
    .map((book) => Object.assign({}, book, {width: safeWidth(book.width)}))
    .sort((first, second) =>
      first.center === second.center ? first.id.localeCompare(second.id) : first.center - second.center,
    );
  const requiredWidth =
    insertionWidth + orderedBooks.reduce((total, book) => total + book.width, 0) + safeGap * orderedBooks.length;
  if (requiredWidth > maximum - minimum + Number.EPSILON) return undefined;

  const insertionIndex = orderedBooks.findIndex((book) => book.center >= insertion.center);
  const boundedInsertionIndex = insertionIndex < 0 ? orderedBooks.length : insertionIndex;
  const leftBooks = orderedBooks.slice(0, boundedInsertionIndex);
  const rightBooks = orderedBooks.slice(boundedInsertionIndex);
  const leftWidth = leftBooks.reduce((total, book) => total + book.width, 0) + safeGap * leftBooks.length;
  const rightWidth = rightBooks.reduce((total, book) => total + book.width, 0) + safeGap * rightBooks.length;
  const minimumCenter = minimum + leftWidth + insertionWidth / 2;
  const maximumCenter = maximum - rightWidth - insertionWidth / 2;
  const insertionCenter = Math.min(Math.max(insertion.center, minimumCenter), maximumCenter);
  const centers = new Map<string, number>();
  centers.set(insertion.id, insertionCenter);

  let cursor = insertionCenter - insertionWidth / 2 - safeGap;
  for (let index = leftBooks.length - 1; index >= 0; index -= 1) {
    const book = leftBooks[index];
    if (!book) continue;
    const center = Math.min(book.center, cursor - book.width / 2);
    centers.set(book.id, center);
    cursor = center - book.width / 2 - safeGap;
  }

  cursor = insertionCenter + insertionWidth / 2 + safeGap;
  for (const book of rightBooks) {
    const center = Math.max(book.center, cursor + book.width / 2);
    centers.set(book.id, center);
    cursor = center + book.width / 2 + safeGap;
  }

  return [...leftBooks, {...insertion, center: insertionCenter}, ...rightBooks].map((book, slotIndex) =>
    Object.assign({}, book, {
      center: centers.get(book.id) ?? book.center,
      slotIndex,
    }),
  );
};
