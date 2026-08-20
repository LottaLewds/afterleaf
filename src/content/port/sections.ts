import {readdir, readFile, stat} from "node:fs/promises";
import {join, relative} from "node:path";

export type PortSection =
  | "library"
  | "sources"
  | "worldSave"
  | "channels"
  | "posters"
  | "artFrames"
  | "models"
  | "books"
  | "libraryConfig";

export interface SectionDefinition {
  id: PortSection;
  label: string;
  description: string;
}

export const SECTIONS: SectionDefinition[] = [
  {
    id: "library",
    label: "Prepared library pack",
    description:
      "content-packs/library/ (index, assets, revisions). Required to read imported books.",
  },
  {
    id: "sources",
    label: "Original source archives",
    description:
      "Raw archives/videos referenced by library.json roots. Lets the importer preserve imported books across scans.",
  },
  {
    id: "worldSave",
    label: "World save",
    description: "content/world-save.json (placements, props, TV state).",
  },
  {
    id: "channels",
    label: "TV channels",
    description: "content/channels/",
  },
  {
    id: "posters",
    label: "Posters",
    description: "content/posters/",
  },
  {
    id: "artFrames",
    label: "Art frames",
    description: "content/art-frames/",
  },
  {
    id: "models",
    label: "Spawned models",
    description: "content/models/",
  },
  {
    id: "books",
    label: "Legacy books folder",
    description: "content/books/ (usually empty in current architecture).",
  },
  {
    id: "libraryConfig",
    label: "Library config",
    description:
      "afterleaf.library.json. Machine specific paths; useful as reference.",
  },
];

export interface LibraryConfig {
  artFramePaths?: string[];
  comicPaths?: string[];
  mangaPaths?: string[];
  posterPaths?: string[];
  tvChannelPaths?: string[];
  mediaPaths?: string[];
}

export const resolveSectionPath = (
  installDir: string,
  section: PortSection,
): string => {
  switch (section) {
    case "library":
      return join(installDir, "content-packs/library");
    case "sources":
      return join(installDir, "content-sources");
    case "worldSave":
      return join(installDir, "content/world-save.json");
    case "channels":
      return join(installDir, "content/channels");
    case "posters":
      return join(installDir, "content/posters");
    case "artFrames":
      return join(installDir, "content/art-frames");
    case "models":
      return join(installDir, "content/models");
    case "books":
      return join(installDir, "content/books");
    case "libraryConfig":
      return join(installDir, "afterleaf.library.json");
  }
};

export const getSourceRootsFromConfig = async (
  configPath: string,
): Promise<string[]> => {
  try {
    const raw = await readFile(configPath, "utf8");
    const cfg = JSON.parse(raw) as LibraryConfig;
    return [
      ...(cfg.artFramePaths ?? []),
      ...(cfg.comicPaths ?? []),
      ...(cfg.mangaPaths ?? []),
      ...(cfg.posterPaths ?? []),
      ...(cfg.tvChannelPaths ?? []),
      ...(cfg.mediaPaths ?? []),
    ];
  } catch {
    return [];
  }
};

export interface SectionStats {
  fileCount: number;
  byteSize: number;
}

export const estimateSectionSize = async (
  installDir: string,
  section: PortSection,
): Promise<SectionStats> => {
  if (section === "sources") {
    const roots = await getSourceRootsFromConfig(
      resolveSectionPath(installDir, "libraryConfig"),
    );
    let fileCount = 0;
    let byteSize = 0;
    for (const root of roots) {
      const stats = await walkDirectoryStats(root);
      fileCount += stats.fileCount;
      byteSize += stats.byteSize;
    }
    return {fileCount, byteSize};
  }
  return walkDirectoryStats(resolveSectionPath(installDir, section));
};

const walkDirectoryStats = async (root: string): Promise<SectionStats> => {
  let fileCount = 0;
  let byteSize = 0;
  let info;
  try {
    info = await stat(root);
  } catch {
    return {fileCount, byteSize};
  }
  if (!info.isDirectory()) return {fileCount: 1, byteSize: info.size};
  const entries = await readdir(root, {withFileTypes: true});
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDirectoryStats(path);
      fileCount += sub.fileCount;
      byteSize += sub.byteSize;
    } else if (entry.isFile()) {
      const fileInfo = await stat(path);
      fileCount += 1;
      byteSize += fileInfo.size;
    }
  }
  return {fileCount, byteSize};
};

export interface SectionFile {
  sourcePath: string;
  packagePath: string;
}

export const listFilesInSection = async (
  installDir: string,
  section: PortSection,
): Promise<SectionFile[]> => {
  if (section === "libraryConfig") {
    const sourcePath = resolveSectionPath(installDir, "libraryConfig");
    return [{sourcePath, packagePath: "afterleaf.library.json"}];
  }
  if (section === "worldSave") {
    const sourcePath = resolveSectionPath(installDir, "worldSave");
    return [{sourcePath, packagePath: "world-save.json"}];
  }
  if (section === "sources") {
    const roots = await getSourceRootsFromConfig(
      resolveSectionPath(installDir, "libraryConfig"),
    );
    const files: SectionFile[] = [];
    for (const root of roots) {
      const rootFiles = await walkFiles(root);
      const baseName = root.replace(/[:\\/]/gu, "_");
      for (const file of rootFiles) {
        files.push({
          sourcePath: file,
          packagePath: join("sources", baseName, relative(root, file)),
        });
      }
    }
    return files;
  }
  const sectionRoot = resolveSectionPath(installDir, section);
  const files = await walkFiles(sectionRoot);
  return files.map((file) => ({
    sourcePath: file,
    packagePath: join(section, relative(sectionRoot, file)),
  }));
};

const walkFiles = async (root: string): Promise<string[]> => {
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
      result.push(...(await walkFiles(path)));
    } else if (entry.isFile()) {
      result.push(path);
    }
  }
  return result;
};
