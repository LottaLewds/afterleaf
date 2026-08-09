import {readFile} from "node:fs/promises";
import sharp from "~/media/sharpRuntime";

export type WebpDerivativeCreator = (source: Uint8Array) => Promise<Buffer>;

export type WebpDerivativeOptions = {
  background: string;
  maxDimension: number;
  quality: number;
};

const WEBP_REOPTIMIZATION_RATIO = 0.9;
const WEBP_ORIENTATION_NORMAL = 1;

export const createWebpDerivative = (
  source: Uint8Array,
  options: WebpDerivativeOptions,
) =>
  sharp(source, {limitInputPixels: 100_000_000})
    .rotate()
    .flatten({background: options.background})
    .toColourspace("srgb")
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({quality: options.quality, effort: 5, smartSubsample: true})
    .toBuffer();

export const renderWebpImage = async (
  filePath: string,
  createDerivative: WebpDerivativeCreator,
  maxDimension: number,
) => {
  const source = await readFile(filePath);
  const metadata = await sharp(source, {
    limitInputPixels: 100_000_000,
  }).metadata();
  const sourceCanPassThrough =
    metadata.format === "webp" &&
    metadata.width !== undefined &&
    metadata.height !== undefined &&
    metadata.width <= maxDimension &&
    metadata.height <= maxDimension &&
    (metadata.orientation === undefined ||
      metadata.orientation === WEBP_ORIENTATION_NORMAL);
  const derivative = await createDerivative(source);
  if (!sourceCanPassThrough) return derivative;
  return derivative.byteLength <= source.byteLength * WEBP_REOPTIMIZATION_RATIO
    ? derivative
    : source;
};
