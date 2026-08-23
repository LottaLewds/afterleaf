import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {ensureDataRootStructure, resolveDataRoot} from "~/content/dataRoot";

export interface LayoutMigrationMove {
  /** Absolute source path in the legacy layout. */
  from: string;
  /** Absolute destination path in the unified data-root layout. */
  to: string;
}

export interface LayoutMigrationPlan {
  moves: LayoutMigrationMove[];
  /** Destinations that already exist with content; these block migration. */
  conflicts: Array<{move: LayoutMigrationMove; reason: string}>;
  /** Legacy leftovers that are intentionally left in place. */
  notes: string[];
}

export interface LayoutMigrationResult extends LayoutMigrationPlan {
  performedMoves: LayoutMigrationMove[];
  dataRoot: string;
}

interface FixedMigrationEntry {
  from: readonly string[];
  to: readonly string[];
}

/**
 * Legacy-layout entries with fixed destinations. Sources are relative to
 * the working directory; destinations relative to the unified data root.
 */
const FIXED_ENTRIES: FixedMigrationEntry[] = [
  // User media
  {from: ["content", "books", "comics"], to: ["content", "comics"]},
  {from: ["content", "books", "manga"], to: ["content", "manga"]},
  {from: ["content", "channels"], to: ["content", "tv"]},
  {from: ["content", "posters"], to: ["content", "posters"]},
  {from: ["content", "art-frames"], to: ["content", "art-frames"]},
  {from: ["content", "models"], to: ["content", "models"]},
  {from: ["content", "roms"], to: ["content", "roms"]},
  // Durable game state
  {from: ["content", "world-save.json"], to: ["game", "world-save.json"]},
  {
    from: ["content", "world-state-backups"],
    to: ["game", "world-save-backups"],
  },
  {from: ["afterleaf.library.json"], to: ["afterleaf.library.json"]},
];

/** Provider cache children of content-sources that have their own homes. */
const RESERVED_SOURCE_NAMES = new Set([
  "catalog",
  "library-roots.json",
  "scan-failures.log",
]);

const pathExists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const directoryIsEmpty = async (path: string) => {
  const entries = await readdir(path);
  return entries.length === 0;
};

/**
 * Moves one file or directory tree into the data root. Same-volume moves
 * use a plain atomic rename; cross-volume moves copy recursively, verify
 * the byte count, then remove the source.
 */
