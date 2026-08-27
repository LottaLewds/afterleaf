import type {ImageDimensions} from "~/content/bookAspectRatio";
import sharp from "~/media/sharpRuntime";

export const readImageDimensions = async (bytes: Uint8Array): Promise<ImageDimensions | undefined> => {
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 100_000_000,
    }).metadata();
    if (!metadata.width || !metadata.height) return;
    return {
      height: metadata.height,
      ...(metadata.orientation === undefined ? {} : {orientation: metadata.orientation}),
      width: metadata.width,
    };
  } catch {
    // Invalid image data has no usable dimensions.
  }
};
