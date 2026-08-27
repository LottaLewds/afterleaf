const DARK_LUMA_THRESHOLD = 24;
const VISIBLE_LUMA_THRESHOLD = 40;
const MIN_VISIBLE_PIXEL_RATIO = 0.04;
const MAX_BRIGHT_EDGE_PIXEL_RATIO = 0.04;
const MIN_BAR_RATIO = 0.02;
const MAX_BAR_RATIO = 0.3;
const MAX_BAR_ASYMMETRY_RATIO = 0.025;
const TARGET_ASPECT = 4 / 3;
const TARGET_ASPECT_TOLERANCE = 0.025;
const CONSENSUS_EDGE_TOLERANCE = 0.015;

export type ActivePictureRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export const FULL_ACTIVE_PICTURE_RECT: ActivePictureRect = Object.freeze({
  height: 1,
  width: 1,
  x: 0,
  y: 0,
});

const lumaAt = (pixels: Uint8ClampedArray, offset: number) =>
  ((pixels[offset] ?? 0) * 54 + (pixels[offset + 1] ?? 0) * 183 + (pixels[offset + 2] ?? 0) * 19) / 256;

const isDarkColumn = (pixels: Uint8ClampedArray, width: number, height: number, column: number) => {
  const maximumBrightPixels = Math.floor(height * MAX_BRIGHT_EDGE_PIXEL_RATIO);
  let brightPixels = 0;
  for (let row = 0; row < height; row += 1) {
    const offset = (row * width + column) * 4;
    if (lumaAt(pixels, offset) <= DARK_LUMA_THRESHOLD) continue;
    brightPixels += 1;
    if (brightPixels > maximumBrightPixels) return false;
  }
  return true;
};

const countDarkEdgeColumns = (pixels: Uint8ClampedArray, width: number, height: number, fromRight: boolean) => {
  const maximumColumns = Math.floor(width * MAX_BAR_RATIO);
  for (let inset = 0; inset < maximumColumns; inset += 1) {
    const column = fromRight ? width - inset - 1 : inset;
    if (!isDarkColumn(pixels, width, height, column)) return inset;
  }
  return maximumColumns;
};

const hasVisiblePicture = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const xStart = Math.floor(width * 0.1);
  const xEnd = Math.ceil(width * 0.9);
  const yStart = Math.floor(height * 0.1);
  const yEnd = Math.ceil(height * 0.9);
  const sampledPixels = (xEnd - xStart) * (yEnd - yStart);
  const minimumVisiblePixels = Math.ceil(sampledPixels * MIN_VISIBLE_PIXEL_RATIO);
  let visiblePixels = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      if (lumaAt(pixels, offset) < VISIBLE_LUMA_THRESHOLD) continue;
      visiblePixels += 1;
      if (visiblePixels >= minimumVisiblePixels) return true;
    }
  }
  return false;
};

/**
 * Finds a 4:3 active picture baked into a wider video frame. Undefined means
 * that the frame is too dark to judge; a full rect is a usable uncropped frame.
 */
export const detectActivePictureRect = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ActivePictureRect | undefined => {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4 || !hasVisiblePicture(pixels, width, height))
    return;

  const leftColumns = countDarkEdgeColumns(pixels, width, height, false);
  const rightColumns = countDarkEdgeColumns(pixels, width, height, true);
  const minimumBarColumns = Math.ceil(width * MIN_BAR_RATIO);
  if (leftColumns < minimumBarColumns || rightColumns < minimumBarColumns) return FULL_ACTIVE_PICTURE_RECT;
  if (Math.abs(leftColumns - rightColumns) > Math.max(2, width * MAX_BAR_ASYMMETRY_RATIO))
    return FULL_ACTIVE_PICTURE_RECT;

  const activeWidth = width - leftColumns - rightColumns;
  const activeAspect = activeWidth / height;
  if (Math.abs(activeAspect - TARGET_ASPECT) / TARGET_ASPECT > TARGET_ASPECT_TOLERANCE) return FULL_ACTIVE_PICTURE_RECT;

  return {
    height: 1,
    width: activeWidth / width,
    x: leftColumns / width,
    y: 0,
  };
};

const median = (values: readonly number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) return 0;
  if (sorted.length % 2 === 1) return value;
  return ((sorted[middle - 1] ?? value) + value) * 0.5;
};

export const getActivePictureConsensus = (
  samples: readonly ActivePictureRect[],
  minimumSamples: number,
): ActivePictureRect | undefined => {
  if (minimumSamples <= 0) return FULL_ACTIVE_PICTURE_RECT;
  for (const candidate of samples) {
    const matching = samples.filter(
      (sample) =>
        Math.abs(sample.x - candidate.x) <= CONSENSUS_EDGE_TOLERANCE &&
        Math.abs(sample.width - candidate.width) <= CONSENSUS_EDGE_TOLERANCE * 2,
    );
    if (matching.length < minimumSamples) continue;
    return {
      height: 1,
      width: median(matching.map((sample) => sample.width)),
      x: median(matching.map((sample) => sample.x)),
      y: 0,
    };
  }
};
