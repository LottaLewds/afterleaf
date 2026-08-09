import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {isAbsolute, relative, resolve, sep} from "node:path";
import {
  LIBRARY_SNAPSHOT_INDEX_VERSION,
  type LibrarySnapshotDescriptor,
  type LibrarySnapshotIndex,
} from "~/content/libraryUpdate/protocol";
import {scheduleSnapshotGarbageCollection} from "~/content/libraryUpdate/snapshotGarbageCollector";

const SNAPSHOT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const RETAINED_SNAPSHOT_COUNT = 1;
const SNAPSHOT_GARBAGE_DIRECTORY = "snapshot-garbage";

const replaceSnapshotIndex = async (
  temporaryPath: string,
  indexPath: string,
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(temporaryPath, indexPath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  try {
    await rm(indexPath, {force: true});
    await rename(temporaryPath, indexPath);
  } catch {
    throw lastError;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${field} must be a non-empty string`);
  return value;
};

const requiredNonNegativeInteger = (value: unknown, field: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${field} must be a non-negative integer`);
  return Number(value);
};

export const assertSnapshotId = (snapshotId: string) => {
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId))
    throw new Error(
      "snapshotId must contain only lowercase letters, numbers, dots, underscores, or hyphens",
    );
  return snapshotId;
};

const assertContainedRelativePath = (path: string, field: string) => {
  if (isAbsolute(path) || path.includes("\\"))
    throw new Error(`${field} must be a portable relative path`);
  const resolved = resolve("/library", path);
  const relativePath = relative("/library", resolved);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    throw new Error(`${field} must stay inside the library directory`);
  return path;
};

const parseSnapshotDescriptor = (
  value: unknown,
  field: string,
): LibrarySnapshotDescriptor => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const snapshotId = assertSnapshotId(
    requiredString(value.snapshotId, `${field}.snapshotId`),
  );
  const directory = assertContainedRelativePath(
    requiredString(value.directory, `${field}.directory`),
    `${field}.directory`,
  );
  const catalogPath = assertContainedRelativePath(
    requiredString(value.catalogPath, `${field}.catalogPath`),
    `${field}.catalogPath`,
  );
  const expectedDirectories = [
    `revisions/${snapshotId}`,
    `snapshots/${snapshotId}`,
  ];
  if (!expectedDirectories.includes(directory))
    throw new Error(`${field}.directory does not match its snapshotId`);
  if (catalogPath !== `${directory}/catalog.json`)
    throw new Error(`${field}.catalogPath must point to its snapshot catalog`);
  return {
    catalogContentHash: requiredString(
      value.catalogContentHash,
      `${field}.catalogContentHash`,
    ),
    catalogPath,
    createdAt: requiredString(value.createdAt, `${field}.createdAt`),
    directory,
    packId: requiredString(value.packId, `${field}.packId`),
    publicationCount: requiredNonNegativeInteger(
      value.publicationCount,
      `${field}.publicationCount`,
    ),
    snapshotId,
  };
};

export const parseLibrarySnapshotIndex = (
  value: unknown,
): LibrarySnapshotIndex => {
  if (!isRecord(value))
    throw new Error("Library snapshot index must be an object");
  if (value.schemaVersion !== LIBRARY_SNAPSHOT_INDEX_VERSION)
    throw new Error("Unsupported library snapshot index schema version");
  if (!Array.isArray(value.snapshots))
    throw new Error("Library snapshot index snapshots must be an array");
  const snapshots = value.snapshots.map((snapshot, index) =>
    parseSnapshotDescriptor(snapshot, `snapshots[${index}]`),
  );
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshotId));
  if (snapshotIds.size !== snapshots.length)
    throw new Error("Library snapshot index contains duplicate snapshot IDs");
  const activeSnapshotId =
    value.activeSnapshotId === undefined
      ? undefined
      : assertSnapshotId(
          requiredString(value.activeSnapshotId, "activeSnapshotId"),
        );
  if (activeSnapshotId && !snapshotIds.has(activeSnapshotId))
    throw new Error("Active snapshot is not present in the snapshot index");
  return {
    ...(activeSnapshotId === undefined ? {} : {activeSnapshotId}),
    revision: requiredNonNegativeInteger(value.revision, "revision"),
    schemaVersion: LIBRARY_SNAPSHOT_INDEX_VERSION,
    snapshots,
  };
};

