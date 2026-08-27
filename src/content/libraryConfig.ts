import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {lstat, mkdir, readFile, readdir, stat, writeFile, rename, rm} from "node:fs/promises";
import {dirname, extname, resolve} from "node:path";

// Relative import: this module is also bundled into the Vite config
// middleware, whose loader cannot resolve the "~" alias at runtime.
import {findArcadeSystem, type ArcadeSystemId} from "../arcade/systems";
import {resolveDataRoot, romsDirectory} from "./dataRoot";

export const LIBRARY_CONFIG_FILE_NAME = "afterleaf.library.json";
export const LIBRARY_ROOT_MARKER_FILE_NAME = ".afterleaf-library-root.json";
export const LIBRARY_ROOT_REGISTRY_FILE_NAME = "library-roots.json";

const LIBRARY_ROOT_MARKER_SCHEMA_VERSION = 1;

interface LibraryRootMarker {
  rootId: string;
  schemaVersion: typeof LIBRARY_ROOT_MARKER_SCHEMA_VERSION;
}

interface LibraryRootRegistry {
  roots: Record<string, string>;
  schemaVersion: typeof LIBRARY_ROOT_MARKER_SCHEMA_VERSION;
}

const PATH_PROPERTIES = [
  "mangaPaths",
  "comicPaths",
  "mediaPaths",
  "tvChannelPaths",
  "posterPaths",
  "artFramePaths",
] as const;

export interface AfterleafLibraryConfig {
  mangaPaths: readonly string[];
  comicPaths: readonly string[];
  /** @deprecated Use mangaPaths or comicPaths so reading direction is explicit. */
  mediaPaths?: readonly string[];
  tvChannelPaths: readonly string[];
  posterPaths: readonly string[];
  artFramePaths: readonly string[];
  /**
   * Maps an emulated cabinet system id to extra folders holding its ROM
   * files, on top of the built-in `content/roms/<system id>` convention
   * folder. Configured through the Options menu.
   */
  romPaths: Partial<Record<ArcadeSystemId, readonly string[]>>;
}

/**
 * Absolute path of a system's built-in ROM folder. This convention folder is
 * scanned whenever it exists; `romPaths` holds additional locations.
 */
export const defaultRomFolderPath = (workingDirectory: string, systemId: ArcadeSystemId): string =>
  resolve(romsDirectory(workingDirectory), systemId);

/** Primary config location inside the unified data root. */
const libraryConfigPath = (workingDirectory: string) =>
  resolve(resolveDataRoot(workingDirectory), LIBRARY_CONFIG_FILE_NAME);

/** Pre-restructure location beside the app code; read as a fallback. */
const legacyLibraryConfigPath = (workingDirectory: string) => resolve(workingDirectory, LIBRARY_CONFIG_FILE_NAME);

export const LIBRARY_CONFIG_PROPERTIES = PATH_PROPERTIES;

const emptyLibraryConfig = (): AfterleafLibraryConfig => ({
  artFramePaths: [],
  comicPaths: [],
  mangaPaths: [],
  posterPaths: [],
  romPaths: {},
  tvChannelPaths: [],
});

const parseLibraryConfig = (value: unknown, configPath: string): AfterleafLibraryConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${configPath} must contain a JSON object`);
  const config = value as Record<string, unknown>;
  const knownProperties = new Set<string>([...PATH_PROPERTIES, "romPaths"]);
  const unknownKeys = Object.keys(config).filter((key) => !knownProperties.has(key));
  if (unknownKeys.length > 0)
    throw new Error(
      `${configPath} contains unknown ${unknownKeys.length === 1 ? "property" : "properties"}: ${unknownKeys.join(", ")}`,
    );

  const parsed = emptyLibraryConfig();
  for (const property of PATH_PROPERTIES) {
    const paths = config[property];
    if (paths === undefined) continue;
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string" && path.trim().length > 0))
      throw new Error(`${configPath} ${property} must be an array of paths`);
    if (property === "mediaPaths") parsed.mediaPaths = paths;
    else parsed[property] = paths;
  }

  // ROM folders map an emulated system id to extra folders on top of the
  // built-in content/roms/<system id> convention folder.
  const romPaths = config.romPaths;
  if (romPaths !== undefined) {
    if (!romPaths || typeof romPaths !== "object" || Array.isArray(romPaths))
      throw new Error(`${configPath} romPaths must map emulated system ids to folder lists`);
    for (const [systemId, folders] of Object.entries(romPaths)) {
      const system = findArcadeSystem(systemId);
      if (!system) throw new Error(`${configPath} romPaths contains the unknown system "${systemId}"`);
      if (!Array.isArray(folders) || !folders.every((path) => typeof path === "string" && path.trim().length > 0))
        throw new Error(`${configPath} romPaths.${systemId} must be an array of folder paths`);
      parsed.romPaths[system.id] = folders.map((folder) => folder.trim());
    }
  }
  return parsed;
};

const parseLibraryConfigText = (text: string, configPath: string) => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  return parseLibraryConfig(value, configPath);
};

const resolveLibraryConfig = (workingDirectory: string, config: AfterleafLibraryConfig): AfterleafLibraryConfig => {
  const comicPaths = config.comicPaths.map((path) => resolve(workingDirectory, path));
  const mangaPaths = config.mangaPaths.map((path) => resolve(workingDirectory, path));
  const comicPathSet = new Set(comicPaths);
  const conflictingPath = mangaPaths.find((path) => comicPathSet.has(path));
  if (conflictingPath) throw new Error(`${conflictingPath} cannot be configured as both a comic and manga path`);
  const romPaths: Partial<Record<ArcadeSystemId, readonly string[]>> = {};
  for (const [systemId, folders] of Object.entries(config.romPaths ?? {})) {
    if (folders === undefined) continue;
    romPaths[systemId as ArcadeSystemId] = folders.map((folder) => resolve(workingDirectory, folder));
  }
  return {
    artFramePaths: config.artFramePaths.map((path) => resolve(workingDirectory, path)),
    comicPaths,
    mangaPaths,
    ...(config.mediaPaths === undefined
      ? {}
      : {
          mediaPaths: config.mediaPaths.map((path) => resolve(workingDirectory, path)),
        }),
    posterPaths: config.posterPaths.map((path) => resolve(workingDirectory, path)),
    romPaths,
    tvChannelPaths: config.tvChannelPaths.map((path) => resolve(workingDirectory, path)),
  };
};

export const writeAfterleafLibraryConfig = async (workingDirectory: string, config: AfterleafLibraryConfig) => {
  const configPath = libraryConfigPath(workingDirectory);
  await mkdir(dirname(configPath), {recursive: true});
  const parsed = parseLibraryConfig(config, configPath);
  resolveLibraryConfig(workingDirectory, parsed);
  const temporaryPath = `${configPath}.staging-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  try {
    // Windows does not replace an existing directory entry with rename().
    await rm(configPath, {force: true});
    await rename(temporaryPath, configPath);
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }
  return parsed;
};

