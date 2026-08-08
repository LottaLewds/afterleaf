import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {
  assertStablePublicationId,
  PublicationBlacklistStore,
} from "~/content/libraryUpdate/publicationBlacklist";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-blacklist-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("PublicationBlacklistStore", () => {
  test("strictly validates stable publication IDs", () => {
    expect(assertStablePublicationId("nhentai-12345")).toBe("nhentai-12345");
    for (const invalid of ["", "../escape", "UPPER", "space here", ".dot"])
      expect(() => assertStablePublicationId(invalid)).toThrow(
        "Publication ID must start",
      );
  });

  test("atomically adds sorted IDs while preserving existing entries", async () => {
    const root = await createTemporaryDirectory();
    const store = new PublicationBlacklistStore(resolve(root, "library"));
    expect(await store.read()).toEqual({
      publicationIds: [],
      schemaVersion: 1,
    });

    expect(await store.add("nhentai-20")).toEqual({
      added: true,
      blacklistedCount: 1,
      publicationId: "nhentai-20",
    });
    expect(await store.add("nhentai-10")).toEqual({
      added: true,
      blacklistedCount: 2,
      publicationId: "nhentai-10",
    });
    expect(await store.add("nhentai-20")).toEqual({
      added: false,
      blacklistedCount: 2,
      publicationId: "nhentai-20",
    });
    expect(await store.list()).toEqual(["nhentai-10", "nhentai-20"]);
    expect(JSON.parse(await readFile(store.path, "utf8")) as unknown).toEqual({
      publicationIds: ["nhentai-10", "nhentai-20"],
      schemaVersion: 1,
    });
  });

  test("serializes concurrent additions without losing entries", async () => {
    const root = await createTemporaryDirectory();
    const store = new PublicationBlacklistStore(resolve(root, "library"));
    await Promise.all([
      store.add("nhentai-1"),
      store.add("nhentai-2"),
      store.add("nhentai-3"),
    ]);
    expect(await store.list()).toEqual(["nhentai-1", "nhentai-2", "nhentai-3"]);
  });

  test("rejects unsafe roots and malformed persisted documents", async () => {
    expect(() => new PublicationBlacklistStore(resolve("/"))).toThrow(
      "cannot be a filesystem root",
    );
    const root = await createTemporaryDirectory();
    const store = new PublicationBlacklistStore(root);
    await writeFile(
      store.path,
      JSON.stringify({publicationIds: ["../escape"], schemaVersion: 1}),
    );
    await expect(store.list()).rejects.toThrow("Publication ID must start");
  });
});
