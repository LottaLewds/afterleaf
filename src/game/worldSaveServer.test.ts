import {afterAll, beforeAll, describe, expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {WORLD_SAVE_SCHEMA_VERSION, type WorldSaveV1} from "~/game/worldSave";
import {loadWorldSaveFile, saveWorldSaveFile} from "~/game/worldSaveServer";

const saveFixture = (savedAt: string): WorldSaveV1 => ({
  books: [],
  player: {
    position: {x: 1, y: 2, z: 3},
    quaternion: {w: 1, x: 0, y: 0, z: 0},
  },
  savedAt,
  schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
});

describe("server world save persistence", () => {
  let directory = "";
  let filePath = "";

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "afterleaf-world-save-"));
    filePath = path.join(directory, "nested", "world-save.json");
  });

  afterAll(async () => {
    await rm(directory, {force: true, recursive: true});
  });

  test("returns no save when the disk file does not exist", async () => {
    expect(await loadWorldSaveFile(filePath)).toBeUndefined();
  });

  test("atomically replaces and validates the shared save", async () => {
    const first = saveFixture("2026-08-06T12:00:00.000Z");
    const second = saveFixture("2026-08-06T12:01:00.000Z");
    await saveWorldSaveFile(filePath, first);
    expect(await loadWorldSaveFile(filePath)).toEqual(first);

    await saveWorldSaveFile(filePath, second);
    expect(await loadWorldSaveFile(filePath)).toEqual(second);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(second);
  });

  test("rejects corrupt disk data", async () => {
    await writeFile(filePath, "not json");
    expect(loadWorldSaveFile(filePath)).rejects.toBeInstanceOf(Error);
  });
});
