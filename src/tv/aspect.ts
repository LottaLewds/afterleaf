export const TV_SCREEN_ASPECT = 16 / 9;
const ASPECT_MATCH_TOLERANCE = 0.005;

export type TvContentScale = {x: number; y: number};
export type TvScreenSafeArea = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export type TvContentMapping = Readonly<{
  center: Readonly<{x: number; y: number}>;
  scale: TvContentScale;
}>;

export const FULL_TV_SCREEN_SAFE_AREA: TvScreenSafeArea = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
});

export const getTvContentScale = (
  mediaWidth: number,
  mediaHeight: number,
  screenAspect = TV_SCREEN_ASPECT,
): TvContentScale => {
  if (
    !Number.isFinite(mediaWidth) ||
    !Number.isFinite(mediaHeight) ||
    !Number.isFinite(screenAspect) ||
    mediaWidth <= 0 ||
    mediaHeight <= 0 ||
    screenAspect <= 0
  )
    return {x: 1, y: 1};

  const mediaAspect = mediaWidth / mediaHeight;
  if (
    Math.abs(mediaAspect - screenAspect) / screenAspect <=
    ASPECT_MATCH_TOLERANCE
  )
    return {x: 1, y: 1};
  if (mediaAspect > screenAspect) return {x: 1, y: screenAspect / mediaAspect};
  return {x: mediaAspect / screenAspect, y: 1};
};

const isValidSafeArea = (safeArea: TvScreenSafeArea) =>
  Number.isFinite(safeArea.bottom) &&
  Number.isFinite(safeArea.left) &&
  Number.isFinite(safeArea.right) &&
  Number.isFinite(safeArea.top) &&
  safeArea.bottom >= 0 &&
  safeArea.left >= 0 &&
  safeArea.right >= 0 &&
  safeArea.top >= 0 &&
  safeArea.left + safeArea.right < 1 &&
  safeArea.bottom + safeArea.top < 1;

export const getTvContentMapping = (
  mediaWidth: number,
  mediaHeight: number,
  screenAspect = TV_SCREEN_ASPECT,
  safeArea: TvScreenSafeArea = FULL_TV_SCREEN_SAFE_AREA,
): TvContentMapping => {
  const resolvedSafeArea = isValidSafeArea(safeArea)
    ? safeArea
    : FULL_TV_SCREEN_SAFE_AREA;
  const safeWidth = 1 - resolvedSafeArea.left - resolvedSafeArea.right;
  const safeHeight = 1 - resolvedSafeArea.bottom - resolvedSafeArea.top;
  const safeAspect = screenAspect * (safeWidth / safeHeight);
  const containedScale = getTvContentScale(mediaWidth, mediaHeight, safeAspect);
  return {
    center: {
      x: resolvedSafeArea.left + safeWidth * 0.5,
      y: resolvedSafeArea.bottom + safeHeight * 0.5,
    },
    scale: {
      x: safeWidth * containedScale.x,
      y: safeHeight * containedScale.y,
    },
  };
};
