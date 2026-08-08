import {createWebpDerivative} from "../media/webp";

export const ART_FRAME_MAX_DIMENSION = 2_048;
const ART_FRAME_WEBP_QUALITY = 84;

export const createArtFrameImageDerivative = (source: Uint8Array) =>
  createWebpDerivative(source, {
    background: "#000000",
    maxDimension: ART_FRAME_MAX_DIMENSION,
    quality: ART_FRAME_WEBP_QUALITY,
  });
