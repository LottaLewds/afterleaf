import {createHash, randomUUID} from "node:crypto";
import {mkdir, readFile, rename, stat, unlink, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import sharp from "./sharpRuntime";

export type WebpDerivativeCreator = (source: Uint8Array) => Promise<Buffer>;

export type WebpDerivativeOptions = {
  background?: string;
  maxDimension: number;
  quality: number;
};

const WEBP_REOPTIMIZATION_RATIO = 0.9;
const WEBP_ORIENTATION_NORMAL = 1;
const pendingCachedWebpRenders = new Map<string, Promise<Buffer>>();

export const createWebpDerivative = (source: Uint8Array, options: WebpDerivativeOptions) => {
  const image = sharp(source, {limitInputPixels: 100_000_000}).rotate();
  if (options.background) image.flatten({background: options.background});
  return image
    .toColourspace("srgb")
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({quality: options.quality, effort: 5, smartSubsample: true})
    .toBuffer();
};

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
    (metadata.orientation === undefined || metadata.orientation === WEBP_ORIENTATION_NORMAL);
  const derivative = await createDerivative(source);
  if (!sourceCanPassThrough) return derivative;
  return derivative.byteLength <= source.byteLength * WEBP_REOPTIMIZATION_RATIO ? derivative : source;
};

const cachedWebpPath = (
  filePath: string,
  sourceSize: number,
  sourceModifiedAt: number,
  cacheDirectory: string,
  cacheVersion: string,
) => {
  const key = createHash("sha256")
    .update(`${resolve(filePath)}\u0000${sourceSize}\u0000${Math.floor(sourceModifiedAt)}\u0000${cacheVersion}`)
    .digest("hex");
  return resolve(cacheDirectory, `webp-${cacheVersion}-${key}.webp`);
};

const persistCachedFile = async (filePath: string, content: string | Uint8Array) => {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, {flag: "wx"});
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    try {
      const existing = await stat(filePath);
      if (existing.isFile()) return;
    } catch {
      // Re-throw the original write failure when no cache exists.
    }
    throw error;
  }
};

export const renderCachedWebpImage = async (
  filePath: string,
  createDerivative: WebpDerivativeCreator,
  maxDimension: number,
  cacheDirectory: string,
  cacheVersion: string,
) => {
  const source = await stat(filePath);
  const cachePath = cachedWebpPath(filePath, source.size, source.mtimeMs, cacheDirectory, cacheVersion);
  const passThroughMarkerPath = `${cachePath}.source`;
  const cached = pendingCachedWebpRenders.get(cachePath);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const cachedFile = await stat(cachePath);
      if (cachedFile.isFile() && cachedFile.size > 0) {
        const cachedBytes = await readFile(cachePath);
        const sourceBytes = await readFile(filePath);
        if (!cachedBytes.equals(sourceBytes)) return cachedBytes;
        await unlink(cachePath).catch(() => {});
        await mkdir(cacheDirectory, {recursive: true});
        await persistCachedFile(passThroughMarkerPath, "source");
        return sourceBytes;
      }
    } catch {
      // Render and persist the derivative below when the cache is missing.
    }
    try {
      const passThroughMarker = await stat(passThroughMarkerPath);
      if (passThroughMarker.isFile()) return await readFile(filePath);
    } catch {
      // Render and persist the derivative below when the cache is missing.
    }

    const sourceBytes = await readFile(filePath);
    const derivative = await renderWebpImage(filePath, createDerivative, maxDimension);
    const outputPath = derivative.equals(sourceBytes) ? passThroughMarkerPath : cachePath;
    const output = derivative.equals(sourceBytes) ? "source" : derivative;
    try {
      await mkdir(cacheDirectory, {recursive: true});
      await persistCachedFile(outputPath, output);
    } catch {
      // Disk caching is opportunistic; serve the rendered result if it fails.
    }
    return derivative;
  })();
  pendingCachedWebpRenders.set(cachePath, pending);
  try {
    return await pending;
  } finally {
    if (pendingCachedWebpRenders.get(cachePath) === pending) pendingCachedWebpRenders.delete(cachePath);
  }
};
