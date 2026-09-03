import {appendFile, readdir, readFile, rm, stat} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {ARCHIVE_SOURCE_PROVIDER, importContentArchives} from "~/content/archive";
import {isContentArchivePath} from "~/content/archiveReader";
import {LIBRARY_CONFIG_FILE_NAME, readAfterleafLibraryConfig, unavailableLibraryPaths} from "~/content/libraryConfig";
import {
  comicsDirectory,
  libraryRootRegistryPath,
  mangaDirectory,
  preparedCatalogDirectory,
  scanFailuresLogPath,
} from "~/content/dataRoot";
import {prepareLocalCatalog, type ContentPrepareDiagnostic} from "~/content/prepare";
import {createIgnoreDirectoryCache, isAbsolutePathIgnoredByRoot} from "~/content/libraryIgnore";
import {parseLocalPublicationDocument} from "~/content/validation";

export {LIBRARY_CONFIG_FILE_NAME};

interface ConfiguredMediaRoot {
  path: string;
  readingDirection?: "ltr" | "rtl";
}

interface ConfiguredMediaPath extends ConfiguredMediaRoot {
  optional: boolean;
  protectsExistingLibrary: boolean;
}

export interface LocalMediaImportResult {
  archivePreparedCount: number;
  archiveRemovedCount: number;
  catalogDirectories: string[];
  imageFolderPreparedCount: number;
  mediaPaths: string[];
}

export interface LocalMediaImportOptions {
  repair?: boolean;
}

export const configuredLibraryMediaPaths = async (
  workingDirectory: string,
): Promise<readonly ConfiguredMediaRoot[]> => {
  const config = await readAfterleafLibraryConfig(workingDirectory);
  return [
    ...config.comicPaths.map((path) => ({
      path,
      readingDirection: "ltr" as const,
    })),
    ...config.mangaPaths.map((path) => ({
      path,
      readingDirection: "rtl" as const,
    })),
    ...(config.mediaPaths?.map((path) => ({path})) ?? []),
  ];
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
    if (!existing) {
      unique.set(mediaPath.path, mediaPath);
      continue;
    }
    const readingDirection = existing.readingDirection ?? mediaPath.readingDirection;
    unique.set(mediaPath.path, {
      optional: existing.optional && mediaPath.optional,
      path: mediaPath.path,
      protectsExistingLibrary: existing.protectsExistingLibrary || mediaPath.protectsExistingLibrary,
      ...(readingDirection === undefined ? {} : {readingDirection}),
    });
  }
  return [...unique.values()];
};

const pathIsWithin = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
};

const pruneNestedMediaPaths = (paths: readonly ConfiguredMediaPath[]) => {
  for (const path of paths) {
    const conflict = paths.find(
      (candidate) =>
        candidate !== path &&
        pathIsWithin(candidate.path, path.path) &&
        candidate.readingDirection !== undefined &&
        path.readingDirection !== undefined &&
        candidate.readingDirection !== path.readingDirection,
    );
    if (conflict)
      throw new Error(`Nested book paths cannot use conflicting reading directions: ${conflict.path} and ${path.path}`);
  }
  return paths.filter(
    (path) =>
      !paths.some(
        (candidate) =>
          candidate !== path &&
          candidate.readingDirection === path.readingDirection &&
          pathIsWithin(candidate.path, path.path),
      ),
  );
};

