import sharp from "sharp";

if (process.platform === "win32") sharp.concurrency(1);

const READER_MAX_DIMENSION = 2_048;
const READER_WEBP_QUALITY = 88;

export const createReaderPageDerivative = (source: Uint8Array) =>
  sharp(source, {limitInputPixels: 100_000_000})
    .rotate()
    .flatten({background: "#f7f3ec"})
    .toColourspace("srgb")
    .resize({
      width: READER_MAX_DIMENSION,
      height: READER_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({quality: READER_WEBP_QUALITY, effort: 5, smartSubsample: true})
    .toBuffer();
