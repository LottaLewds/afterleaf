export type ArtFrameFit = "contain" | "cover";

export type ArtFrameImageMapping = {
  contentScaleX: number;
  contentScaleY: number;
  sourceMaximumX: number;
  sourceMaximumY: number;
  sourceMinimumX: number;
  sourceMinimumY: number;
};

export const getArtFrameImageMapping = (
  imageAspect: number,
  frameAspect: number,
  fit: ArtFrameFit,
): ArtFrameImageMapping => {
  if (fit === "contain") {
    const scaleX = Math.min(1, imageAspect / frameAspect);
    const scaleY = Math.min(1, frameAspect / imageAspect);
    return {
      contentScaleX: scaleX,
      contentScaleY: scaleY,
      sourceMaximumX: 1,
      sourceMaximumY: 1,
      sourceMinimumX: 0,
      sourceMinimumY: 0,
    };
  }
  if (imageAspect > frameAspect) {
    const visibleWidth = frameAspect / imageAspect;
    const inset = (1 - visibleWidth) / 2;
    return {
      contentScaleX: 1,
      contentScaleY: 1,
      sourceMaximumX: 1 - inset,
      sourceMaximumY: 1,
      sourceMinimumX: inset,
      sourceMinimumY: 0,
    };
  }
  const visibleHeight = imageAspect / frameAspect;
  const inset = (1 - visibleHeight) / 2;
  return {
    contentScaleX: 1,
    contentScaleY: 1,
    sourceMaximumX: 1,
    sourceMaximumY: 1 - inset,
    sourceMinimumX: 0,
    sourceMinimumY: inset,
  };
};
