export interface ImageDimensions {
  height: number;
  orientation?: number;
  width: number;
}

export const BOOK_ASPECT_RATIO_INFERENCE_VERSION = 2;
const MIN_BOOK_ASPECT_RATIO = 0.35;
const MAX_BOOK_ASPECT_RATIO = 1.5;
// Two-page scans are upper outliers. The lower quartile tolerates several of
// them without letting a single unusually narrow page decide a long book.
const REPRESENTATIVE_RATIO_QUANTILE = 0.25;

export const bookAspectRatioSamplePageIndices = (pageCount: number, earlyInteriorCount = 2) => {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) throw new Error("pageCount must be a positive integer");
  if (!Number.isSafeInteger(earlyInteriorCount) || earlyInteriorCount < 0)
    throw new Error("earlyInteriorCount must be a non-negative integer");
  const lastPageIndex = pageCount - 1;
  const midpoint = Math.floor(lastPageIndex / 2);
  return [
    ...new Set([
      ...Array.from({length: Math.min(earlyInteriorCount, Math.max(0, lastPageIndex - 1))}, (_, index) => index + 1),
      midpoint,
      midpoint + 1,
    ]),
  ].filter((index) => index > 0 && index < lastPageIndex);
};

export const boundedBookAspectRatio = (aspectRatio: number) =>
  Math.min(MAX_BOOK_ASPECT_RATIO, Math.max(MIN_BOOK_ASPECT_RATIO, aspectRatio));

export const orientedImageDimensions = (image: ImageDimensions) => {
  const swapsAxes = image.orientation !== undefined && image.orientation >= 5 && image.orientation <= 8;
  return swapsAxes ? {height: image.width, width: image.height} : {height: image.height, width: image.width};
};

export const inferRepresentativeBookAspectRatio = (images: readonly ImageDimensions[], fallbackAspectRatio: number) => {
  const ratios = images
    .flatMap((image) => {
      const dimensions = orientedImageDimensions(image);
      const ratio = dimensions.width / dimensions.height;
      return Number.isFinite(ratio) && ratio > 0 ? [ratio] : [];
    })
    .sort((left, right) => left - right);
  if (ratios.length === 0) return boundedBookAspectRatio(fallbackAspectRatio);
  const representativeIndex = Math.min(ratios.length - 1, Math.floor(ratios.length * REPRESENTATIVE_RATIO_QUANTILE));
  return boundedBookAspectRatio(ratios[representativeIndex] ?? fallbackAspectRatio);
};
