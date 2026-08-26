import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import type {LibrarySnapshotDescriptor} from "~/content/libraryUpdate/protocol";
import {
  activeSnapshotFromIndex,
  LibrarySnapshotIndexStore,
  parseLibrarySnapshotIndex,
} from "~/content/libraryUpdate/snapshotIndex";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
});

const snapshot = (snapshotId: string): LibrarySnapshotDescriptor => ({
  catalogContentHash: `hash-${snapshotId}`,
  catalogPath: `snapshots/${snapshotId}/catalog.json`,
  createdAt: "2026-07-29T12:00:00.000Z",
  directory: `snapshots/${snapshotId}`,
  packId: "afterleaf-library",
  publicationCount: 20,
  snapshotId,
});

describe("LibrarySnapshotIndexStore", () => {
  test("atomically advances the active snapshot and prunes old revisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-library-index-"));
    temporaryDirectories.push(root);
    let temporaryId = 0;
    const scheduledGarbageDirectories: string[] = [];
    const store = new LibrarySnapshotIndexStore(root, {
      createTemporaryId: () => String((temporaryId += 1)),
      scheduleGarbageCollection: (directory) => scheduledGarbageDirectories.push(directory),
    });
    await Promise.all(
      ["snapshot-1", "snapshot-2", "snapshot-3"].map((snapshotId) =>
        mkdir(resolve(root, "snapshots", snapshotId), {recursive: true}),
      ),
    );
    expect(await store.read()).toEqual({
      revision: 0,
      schemaVersion: 1,
      snapshots: [],
    });

    await store.activate(snapshot("snapshot-1"));
    const secondIndex = await store.activate(snapshot("snapshot-2"));

    expect(secondIndex.revision).toBe(2);
    expect(secondIndex.snapshots.map((entry) => entry.snapshotId)).toEqual(["snapshot-2"]);
    expect(activeSnapshotFromIndex(secondIndex)?.snapshotId).toBe("snapshot-2");
    expect(JSON.parse(await readFile(resolve(root, "index.json"), "utf8"))).toEqual(secondIndex);

    const thirdIndex = await store.activate(snapshot("snapshot-3"));
    expect(thirdIndex.snapshots.map((entry) => entry.snapshotId)).toEqual(["snapshot-3"]);
    await expect(access(resolve(root, "snapshots/snapshot-1"))).rejects.toThrow();
    await expect(access(resolve(root, "snapshots/snapshot-2"))).rejects.toThrow();
    expect(scheduledGarbageDirectories).toEqual([
      resolve(root, "snapshot-garbage"),
      resolve(root, "snapshot-garbage"),
      resolve(root, "snapshot-garbage"),
    ]);
    await access(resolve(root, "snapshot-garbage/snapshot-1"));
    await access(resolve(root, "snapshot-garbage/snapshot-2"));
  });

  test("rejects traversal and active pointers without a matching snapshot", () => {
    expect(() =>
      parseLibrarySnapshotIndex({
        activeSnapshotId: "missing",
        revision: 1,
        schemaVersion: 1,
        snapshots: [],
      }),
    ).toThrow("not present");
    expect(() =>
      parseLibrarySnapshotIndex({
        activeSnapshotId: "snapshot-1",
        revision: 1,
        schemaVersion: 1,
        snapshots: [
          {
            ...snapshot("snapshot-1"),
            directory: "../outside",
          },
        ],
      }),
    ).toThrow("stay inside");
  });

  test("accepts pooled catalog revisions while retaining legacy snapshots", () => {
    expect(
      parseLibrarySnapshotIndex({
        activeSnapshotId: "revision-2",
        revision: 2,
        schemaVersion: 1,
        snapshots: [
          {
            ...snapshot("revision-2"),
            catalogPath: "revisions/revision-2/catalog.json",
            directory: "revisions/revision-2",
            snapshotId: "revision-2",
          },
        ],
      }).snapshots[0]?.directory,
    ).toBe("revisions/revision-2");
  });
});
