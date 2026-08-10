import {createWebpDerivative} from "../media/webp";

export const POSTER_MAX_DIMENSION = 2_048;
const POSTER_WEBP_QUALITY = 88;

export const createPosterImageDerivative = (source: Uint8Array) =>
  createWebpDerivative(source, {
    maxDimension: POSTER_MAX_DIMENSION,
    quality: POSTER_WEBP_QUALITY,
  });
