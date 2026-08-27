import {
  parseTvChannelManifest,
  parseTvVideoImportRequest,
  parseTvVideoImportResponse,
  TV_CHANNELS_ENDPOINT,
  TV_IMPORT_ENDPOINT,
  type TvChannel,
  type TvVideo,
} from "~/tv/protocol";

export const loadTvChannels = async (signal: AbortSignal): Promise<readonly TvChannel[]> => {
  const response = await fetch(TV_CHANNELS_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`TV channel discovery failed (${response.status})`);
  return parseTvChannelManifest(await response.json()).channels;
};

export const importTvVideo = async (url: string, channelId: string, signal: AbortSignal): Promise<TvVideo> => {
  const request = parseTvVideoImportRequest({channelId, url});
  const response = await fetch(TV_IMPORT_ENDPOINT, {
    body: JSON.stringify(request),
    cache: "no-store",
    credentials: "same-origin",
    headers: {"Content-Type": "application/json"},
    method: "POST",
    signal,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `TV video import failed (${response.status})`);
  }
  return parseTvVideoImportResponse(await response.json(), channelId).video;
};
