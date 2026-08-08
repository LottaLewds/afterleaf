import {afterEach, describe, expect, test} from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pruneSnapshotGarbage} from "~/content/libraryUpdate/snapshotGarbageCollector";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("snapshot garbage collection", () => {
  test("removes only snapshot directories from the dedicated garbage directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-snapshot-garbage-"));
    temporaryDirectories.push(root);
    const garbageDirectory = resolve(root, "snapshot-garbage");
    const outsideDirectory = resolve(root, "outside");
    await Promise.all([
      mkdir(resolve(garbageDirectory, "snapshot-1"), {recursive: true}),
      mkdir(resolve(garbageDirectory, ".keep"), {recursive: true}),
      mkdir(outsideDirectory),
    ]);
    await symlink(outsideDirectory, resolve(garbageDirectory, "snapshot-link"));

    pruneSnapshotGarbage(garbageDirectory);

    await expect(
      access(resolve(garbageDirectory, "snapshot-1")),
    ).rejects.toThrow();
    await access(resolve(garbageDirectory, ".keep"));
    await access(resolve(garbageDirectory, "snapshot-link"));
    await access(outsideDirectory);
  });

  test("rejects broad or unrelated cleanup roots", () => {
    expect(() => pruneSnapshotGarbage("/")).toThrow("dedicated directory");
  });

  test("cleans retired managed files without following links outside source garbage", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-source-garbage-"));
    temporaryDirectories.push(root);
    const garbageDirectory = resolve(root, "source-garbage");
    const outsideFile = resolve(root, "outside.cbz");
    await mkdir(resolve(garbageDirectory, "Retired Book"), {recursive: true});
    await Promise.all([
      writeFile(resolve(garbageDirectory, "book.cbz"), "archive"),
      writeFile(outsideFile, "outside"),
      symlink(outsideFile, resolve(garbageDirectory, "outside-link.cbz")),
    ]);

    pruneSnapshotGarbage(garbageDirectory);

    expect(await readdir(garbageDirectory)).toEqual([]);
    await access(outsideFile);
  });
});
