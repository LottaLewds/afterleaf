import {mkdir, readdir, rename, rm} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import type {Dirent} from "node:fs";
import {scheduleSnapshotGarbageCollection} from "~/content/libraryUpdate/snapshotGarbageCollector";
import type {ContentPackCatalog} from "~/content/schema";

const isMissing = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";

const catalogAssetPaths = (catalog: ContentPackCatalog) => [
  ...catalog.publications.flatMap((publication) => [
    publication.assets.front,
    publication.assets.frontDetail,
    publication.assets.back,
    publication.assets.spine,
    ...publication.alternates.map(({page0}) => page0),
  ]),
  ...catalog.atlases.front.map(({path}) => path),
  ...catalog.atlases.back.map(({path}) => path),
  ...catalog.atlases.spine.map(({path}) => path),
];

export const referencedLibraryAssetPaths = (catalog: ContentPackCatalog) => new Set(catalogAssetPaths(catalog));

/**
 * Retires every pooled asset the given catalog does not reference. Pool
 * paths are content-keyed and stable across revisions, so retirement is a
 * simple set difference instead of per-revision bookkeeping. Retired files
 * are renamed into the garbage directory (preserving their relative path)
 * and deleted later by the detached garbage collector.
 */
export const retireUnreferencedLibraryAssets = async (
  libraryDirectory: string,
  catalog: ContentPackCatalog,
  scheduleGarbageCollection: (directory: string) => void = scheduleSnapshotGarbageCollection,
) => {
  const assetPoolDirectory = resolve(libraryDirectory, "assets");
  const garbageDirectory = resolve(libraryDirectory, "asset-garbage");
  const referencedAssets = referencedLibraryAssetPaths(catalog);
  let poolEntries: Dirent[];
  try {
    poolEntries = await readdir(assetPoolDirectory, {withFileTypes: true});
  } catch (error) {
    if (!isMissing(error)) throw error;
    return [];
  }
  await mkdir(garbageDirectory, {recursive: true});
  const retiredPaths: string[] = [];
  // Returns true when the directory ended up empty and can be pruned.
  const walk = async (entries: Dirent[], relativeDirectory: string): Promise<boolean> => {
    const results = await Promise.allSettled(
      entries.map(async (entry): Promise<boolean> => {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          let childEntries: Dirent[];
          try {
            childEntries = await readdir(resolve(assetPoolDirectory, relativePath), {
              withFileTypes: true,
            });
          } catch (error) {
            if (!isMissing(error)) throw error;
            return true;
          }
          if (!(await walk(childEntries, relativePath))) return false;
          // The subtree retired cleanly, so prune the now-empty directory.
          await rm(resolve(assetPoolDirectory, relativePath), {
            force: true,
            recursive: true,
          }).catch(() => {});
          return true;
        }
        if (!entry.isFile()) return false;
        const catalogPath = `assets/${relativePath}`;
        if (referencedAssets.has(catalogPath)) return false;
        const garbagePath = resolve(garbageDirectory, relativePath);
        await mkdir(dirname(garbagePath), {recursive: true});
        await rename(resolve(assetPoolDirectory, relativePath), garbagePath);
        retiredPaths.push(catalogPath);
        return true;
      }),
    );
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    return results.every((result) => result.status === "fulfilled" && result.value);
  };
  try {
    await walk(poolEntries, "");
  } catch {
    // A partially completed retirement is safe: referenced assets are
    // never touched, so only extra garbage can result. The next
    // successful activation retries.
  }
  if (retiredPaths.length > 0) scheduleGarbageCollection(garbageDirectory);
  return retiredPaths.toSorted();
};
