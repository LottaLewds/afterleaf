import {readdir, readFile, rm, stat} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {
  ARCHIVE_SOURCE_PROVIDER,
  importContentArchives,
} from "~/content/archive";
import {isContentArchivePath} from "~/content/archiveReader";
import {
  LIBRARY_CONFIG_FILE_NAME,
  readAfterleafLibraryConfig,
  unavailableLibraryPaths,
} from "~/content/libraryConfig";
import {prepareLocalCatalog} from "~/content/prepare";
import {parseLocalPublicationDocument} from "~/content/validation";

export {LIBRARY_CONFIG_FILE_NAME};

const DEFAULT_MEDIA_PATHS = [
  "content/books",
  "content-sources/catalog",
] as const;

interface ConfiguredMediaPath {
  optional: boolean;
  path: string;
  protectsExistingLibrary: boolean;
}

export interface LocalMediaImportResult {
  archivePreparedCount: number;
  archiveRemovedCount: number;
  catalogDirectories: string[];
  imageFolderPreparedCount: number;
  mediaPaths: string[];
}

export const configuredLibraryMediaPaths = async (workingDirectory: string) => {
  const config = await readAfterleafLibraryConfig(workingDirectory);
  return config.mediaPaths;
};

export class UnavailableLibraryMediaPathsError extends Error {
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super(
      `Library scan stopped because ${paths.length} configured book ${paths.length === 1 ? "path is" : "paths are"} unavailable. The current library was left unchanged.`,
    );
    this.name = "UnavailableLibraryMediaPathsError";
    this.paths = paths;
  }
}

const uniqueMediaPaths = (paths: readonly ConfiguredMediaPath[]) => {
  const unique = new Map<string, ConfiguredMediaPath>();
  for (const mediaPath of paths) {
    const existing = unique.get(mediaPath.path);
    unique.set(
      mediaPath.path,
      existing
        ? {
            optional: existing.optional && mediaPath.optional,
            path: mediaPath.path,
            protectsExistingLibrary:
              existing.protectsExistingLibrary ||
              mediaPath.protectsExistingLibrary,
          }
        : mediaPath,
    );
  }
  return [...unique.values()];
};

const pathIsWithin = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
};

const pruneMissingDefaultArchives = async (
  outputDirectory: string,
  defaultArchiveDirectory: string,
) => {
  let entries;
  try {
    entries = await readdir(outputDirectory, {withFileTypes: true});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  let removedCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const publicationDirectory = resolve(outputDirectory, entry.name);
    let document;
    try {
      document = parseLocalPublicationDocument(
        JSON.parse(
          await readFile(
            resolve(publicationDirectory, "publication.json"),
            "utf8",
          ),
        ) as unknown,
        "publication.json",
      );
    } catch {
      continue;
    }
    if (document.source?.provider !== ARCHIVE_SOURCE_PROVIDER) continue;
    let sourcePath: string;
    try {
      const sourceUrl = new URL(document.source.sourceUrl);
      if (sourceUrl.protocol !== "file:") continue;
      sourcePath = resolve(fileURLToPath(sourceUrl));
    } catch {
      continue;
    }
    if (!pathIsWithin(defaultArchiveDirectory, sourcePath)) continue;
    try {
      await stat(sourcePath);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rm(publicationDirectory, {force: true, recursive: true});
    removedCount += 1;
  }
  return removedCount;
};

export const importLocalMedia = async (
  workingDirectory: string,
  outputDirectory: string,
  cliMediaPaths: readonly string[] = [],
): Promise<LocalMediaImportResult> => {
  const configMediaPaths = await configuredLibraryMediaPaths(workingDirectory);
  const defaultMediaPaths = DEFAULT_MEDIA_PATHS.map((path) =>
    resolve(workingDirectory, path),
  );
  const defaultMediaPathSet = new Set(defaultMediaPaths);
  const defaultArchiveDirectory = defaultMediaPaths[0];
  const mediaPaths = uniqueMediaPaths([
    ...defaultMediaPaths.map((path) => ({
      optional: true,
      path,
      protectsExistingLibrary: false,
    })),
    ...configMediaPaths.map((path) => ({
      optional: true,
      path,
      protectsExistingLibrary: !defaultMediaPathSet.has(path),
    })),
    ...cliMediaPaths.map((path) => ({
      optional: false,
      path: resolve(path),
      protectsExistingLibrary: false,
    })),
  ]);
  const unavailableProtectedPaths = await unavailableLibraryPaths(
    mediaPaths
      .filter((mediaPath) => mediaPath.protectsExistingLibrary)
      .map((mediaPath) => mediaPath.path),
  );
  if (unavailableProtectedPaths.length > 0)
    throw new UnavailableLibraryMediaPathsError(unavailableProtectedPaths);

  const catalogDirectories: string[] = [];
  const availableMediaPaths: string[] = [];
  const availableMedia: Array<{
    path: string;
    stat: Awaited<ReturnType<typeof stat>>;
  }> = [];
  let imageFolderPreparedCount = 0;

  for (const mediaPath of mediaPaths) {
    let mediaStat: Awaited<ReturnType<typeof stat>>;
    try {
      mediaStat = await stat(mediaPath.path);
    } catch (error) {
      if (
        mediaPath.optional &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        continue;
      throw new Error(
        `Could not access library media path ${mediaPath.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (mediaStat.isFile() && !isContentArchivePath(mediaPath.path))
      throw new Error(
        `Library media file is not a supported CBZ, ZIP, CBR, or RAR archive: ${mediaPath.path}`,
      );
    if (!mediaStat.isFile() && !mediaStat.isDirectory())
      throw new Error(
        `Library media path is not a file or folder: ${mediaPath.path}`,
      );

    availableMediaPaths.push(mediaPath.path);
    availableMedia.push({path: mediaPath.path, stat: mediaStat});
  }

  for (const mediaPath of availableMedia) {
    if (!mediaPath.stat.isDirectory()) continue;

    const folderReport = await prepareLocalCatalog({
      defaultLanguage: "english",
      force: false,
      refreshExisting: true,
      rootDirectory: mediaPath.path,
      tags: [],
      write: true,
    });
    imageFolderPreparedCount += folderReport.preparedCount;
    catalogDirectories.push(mediaPath.path);
  }

  const archiveReport = await importContentArchives({
    archivePaths: availableMediaPaths,
    archivesDirectory: defaultArchiveDirectory,
    defaultLanguage: "english",
    force: false,
    outputDirectory,
    tags: [],
    write: true,
  });

  const archiveRemovedCount = await pruneMissingDefaultArchives(
    outputDirectory,
    defaultArchiveDirectory,
  );

  try {
    if ((await stat(outputDirectory)).isDirectory())
      catalogDirectories.push(resolve(outputDirectory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return {
    archivePreparedCount: archiveReport.preparedCount,
    archiveRemovedCount,
    catalogDirectories: [...new Set(catalogDirectories)],
    imageFolderPreparedCount,
    mediaPaths: mediaPaths.map((mediaPath) => mediaPath.path),
  };
};
