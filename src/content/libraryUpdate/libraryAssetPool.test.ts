import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  discardLibraryAssetSet,
  promoteLibraryAssetSet,
  retireUnreferencedLibraryAssetSets,
} from "~/content/libraryUpdate/libraryAssetPool";
import type {ContentPackCatalog} from "~/content/schema";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("library asset pool", () => {
  test("atomically promotes only a revision's new assets into the shared pool", async () => {
    const libraryDirectory = await mkdtemp(
      join(tmpdir(), "afterleaf-asset-pool-"),
    );
    temporaryDirectories.push(libraryDirectory);
    const revisionDirectory = resolve(libraryDirectory, "revisions/next");
    const candidateFile = resolve(
      revisionDirectory,
      "assets/next/publications/book/front.webp",
    );
    await mkdir(resolve(candidateFile, ".."), {recursive: true});
    await writeFile(candidateFile, "front");

    await expect(
      promoteLibraryAssetSet(libraryDirectory, revisionDirectory, "next"),
    ).resolves.toBe(true);
    await access(
      resolve(libraryDirectory, "assets/next/publications/book/front.webp"),
    );
    await expect(
      access(resolve(revisionDirectory, "assets/next")),
    ).rejects.toThrow();

    await discardLibraryAssetSet(libraryDirectory, "next");
    await expect(
      access(resolve(libraryDirectory, "assets/next")),
    ).rejects.toThrow();
  });

  test("allows catalog-only revisions with no new asset set", async () => {
    const libraryDirectory = await mkdtemp(
      join(tmpdir(), "afterleaf-asset-pool-"),
    );
    temporaryDirectories.push(libraryDirectory);
    await expect(
      promoteLibraryAssetSet(
        libraryDirectory,
        resolve(libraryDirectory, "revisions/next"),
        "next",
      ),
    ).resolves.toBe(false);
  });

  test("retires only asset sets no longer referenced by the active catalog", async () => {
    const libraryDirectory = await mkdtemp(
      join(tmpdir(), "afterleaf-asset-pool-"),
    );
    temporaryDirectories.push(libraryDirectory);
    await Promise.all([
      mkdir(resolve(libraryDirectory, "assets/keep"), {recursive: true}),
      mkdir(resolve(libraryDirectory, "assets/retire"), {recursive: true}),
    ]);
    const catalog = {
      atlases: {back: [], front: [], spine: []},
      contentHash: "catalog-hash",
      id: "library",
      publications: [
        {
          alternates: [],
          assets: {
            back: "assets/keep/publications/book/back.webp",
            front: "assets/keep/publications/book/front.webp",
            frontDetail: "assets/keep/publications/book/front-detail.webp",
            pages: ["assets/keep/publications/book/pages/001.webp"],
            spine: "assets/keep/publications/book/spine.webp",
          },
          contentHash: "book-hash",
          id: "book",
          language: "english",
          originalTags: [],
          physical: {aspectRatio: 2 / 3},
          shelfAtlasIndex: 0,
          tags: [],
          title: "Book",
        },
      ],
      schemaVersion: 1,
      selection: {
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        seed: "test",
        source: "test",
        tags: [],
      },
    } satisfies ContentPackCatalog;

    await expect(
      retireUnreferencedLibraryAssetSets(libraryDirectory, catalog, () => {}),
    ).resolves.toEqual(["retire"]);
    await access(resolve(libraryDirectory, "assets/keep"));
    await access(resolve(libraryDirectory, "asset-garbage/retire"));
    await expect(
      access(resolve(libraryDirectory, "assets/retire")),
    ).rejects.toThrow();
  });
});
