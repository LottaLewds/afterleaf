import {describe, expect, test} from "bun:test";

import {WORLD_SAVE_SCHEMA_VERSION, type WorldSaveV1} from "~/game/worldSave";
import {
  loadServerWorldSave,
  saveServerWorldSave,
  WorldSaveServerChangedError,
  type WorldSaveFetch,
} from "~/game/worldSaveBrowserClient";
import {
  WORLD_SAVE_ENDPOINT,
  WORLD_SAVE_SERVER_INSTANCE_HEADER,
} from "~/game/worldSaveHttp";

const serverInstanceId = "server-instance-42";
const serverResponse = (body: BodyInit | null, init?: ResponseInit) => {
  const headers = new Headers(init?.headers);
  headers.set(WORLD_SAVE_SERVER_INSTANCE_HEADER, serverInstanceId);
  return new Response(body, {...init, headers});
};

const saveFixture = (): WorldSaveV1 => ({
  books: [],
  player: {
    position: {x: 1, y: 2, z: 3},
    quaternion: {w: 1, x: 0, y: 0, z: 0},
  },
  savedAt: "2026-08-06T12:00:00.000Z",
  schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
});

describe("browser world save client", () => {
  test("loads and validates the server save", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = async (input, init) => {
      expect(input).toBe(WORLD_SAVE_ENDPOINT);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
      });
      return serverResponse(JSON.stringify(save), {
        headers: {"Content-Type": "application/json"},
      });
    };
    await expect(
      loadServerWorldSave(new AbortController().signal, fetcher),
    ).resolves.toEqual({save, serverInstanceId});
  });

  test("treats a missing server file as no shared save", async () => {
    const fetcher: WorldSaveFetch = async () =>
      serverResponse(null, {status: 404});
    await expect(
      loadServerWorldSave(new AbortController().signal, fetcher),
    ).resolves.toEqual({serverInstanceId});
  });

  test("loads a legacy server save without granting write authority", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = async () => Response.json(save);

    await expect(
      loadServerWorldSave(new AbortController().signal, fetcher),
    ).resolves.toEqual({save});
  });

  test("uploads a validated save", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = async (input, init) => {
      expect(input).toBe(WORLD_SAVE_ENDPOINT);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          [WORLD_SAVE_SERVER_INSTANCE_HEADER]: serverInstanceId,
        },
        method: "PUT",
      });
      expect(JSON.parse(String(init?.body))).toEqual(save);
      return new Response(null, {status: 204});
    };
    await expect(
      saveServerWorldSave(save, serverInstanceId, fetcher),
    ).resolves.toBeUndefined();
  });

  test("rejects a save after the server instance changes", async () => {
    const fetcher: WorldSaveFetch = async () =>
      new Response("World save belongs to an earlier server instance", {
        status: 409,
      });

    await expect(
      saveServerWorldSave(saveFixture(), serverInstanceId, fetcher),
    ).rejects.toBeInstanceOf(WorldSaveServerChangedError);
  });
});
