import {mkdir} from "node:fs/promises";
import {join, resolve} from "node:path";
import {SECTIONS, type PortSection, resolveSectionPath} from "./sections";
import {exportLibrary} from "./export";
import {importLibrary} from "./import";
import {summarizeWorldSave} from "./manifest";
import {formatBytes, runChecklist} from "./tui";

const isPortSection = (value: string): value is PortSection =>
  SECTIONS.some((section) => section.id === value);

const parseSectionList = (
  raw: string | undefined,
): PortSection[] | undefined => {
  if (!raw) return undefined;
  const ids = raw.split(",").map((part) => part.trim());
  const invalid = ids.filter((id) => !isPortSection(id));
  if (invalid.length > 0) {
    throw new Error(`Unknown sections: ${invalid.join(", ")}`);
  }
  return ids as PortSection[];
};

const parseWorldSaveKeys = (
  raw: string | undefined,
): string[] | undefined => {
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

export const runExportCli = async (args: string[]): Promise<void> => {
  const allFlag = args.includes("--all");
  const yesFlag = args.includes("--yes");
  const onlyIndex = args.findIndex((arg) => arg === "--only");
  const onlyRaw = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
  const worldSaveKeysIndex = args.findIndex(
    (arg) => arg === "--world-save-keys",
  );
  const worldSaveKeysRaw =
    worldSaveKeysIndex >= 0 ? args[worldSaveKeysIndex + 1] : undefined;
  const positional = args.filter(
    (arg) =>
      arg !== "--all" &&
      arg !== "--yes" &&
      arg !== "--only" &&
      arg !== onlyRaw &&
      arg !== "--world-save-keys" &&
      arg !== worldSaveKeysRaw,
  );
  const destArg = positional[0];
  if (!destArg) {
    console.log(
      "Usage: bun run library:export <dest-dir> [--all] [--only a,b,c] [--yes] [--world-save-keys k1,k2]",
    );
    process.exit(0);
  }

  const installDir = process.cwd();
  const destDir = resolve(destArg);

  let sections: Set<PortSection>;
  if (allFlag) {
    sections = new Set(SECTIONS.map((section) => section.id));
  } else {
    const only = parseSectionList(onlyRaw);
    if (only) {
      sections = new Set(only);
    } else if (yesFlag) {
      sections = new Set(SECTIONS.map((section) => section.id));
    } else {
      const items = await Promise.all(
        SECTIONS.map(async (section) => {
          const {estimateSectionSize} = await import("./sections");
          const stats = await estimateSectionSize(installDir, section.id);
          return {
            id: section.id,
            label: `${section.label} (${formatBytes(stats.byteSize)}, ${stats.fileCount} files)`,
            description: section.description,
          };
        }),
      );
      sections = await runChecklist("Select sections to export:", items);
    }
  }

  if (sections.size === 0) {
    console.log("No sections selected. Aborting.");
    process.exit(0);
  }

  let worldSaveKeys: Set<string> | undefined;
  if (sections.has("worldSave")) {
    const explicitKeys = parseWorldSaveKeys(worldSaveKeysRaw);
    if (explicitKeys) {
      worldSaveKeys = new Set(explicitKeys);
    } else if (!allFlag && !yesFlag) {
      const worldSavePath = resolveSectionPath(installDir, "worldSave");
      const summary = await summarizeWorldSave(worldSavePath);
      const items = summary.topLevelKeys.map((key) => ({
        id: key,
        label: key,
        description: undefined,
      }));
      worldSaveKeys = await runChecklist(
        "Select world-save keys to export:",
        items,
      );
    }
    // sinon (--all ou --yes sans --world-save-keys) : worldSaveKeys reste
    // undefined, exportLibrary exporte alors le world-save.json complet.
  }

  await mkdir(destDir, {recursive: true}).catch(() => {});
  console.log(`\nExporting to ${destDir}...`);
  const {manifest} = await exportLibrary(
    installDir,
    destDir,
    sections,
    worldSaveKeys,
    (progress) => {
      console.log(
        `[${progress.section}] ${progress.completedFiles}/${progress.totalFiles} ${progress.filePath}`,
      );
    },
  );

  console.log("\nExport complete.");
  for (const section of SECTIONS) {
    const info = manifest.sections[section.id];
    if (!info?.included) continue;
    console.log(`  ${section.label}: ${formatBytes(info.byteSize)}`);
  }
};

export const runImportCli = async (args: string[]): Promise<void> => {
  const allFlag = args.includes("--all");
  const yesFlag = args.includes("--yes");
  const onlyIndex = args.findIndex((arg) => arg === "--only");
  const onlyRaw = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
  const worldSaveKeysIndex = args.findIndex(
    (arg) => arg === "--world-save-keys",
  );
  const worldSaveKeysRaw =
    worldSaveKeysIndex >= 0 ? args[worldSaveKeysIndex + 1] : undefined;
  const positional = args.filter(
    (arg) =>
      arg !== "--all" &&
      arg !== "--yes" &&
      arg !== "--only" &&
      arg !== onlyRaw &&
      arg !== "--world-save-keys" &&
      arg !== worldSaveKeysRaw,
  );
  const srcArg = positional[0];
  if (!srcArg) {
    console.log(
      "Usage: bun run library:import <package-dir> [--all] [--only a,b,c] [--yes]",
    );
    process.exit(0);
  }

  const installDir = process.cwd();
  const packageDir = resolve(srcArg);

  const {readManifest} = await import("./manifest");
  const manifest = await readManifest(packageDir);

  let sections: Set<PortSection>;
  if (allFlag) {
    sections = new Set(
      SECTIONS.map((section) => section.id).filter(
        (id) => manifest.sections[id]?.included,
      ),
    );
  } else {
    const only = parseSectionList(onlyRaw);
    if (only) {
      sections = new Set(only.filter((id) => manifest.sections[id]?.included));
    } else if (yesFlag) {
      sections = new Set(
        SECTIONS.map((section) => section.id).filter(
          (id) => manifest.sections[id]?.included,
        ),
      );
    } else {
      const available = SECTIONS.filter(
        (section) => manifest.sections[section.id]?.included,
      );
      const items = available.map((section) => ({
        id: section.id,
        label: section.label,
        description: section.description,
      }));
      sections = await runChecklist("Select sections to import:", items);
    }
  }

  if (sections.size === 0) {
    console.log("No sections selected. Aborting.");
    process.exit(0);
  }

  let worldSaveKeys = new Set<string>();
  if (sections.has("worldSave")) {
    const worldSavePath = join(packageDir, "world-save.json");
    const summary = await summarizeWorldSave(worldSavePath);
    const explicitKeys = parseWorldSaveKeys(worldSaveKeysRaw);
    if (explicitKeys) {
      worldSaveKeys = new Set(explicitKeys);
    } else if (allFlag || yesFlag) {
      worldSaveKeys = new Set(summary.topLevelKeys);
    } else {
      const items = summary.topLevelKeys.map((key) => ({
        id: key,
        label: key,
        description:
          key === "books"
            ? "merge shelved placements by publicationId"
            : undefined,
      }));
      worldSaveKeys = await runChecklist(
        "Select world-save keys to merge:",
        items,
      );
    }
  }

  console.log(`\nImporting from ${packageDir}...`);
  const result = await importLibrary(
    installDir,
    packageDir,
    sections,
    worldSaveKeys,
  );

  console.log("\nImport complete.");
  console.log(`Sections imported: ${result.sections.join(", ")}`);
  if (result.sourceDestination) {
    console.log(`Sources restored to: ${result.sourceDestination}`);
  }
  if (result.backups.length > 0) {
    console.log("Backups created:");
    for (const backup of result.backups) console.log(`  ${backup}`);
  }
};
