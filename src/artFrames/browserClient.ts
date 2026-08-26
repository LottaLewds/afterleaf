import {
  ART_FRAME_CATALOG_ENDPOINT,
  ART_FRAME_IMPORT_ENDPOINT,
  MAX_ART_FRAME_IMPORT_BODY_BYTES,
  isSafeArtFrameChannelId,
  parseArtFrameCatalog,
  parseArtFrameImportResponse,
  type ArtFrameChannel,
  type ArtFrameImage,
} from "~/artFrames/protocol";

export const importArtFrameImage = async (
  image: Blob,
  channelId: string,
  signal: AbortSignal,
): Promise<ArtFrameImage> => {
  if (!isSafeArtFrameChannelId(channelId)) throw new Error("Art frame channel name is invalid");
  if (image.size <= 0 || image.size > MAX_ART_FRAME_IMPORT_BODY_BYTES)
    throw new Error("Pasted art frame image is empty or too large");
  const response = await fetch(ART_FRAME_IMPORT_ENDPOINT, {
    body: image,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": image.type || "application/octet-stream",
      "X-Afterleaf-Art-Frame-Channel": channelId,
    },
    method: "POST",
    signal,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Art frame import failed (${response.status})`);
  }
  return parseArtFrameImportResponse(await response.json(), channelId).image;
};

export const loadArtFrameChannels = async (signal: AbortSignal): Promise<readonly ArtFrameChannel[]> => {
  const response = await fetch(ART_FRAME_CATALOG_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`Art frame discovery failed (${response.status})`);
  return parseArtFrameCatalog(await response.json()).channels;
};