const readLibraryConfigText = async (workingDirectory: string) => {
  let text: string;
  try {
    text = await readFile(libraryConfigPath(workingDirectory), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Fall back to the pre-restructure location so an install keeps
    // working until the migration CLI relocates the file.
    try {
      text = await readFile(legacyLibraryConfigPath(workingDirectory), "utf8");
    } catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw legacyError;
    }
  }
  return text;
};

const readLibraryConfigTextSync = (workingDirectory: string) => {
  try {
    return readFileSync(libraryConfigPath(workingDirectory), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Fall back to the pre-restructure location so an install keeps
    // working until the migration CLI relocates the file.
    try {
      return readFileSync(legacyLibraryConfigPath(workingDirectory), "utf8");
    } catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw legacyError;
    }
  }
};

export const readAfterleafLibraryConfig = async (workingDirectory: string) => {
  const text = await readLibraryConfigText(workingDirectory);
  if (text === undefined) return emptyLibraryConfig();
  return resolveLibraryConfig(workingDirectory, parseLibraryConfigText(text, libraryConfigPath(workingDirectory)));
};

export const readAfterleafLibraryConfigSync = (workingDirectory: string) => {
  const text = readLibraryConfigTextSync(workingDirectory);
  if (text === undefined) return emptyLibraryConfig();
  return resolveLibraryConfig(workingDirectory, parseLibraryConfigText(text, libraryConfigPath(workingDirectory)));
};

const LIBRARY_MEDIA_EXTENSIONS = new Set([".avif", ".cbr", ".cbz", ".jpeg", ".jpg", ".png", ".rar", ".webp", ".zip"]);

const isMissing = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";

const isLibraryRootMarker = (value: unknown): value is LibraryRootMarker => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Partial<LibraryRootMarker>;
  return (
    marker.schemaVersion === LIBRARY_ROOT_MARKER_SCHEMA_VERSION &&
    typeof marker.rootId === "string" &&
    /^[0-9a-f-]{36}$/iu.test(marker.rootId)
  );
};

const readLibraryRootMarker = async (directory: string) => {
  const markerPath = resolve(directory, LIBRARY_ROOT_MARKER_FILE_NAME);
  try {
    const markerStat = await lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) return undefined;
    const parsed: unknown = JSON.parse(await readFile(markerPath, "utf8"));
    return isLibraryRootMarker(parsed) ? parsed : undefined;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return undefined;
    throw error;
  }
};

const createLibraryRootMarker = async (directory: string) => {
  const markerPath = resolve(directory, LIBRARY_ROOT_MARKER_FILE_NAME);
  const marker: LibraryRootMarker = {
    rootId: randomUUID(),
    schemaVersion: LIBRARY_ROOT_MARKER_SCHEMA_VERSION,
  };
  try {
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
      flag: "wx",
    });
    return marker;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    const existing = await readLibraryRootMarker(directory);
    if (!existing) throw new Error(`Library root marker is invalid: ${markerPath}`, {cause: error});
    return existing;
  }
};

const emptyLibraryRootRegistry = (): LibraryRootRegistry => ({
  roots: {},
  schemaVersion: LIBRARY_ROOT_MARKER_SCHEMA_VERSION,
});

