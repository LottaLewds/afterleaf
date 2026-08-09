import {mkdir, readdir, rename, rm} from "node:fs/promises";
import {resolve} from "node:path";
import type {Dirent} from "node:fs";
import {assertSnapshotId} from "~/content/libraryUpdate/snapshotIndex";
import {scheduleSnapshotGarbageCollection} from "~/content/libraryUpdate/snapshotGarbageCollector";
import {replaceDirectory} from "~/content/replaceDirectory";
import type {ContentPackCatalog} from "~/content/schema";

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
const isAssetSetId = (value: string) => /^[a-z0-9][a-z0-9._-]*$/u.test(value);

export const promoteLibraryAssetSet = async (
  libraryDirectory: string,
  revisionDirectory: string,
  revisionId: string,
) => {
  const safeRevisionId = assertSnapshotId(revisionId);
  const assetPoolDirectory = resolve(libraryDirectory, "assets");
  const candidateAssets = resolve(revisionDirectory, "assets", safeRevisionId);
  const pooledAssets = resolve(assetPoolDirectory, safeRevisionId);
  await mkdir(assetPoolDirectory, {recursive: true});
  try {
    await replaceDirectory(candidateAssets, pooledAssets);
    await rm(resolve(revisionDirectory, "assets"), {
      force: true,
      recursive: true,
    }).catch(() => {});
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
};

export const discardLibraryAssetSet = (
  libraryDirectory: string,
  revisionId: string,
) =>
  rm(resolve(libraryDirectory, "assets", assertSnapshotId(revisionId)), {
    force: true,
    recursive: true,
  });

const catalogAssetPaths = (catalog: ContentPackCatalog) => [
  ...catalog.publications.flatMap((publication) => [
    publication.assets.front,
    publication.assets.frontDetail,
    publication.assets.back,
    ...(publication.assets.backDetail ? [publication.assets.backDetail] : []),
    publication.assets.spine,
    ...publication.assets.pages,
    ...publication.alternates.map(({page0}) => page0),
  ]),
  ...catalog.atlases.front.map(({path}) => path),
  ...catalog.atlases.back.map(({path}) => path),
  ...catalog.atlases.spine.map(({path}) => path),
];

export const referencedLibraryAssetSets = (catalog: ContentPackCatalog) =>
  new Set(
    catalogAssetPaths(catalog).flatMap((assetPath) => {
      const match = assetPath.match(/^assets\/([^/]+)\//u);
      if (!match?.[1]) return [];
      return [assertSnapshotId(match[1])];
    }),
  );

export const retireUnreferencedLibraryAssetSets = async (
  libraryDirectory: string,
  catalog: ContentPackCatalog,
  scheduleGarbageCollection: (
    directory: string,
  ) => void = scheduleSnapshotGarbageCollection,
) => {
  const assetPoolDirectory = resolve(libraryDirectory, "assets");
  const garbageDirectory = resolve(libraryDirectory, "asset-garbage");
  const referencedAssetSets = referencedLibraryAssetSets(catalog);
  let entries: Dirent[];
  try {
    entries = await readdir(assetPoolDirectory, {withFileTypes: true});
  } catch (error) {
    if (!isMissing(error)) throw error;
    return [];
  }
  await mkdir(garbageDirectory, {recursive: true});
  const retiredAssetSets = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !referencedAssetSets.has(entry.name) &&
        isAssetSetId(entry.name),
    )
    .map(({name}) => name);
  const results = await Promise.allSettled(
    retiredAssetSets.map((assetSetId) =>
      rename(
        resolve(assetPoolDirectory, assetSetId),
        resolve(garbageDirectory, assetSetId),
      ),
    ),
  );
  const retired = retiredAssetSets.filter(
    (_assetSetId, index) => results[index]?.status === "fulfilled",
  );
  scheduleGarbageCollection(garbageDirectory);
  return retired;
};
