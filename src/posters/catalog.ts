import {randomUUID} from "node:crypto";
import {lstat, mkdir, readdir, realpath, rename, rm, writeFile} from "node:fs/promises";
import {basename, extname, relative, resolve, sep} from "node:path";
import sharp, {type Metadata} from "../media/sharpRuntime";

import {renderCachedWebpImage, renderWebpImage, type WebpDerivativeCreator} from "../media/webp";
import {POSTER_MAX_DIMENSION} from "./image";
import type {PosterAsset} from "./protocol";

export type PosterMediaUrlBuilder = (posterId: string) => string;
export type PosterDerivativeCreator = WebpDerivativeCreator;

export type DiscoveredPoster = PosterAsset & {
  filePath: string;
};

const compareNames = (left: string, right: string) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

type PosterMetadataCacheEntry = {
  aspectRatio?: number;
  hasAlpha: boolean;
  modifiedAt: number;
  size: number;
};

const posterMetadataCache = new Map<string, PosterMetadataCacheEntry>();

const posterLabel = (id: string) =>
  basename(id, extname(id))
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

const metadataAspectRatio = (metadata: Metadata) => {
  if (!metadata.width || !metadata.height) return;
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5;
  return rotated ? metadata.height / metadata.width : metadata.width / metadata.height;
};

const posterFilesIn = async (rootDirectory: string, directory = rootDirectory): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareNames(left.name, right.name))) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await posterFilesIn(rootDirectory, entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
};

export const discoverPosters = async (
  postersDirectories: readonly string[],
  mediaUrl: PosterMediaUrlBuilder,
): Promise<readonly DiscoveredPoster[]> => {
  const discovered: DiscoveredPoster[] = [];
  const posterIds = new Set<string>();
  for (const postersDirectory of postersDirectories) {
    const root = resolve(postersDirectory);
    const files = await posterFilesIn(root);
    const posters = await Promise.all(
      files.map(async (filePath): Promise<DiscoveredPoster | undefined> => {
        try {
          const file = await lstat(filePath);
          const cached = posterMetadataCache.get(filePath);
          let aspectRatio =
            cached?.modifiedAt === file.mtimeMs && cached.size === file.size ? cached.aspectRatio : undefined;
          let hasAlpha = cached?.modifiedAt === file.mtimeMs && cached.size === file.size ? cached.hasAlpha : false;
          if (!cached || cached.modifiedAt !== file.mtimeMs || cached.size !== file.size) {
            const metadata = await sharp(filePath, {
              limitInputPixels: 100_000_000,
            }).metadata();
            aspectRatio = metadataAspectRatio(metadata);
            hasAlpha = metadata.hasAlpha ?? false;
            posterMetadataCache.set(filePath, {
              ...(aspectRatio === undefined ? {} : {aspectRatio}),
              hasAlpha,
              modifiedAt: file.mtimeMs,
              size: file.size,
            });
          }
          if (!aspectRatio || !Number.isFinite(aspectRatio)) return;
          const id = relative(root, filePath).split(sep).join("/");
          const label = posterLabel(id);
          if (!label) return;
          return {
            aspectRatio,
            filePath,
            hasAlpha,
            id,
            label,
            url: mediaUrl(id),
          };
        } catch {
          // Skip files that cannot be inspected as poster images.
        }
      }),
    );
    for (const poster of posters) {
      if (!poster || posterIds.has(poster.id)) continue;
      posterIds.add(poster.id);
      discovered.push(poster);
    }
  }
  return discovered;
};

export const resolvePosterPath = async (postersDirectories: readonly string[], posterId: string) => {
  for (const postersDirectory of postersDirectories) {
    const root = resolve(postersDirectory);
    const candidate = resolve(root, ...posterId.split("/"));
    const candidateRelativePath = relative(root, candidate);
    if (
      candidateRelativePath.length === 0 ||
      candidateRelativePath.startsWith("..") ||
      resolve(root, candidateRelativePath) !== candidate
    )
      continue;
    try {
      const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
      const realCandidateRelativePath = relative(realRoot, realCandidate);
      if (
        realCandidateRelativePath.length === 0 ||
        realCandidateRelativePath.startsWith("..") ||
        resolve(realRoot, realCandidateRelativePath) !== realCandidate
      )
        continue;
      const file = await lstat(candidate);
      if (!file.isFile() || file.isSymbolicLink() || file.size <= 0) continue;
      return candidate;
    } catch {
      continue;
    }
  }
};

export const renderPoster = async (
  filePath: string,
  createDerivative: PosterDerivativeCreator,
  cacheDirectory?: string,
) => {
  if (cacheDirectory)
    return renderCachedWebpImage(filePath, createDerivative, POSTER_MAX_DIMENSION, cacheDirectory, "poster-v1");
  return renderWebpImage(filePath, createDerivative, POSTER_MAX_DIMENSION);
};

export const importPosterImage = async (
  postersDirectory: string,
  source: Uint8Array,
  createDerivative: PosterDerivativeCreator,
  mediaUrl: PosterMediaUrlBuilder,
) => {
  const derivative = await createDerivative(source);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "-").replace("Z", "");
  const id = `pasted-${timestamp}-${randomUUID().slice(0, 8)}.webp`;
  const destination = resolve(postersDirectory, id);
  const staging = `${destination}.staging-${process.pid}`;
  await mkdir(postersDirectory, {recursive: true});
  try {
    await writeFile(staging, derivative, {flag: "wx"});
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, {force: true}).catch(() => {});
    throw error;
  }
  const poster = (await discoverPosters([postersDirectory], mediaUrl)).find((candidate) => candidate.id === id);
  if (!poster) throw new Error("Converted poster could not be catalogued");
  return poster;
};
