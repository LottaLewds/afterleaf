import {parseWorldSave, type WorldSaveV1} from "~/game/worldSave";
import {
  MAX_WORLD_SAVE_BODY_BYTES,
  WORLD_SAVE_ENDPOINT,
} from "~/game/worldSaveHttp";

export type WorldSaveFetch = typeof fetch;

export const loadServerWorldSave = async (
  signal: AbortSignal,
  fetcher: WorldSaveFetch = fetch,
): Promise<WorldSaveV1 | undefined> => {
  const response = await fetcher(WORLD_SAVE_ENDPOINT, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (response.status === 404) return;
  if (!response.ok)
    throw new Error(`World save download failed (${response.status})`);
  return parseWorldSave(await response.json());
};

export const saveServerWorldSave = async (
  save: WorldSaveV1,
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
    headers: {"Content-Type": "application/json"},
    keepalive: bodyByteLength <= 60 * 1_024,
    method: "PUT",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `World save upload failed (${response.status})`);
  }
};

let saveQueue = Promise.resolve();

/** Keeps saves ordered so an older request cannot overwrite a newer snapshot. */
export const queueServerWorldSave = (save: WorldSaveV1) => {
  const queuedSave = saveQueue.then(() => saveServerWorldSave(save));
  saveQueue = queuedSave.catch(() => {});
  return queuedSave;
};
