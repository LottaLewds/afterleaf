import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  referencedLibraryAssetPaths,
  retireUnreferencedLibraryAssets,
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

const writePooledAsset = async (
  libraryDirectory: string,
  relativePath: string,
) => {
  const filePath = resolve(libraryDirectory, "assets", relativePath);
  await mkdir(resolve(filePath, ".."), {recursive: true});
  await writeFile(filePath, relativePath);
};

const catalogReferencing = (assetPaths: readonly string[]) => {
  const [front = "", frontDetail = "", back = "", spine = "", page0 = ""] =
    assetPaths;
  return {
    atlases: {back: [], front: [], spine: []},
    contentHash: "catalog-hash",
    id: "library",
    publications: [
      {
        alternates: [],
        assets: {
          back,
          front,
          frontDetail,
          pages: [page0],
          spine,
        },
        contentHash: "book-hash",
        id: "book",
        language: "english" as const,
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
      languages: ["english" as const],
      limit: 1,
      match: "all" as const,
      seed: "test",
      source: "test",
      tags: [],
    },
  } satisfies ContentPackCatalog;
};

describe("library asset pool", () => {
  test("collects every pooled path a catalog references", () => {
    const catalog = catalogReferencing([
      "assets/publications/book/front-a.webp",
      "assets/publications/book/front-detail-b.webp",
      "assets/publications/book/back-c.webp",
      "assets/publications/book/spine-d.webp",
      "assets/publications/book/pages/001-e.webp",
    ]);
    expect(referencedLibraryAssetPaths(catalog)).toEqual(
      new Set([
        "assets/publications/book/front-a.webp",
        "assets/publications/book/front-detail-b.webp",
        "assets/publications/book/back-c.webp",
        "assets/publications/book/spine-d.webp",
        "assets/publications/book/pages/001-e.webp",
      ]),
    );
  });

  test("retires only individual pooled files no longer referenced by the active catalog", async () => {
    const libraryDirectory = await mkdtemp(
      join(tmpdir(), "afterleaf-asset-pool-"),
    );
    temporaryDirectories.push(libraryDirectory);
    const kept = [
      "assets/publications/book/front-aaaa.webp",
      "assets/publications/book/front-detail-bbbb.webp",
      "assets/publications/book/back-cccc.webp",
      "assets/publications/book/spine-dddd.webp",
      "assets/publications/book/pages/001-eeee.webp",
    ];
    for (const assetPath of kept) {
      await writePooledAsset(
        libraryDirectory,
        assetPath.slice("assets/".length),
      );
    }
    // Superseded derivatives and legacy per-snapshot trees are unreferenced.
    await Promise.all([
      writePooledAsset(libraryDirectory, "publications/book/front-ffff.webp"),
      writePooledAsset(
        libraryDirectory,
        "publications/superseded/spine-gggg.webp",
      ),
      writePooledAsset(
        libraryDirectory,
        "20260801T000000-abcd1234/publications/old/front-hhhh.webp",
      ),
      writePooledAsset(libraryDirectory, "atlases/front-iijj.webp"),
    ]);
    const catalog = catalogReferencing(kept);

    await expect(
      retireUnreferencedLibraryAssets(libraryDirectory, catalog, () => {}),
    ).resolves.toEqual([
      "assets/20260801T000000-abcd1234/publications/old/front-hhhh.webp",
      "assets/atlases/front-iijj.webp",
      "assets/publications/book/front-ffff.webp",
      "assets/publications/superseded/spine-gggg.webp",
    ]);
    for (const assetPath of kept) {
      await access(resolve(libraryDirectory, assetPath));
    }
    for (const retiredPath of [
      "publications/book/front-ffff.webp",
      "publications/superseded/spine-gggg.webp",
      "20260801T000000-abcd1234/publications/old/front-hhhh.webp",
      "atlases/front-iijj.webp",
    ]) {
      await access(resolve(libraryDirectory, "asset-garbage", retiredPath));
    }
    await access(
      resolve(
        libraryDirectory,
        "asset-garbage/20260801T000000-abcd1234/publications/old/front-hhhh.webp",
      ),
    );
    // Emptied pool directories are pruned; referenced ones remain.
    await access(resolve(libraryDirectory, "assets/publications/book"));
    await expect(
      access(resolve(libraryDirectory, "assets/publications/superseded")),
    ).rejects.toThrow();
    await expect(
      access(resolve(libraryDirectory, "assets/atlases")),
    ).rejects.toThrow();
  });

  test("tolerates a missing pool directory", async () => {
    const libraryDirectory = await mkdtemp(
      join(tmpdir(), "afterleaf-asset-pool-"),
    );
    temporaryDirectories.push(libraryDirectory);
    const catalog = catalogReferencing([
      "assets/publications/book/front-aaaa.webp",
      "assets/publications/book/front-detail-bbbb.webp",
      "assets/publications/book/back-cccc.webp",
      "assets/publications/book/spine-dddd.webp",
      "assets/publications/book/pages/001-eeee.webp",
    ]);
    await expect(
      retireUnreferencedLibraryAssets(libraryDirectory, catalog, () => {}),
    ).resolves.toEqual([]);
  });
});
