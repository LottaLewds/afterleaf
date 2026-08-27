import {describe, expect, test} from "bun:test";

import {WORLD_SAVE_SCHEMA_VERSION, type WorldSaveV1} from "~/game/worldSave";
import {
  loadServerWorldSave,
  saveServerWorldSave,
  WorldSaveConflictError,
  WorldSaveServerChangedError,
  type WorldSaveFetch,
} from "~/game/worldSaveBrowserClient";
import {WORLD_SAVE_ENDPOINT, WORLD_SAVE_SERVER_INSTANCE_HEADER} from "~/game/worldSaveHttp";
import {stubFetch} from "~/test/fetchStub";

const serverInstanceId = "server-instance-42";
const worldSaveRevision = '"world-revision-42"';
const serverResponse = (body: BodyInit | null, init?: ResponseInit) => {
  const headers = new Headers(init?.headers);
  headers.set(WORLD_SAVE_SERVER_INSTANCE_HEADER, serverInstanceId);
  headers.set("ETag", worldSaveRevision);
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
    const fetcher: WorldSaveFetch = stubFetch(async (input, init) => {
      expect(input).toBe(WORLD_SAVE_ENDPOINT);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
      });
      return serverResponse(JSON.stringify(save), {
        headers: {"Content-Type": "application/json"},
      });
    });
    await expect(loadServerWorldSave(new AbortController().signal, fetcher)).resolves.toEqual({
      revision: worldSaveRevision,
      save,
      serverInstanceId,
    });
  });

  test("treats a missing server file as no shared save", async () => {
    const fetcher: WorldSaveFetch = stubFetch(async () => serverResponse(null, {status: 404}));
    await expect(loadServerWorldSave(new AbortController().signal, fetcher)).resolves.toEqual({
      revision: worldSaveRevision,
      serverInstanceId,
    });
  });

  test("loads a legacy server save without granting write authority", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = stubFetch(async () => Response.json(save));

    await expect(loadServerWorldSave(new AbortController().signal, fetcher)).resolves.toEqual({save});
  });

  test("uploads a validated save", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = stubFetch(async (input, init) => {
      expect(input).toBe(WORLD_SAVE_ENDPOINT);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "If-Match": worldSaveRevision,
          [WORLD_SAVE_SERVER_INSTANCE_HEADER]: serverInstanceId,
        },
        method: "PUT",
      });
      expect(JSON.parse(String(init?.body))).toEqual(save);
      return new Response(null, {
        headers: {ETag: '"world-revision-43"'},
        status: 204,
      });
    });
    await expect(saveServerWorldSave(save, serverInstanceId, worldSaveRevision, fetcher)).resolves.toBe(
      '"world-revision-43"',
    );
  });

  test("rejects a save after the server instance changes", async () => {
    const fetcher: WorldSaveFetch = stubFetch(
      async () =>
        new Response("World save belongs to an earlier server instance", {
          status: 409,
        }),
    );

    await expect(
      saveServerWorldSave(saveFixture(), serverInstanceId, worldSaveRevision, fetcher),
    ).rejects.toBeInstanceOf(WorldSaveServerChangedError);
  });

  test("rejects a save when another tab changed the world revision", async () => {
    const fetcher: WorldSaveFetch = stubFetch(
      async () =>
        new Response("World save changed after this tab loaded it", {
          status: 412,
        }),
    );

    await expect(
      saveServerWorldSave(saveFixture(), serverInstanceId, worldSaveRevision, fetcher),
    ).rejects.toBeInstanceOf(WorldSaveConflictError);
  });
});