const readLibraryRootRegistry = async (registryPath: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(registryPath, "utf8")) as unknown;
  } catch (error) {
    if (isMissing(error)) return emptyLibraryRootRegistry();
    throw new Error(
      `Could not read library root registry ${registryPath}: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`Library root registry is malformed: ${registryPath}`);
  const registry = parsed as Partial<LibraryRootRegistry>;
  if (
    registry.schemaVersion !== LIBRARY_ROOT_MARKER_SCHEMA_VERSION ||
    !registry.roots ||
    typeof registry.roots !== "object" ||
    Array.isArray(registry.roots) ||
    Object.entries(registry.roots).some(
      ([path, rootId]) => !path || typeof rootId !== "string" || !/^[0-9a-f-]{36}$/iu.test(rootId),
    )
  )
    throw new Error(`Library root registry is malformed: ${registryPath}`);
  return registry as LibraryRootRegistry;
};

const writeLibraryRootRegistry = async (registryPath: string, registry: LibraryRootRegistry) => {
  await mkdir(dirname(registryPath), {recursive: true});
  const temporaryPath = `${registryPath}.staging-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  try {
    // The registry is generated state. Removing this exact file enables an
    // atomic-style replacement on Windows without touching source media.
    await rm(registryPath, {force: true});
    await rename(temporaryPath, registryPath);
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }
};

export const reenrollLibraryRootPath = async (path: string, registryPath: string) => {
  const resolvedPath = resolve(path);
  const pathStat = await stat(resolvedPath);
  if (!pathStat.isDirectory()) throw new Error(`Library root must be a directory: ${resolvedPath}`);
  if (!(await libraryRootContainsMedia(resolvedPath)))
    throw new Error(`Library root cannot be re-enrolled while it contains no supported books: ${resolvedPath}`);
  const marker: LibraryRootMarker = {
    rootId: randomUUID(),
    schemaVersion: LIBRARY_ROOT_MARKER_SCHEMA_VERSION,
  };
  const markerPath = resolve(resolvedPath, LIBRARY_ROOT_MARKER_FILE_NAME);
  const temporaryMarkerPath = `${markerPath}.staging-${randomUUID()}`;
  await writeFile(temporaryMarkerPath, `${JSON.stringify(marker, null, 2)}\n`, {
    flag: "wx",
  });
  try {
    // This explicit recovery action replaces only Afterleaf's marker. It never
    // removes source media from the enrolled directory.
    await rm(markerPath, {force: true});
    await rename(temporaryMarkerPath, markerPath);
  } catch (error) {
    await rm(temporaryMarkerPath, {force: true}).catch(() => {});
    throw error;
  }
  const resolvedRegistryPath = resolve(registryPath);
  const registry = await readLibraryRootRegistry(resolvedRegistryPath);
  registry.roots[resolvedPath] = marker.rootId;
  await writeLibraryRootRegistry(resolvedRegistryPath, registry);
  return marker;
};

export const libraryRootContainsMedia = async (directory: string): Promise<boolean> => {
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    if (
      entry.isFile() &&
      (entry.name === "publication.json" || LIBRARY_MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    )
      return true;
    if (entry.isDirectory() && (await libraryRootContainsMedia(resolve(directory, entry.name)))) return true;
  }
  return false;
};

export const unavailableLibraryPaths = async (paths: readonly string[], registryPath?: string) => {
  if (!registryPath) {
    const unavailable = await Promise.all(
      paths.map(async (path) => {
        try {
          const pathStat = await stat(path);
          if (pathStat.isFile()) return;
          if (pathStat.isDirectory() && (await libraryRootContainsMedia(path))) return;
          return path;
        } catch {
          return path;
        }
      }),
    );
    return unavailable.filter((path) => path !== undefined);
  }

  const registry = await readLibraryRootRegistry(resolve(registryPath));
  const resolvedPaths = [...new Set(paths.map((path) => resolve(path)))];
  const availableRootIds = new Map<string, string>();
  const unavailable: string[] = [];
  let registryChanged = false;

  for (const path of resolvedPaths) {
    let pathStat: Awaited<ReturnType<typeof stat>>;
    try {
      pathStat = await stat(path);
    } catch {
      unavailable.push(path);
      continue;
    }
    if (pathStat.isFile()) continue;
    if (!pathStat.isDirectory()) {
      unavailable.push(path);
      continue;
    }

    const expectedRootId = registry.roots[path];
    let marker = await readLibraryRootMarker(path);
    if (expectedRootId) {
      if (marker?.rootId !== expectedRootId) {
        unavailable.push(path);
        continue;
      }
    } else {
      if (!marker && (await libraryRootContainsMedia(path))) marker = await createLibraryRootMarker(path);
      if (!marker) {
        unavailable.push(path);
        continue;
      }
      registry.roots[path] = marker.rootId;
      registryChanged = true;
    }

    const existingPath = availableRootIds.get(marker.rootId);
    if (existingPath && existingPath !== path) {
      unavailable.push(existingPath, path);
      continue;
    }
    availableRootIds.set(marker.rootId, path);
  }

  if (registryChanged) await writeLibraryRootRegistry(resolve(registryPath), registry);
  return [...new Set(unavailable)];
};
