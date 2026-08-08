export const ART_FRAME_CROSSFADE_SECONDS = 0.8;

export const artFrameCrossfadeOpacity = (elapsedSeconds: number) => {
  const progress = Math.min(
    1,
    Math.max(0, elapsedSeconds / ART_FRAME_CROSSFADE_SECONDS),
  );
  return progress * progress * (3 - 2 * progress);
};
