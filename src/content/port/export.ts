import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import {createReadStream, createWriteStream} from "node:fs";
import {dirname, join} from "node:path";
import {pipeline} from "node:stream/promises";
import type {PortSection} from "./sections";
import {
  estimateSectionSize,
  getSourceRootsFromConfig,
  listFilesInSection,
  resolveSectionPath,
} from "./sections";
import {
  type ExportManifest,
  MANIFEST_FILE_NAME,
  MANIFEST_VERSION,
  summarizeLibraryIndex,
  summarizeWorldSave,
} from "./manifest";

export interface ExportProgress {
  section: PortSection;
  filePath: string;
  bytes: number;
  completedFiles: number;
  totalFiles: number;
}

export interface ExportResult {
  packageDir: string;
  manifest: ExportManifest;
}

const ensureDir = async (dir: string): Promise<void> => {
  await mkdir(dir, {recursive: true}).catch(() => {});
};

const exportWorldSave = async (
  installDir: string,
  packageDir: string,
  worldSaveKeys: Set<string> | undefined,
  onProgress?: (progress: ExportProgress) => void,
): Promise<{fileCount: number; byteSize: number}> => {
  const sourcePath = resolveSectionPath(installDir, "worldSave");
  const dest = join(packageDir, "world-save.json");
  await ensureDir(dirname(dest));

  let serialized: string;
  if (worldSaveKeys) {
    // Export filtré : on ne garde que les clés demandées.
    const fullData = JSON.parse(await readFile(sourcePath, "utf8")) as Record<
      string,
      unknown
    >;
    const filtered: Record<string, unknown> = {};
    for (const key of worldSaveKeys) {
      if (key in fullData) filtered[key] = fullData[key];
    }
    serialized = `${JSON.stringify(filtered, null, 2)}\n`;
    await writeFile(dest, serialized, "utf8");
  } else {
    // Pas de filtre demandé : on copie le fichier tel quel.
    await pipeline(createReadStream(sourcePath), createWriteStream(dest));
    serialized = await readFile(dest, "utf8");
  }

  const byteSize = Buffer.byteLength(serialized, "utf8");
  onProgress?.({
    section: "worldSave",
    filePath: sourcePath,
    bytes: byteSize,
    completedFiles: 1,
    totalFiles: 1,
  });

  return {fileCount: 1, byteSize};
};

export const exportLibrary = async (
  installDir: string,
  packageDir: string,
  sections: Set<PortSection>,
  worldSaveKeys?: Set<string>,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportResult> => {
  await ensureDir(packageDir);

  const manifest: ExportManifest = {
    version: MANIFEST_VERSION,
    createdAt: new Date().toISOString(),
    sections: {} as ExportManifest["sections"],
  };

  for (const section of sections) {
    if (section === "worldSave") {
      const {fileCount, byteSize} = await exportWorldSave(
        installDir,
        packageDir,
        worldSaveKeys,
        onProgress,
      );
      manifest.sections[section] = {
        included: true,
        fileCount,
        byteSize,
      };
      manifest.worldSave = await summarizeWorldSave(
        join(packageDir, "world-save.json"),
      );
      continue;
    }

    const stats = await estimateSectionSize(installDir, section);
    manifest.sections[section] = {
      included: true,
      fileCount: stats.fileCount,
      byteSize: stats.byteSize,
    };

    const files = await listFilesInSection(installDir, section);
    let completed = 0;
    for (const file of files) {
      const dest = join(packageDir, file.packagePath);
      await ensureDir(dirname(dest));
      await pipeline(
        createReadStream(file.sourcePath),
        createWriteStream(dest),
      );
      completed += 1;
      const fileInfo = await stat(file.sourcePath);
      onProgress?.({
        section,
        filePath: file.sourcePath,
        bytes: fileInfo.size,
        completedFiles: completed,
        totalFiles: files.length,
      });
    }

    if (section === "library") {
      manifest.library = await summarizeLibraryIndex(
        resolveSectionPath(installDir, "library"),
      );
    }
  }

  if (sections.has("libraryConfig")) {
    const roots = await getSourceRootsFromConfig(
      resolveSectionPath(installDir, "libraryConfig"),
    );
    manifest.sourceRoots = {originalPaths: roots};
  }

  await writeFile(
    join(packageDir, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return {packageDir, manifest};
};
