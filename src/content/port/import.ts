import {
  cp,
  mkdir,
  readFile,
  rename,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import {dirname, join, relative} from "node:path";
import type {PortSection} from "./sections";
import {resolveSectionPath} from "./sections";
import {readManifest} from "./manifest";
import {mergeWorldSave} from "./worldSaveMerge";

export interface ImportResult {
  backups: string[];
  sections: PortSection[];
  worldSaveKeys?: Set<string>;
  sourceDestination?: string;
}

const makeBackupPath = (target: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return `${target}.${timestamp}.bak`;
};

const copyFile = async (source: string, dest: string): Promise<void> => {
  await mkdir(dirname(dest), {recursive: true}).catch(() => {});
  await cp(source, dest);
};

const listPackageFiles = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  let info;
  try {
    info = await stat(root);
  } catch {
    return result;
  }
  if (!info.isDirectory()) return [root];
  const entries = await readdir(root, {withFileTypes: true});
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const sub = await listPackageFiles(path);
      for (const s of sub) result.push(`${entry.name}/${s}`);
    } else if (entry.isFile()) {
      result.push(entry.name);
    }
  }
  return result;
};

const copyDirectoryContents = async (
  sourceDir: string,
  destDir: string,
): Promise<void> => {
  const files = await listPackageFiles(sourceDir);
  for (const file of files) {
    await copyFile(join(sourceDir, file), join(destDir, file));
  }
};

const replaceDirectory = async (
  target: string,
  source: string,
  backups: string[],
): Promise<void> => {
  const backup = makeBackupPath(target);
  backups.push(backup);
  await rename(target, backup);
  await mkdir(target, {recursive: true});
  await copyDirectoryContents(source, target);
};

type LibraryConfig = {
  artFramePaths?: string[];
  comicPaths?: string[];
  mangaPaths?: string[];
  posterPaths?: string[];
  tvChannelPaths?: string[];
  mediaPaths?: string[];
};

const LIBRARY_CONFIG_ROOT_KEYS: Array<keyof LibraryConfig> = [
  "artFramePaths",
  "comicPaths",
  "mangaPaths",
  "posterPaths",
  "tvChannelPaths",
  "mediaPaths",
];

const mergeLibraryConfig = (
  current: LibraryConfig,
  imported: LibraryConfig,
): LibraryConfig => {
  const merged: LibraryConfig = {};
  for (const key of LIBRARY_CONFIG_ROOT_KEYS) {
    const set = new Set([
      ...(current[key] ?? []),
      ...(imported[key] ?? []),
    ]);
    const values = [...set];
    if (values.length > 0) merged[key] = values;
  }
  return merged;
};

export const importLibrary = async (
  installDir: string,
  packageDir: string,
  sections: Set<PortSection>,
  worldSaveKeys: Set<string>,
): Promise<ImportResult> => {
  const manifest = await readManifest(packageDir);
  const result: ImportResult = {backups: [], sections: []};

  if (sections.has("library")) {
    const target = resolveSectionPath(installDir, "library");
    await replaceDirectory(target, join(packageDir, "library"), result.backups);
    result.sections.push("library");
  }

  for (const section of [
    "channels",
    "posters",
    "artFrames",
    "models",
    "books",
  ] as PortSection[]) {
    if (!sections.has(section)) continue;
    const target = resolveSectionPath(installDir, section);
    await replaceDirectory(target, join(packageDir, section), result.backups);
    result.sections.push(section);
  }

  if (sections.has("worldSave")) {
    const target = resolveSectionPath(installDir, "worldSave");
    const backup = makeBackupPath(target);
    result.backups.push(backup);
    await copyFile(target, backup);

    const currentData = JSON.parse(await readFile(target, "utf8")) as Record<
      string,
      unknown
    >;
    const packageData = JSON.parse(
      await readFile(join(packageDir, "world-save.json"), "utf8"),
    ) as Record<string, unknown>;
    const {data} = mergeWorldSave(packageData, currentData, worldSaveKeys, "union");
    await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    result.sections.push("worldSave");
    result.worldSaveKeys = worldSaveKeys;
  }

  if (sections.has("libraryConfig")) {
    const target = resolveSectionPath(installDir, "libraryConfig");
    const backup = makeBackupPath(target);
    result.backups.push(backup);
    await copyFile(target, backup);

    const currentConfig = JSON.parse(await readFile(target, "utf8")) as LibraryConfig;
    const importedConfig = JSON.parse(
      await readFile(join(packageDir, "afterleaf.library.json"), "utf8"),
    ) as LibraryConfig;
    const mergedConfig = mergeLibraryConfig(currentConfig, importedConfig);
    await writeFile(target, `${JSON.stringify(mergedConfig, null, 2)}\n`, "utf8");
    result.sections.push("libraryConfig");
  }

  if (sections.has("sources")) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/gu, "-")
      .slice(0, 19);
    const destRoot = join(
      installDir,
      "content-sources",
      `imported-${timestamp}`,
    );
    const sourceDir = join(packageDir, "sources");
    await mkdir(destRoot, {recursive: true});
    await copyDirectoryContents(sourceDir, destRoot);
    result.sourceDestination = destRoot;

    const configPath = resolveSectionPath(installDir, "libraryConfig");
    const configRaw = await readFile(configPath, "utf8");
    const config = JSON.parse(configRaw) as LibraryConfig;
    config.mediaPaths = config.mediaPaths ?? [];
    if (!config.mediaPaths.includes(destRoot)) config.mediaPaths.push(destRoot);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    result.sections.push("sources");
  } else if (manifest.sections.sources?.included && sections.has("library")) {
    console.warn(
      "Warning: the exported package contained source archives, but they were not imported. " +
        "Imported books remain readable, but future local scans may discard them if their sources are not found.",
    );
  }

  return result;
};
