export const POSTER_ROUTE_PREFIX = "/api/media/posters";
export const POSTER_CATALOG_ENDPOINT = `${POSTER_ROUTE_PREFIX}/catalog.json`;
export const POSTER_IMPORT_ENDPOINT = "/api/posters";
export const POSTER_MEDIA_ENDPOINT_PREFIX = `${POSTER_ROUTE_PREFIX}/`;
export const MAX_POSTER_IMPORT_BODY_BYTES = 64 * 1_024 * 1_024;

export type PosterAsset = {
  aspectRatio: number;
  hasAlpha: boolean;
  id: string;
  label: string;
  url: string;
};

export type PosterCatalog = {
  posters: readonly PosterAsset[];
};

export type PosterImportResponse = {
  poster: PosterAsset;
};

export type PosterMediaRequest =
  | {kind: "invalid"}
  | {id: string; kind: "media"}
  | {kind: "unscoped"};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSafePosterId = (value: string) => {
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

export const posterMediaUrl = (id: string) =>
  `${POSTER_MEDIA_ENDPOINT_PREFIX}${Array.from(
    new TextEncoder().encode(id),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}.webp`;

export const parsePosterMediaRequest = (
  requestUrl: string,
): PosterMediaRequest => {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://afterleaf.local").pathname;
  } catch {
    return {kind: "unscoped"};
  }
  if (!pathname.startsWith(POSTER_MEDIA_ENDPOINT_PREFIX))
    return {kind: "unscoped"};
  const token = pathname.slice(POSTER_MEDIA_ENDPOINT_PREFIX.length);
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
    return isSafePosterId(id) ? {id, kind: "media"} : {kind: "invalid"};
  } catch {
    return {kind: "invalid"};
  }
};

export const parsePosterCatalog = (value: unknown): PosterCatalog => {
  if (!isRecord(value) || !Array.isArray(value.posters))
    throw new Error("Poster catalog must contain a posters array");
  const ids = new Set<string>();
  const posters = value.posters.map((poster, index) => {
    if (
      !isRecord(poster) ||
      typeof poster.id !== "string" ||
      !isSafePosterId(poster.id) ||
      typeof poster.label !== "string" ||
      poster.label.trim().length === 0 ||
      poster.label.length > 512 ||
      typeof poster.url !== "string" ||
      poster.url !== posterMediaUrl(poster.id) ||
      typeof poster.aspectRatio !== "number" ||
      !Number.isFinite(poster.aspectRatio) ||
      poster.aspectRatio <= 0 ||
      poster.aspectRatio > 100 ||
      (poster.hasAlpha !== undefined && typeof poster.hasAlpha !== "boolean")
    )
      throw new Error(`Poster ${index} is invalid`);
    if (ids.has(poster.id)) throw new Error("Poster catalog has duplicate IDs");
    ids.add(poster.id);
    return {
      aspectRatio: poster.aspectRatio,
      hasAlpha: poster.hasAlpha ?? false,
      id: poster.id,
      label: poster.label,
      url: poster.url,
    } satisfies PosterAsset;
  });
  return {posters};
};

export const parsePosterImportResponse = (
  value: unknown,
): PosterImportResponse => {
  if (!isRecord(value)) throw new Error("Poster import response is invalid");
  const poster = parsePosterCatalog({posters: [value.poster]}).posters[0];
  if (!poster) throw new Error("Poster import response has no poster");
  return {poster};
};
