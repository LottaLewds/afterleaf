import {randomUUID} from "node:crypto";
import {readFile, readdir, rename, rm, writeFile} from "node:fs/promises";
import {basename, dirname, relative, resolve, sep} from "node:path";
import type {LocalPublicationDocument} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const PUBLICATION_MANIFEST_FILE = "publication.json";

export interface LibrarySourceMigrationContext {
  readonly document: LocalPublicationDocument;
  readonly manifestPath: string;
  readonly publicationDirectory: string;
  readonly sourceId: string;
}

export interface LibrarySourceMigration {
  applies(context: LibrarySourceMigrationContext): boolean;
  id: string;
  label: string;
  migrate(
    context: LibrarySourceMigrationContext,
  ): LocalPublicationDocument | Promise<LocalPublicationDocument>;
}

export interface LibrarySourceMigrationDiagnostic {
  message: string;
  migrationId: string;
  sourceId: string;
}

export interface LibrarySourceMigrationReport {
  diagnostics: LibrarySourceMigrationDiagnostic[];
  failedCount: number;
  migratedCount: number;
  pendingCount: number;
}

export interface LibrarySourceMigrationOptions {
  migrations: readonly LibrarySourceMigration[];
  onProgress?: (message: string) => void;
  sourceDirectory: string;
}

interface PublicationManifestCandidate {
  document: LocalPublicationDocument;
  manifestPath: string;
  publicationDirectory: string;
  sourceId: string;
}

interface PendingLibrarySourceMigration {
  candidate: PublicationManifestCandidate;
  eligibilityError?: {value: unknown};
  migration: LibrarySourceMigration;
}

const toPortablePath = (path: string) => path.split(sep).join("/");

const publicationManifestPaths = async (sourceDirectory: string) => {
  const pendingDirectories = [sourceDirectory];
  const manifests: Array<Omit<PublicationManifestCandidate, "document">> = [];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;
    let entries;
    try {
      entries = await readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (
        directory === sourceDirectory &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return [];
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) pendingDirectories.push(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== PUBLICATION_MANIFEST_FILE) continue;
      const publicationDirectory = dirname(path);
      manifests.push({
        manifestPath: path,
        publicationDirectory,
        sourceId: toPortablePath(
          relative(sourceDirectory, publicationDirectory),
        ),
      });
    }
  }
  return manifests.toSorted((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
};

const publicationCandidates = async (sourceDirectory: string) => {
  const candidates: PublicationManifestCandidate[] = [];
  for (const manifest of await publicationManifestPaths(sourceDirectory)) {
    try {
      const document = parseLocalPublicationDocument(
        JSON.parse(await readFile(manifest.manifestPath, "utf8")) as unknown,
        manifest.manifestPath,
      );
      if (document.id !== basename(manifest.publicationDirectory)) continue;
      candidates.push({...manifest, document});
    } catch {
      // Invalid manifests are reported by the normal local catalog scan.
    }
  }
  return candidates;
};

const migrationContext = (
  candidate: PublicationManifestCandidate,
): LibrarySourceMigrationContext => ({
  document: candidate.document,
  manifestPath: candidate.manifestPath,
  publicationDirectory: candidate.publicationDirectory,
  sourceId: candidate.sourceId,
});

const pendingMigrations = (
  candidates: readonly PublicationManifestCandidate[],
  migrations: readonly LibrarySourceMigration[],
) => {
  const pending: PendingLibrarySourceMigration[] = [];
  for (const candidate of candidates) {
    for (const migration of migrations) {
      try {
        if (!migration.applies(migrationContext(candidate))) continue;
        pending.push({candidate, migration});
      } catch (eligibilityError) {
        pending.push({
          candidate,
          eligibilityError: {value: eligibilityError},
          migration,
        });
      }
    }
  }
  return pending;
};

const assertMigrationRegistry = (
  migrations: readonly LibrarySourceMigration[],
) => {
  const ids = new Set<string>();
  for (const migration of migrations) {
    if (!migration.id.trim()) throw new Error("Migration IDs cannot be empty");
    if (!migration.label.trim())
      throw new Error(`Migration ${migration.id} must have a label`);
    if (ids.has(migration.id))
      throw new Error(`Duplicate library source migration ${migration.id}`);
    ids.add(migration.id);
  }
};

const writeMigratedPublication = async (
  manifestPath: string,
  document: LocalPublicationDocument,
) => {
  const temporaryPath = `${manifestPath}.staging-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`);
    await rename(temporaryPath, manifestPath);
  } finally {
    await rm(temporaryPath, {force: true});
  }
};

const progressPercentage = (completedCount: number, pendingCount: number) =>
  Math.floor((completedCount / pendingCount) * 100);

export const runLibrarySourceMigrations = async (
  options: LibrarySourceMigrationOptions,
): Promise<LibrarySourceMigrationReport> => {
  assertMigrationRegistry(options.migrations);
  const diagnostics: LibrarySourceMigrationDiagnostic[] = [];
  let failedCount = 0;
  let migratedCount = 0;
  const candidates = await publicationCandidates(options.sourceDirectory);
  const pending = pendingMigrations(candidates, options.migrations);
  const pendingCount = pending.length;
  if (pendingCount === 0)
    return {diagnostics, failedCount, migratedCount, pendingCount};
  options.onProgress?.(
    `Updating older cached publications: 0/${pendingCount} complete (0%); 0 updated, 0 failed`,
  );
  for (const [index, job] of pending.entries()) {
    const {candidate, migration} = job;
    const completedCount = index;
    options.onProgress?.(
      `Updating older cached publications: ${completedCount}/${pendingCount} complete (${progressPercentage(completedCount, pendingCount)}%); running ${migration.label} for ${candidate.sourceId}`,
    );
    try {
      if (job.eligibilityError !== undefined) throw job.eligibilityError.value;
      const migrated = parseLocalPublicationDocument(
        await migration.migrate(migrationContext(candidate)),
        candidate.manifestPath,
      );
      if (migrated.id !== candidate.document.id)
        throw new Error("migrations cannot change publication IDs");
      await writeMigratedPublication(candidate.manifestPath, migrated);
      candidate.document = migrated;
      migratedCount += 1;
      const nextCompletedCount = index + 1;
      options.onProgress?.(
        `Updating older cached publications: ${nextCompletedCount}/${pendingCount} complete (${progressPercentage(nextCompletedCount, pendingCount)}%); updated ${candidate.sourceId} with ${migration.label} (${migratedCount} updated, ${failedCount} failed)`,
      );
    } catch (error) {
      failedCount += 1;
      diagnostics.push({
        message: `Could not run ${migration.label} for ${candidate.sourceId}: ${error instanceof Error ? error.message : String(error)}`,
        migrationId: migration.id,
        sourceId: candidate.sourceId,
      });
      const nextCompletedCount = index + 1;
      options.onProgress?.(
        `Updating older cached publications: ${nextCompletedCount}/${pendingCount} complete (${progressPercentage(nextCompletedCount, pendingCount)}%); failed ${migration.label} for ${candidate.sourceId}, will retry next scan (${migratedCount} updated, ${failedCount} failed)`,
      );
    }
  }

  return {diagnostics, failedCount, migratedCount, pendingCount};
};
