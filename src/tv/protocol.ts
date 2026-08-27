import type {ActivePictureRect} from "./activePicture";

export const DEFAULT_TV_CHANNEL_ID = "afterleaf_tv";
export const TV_CHANNELS_ENDPOINT = "/api/tv/channels";
export const TV_IMPORT_ENDPOINT = "/api/tv/import";
export const TV_MEDIA_ENDPOINT_PREFIX = "/api/media/tv/channels/";

export type TvVideo = {
  activePicture?: ActivePictureRect;
  id: string;
  url: string;
};

export type TvChannel = {
  id: string;
  label: string;
  videos: readonly TvVideo[];
};

export type TvChannelManifest = {
  channels: readonly TvChannel[];
};

export type TvVideoImportRequest = {
  channelId: string;
  url: string;
};

export type TvVideoImportResponse = {
  video: TvVideo;
};

export type TvMediaRequest =
  | {kind: "invalid"}
  | {kind: "media"; channelId: string; videoId: string}
  | {kind: "unscoped"};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export const isSafeTvPathSegment = (value: string) =>
  value.length > 0 &&
  value !== "." &&
  value !== ".." &&
  !value.startsWith(".") &&
  !value.includes("/") &&
  !value.includes("\\");

export const isSafeTvChannelId = isSafeTvPathSegment;

export const tvChannelId = (label: string) =>
  label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replace(/-+$/gu, "");

export const tvVideoImportUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16_384) return;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    return url.href;
  } catch {
    // Invalid URLs are rejected by returning undefined.
  }
};

const parseActivePictureRect = (value: unknown) => {
  if (!isRecord(value)) return;
  const {height, width, x, y} = value;
  if (
    typeof height !== "number" ||
    typeof width !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    height <= 0 ||
    width <= 0 ||
    x < 0 ||
    y < 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return;
  return {height, width, x, y} satisfies ActivePictureRect;
};

const decodeSafePathSegment = (value: string) => {
  try {
    const decoded = decodeURIComponent(value);
    return isSafeTvPathSegment(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
};

export const tvMediaUrl = (channelId: string, videoId: string) =>
  `${TV_MEDIA_ENDPOINT_PREFIX}${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}`;

export const parseTvMediaRequest = (requestUrl: string): TvMediaRequest => {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://afterleaf.local").pathname;
  } catch {
    return {kind: "unscoped"};
  }
  if (!pathname.startsWith(TV_MEDIA_ENDPOINT_PREFIX)) return {kind: "unscoped"};
  const segments = pathname.slice(TV_MEDIA_ENDPOINT_PREFIX.length).split("/");
  if (segments.length !== 2) return {kind: "invalid"};
  const channelId = decodeSafePathSegment(segments[0] ?? "");
  const videoId = decodeSafePathSegment(segments[1] ?? "");
  if (!channelId || !videoId) return {kind: "invalid"};
  return {channelId, kind: "media", videoId};
};

export const parseTvChannelManifest = (value: unknown): TvChannelManifest => {
  if (!isRecord(value) || !Array.isArray(value.channels))
    throw new Error("TV channel manifest must contain a channels array");

  const channels = value.channels.map((channel, channelIndex) => {
    if (
      !isRecord(channel) ||
      typeof channel.id !== "string" ||
      !isSafeTvPathSegment(channel.id) ||
      typeof channel.label !== "string" ||
      channel.label.trim().length === 0 ||
      !Array.isArray(channel.videos)
    )
      throw new Error(`TV channel ${channelIndex} is invalid`);

    const videos = channel.videos.map((video, videoIndex) => {
      if (
        !isRecord(video) ||
        typeof video.id !== "string" ||
        !isSafeTvPathSegment(video.id) ||
        typeof video.url !== "string" ||
        !video.url.startsWith(TV_MEDIA_ENDPOINT_PREFIX)
      )
        throw new Error(`TV channel ${channel.id} video ${videoIndex} is invalid`);
      if (video.activePicture === undefined) return {id: video.id, url: video.url} satisfies TvVideo;
      const activePicture = parseActivePictureRect(video.activePicture);
      if (!activePicture) throw new Error(`TV channel ${channel.id} video ${videoIndex} active picture is invalid`);
      return {
        activePicture,
        id: video.id,
        url: video.url,
      } satisfies TvVideo;
    });

    return {
      id: channel.id,
      label: channel.label,
      videos,
    } satisfies TvChannel;
  });

  return {channels};
};

export const parseTvVideoImportRequest = (value: unknown): TvVideoImportRequest => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.channelId !== "string" ||
    !isSafeTvChannelId(value.channelId) ||
    typeof value.url !== "string"
  )
    throw new Error("TV video import request is invalid");
  const url = tvVideoImportUrl(value.url);
  if (!url) throw new Error("Paste a valid HTTP or HTTPS video URL");
  return {channelId: value.channelId, url};
};

export const parseTvVideoImportResponse = (value: unknown, channelId: string): TvVideoImportResponse => {
  if (!isRecord(value)) throw new Error("TV video import response is invalid");
  const video = parseTvChannelManifest({
    channels: [{id: channelId, label: channelId, videos: [value.video]}],
  }).channels[0]?.videos[0];
  if (!video) throw new Error("TV video import response has no video");
  return {video};
};
