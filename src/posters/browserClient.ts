import {
  parsePosterCatalog,
  parsePosterImportResponse,
  MAX_POSTER_IMPORT_BODY_BYTES,
  POSTER_CATALOG_ENDPOINT,
  POSTER_IMPORT_ENDPOINT,
  type PosterAsset,
} from "~/posters/protocol";

export const loadPosters = async (signal: AbortSignal): Promise<readonly PosterAsset[]> => {
  const response = await fetch(POSTER_CATALOG_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`Poster discovery failed (${response.status})`);
  return parsePosterCatalog(await response.json()).posters;
};

export const importPoster = async (image: Blob, signal: AbortSignal): Promise<PosterAsset> => {
  if (image.size <= 0 || image.size > MAX_POSTER_IMPORT_BODY_BYTES)
    throw new Error("Pasted poster image is empty or too large");
  const response = await fetch(POSTER_IMPORT_ENDPOINT, {
    body: image,
    cache: "no-store",
    credentials: "same-origin",
    headers: {"Content-Type": image.type || "application/octet-stream"},
    method: "POST",
    signal,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Poster import failed (${response.status})`);
  }
  return parsePosterImportResponse(await response.json()).poster;
};
