import {randomUUID} from "node:crypto";
import type {Dirent} from "node:fs";
import {mkdir, readdir, readFile, rename, stat} from "node:fs/promises";
import {basename, isAbsolute, relative, resolve, sep} from "node:path";
import {preparedCatalogDirectory, providersDirectory} from "~/content/dataRoot";
import {fileURLToPath} from "node:url";
import {
  ARCHIVE_SOURCE_PROVIDER,
  isContentArchivePath,
} from "~/content/archiveReader";
import {configuredLibraryMediaPaths} from "~/content/libraryMedia";
import {assertStablePublicationId} from "~/content/libraryUpdate/publicationBlacklist";
import {scheduleSnapshotGarbageCollection} from "~/content/libraryUpdate/snapshotGarbageCollector";
import type {LocalPublicationDocument} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const MANIFEST_FILE_NAME = "publication.json";

const pathIsWithin = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
};

const readPublication = async (manifestPath: string) => {
  try {
    return parseLocalPublicationDocument(
      JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
      manifestPath,
    );
  } catch {
    return undefined;
  }
};

const findManagedPublications = async (
  directory: string,
  publicationId: string,
) => {
  const matches: Array<{
    directory: string;
    document: LocalPublicationDocument;
  }> = [];
  const visit = async (currentDirectory: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(currentDirectory, {withFileTypes: true});
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      )
        return;
      throw error;
    }
    const manifest = entries.find(
      (entry) => entry.isFile() && entry.name === MANIFEST_FILE_NAME,
    );
    if (manifest) {
      const document = await readPublication(
        resolve(currentDirectory, MANIFEST_FILE_NAME),
      );
      if (document?.id === publicationId) {
        matches.push({directory: currentDirectory, document});
        return;
      }
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        entry.name === "source-garbage"
      )
        continue;
      await visit(resolve(currentDirectory, entry.name));
    }
  };
  await visit(directory);
  return matches;
};

const managedFileSource = (
  workingDirectory: string,
  document: LocalPublicationDocument,
) => {
  if (document.source?.provider !== ARCHIVE_SOURCE_PROVIDER) return undefined;
  const sourceUrl = document.source?.sourceUrl;
  if (!sourceUrl) return undefined;
  let path: string;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "file:") return undefined;
    path = resolve(fileURLToPath(url));
  } catch {
    return undefined;
  }
  return pathIsWithin(workingDirectory, path) && isContentArchivePath(path)
    ? path
    : undefined;
};

export interface DiscardManagedPublicationSourcesResult {
  managedSourceCount: number;
  publicationId: string;
}

export const discardManagedPublicationSources = async (
  workingDirectory: string,
  publicationId: string,
  scheduleGarbageCollection: (
    directory: string,
  ) => void = scheduleSnapshotGarbageCollection,
): Promise<DiscardManagedPublicationSourcesResult> => {
  const stablePublicationId = assertStablePublicationId(publicationId);
  const resolvedWorkingDirectory = resolve(workingDirectory);
  const managedSourceDirectories = [
    providersDirectory(resolvedWorkingDirectory),
    preparedCatalogDirectory(resolvedWorkingDirectory),
  ];
  const configuredMediaPaths = await configuredLibraryMediaPaths(
    resolvedWorkingDirectory,
  );
  const managedMediaDirectories = [
    ...managedSourceDirectories,
    ...configuredMediaPaths
      .map(({path}) => path)
      .filter(
        (path) =>
          path !== resolvedWorkingDirectory &&
          pathIsWithin(resolvedWorkingDirectory, path),
      ),
  ];
  const matches = (
    await Promise.all(
      [...new Set(managedMediaDirectories)].map((directory) =>
        findManagedPublications(directory, stablePublicationId),
      ),
    )
  ).flat();
  const targets = new Set(matches.map(({directory}) => directory));
  for (const {document} of matches) {
    const sourcePath = managedFileSource(resolvedWorkingDirectory, document);
    if (!sourcePath) continue;
    try {
      if ((await stat(sourcePath)).isFile()) targets.add(sourcePath);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
  }
  const protectedDirectories = new Set([
    resolvedWorkingDirectory,
    ...managedSourceDirectories,
  ]);
  const topLevelTargets = [...targets].filter(
    (candidate) =>
      !protectedDirectories.has(candidate) &&
      ![...targets].some(
        (other) => other !== candidate && pathIsWithin(other, candidate),
      ),
  );
  if (topLevelTargets.length === 0)
    return {managedSourceCount: 0, publicationId: stablePublicationId};

  // Discarded managed sources are quarantined beside the provider caches
  // before the detached garbage collector deletes them.
  const garbageDirectory = resolve(
    providersDirectory(resolvedWorkingDirectory),
    "source-garbage",
  );
  await mkdir(garbageDirectory, {recursive: true});
  const moved: string[] = [];
  for (const target of topLevelTargets) {
    if (!pathIsWithin(resolvedWorkingDirectory, target)) continue;
    const garbagePath = resolve(
      garbageDirectory,
      `${randomUUID()}-${basename(target)}`,
    );
    try {
      await rename(target, garbagePath);
      moved.push(target);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        continue;
      throw error;
    }
  }
  scheduleGarbageCollection(garbageDirectory);
  return {
    managedSourceCount: moved.length,
    publicationId: stablePublicationId,
  };
};