const pruneMissingArchives = async (outputDirectory: string, authoritativeDirectories: readonly string[]) => {
  let entries;
  try {
    entries = await readdir(outputDirectory, {withFileTypes: true});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const ignoreCache = createIgnoreDirectoryCache();

  let removedCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const publicationDirectory = resolve(outputDirectory, entry.name);
    let document;
    try {
      document = parseLocalPublicationDocument(
        JSON.parse(await readFile(resolve(publicationDirectory, "publication.json"), "utf8")) as unknown,
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
    const authoritativeRoot = authoritativeDirectories.find((directory) => pathIsWithin(directory, sourcePath));
    if (!authoritativeRoot) continue;
    try {
      await stat(sourcePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await rm(publicationDirectory, {force: true, recursive: true});
      removedCount += 1;
      continue;
    }
    if (await isAbsolutePathIgnoredByRoot(authoritativeRoot, sourcePath, false, ignoreCache)) {
      await rm(publicationDirectory, {force: true, recursive: true});
      removedCount += 1;
    }
  }
  return removedCount;
};

export const importLocalMedia = async (
  workingDirectory: string,
  outputDirectory: string,
  cliMediaPaths: readonly string[] = [],
  options: LocalMediaImportOptions = {},
): Promise<LocalMediaImportResult> => {
  const configMediaPaths = await configuredLibraryMediaPaths(workingDirectory);
  const defaultArchiveDirectory = comicsDirectory(workingDirectory);
  const defaultMediaPaths = [
    defaultArchiveDirectory,
    mangaDirectory(workingDirectory),
    preparedCatalogDirectory(workingDirectory),
  ];
  const defaultMediaPathSet = new Set(defaultMediaPaths);
  const configuredMediaPaths = uniqueMediaPaths([
    ...defaultMediaPaths.map((path) => ({
      optional: true,
      path,
      protectsExistingLibrary: false,
    })),
    ...configMediaPaths.map((entry) =>
      Object.assign(
        {
          optional: true,
          path: entry.path,
          protectsExistingLibrary: !defaultMediaPathSet.has(entry.path),
        },
        entry.readingDirection === undefined ? {} : {readingDirection: entry.readingDirection},
      ),
    ),
    ...cliMediaPaths.map((path) => ({
      optional: false,
      path: resolve(path),
      protectsExistingLibrary: false,
    })),
  ]);
  const mediaPaths = pruneNestedMediaPaths(configuredMediaPaths);
  const unavailableProtectedPaths = await unavailableLibraryPaths(
    configuredMediaPaths.filter((mediaPath) => mediaPath.protectsExistingLibrary).map((mediaPath) => mediaPath.path),
    libraryRootRegistryPath(workingDirectory),
  );
  if (unavailableProtectedPaths.length > 0) throw new UnavailableLibraryMediaPathsError(unavailableProtectedPaths);

  const catalogDirectories: string[] = [];
  const availableMedia: Array<{
    path: string;
    readingDirection?: "ltr" | "rtl";
    stat: Awaited<ReturnType<typeof stat>>;
  }> = [];
  let imageFolderPreparedCount = 0;

  for (const mediaPath of mediaPaths) {
    let mediaStat: Awaited<ReturnType<typeof stat>>;
    try {
      mediaStat = await stat(mediaPath.path);
    } catch (error) {
      if (mediaPath.optional && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error(
        `Could not access library media path ${mediaPath.path}: ${error instanceof Error ? error.message : String(error)}`,
        {cause: error},
      );
    }
    if (mediaStat.isFile() && !isContentArchivePath(mediaPath.path))
      throw new Error(`Library media file is not a supported CBZ, ZIP, CBR, or RAR archive: ${mediaPath.path}`);
    if (!mediaStat.isFile() && !mediaStat.isDirectory())
      throw new Error(`Library media path is not a file or folder: ${mediaPath.path}`);

    availableMedia.push({
      path: mediaPath.path,
      ...(mediaPath.readingDirection === undefined ? {} : {readingDirection: mediaPath.readingDirection}),
      stat: mediaStat,
    });
  }

  const folderDiagnostics: ContentPrepareDiagnostic[] = [];

  for (const mediaPath of availableMedia) {
    if (!mediaPath.stat.isDirectory()) continue;

    const folderReport = await prepareLocalCatalog({
      defaultLanguage: "english",
      force: false,
      refreshExisting: true,
      rootDirectory: mediaPath.path,
      tags: [],
      write: true,
      ...(mediaPath.readingDirection === undefined ? {} : {readingDirection: mediaPath.readingDirection}),
    });
    imageFolderPreparedCount += folderReport.preparedCount;
    folderDiagnostics.push(...folderReport.diagnostics);
    catalogDirectories.push(mediaPath.path);
  }

  const archiveReport = await importContentArchives({
    archivePaths: availableMedia.map(({path, readingDirection}) => ({
      path,
      ...(readingDirection === undefined ? {} : {readingDirection}),
    })),
    archivesDirectory: defaultArchiveDirectory,
    defaultLanguage: "english",
    force: options.repair === true,
    outputDirectory,
    tags: [],
    write: true,
  });

  const failureLogPath = scanFailuresLogPath(workingDirectory);
  const failures = [...folderDiagnostics, ...archiveReport.diagnostics].filter(
    (diagnostic) => diagnostic.code === "processing-failed",
  );
  if (failures.length > 0) {
    const lines = failures
      .map((diagnostic) => `[${new Date().toISOString()}] ${JSON.stringify(diagnostic)}`)
      .join("\n");
    await appendFile(failureLogPath, `${lines}\n`);
  }

  const archiveRemovedCount = await pruneMissingArchives(
    outputDirectory,
    availableMedia.filter(({stat: mediaStat}) => mediaStat.isDirectory()).map(({path}) => path),
  );

  try {
    if ((await stat(outputDirectory)).isDirectory()) catalogDirectories.push(resolve(outputDirectory));
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
