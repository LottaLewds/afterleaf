import {readFile} from "node:fs/promises";
import {join} from "node:path";
import type {PortSection} from "./sections";

export interface ExportManifest {
  version: number;
  createdAt: string;
  sections: Record<
    PortSection,
    {included: boolean; fileCount: number; byteSize: number} | undefined
  >;
  library?: {
    schemaVersion?: number;
    publicationCount?: number;
    snapshotCount?: number;
  };
  worldSave?: {
    schemaVersion?: number;
    topLevelKeys: string[];
  };
  sourceRoots?: {
    originalPaths: string[];
  };
}

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILE_NAME = "manifest.json";

export const readManifest = async (
  packageDir: string,
): Promise<ExportManifest> => {
  const raw = await readFile(join(packageDir, MANIFEST_FILE_NAME), "utf8");
  return JSON.parse(raw) as ExportManifest;
};

interface LibraryIndex {
  schemaVersion?: number;
  snapshots?: Array<{publications?: unknown[]}>;
}

export const summarizeLibraryIndex = async (
  libraryDir: string,
): Promise<NonNullable<ExportManifest["library"]>> => {
  try {
    const raw = await readFile(join(libraryDir, "index.json"), "utf8");
    const index = JSON.parse(raw) as LibraryIndex;
    const snapshots = Array.isArray(index.snapshots) ? index.snapshots : [];
    const publicationCount = snapshots.reduce(
      (sum, snap) =>
        sum + (Array.isArray(snap.publications) ? snap.publications.length : 0),
      0,
    );
    return {
      schemaVersion: index.schemaVersion,
      snapshotCount: snapshots.length,
      publicationCount,
    };
  } catch {
    return {snapshotCount: 0, publicationCount: 0};
  }
};

export const summarizeWorldSave = async (
  worldSavePath: string,
): Promise<NonNullable<ExportManifest["worldSave"]>> => {
  try {
    const raw = await readFile(worldSavePath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      schemaVersion:
        typeof data.schemaVersion === "number" ? data.schemaVersion : undefined,
      topLevelKeys: Object.keys(data).sort(),
    };
  } catch {
    return {topLevelKeys: []};
  }
};
