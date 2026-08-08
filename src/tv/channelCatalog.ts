import {lstat, readdir} from "node:fs/promises";
import {extname, relative, resolve} from "node:path";

import type {ActivePictureRect} from "~/tv/activePicture";
import type {TvChannel, TvChannelManifest, TvVideo} from "~/tv/protocol";

export type TvMediaUrlBuilder = (channelId: string, videoId: string) => string;
export type TvVideoAnalyzer = (
  filePath: string,
  cacheKey: string,
) => Promise<ActivePictureRect | undefined>;

const VIDEO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const compareNames = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const channelLabel = (channelId: string) =>
  channelId
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

export const tvVideoContentType = (videoId: string) =>
  VIDEO_CONTENT_TYPES[extname(videoId).toLowerCase()];

export const discoverTvChannels = async (
  channelsDirectories: readonly string[],
  mediaUrl: TvMediaUrlBuilder,
  analyzeVideo?: TvVideoAnalyzer,
): Promise<TvChannelManifest> => {
  const channels = new Map<
    string,
    TvChannel & {videoIds: Set<string>; videos: TvVideo[]}
  >();
  for (const channelsDirectory of channelsDirectories) {
    let channelEntries;
    try {
      channelEntries = await readdir(channelsDirectory, {withFileTypes: true});
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw error;
    }

    for (const channelEntry of channelEntries.sort((left, right) =>
      compareNames(left.name, right.name),
    )) {
      if (!channelEntry.isDirectory() || channelEntry.name.startsWith("."))
        continue;
      let entries;
      try {
        entries = await readdir(resolve(channelsDirectory, channelEntry.name), {
          withFileTypes: true,
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        throw error;
      }
      const videoEntries = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            !entry.name.startsWith(".") &&
            tvVideoContentType(entry.name) !== undefined,
        )
        .sort((left, right) => compareNames(left.name, right.name));
      const existing = channels.get(channelEntry.name);
      const channel =
        existing ??
        ({
          id: channelEntry.name,
          label: channelLabel(channelEntry.name),
          videoIds: new Set<string>(),
          videos: [],
        } satisfies TvChannel & {videoIds: Set<string>; videos: TvVideo[]});
      for (const entry of videoEntries) {
        if (channel.videoIds.has(entry.name)) continue;
        const filePath = resolve(
          channelsDirectory,
          channelEntry.name,
          entry.name,
        );
        let activePicture: ActivePictureRect | undefined;
        try {
          activePicture = await analyzeVideo?.(filePath, filePath);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ENOENT" || code === "ENOTDIR") continue;
          throw error;
        }
        const video = {
          id: entry.name,
          url: mediaUrl(channelEntry.name, entry.name),
        };
        channel.videoIds.add(entry.name);
        channel.videos.push(activePicture ? {...video, activePicture} : video);
      }
      if (!existing && channel.videos.length > 0)
        channels.set(channel.id, channel);
    }
  }
  return {
    channels: [...channels.values()].map(({id, label, videos}) => ({
      id,
      label,
      videos,
    })),
  };
};

export const resolveTvVideoPath = async (
  channelsDirectories: readonly string[],
  channelId: string,
  videoId: string,
) => {
  if (!tvVideoContentType(videoId)) return;
  for (const channelsDirectory of channelsDirectories) {
    const root = resolve(channelsDirectory);
    const candidate = resolve(root, channelId, videoId);
    const candidateRelativePath = relative(root, candidate);
    if (
      candidateRelativePath.length === 0 ||
      candidateRelativePath.startsWith("..") ||
      resolve(root, candidateRelativePath) !== candidate
    )
      continue;
    try {
      const file = await lstat(candidate);
      if (!file.isFile() || file.isSymbolicLink() || file.size <= 0) continue;
      const channel = await lstat(resolve(root, channelId));
      if (!channel.isDirectory() || channel.isSymbolicLink()) continue;
      return {filePath: candidate, size: file.size};
    } catch {
      continue;
    }
  }
};
