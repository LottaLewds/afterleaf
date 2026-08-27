import {randomUUID} from "node:crypto";
import {lstat, mkdir, readdir, realpath, rename, rm, writeFile} from "node:fs/promises";
import {basename, extname, relative, resolve, sep} from "node:path";
import sharp, {type Metadata} from "../media/sharpRuntime";

import {ART_FRAME_MAX_DIMENSION} from "./image";
import type {ArtFrameChannel, ArtFrameImage} from "./protocol";
import {renderCachedWebpImage, renderWebpImage, type WebpDerivativeCreator} from "../media/webp";

export type ArtFrameMediaUrlBuilder = (imageId: string) => string;
export type ArtFrameDerivativeCreator = WebpDerivativeCreator;

export type DiscoveredArtFrameImage = ArtFrameImage & {
  filePath: string;
};

export type DiscoveredArtFrameChannel = Omit<ArtFrameChannel, "images"> & {
  images: readonly DiscoveredArtFrameImage[];
};

type ArtFrameMetadataCacheEntry = {
  aspectRatio?: number;
  modifiedAt: number;
  size: number;
};

const metadataCache = new Map<string, ArtFrameMetadataCacheEntry>();

const compareNames = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const isSafeChannelId = (value: string) => /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value);

const displayLabel = (value: string) =>
  basename(value, extname(value))
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

const metadataAspectRatio = (metadata: Metadata) => {
  if (!metadata.width || !metadata.height) return;
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5;
  return rotated ? metadata.height / metadata.width : metadata.width / metadata.height;
};

const discoverArtFrameChannelsIn = async (
  framesDirectory: string,
  mediaUrl: ArtFrameMediaUrlBuilder,
): Promise<readonly DiscoveredArtFrameChannel[]> => {
  const root = resolve(framesDirectory);
  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
  const channels = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink() && entry.isDirectory())
      .sort((left, right) => compareNames(left.name, right.name))
      .map(async (entry): Promise<DiscoveredArtFrameChannel | undefined> => {
        const channelDirectory = resolve(root, entry.name);
        let entries;
        try {
          entries = await readdir(channelDirectory, {
            withFileTypes: true,
          });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ENOENT" || code === "ENOTDIR") return;
          throw error;
        }
        const imageEntries = entries
          .filter(
            (imageEntry) => !imageEntry.name.startsWith(".") && !imageEntry.isSymbolicLink() && imageEntry.isFile(),
          )
          .sort((left, right) => compareNames(left.name, right.name));
        const images = await Promise.all(
          imageEntries.map(async (imageEntry): Promise<DiscoveredArtFrameImage | undefined> => {
            const filePath = resolve(channelDirectory, imageEntry.name);
            try {
              const file = await lstat(filePath);
              const cached = metadataCache.get(filePath);
              let aspectRatio =
                cached?.modifiedAt === file.mtimeMs && cached.size === file.size ? cached.aspectRatio : undefined;
              if (!cached || cached.modifiedAt !== file.mtimeMs || cached.size !== file.size) {
                const metadata = await sharp(filePath, {
                  limitInputPixels: 100_000_000,
                }).metadata();
                aspectRatio = metadataAspectRatio(metadata);
                metadataCache.set(filePath, {
                  ...(aspectRatio === undefined ? {} : {aspectRatio}),
                  modifiedAt: file.mtimeMs,
                  size: file.size,
                });
              }
              if (!aspectRatio || !Number.isFinite(aspectRatio)) return;
              const id = relative(root, filePath).split(sep).join("/");
              const label = displayLabel(imageEntry.name);
              if (!label) return;
              return {aspectRatio, filePath, id, label, url: mediaUrl(id)};
            } catch {
              // Skip files that cannot be inspected as art frame images.
            }
          }),
        );
        const validImages = images.filter((image) => image !== undefined);
        const label = displayLabel(entry.name);
        if (!label || validImages.length === 0) return;
        return {id: entry.name, images: validImages, label};
      }),
  );
  return channels.filter((channel) => channel !== undefined);
};

export const discoverArtFrameChannels = async (
  framesDirectories: readonly string[],
  mediaUrl: ArtFrameMediaUrlBuilder,
): Promise<readonly DiscoveredArtFrameChannel[]> => {
  const channels = new Map<
    string,
    DiscoveredArtFrameChannel & {
      imageIds: Set<string>;
      images: DiscoveredArtFrameImage[];
    }
  >();
  for (const framesDirectory of framesDirectories) {
    const discovered = await discoverArtFrameChannelsIn(framesDirectory, mediaUrl);
    for (const discoveredChannel of discovered) {
      const existing = channels.get(discoveredChannel.id);
      const channel =
        existing ??
        ({
          id: discoveredChannel.id,
          imageIds: new Set<string>(),
          images: [],
          label: discoveredChannel.label,
        } satisfies DiscoveredArtFrameChannel & {
          imageIds: Set<string>;
          images: DiscoveredArtFrameImage[];
        });
      for (const image of discoveredChannel.images) {
        if (channel.imageIds.has(image.id)) continue;
        channel.imageIds.add(image.id);
        channel.images.push(image);
      }
      if (!existing) channels.set(channel.id, channel);
    }
  }
  return [...channels.values()].map(({id, images, label}) => ({
    id,
    images,
    label,
  }));
};

export const resolveArtFrameImagePath = async (framesDirectories: readonly string[], imageId: string) => {
  for (const framesDirectory of framesDirectories) {
    const root = resolve(framesDirectory);
    const candidate = resolve(root, ...imageId.split("/"));
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

export const renderArtFrameImage = async (
  filePath: string,
  createDerivative: ArtFrameDerivativeCreator,
  cacheDirectory?: string,
) => {
  if (cacheDirectory)
    return renderCachedWebpImage(filePath, createDerivative, ART_FRAME_MAX_DIMENSION, cacheDirectory, "art-frame-v1");
  return renderWebpImage(filePath, createDerivative, ART_FRAME_MAX_DIMENSION);
};

export const importArtFrameImage = async (
  framesDirectory: string,
  channelId: string,
  source: Uint8Array,
  createDerivative: ArtFrameDerivativeCreator,
  mediaUrl: ArtFrameMediaUrlBuilder,
) => {
  if (!isSafeChannelId(channelId)) throw new Error("Art frame channel name is invalid");
  const derivative = await createDerivative(source);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "-").replace("Z", "");
  const imageName = `pasted-${timestamp}-${randomUUID().slice(0, 8)}.webp`;
  const id = `${channelId}/${imageName}`;
  const root = resolve(framesDirectory);
  const channelDirectory = resolve(root, channelId);
  await mkdir(channelDirectory, {recursive: true});
  const [realRoot, realChannelDirectory] = await Promise.all([realpath(root), realpath(channelDirectory)]);
  const channelRelativePath = relative(realRoot, realChannelDirectory);
  if (
    channelRelativePath.length === 0 ||
    channelRelativePath.startsWith("..") ||
    resolve(realRoot, channelRelativePath) !== realChannelDirectory
  )
    throw new Error("Art frame channel path escapes the content directory");
  const destination = resolve(realChannelDirectory, imageName);
  const staging = `${destination}.staging-${process.pid}`;
  try {
    await writeFile(staging, derivative, {flag: "wx"});
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, {force: true}).catch(() => {});
    throw error;
  }
  const image = (await discoverArtFrameChannels([framesDirectory], mediaUrl))
    .flatMap((channel) => channel.images)
    .find((candidate) => candidate.id === id);
  if (!image) throw new Error("Converted art frame image could not be catalogued");
  return {derivative, image};
};
