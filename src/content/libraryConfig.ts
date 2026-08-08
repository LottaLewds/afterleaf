import {readFileSync} from "node:fs";
import {readFile, readdir, stat} from "node:fs/promises";
import {extname, resolve} from "node:path";

export const LIBRARY_CONFIG_FILE_NAME = "afterleaf.library.json";

const PATH_PROPERTIES = [
  "mediaPaths",
  "tvChannelPaths",
  "posterPaths",
  "artFramePaths",
] as const;

type PathProperty = (typeof PATH_PROPERTIES)[number];

export type AfterleafLibraryConfig = Record<PathProperty, readonly string[]>;

const emptyLibraryConfig = (): AfterleafLibraryConfig => ({
  artFramePaths: [],
  mediaPaths: [],
  posterPaths: [],
  tvChannelPaths: [],
});

const parseLibraryConfig = (
  value: unknown,
  configPath: string,
): AfterleafLibraryConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${configPath} must contain a JSON object`);
  const config = value as Record<string, unknown>;
  const knownProperties = new Set<string>(PATH_PROPERTIES);
  const unknownKeys = Object.keys(config).filter(
    (key) => !knownProperties.has(key),
  );
  if (unknownKeys.length > 0)
    throw new Error(
      `${configPath} contains unknown ${unknownKeys.length === 1 ? "property" : "properties"}: ${unknownKeys.join(", ")}`,
    );

  const parsed = emptyLibraryConfig();
  for (const property of PATH_PROPERTIES) {
    const paths = config[property];
    if (paths === undefined) continue;
    if (
      !Array.isArray(paths) ||
      !paths.every((path) => typeof path === "string" && path.trim().length > 0)
    )
      throw new Error(`${configPath} ${property} must be an array of paths`);
    parsed[property] = paths;
  }
  return parsed;
};

const parseLibraryConfigText = (text: string, configPath: string) => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseLibraryConfig(value, configPath);
};

const resolveLibraryConfig = (
  workingDirectory: string,
  config: AfterleafLibraryConfig,
): AfterleafLibraryConfig => ({
  artFramePaths: config.artFramePaths.map((path) =>
    resolve(workingDirectory, path),
  ),
  mediaPaths: config.mediaPaths.map((path) => resolve(workingDirectory, path)),
  posterPaths: config.posterPaths.map((path) =>
    resolve(workingDirectory, path),
  ),
  tvChannelPaths: config.tvChannelPaths.map((path) =>
    resolve(workingDirectory, path),
  ),
});

export const readAfterleafLibraryConfig = async (workingDirectory: string) => {
  const configPath = resolve(workingDirectory, LIBRARY_CONFIG_FILE_NAME);
  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyLibraryConfig();
    throw error;
  }
  return resolveLibraryConfig(
    workingDirectory,
    parseLibraryConfigText(text, configPath),
  );
};

export const readAfterleafLibraryConfigSync = (workingDirectory: string) => {
  const configPath = resolve(workingDirectory, LIBRARY_CONFIG_FILE_NAME);
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyLibraryConfig();
    throw error;
  }
  return resolveLibraryConfig(
    workingDirectory,
    parseLibraryConfigText(text, configPath),
  );
};

const LIBRARY_MEDIA_EXTENSIONS = new Set([
  ".avif",
  ".cbr",
  ".cbz",
  ".jpeg",
  ".jpg",
  ".png",
  ".rar",
  ".webp",
  ".zip",
]);

const directoryContainsLibraryMedia = async (
  directory: string,
): Promise<boolean> => {
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
      (entry.name === "publication.json" ||
        LIBRARY_MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    )
      return true;
    if (
      entry.isDirectory() &&
      (await directoryContainsLibraryMedia(resolve(directory, entry.name)))
    )
      return true;
  }
  return false;
};

export const unavailableLibraryPaths = async (paths: readonly string[]) => {
  const unavailable = await Promise.all(
    paths.map(async (path) => {
      try {
        const pathStat = await stat(path);
        if (pathStat.isFile()) return;
        if (
          pathStat.isDirectory() &&
          (await directoryContainsLibraryMedia(path))
        )
          return;
        return path;
      } catch {
        return path;
      }
    }),
  );
  return unavailable.filter((path) => path !== undefined);
};
