export const ART_FRAME_CATALOG_ENDPOINT = "/art-frames/catalog.json";
export const ART_FRAME_IMPORT_ENDPOINT = "/api/art-frames";
export const ART_FRAME_MEDIA_ENDPOINT_PREFIX = "/art-frames/render-v3/";
export const MAX_ART_FRAME_IMPORT_BODY_BYTES = 64 * 1_024 * 1_024;

export type ArtFrameImage = {
  aspectRatio: number;
  id: string;
  label: string;
  url: string;
};

export type ArtFrameChannel = {
  id: string;
  images: readonly ArtFrameImage[];
  label: string;
};

export type ArtFrameCatalog = {
  channels: readonly ArtFrameChannel[];
};

export type ArtFrameImportResponse = {
  image: ArtFrameImage;
};

export type ArtFrameMediaRequest =
  | {kind: "invalid"}
  | {id: string; kind: "media"}
  | {kind: "unscoped"};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSafeId = (value: string) => {
  const segments = value.split("/");
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.includes("\\") &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.startsWith("."),
    )
  );
};

export const artFrameMediaUrl = (id: string) =>
  `${ART_FRAME_MEDIA_ENDPOINT_PREFIX}${Array.from(
    new TextEncoder().encode(id),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}.webp`;

export const parseArtFrameMediaRequest = (
  requestUrl: string,
): ArtFrameMediaRequest => {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://afterleaf.local").pathname;
  } catch {
    return {kind: "unscoped"};
  }
  if (!pathname.startsWith(ART_FRAME_MEDIA_ENDPOINT_PREFIX))
    return {kind: "unscoped"};
  const token = pathname.slice(ART_FRAME_MEDIA_ENDPOINT_PREFIX.length);
  if (!token.endsWith(".webp")) return {kind: "invalid"};
  const encodedId = token.slice(0, -".webp".length);
  if (
    encodedId.length === 0 ||
    encodedId.length % 2 !== 0 ||
    !/^[0-9a-f]+$/u.test(encodedId)
  )
    return {kind: "invalid"};
  try {
    const bytes = Uint8Array.from(encodedId.match(/.{2}/gu) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    );
    const id = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    return isSafeId(id) ? {id, kind: "media"} : {kind: "invalid"};
  } catch {
    return {kind: "invalid"};
  }
};

export const parseArtFrameCatalog = (value: unknown): ArtFrameCatalog => {
  if (!isRecord(value) || !Array.isArray(value.channels))
    throw new Error("Art frame catalog must contain a channels array");
  const channelIds = new Set<string>();
  const imageIds = new Set<string>();
  const channels = value.channels.map((channel, channelIndex) => {
    if (
      !isRecord(channel) ||
      typeof channel.id !== "string" ||
      !isSafeId(channel.id) ||
      channel.id.includes("/") ||
      typeof channel.label !== "string" ||
      channel.label.trim().length === 0 ||
      channel.label.length > 512 ||
      !Array.isArray(channel.images) ||
      channel.images.length === 0
    )
      throw new Error(`Art frame channel ${channelIndex} is invalid`);
    if (channelIds.has(channel.id))
      throw new Error("Art frame catalog has duplicate channel IDs");
    channelIds.add(channel.id);
    const channelId: string = channel.id;
    const images = channel.images.map((image, imageIndex) => {
      if (
        !isRecord(image) ||
        typeof image.id !== "string" ||
        !isSafeId(image.id) ||
        !image.id.startsWith(`${channelId}/`) ||
        image.id.slice(channelId.length + 1).includes("/") ||
        typeof image.label !== "string" ||
        image.label.trim().length === 0 ||
        image.label.length > 512 ||
        typeof image.url !== "string" ||
        image.url !== artFrameMediaUrl(image.id) ||
        typeof image.aspectRatio !== "number" ||
        !Number.isFinite(image.aspectRatio) ||
        image.aspectRatio <= 0 ||
        image.aspectRatio > 100
      )
        throw new Error(
          `Art frame image ${channelIndex}:${imageIndex} is invalid`,
        );
      if (imageIds.has(image.id))
        throw new Error("Art frame catalog has duplicate image IDs");
      imageIds.add(image.id);
      return {
        aspectRatio: image.aspectRatio,
        id: image.id,
        label: image.label,
        url: image.url,
      } satisfies ArtFrameImage;
    });
    return {
      id: channel.id,
      images,
      label: channel.label,
    } satisfies ArtFrameChannel;
  });
  return {channels};
};

export const parseArtFrameImportResponse = (
  value: unknown,
  channelId: string,
): ArtFrameImportResponse => {
  if (!isRecord(value)) throw new Error("Art frame import response is invalid");
  const channel = parseArtFrameCatalog({
    channels: [{id: channelId, images: [value.image], label: channelId}],
  }).channels[0];
  const image = channel?.images[0];
  if (!image) throw new Error("Art frame import response has no image");
  return {image};
};

export const isSafeArtFrameChannelId = (value: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value);

export const artFrameChannelId = (label: string) =>
  label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64)
    .replace(/-+$/gu, "");
