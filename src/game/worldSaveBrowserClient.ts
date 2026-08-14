import {parseWorldSave, type WorldSaveV1} from "~/game/worldSave";
import {
  MAX_WORLD_SAVE_BODY_BYTES,
  WORLD_SAVE_ENDPOINT,
  WORLD_SAVE_SERVER_INSTANCE_HEADER,
} from "~/game/worldSaveHttp";

export type WorldSaveFetch = typeof fetch;

export type LoadedServerWorldSave = {
  save?: WorldSaveV1;
  serverInstanceId?: string;
};

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
  if (response.status === 404)
    return serverInstanceId ? {serverInstanceId} : {};
  if (!response.ok)
    throw new Error(`World save download failed (${response.status})`);
  const save = parseWorldSave(await response.json());
  return serverInstanceId ? {save, serverInstanceId} : {save};
};

export const saveServerWorldSave = async (
  save: WorldSaveV1,
  serverInstanceId: string,
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
    throw new Error(message || `World save upload failed (${response.status})`);
  }
};

let saveQueue = Promise.resolve();

/** Keeps saves ordered so an older request cannot overwrite a newer snapshot. */
export const queueServerWorldSave = (
  save: WorldSaveV1,
  serverInstanceId: string,
) => {
  const queuedSave = saveQueue.then(() =>
    saveServerWorldSave(save, serverInstanceId),
  );
  saveQueue = queuedSave.catch(() => {});
  return queuedSave;
};
