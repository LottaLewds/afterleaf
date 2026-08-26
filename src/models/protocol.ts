export const MODEL_MEDIA_ENDPOINT_PREFIX = "/api/media/models/";
const MODEL_MEDIA_COMPATIBILITY_VERSION = 1;

export type ModelAsset = {
  id: string;
  label: string;
  url: string;
};

export type ModelCatalog = {
  models: readonly ModelAsset[];
};

export type ModelMediaRequest =
  | {kind: "invalid"}
  | {id: string; kind: "media"}
  | {kind: "unscoped"};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSafeModelId = (value: string) => {
  const segments = value.split("/");
  return (
    value.length > 0 &&
    value.length <= 512 &&
    value.toLowerCase().endsWith(".glb") &&
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

const encodeModelId = (id: string) =>
  Array.from(new TextEncoder().encode(id), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

export const modelMediaUrl = (id: string) =>
  `${MODEL_MEDIA_ENDPOINT_PREFIX}${encodeModelId(id)}.glb?compat=${MODEL_MEDIA_COMPATIBILITY_VERSION}`;

export const parseModelMediaRequest = (
  requestUrl: string,
): ModelMediaRequest => {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://afterleaf.local").pathname;
  } catch {
    return {kind: "unscoped"};
  }
  if (!pathname.startsWith(MODEL_MEDIA_ENDPOINT_PREFIX))
    return {kind: "unscoped"};
  const token = pathname.slice(MODEL_MEDIA_ENDPOINT_PREFIX.length);
  if (!token.endsWith(".glb")) return {kind: "invalid"};
  const encodedId = token.slice(0, -".glb".length);
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
    return isSafeModelId(id) ? {id, kind: "media"} : {kind: "invalid"};
  } catch {
    return {kind: "invalid"};
  }
};

export const parseModelCatalog = (value: unknown): ModelCatalog => {
  if (!isRecord(value) || !Array.isArray(value.models))
    throw new Error("Model catalog must contain a models array");
  const ids = new Set<string>();
  const models = value.models.map((model, index) => {
    if (
      !isRecord(model) ||
      typeof model.id !== "string" ||
      !isSafeModelId(model.id) ||
      typeof model.label !== "string" ||
      model.label.trim().length === 0 ||
      model.label.length > 512 ||
      typeof model.url !== "string" ||
      model.url !== modelMediaUrl(model.id)
    )
      throw new Error(`Model ${index} is invalid`);
    if (ids.has(model.id)) throw new Error("Model catalog has duplicate IDs");
    ids.add(model.id);
    return {
      id: model.id,
      label: model.label,
      url: model.url,
    } satisfies ModelAsset;
  });
  return {models};
};
