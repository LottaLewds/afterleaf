import {describe, expect, test} from "bun:test";

import {WORLD_SAVE_SCHEMA_VERSION, type WorldSaveV1} from "~/game/worldSave";
import {
  loadServerWorldSave,
  saveServerWorldSave,
  type WorldSaveFetch,
} from "~/game/worldSaveBrowserClient";
import {WORLD_SAVE_ENDPOINT} from "~/game/worldSaveHttp";

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
      return Response.json(save);
    };
    await expect(
      loadServerWorldSave(new AbortController().signal, fetcher),
    ).resolves.toEqual(save);
  });

  test("treats a missing server file as no shared save", async () => {
    const fetcher: WorldSaveFetch = async () =>
      new Response(null, {status: 404});
    await expect(
      loadServerWorldSave(new AbortController().signal, fetcher),
    ).resolves.toBeUndefined();
  });

  test("uploads a validated save", async () => {
    const save = saveFixture();
    const fetcher: WorldSaveFetch = async (input, init) => {
      expect(input).toBe(WORLD_SAVE_ENDPOINT);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
        headers: {"Content-Type": "application/json"},
        method: "PUT",
      });
      expect(JSON.parse(String(init?.body))).toEqual(save);
      return new Response(null, {status: 204});
    };
    await expect(saveServerWorldSave(save, fetcher)).resolves.toBeUndefined();
  });
});
