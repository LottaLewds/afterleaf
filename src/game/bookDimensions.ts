const B5_TRIM_HEIGHT_MILLIMETERS = 257;
const DEFAULT_BOOK_THICKNESS_MILLIMETERS = 8;
const MIN_BOOK_THICKNESS_MILLIMETERS = 4;
const MAX_BOOK_THICKNESS_MILLIMETERS = 24;
const DEFAULT_BOOK_ASPECT_RATIO = 0.5 / 0.74;
const MIN_BOOK_ASPECT_RATIO = 0.35;
const MAX_BOOK_ASPECT_RATIO = 1.5;

export const physicalBookWidth = (
  aspectRatio: number | undefined,
  renderedHeight: number,
) => {
  const ratio =
    aspectRatio !== undefined && Number.isFinite(aspectRatio)
      ? aspectRatio
      : DEFAULT_BOOK_ASPECT_RATIO;
  return (
    Math.min(MAX_BOOK_ASPECT_RATIO, Math.max(MIN_BOOK_ASPECT_RATIO, ratio)) *
    renderedHeight
  );
};

export const physicalBookDepth = (
  thicknessMillimeters: number | undefined,
  renderedHeight: number,
) => {
  const thickness =
    thicknessMillimeters !== undefined && Number.isFinite(thicknessMillimeters)
      ? thicknessMillimeters
      : DEFAULT_BOOK_THICKNESS_MILLIMETERS;
  const boundedThickness = Math.min(
    MAX_BOOK_THICKNESS_MILLIMETERS,
    Math.max(MIN_BOOK_THICKNESS_MILLIMETERS, thickness),
  );
  return (boundedThickness / B5_TRIM_HEIGHT_MILLIMETERS) * renderedHeight;
};
