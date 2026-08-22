import {parseWorldSave, type WorldSaveV1} from "~/game/worldSave";
import {
  MAX_WORLD_SAVE_BODY_BYTES,
  WORLD_SAVE_ENDPOINT,
  WORLD_SAVE_SERVER_INSTANCE_HEADER,
} from "~/game/worldSaveHttp";

export type WorldSaveFetch = typeof fetch;

export type LoadedServerWorldSave = {
  revision?: string;
  save?: WorldSaveV1;
  serverInstanceId?: string;
};

export class WorldSaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldSaveConflictError";
  }
}

export class WorldSaveServerChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldSaveServerChangedError";
  }
}

export const loadServerWorldSave = async (
  signal: AbortSignal,
  fetcher: WorldSaveFetch = fetch,
): Promise<LoadedServerWorldSave> => {
  const response = await fetcher(WORLD_SAVE_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const serverInstanceId = response.headers
    .get(WORLD_SAVE_SERVER_INSTANCE_HEADER)
    ?.trim();
  const revision = response.headers.get("ETag")?.trim();
  if (response.status === 404)
    return {
      ...(revision ? {revision} : {}),
      ...(serverInstanceId ? {serverInstanceId} : {}),
    };
  if (!response.ok)
    throw new Error(`World save download failed (${response.status})`);
  const save = parseWorldSave(await response.json());
  return {
    ...(revision ? {revision} : {}),
    save,
    ...(serverInstanceId ? {serverInstanceId} : {}),
  };
};

export const saveServerWorldSave = async (
  save: WorldSaveV1,
  serverInstanceId: string,
  revision: string,
  fetcher: WorldSaveFetch = fetch,
) => {
  const body = JSON.stringify(parseWorldSave(save));
  const bodyByteLength = new TextEncoder().encode(body).byteLength;
  if (bodyByteLength > MAX_WORLD_SAVE_BODY_BYTES)
    throw new Error("World save is too large to upload");
  const response = await fetcher(WORLD_SAVE_ENDPOINT, {
    body,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "If-Match": revision,
      [WORLD_SAVE_SERVER_INSTANCE_HEADER]: serverInstanceId,
    },
    keepalive: bodyByteLength <= 60 * 1_024,
    method: "PUT",
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 409)
      throw new WorldSaveServerChangedError(
        message || "World save server changed; reload before saving",
      );
    if (response.status === 412)
      throw new WorldSaveConflictError(
        message || "World save changed in another tab; reload before saving",
      );
    throw new Error(message || `World save upload failed (${response.status})`);
  }
  const nextRevision = response.headers.get("ETag")?.trim();
  if (!nextRevision)
    throw new Error("World save server did not return the new revision");
  return nextRevision;
};

let saveQueue = Promise.resolve();

/** Keeps saves ordered so an older request cannot overwrite a newer snapshot. */
export const queueServerWorldSave = (
  save: WorldSaveV1,
  serverInstanceId: string,
  revision: string,
) => {
  const queuedSave = saveQueue.then(() =>
    saveServerWorldSave(save, serverInstanceId, revision),
  );
  // Discard the resolved revision so the chain stays Promise<void>; failures
  // are swallowed here because each caller already handles its own rejection.
  saveQueue = queuedSave.then(
    () => undefined,
    () => undefined,
  );
  return queuedSave;
};