const performMove = async ({from, to}: LayoutMigrationMove) => {
  await mkdir(dirname(to), {recursive: true});
  try {
    await rename(from, to);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  const sourceStat = await stat(from);
  if (!sourceStat.isDirectory()) {
    await copyFile(from, to);
    const destinationStat = await stat(to);
    if (destinationStat.size !== sourceStat.size)
      throw new Error(`Copied size mismatch for ${to}`);
    await rm(from, {force: true});
    return;
  }
  await copyDirectory(from, to, sourceStat.size);
  await rm(from, {recursive: true, force: true});
};

/**
 * Removes a legacy parent directory only when the migration left it
 * completely empty. Never recurses and never deletes content.
 */
const pruneIfEmpty = async (path: string) => {
  try {
    const entries = await readdir(path);
    if (entries.length > 0) return;
    await rmdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

/** Deepest-first legacy directories that may be left empty post-migration. */
const LEGACY_PRUNE_CANDIDATES = [
  "content/books/comics",
  "content/books/manga",
  "content/books",
  "content/channels",
  "content/posters",
  "content/art-frames",
  "content/models",
  "content/roms",
  "content/world-state-backups",
  "content-sources",
  "content-packs/library",
  "content-packs",
] as const;

const copyDirectory = async (
  from: string,
  to: string,
  expectedBytes?: number,
) => {
  await mkdir(to, {recursive: true});
  let totalBytes = 0;
  const entries = await readdir(from, {withFileTypes: true});
  for (const entry of entries) {
    const sourcePath = join(from, entry.name);
    const destinationPath = join(to, entry.name);
    if (entry.isDirectory()) {
      totalBytes += await copyDirectory(sourcePath, destinationPath);
      continue;
    }
    if (!entry.isFile()) continue;
    await copyFile(sourcePath, destinationPath);
    totalBytes += (await stat(destinationPath)).size;
  }
  if (expectedBytes !== undefined && totalBytes !== expectedBytes)
    throw new Error(`Copied byte count mismatch for ${to}`);
  return totalBytes;
};

/** Collects every legacy-layout artifact present on disk and its destination. */
export const planLibraryLayoutMigration = async (
  workingDirectory: string,
): Promise<LayoutMigrationPlan> => {
  const resolvedWorking = resolve(workingDirectory);
  const dataRoot = resolveDataRoot(resolvedWorking);
  const moves: LayoutMigrationMove[] = [];
  const notes: string[] = [];

  for (const entry of FIXED_ENTRIES) {
    const from = resolve(resolvedWorking, ...entry.from);
    if (!(await pathExists(from))) continue;
    moves.push({from, to: resolve(dataRoot, ...entry.to)});
  }

  // Prepared catalog and managed library pack.
  const legacyCatalog = resolve(resolvedWorking, "content-sources", "catalog");
  if (await pathExists(legacyCatalog))
    moves.push({
      from: legacyCatalog,
      to: resolve(dataRoot, "game", ".cache", "prepared"),
    });
  const legacyLibrary = resolve(resolvedWorking, "content-packs", "library");
  if (await pathExists(legacyLibrary))
    moves.push({
      from: legacyLibrary,
      to: resolve(dataRoot, "game", ".cache", "library"),
    });
  const legacyRegistry = resolve(
    resolvedWorking,
    "content-sources",
    "library-roots.json",
  );
  if (await pathExists(legacyRegistry))
    moves.push({
      from: legacyRegistry,
      to: resolve(dataRoot, "game", ".cache", "library-roots.json"),
    });
  const legacyFailureLog = resolve(
    resolvedWorking,
    "content-sources",
    "scan-failures.log",
  );
  if (await pathExists(legacyFailureLog))
    moves.push({
      from: legacyFailureLog,
      to: resolve(dataRoot, "game", ".cache", "scan-failures.log"),
    });

  // Every remaining content-sources child is a provider cache.
  const sourcesDirectory = resolve(resolvedWorking, "content-sources");
  if (await pathExists(sourcesDirectory)) {
    const children = await readdir(sourcesDirectory, {withFileTypes: true});
    let providerCount = 0;
    for (const child of children) {
      if (RESERVED_SOURCE_NAMES.has(child.name)) continue;
      const from = join(sourcesDirectory, child.name);
      if (!child.isDirectory()) {
        notes.push(`Left in place (unrecognized file): ${from}`);
        continue;
      }
      providerCount += 1;
      moves.push({
        from,
        to: resolve(dataRoot, "providers", child.name),
      });
    }
    notes.push(
      `Relocated ${providerCount} provider ${providerCount === 1 ? "cache" : "caches"} under providers/.`,
    );
  }

  const demoPack = resolve(resolvedWorking, "content-packs", "demo-v1");
  if (await pathExists(demoPack))
    notes.push(
      `Left in place (unused generated demo pack; safe to delete): ${demoPack}`,
    );
  const booksDirectory = resolve(resolvedWorking, "content", "books");
  if (await pathExists(booksDirectory))
    notes.push(
      `Left in place (now empty after moving comics/manga): ${booksDirectory}`,
    );

  const conflicts: LayoutMigrationPlan["conflicts"] = [];
  for (const move of moves) {
    if (!(await pathExists(move.to))) continue;
    const destinationStat = await stat(move.to);
    const empty =
      destinationStat.isDirectory() && (await directoryIsEmpty(move.to));
    if (empty) await rm(move.to, {force: true, recursive: true});
    else
      conflicts.push({
        move,
        reason: `Destination already exists with content: ${move.to}`,
      });
  }

  return {
    conflicts,
    moves,
    notes: [...new Set(notes)],
  };
};

/**
 * Migrates the legacy three-folder layout into the unified data root.
 * Without `write`, this only reports the plan. With `write`, the plan is
 * validated first (any conflict aborts before touching anything), each
 * move is all-or-nothing per entry, and the data-root structure plus
 * README.txt are created.
 */
export const migrateLibraryLayout = async (
  workingDirectory: string,
  options: {write?: boolean} = {},
): Promise<LayoutMigrationResult> => {
  const resolvedWorking = resolve(workingDirectory);
  const plan = await planLibraryLayoutMigration(resolvedWorking);
  const dataRoot = resolveDataRoot(resolvedWorking);
  if (!options.write || plan.moves.length === 0) {
    return {...plan, performedMoves: [], dataRoot};
  }
  if (plan.conflicts.length > 0)
    throw new Error(
      `Library layout migration found ${plan.conflicts.length} blocking conflict${plan.conflicts.length === 1 ? "" : "s"}:\n${plan.conflicts
        .map(({reason}) => `- ${reason}`)
        .join("\n")}`,
    );
  const performedMoves: LayoutMigrationMove[] = [];
  try {
    for (const move of plan.moves) {
      await performMove(move);
      performedMoves.push(move);
    }
  } catch (error) {
    await rollbackMoves(performedMoves).catch(() => {});
    throw error;
  }
  // Clean up legacy parent folders that are now empty so the old layout
  // disappears instead of leaving confusing shells behind.
  for (const candidate of LEGACY_PRUNE_CANDIDATES) {
    await pruneIfEmpty(resolve(resolvedWorking, candidate));
  }
  await ensureDataRootStructure(resolvedWorking);
  return {...plan, performedMoves, dataRoot};
};

const rollbackMoves = async (
  performedMoves: readonly LayoutMigrationMove[],
) => {
  // Best-effort reverse relocation so a failed run never leaves data in
  // both layouts without warning.
  for (const move of [...performedMoves].reverse()) {
    await mkdir(dirname(move.from), {recursive: true});
    await rename(move.to, move.from);
  }
};