export const activeSnapshotFromIndex = (index: LibrarySnapshotIndex) => {
  if (!index.activeSnapshotId) return undefined;
  return index.snapshots.find(
    (snapshot) => snapshot.snapshotId === index.activeSnapshotId,
  );
};

export interface LibrarySnapshotIndexStoreDependencies {
  createTemporaryId?: () => string;
  scheduleGarbageCollection?: (garbageDirectory: string) => void;
}

export class LibrarySnapshotIndexStore {
  readonly #indexPath: string;
  readonly #libraryDirectory: string;
  readonly #createTemporaryId: () => string;
  readonly #scheduleGarbageCollection: (garbageDirectory: string) => void;

  constructor(
    libraryDirectory: string,
    dependencies: LibrarySnapshotIndexStoreDependencies = {},
  ) {
    this.#libraryDirectory = resolve(libraryDirectory);
    this.#indexPath = resolve(this.#libraryDirectory, "index.json");
    this.#createTemporaryId = dependencies.createTemporaryId ?? randomUUID;
    this.#scheduleGarbageCollection =
      dependencies.scheduleGarbageCollection ??
      scheduleSnapshotGarbageCollection;
  }

  resolveSnapshotPath(snapshot: LibrarySnapshotDescriptor) {
    return resolve(this.#libraryDirectory, snapshot.directory);
  }

  async read(): Promise<LibrarySnapshotIndex> {
    let text: string;
    try {
      text = await readFile(this.#indexPath, "utf8");
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT")
        return {
          revision: 0,
          schemaVersion: LIBRARY_SNAPSHOT_INDEX_VERSION,
          snapshots: [],
        };
      throw error;
    }
    return parseLibrarySnapshotIndex(JSON.parse(text) as unknown);
  }

  async activate(
    snapshot: LibrarySnapshotDescriptor,
  ): Promise<LibrarySnapshotIndex> {
    const validatedSnapshot = parseSnapshotDescriptor(snapshot, "snapshot");
    const current = await this.read();
    if (
      current.snapshots.some(
        (entry) => entry.snapshotId === validatedSnapshot.snapshotId,
      )
    )
      throw new Error(
        `Snapshot ${JSON.stringify(validatedSnapshot.snapshotId)} is already indexed`,
      );
    const next: LibrarySnapshotIndex = {
      activeSnapshotId: validatedSnapshot.snapshotId,
      revision: current.revision + 1,
      schemaVersion: LIBRARY_SNAPSHOT_INDEX_VERSION,
      snapshots: [validatedSnapshot, ...current.snapshots].slice(
        0,
        RETAINED_SNAPSHOT_COUNT,
      ),
    };
    const retainedSnapshotIds = new Set(
      next.snapshots.map((entry) => entry.snapshotId),
    );
    const evictedSnapshots = current.snapshots.filter(
      (entry) => !retainedSnapshotIds.has(entry.snapshotId),
    );
    await mkdir(this.#libraryDirectory, {recursive: true});
    const garbageDirectory = resolve(
      this.#libraryDirectory,
      SNAPSHOT_GARBAGE_DIRECTORY,
    );
    await mkdir(garbageDirectory, {recursive: true});
    const temporaryPath = `${this.#indexPath}.staging-${this.#createTemporaryId()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
        flag: "wx",
      });
      await replaceSnapshotIndex(temporaryPath, this.#indexPath);
      await Promise.allSettled(
        evictedSnapshots.map((entry) =>
          rename(
            resolve(this.#libraryDirectory, entry.directory),
            resolve(garbageDirectory, entry.snapshotId),
          ),
        ),
      );
      try {
        this.#scheduleGarbageCollection(garbageDirectory);
      } catch {}
    } catch (error) {
      await rm(temporaryPath, {force: true}).catch(() => {});
      throw error;
    }
    return next;
  }
}
