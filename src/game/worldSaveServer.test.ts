import {afterAll, beforeAll, describe, expect, test} from "bun:test";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {WORLD_SAVE_SCHEMA_VERSION, type WorldSaveV1} from "~/game/worldSave";
import {
  loadWorldSaveFile,
  MISSING_WORLD_SAVE_REVISION,
  pruneWorldStateBackups,
  saveWorldSaveFile,
  saveWorldStateBackup,
  worldSaveRevision,
} from "~/game/worldSaveServer";

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
    expect(worldSaveRevision(undefined)).toBe(MISSING_WORLD_SAVE_REVISION);
  });

  test("atomically replaces and validates the shared save", async () => {
    const first = saveFixture("2026-08-06T12:00:00.000Z");
    const second = saveFixture("2026-08-06T12:01:00.000Z");
    await saveWorldSaveFile(filePath, first);
    expect(await loadWorldSaveFile(filePath)).toEqual(first);

    await saveWorldSaveFile(filePath, second);
    expect(await loadWorldSaveFile(filePath)).toEqual(second);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(second);
    expect(worldSaveRevision(first)).not.toBe(worldSaveRevision(second));
    expect(worldSaveRevision(second)).toBe(worldSaveRevision({...second}));
  });

  test("creates dated backups and prunes the oldest snapshots", async () => {
    const backupDirectory = path.join(directory, "backups");
    const save = saveFixture("2026-08-06T12:00:00.000Z");
    const dates = [
      new Date("2026-08-06T12:00:00.000Z"),
      new Date("2026-08-06T12:15:00.000Z"),
      new Date("2026-08-06T12:30:00.000Z"),
    ];
    for (const date of dates) await saveWorldStateBackup(backupDirectory, save, date);

    expect((await readdir(backupDirectory)).sort()).toEqual([
      "world-state.2026-08-06T12-00-00.000Z.json",
      "world-state.2026-08-06T12-15-00.000Z.json",
      "world-state.2026-08-06T12-30-00.000Z.json",
    ]);
    expect(await pruneWorldStateBackups(backupDirectory, 2)).toBe(1);
    const remaining = (await readdir(backupDirectory)).sort();
    expect(remaining).toEqual([
      "world-state.2026-08-06T12-15-00.000Z.json",
      "world-state.2026-08-06T12-30-00.000Z.json",
    ]);
    expect(await loadWorldSaveFile(path.resolve(backupDirectory, remaining[1] ?? ""))).toEqual(save);
  });

  test("rejects corrupt disk data", async () => {
    await writeFile(filePath, "not json");
    expect(loadWorldSaveFile(filePath)).rejects.toBeInstanceOf(Error);
  });
});
