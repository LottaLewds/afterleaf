import {randomUUID} from "node:crypto";
import {mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile} from "node:fs/promises";
import {basename, dirname, join} from "node:path";

import {collectionsPath} from "./dataRoot";

export const COLLECTIONS_SCHEMA_VERSION = 1 as const;

const MAX_COLLECTION_COUNT = 200;
const MAX_COLLECTION_NAME_LENGTH = 100;
const MAX_PUBLICATION_IDS_PER_COLLECTION = 10_000;
const MAX_TOTAL_PUBLICATION_IDS = 100_000;
const COLLECTION_BACKUP_FILE_PATTERN = /^collections\.(?:backup-.+|staging-.+)\.json$/u;

// Mirrors the publication ID pattern used in httpProtocol.ts.
const PUBLICATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,199}$/u;

export type UserCollection = {
  id: string;
  name: string;
  createdAt: string;
  publicationIds: readonly string[];
  color?: string;
};

export type CollectionsStore = {
  collections: readonly UserCollection[];
  schemaVersion: typeof COLLECTIONS_SCHEMA_VERSION;
};

export type UserCollectionChanges = {
  addPublicationIds?: readonly string[];
  color?: string;
  name?: string;
  publicationIds?: readonly string[];
  removePublicationIds?: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";

const errorCode = (error: unknown) =>
  error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;

const collectionMutationQueues = new Map<string, Promise<unknown>>();

const enqueueCollectionMutation = <T>(workingDirectory: string, mutation: () => Promise<T>): Promise<T> => {
  const key = collectionsPath(workingDirectory);
  const previous = collectionMutationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  collectionMutationQueues.set(key, next);
  return next.finally(() => {
    if (collectionMutationQueues.get(key) === next) collectionMutationQueues.delete(key);
  });
};

const validCollectionId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new Error("Collection id must be a UUID");
  return value.toLowerCase();
};

const validCollectionName = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_COLLECTION_NAME_LENGTH)
    throw new Error(`Collection name must be a non-empty string of at most ${MAX_COLLECTION_NAME_LENGTH} characters`);
  return value.trim();
};

const validCreatedAt = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error(`${field} must be a valid date`);
  return value;
};

const validPublicationId = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !PUBLICATION_ID_PATTERN.test(value))
    throw new Error(`${field} must be a portable publication identifier`);
  return value;
};

const validColor = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/u.test(value))
    throw new Error("Collection color must be a 6-digit hex color");
  return value.toLowerCase();
};

const validCollection = (value: unknown, index: number): UserCollection => {
  if (!isRecord(value)) throw new Error(`collections[${index}] must be an object`);
  const field = (name: string) => `collections[${index}].${name}`;
  const id = validCollectionId(value.id);
  const name = validCollectionName(value.name);
  const createdAt = validCreatedAt(value.createdAt, field("createdAt"));
  const color = validColor(value.color);
  const rawPublicationIds = value.publicationIds;
  if (!Array.isArray(rawPublicationIds)) throw new Error(`${field("publicationIds")} must be an array`);
  if (rawPublicationIds.length > MAX_PUBLICATION_IDS_PER_COLLECTION)
    throw new Error(`${field("publicationIds")} must contain at most ${MAX_PUBLICATION_IDS_PER_COLLECTION} IDs`);
  const publicationIds = rawPublicationIds.map((publicationId, publicationIndex) =>
    validPublicationId(publicationId, `${field("publicationIds")}[${publicationIndex}]`),
  );
  const uniqueIds = new Set(publicationIds);
  if (uniqueIds.size !== publicationIds.length) throw new Error(`${field("publicationIds")} contains duplicates`);
  return {
    id,
    name,
    createdAt,
    publicationIds,
    ...(color === undefined ? {} : {color}),
  };
};

export const parseCollectionsStore = (value: unknown): CollectionsStore => {
  if (!isRecord(value)) throw new Error("Collections store must be an object");
  if (value.schemaVersion !== COLLECTIONS_SCHEMA_VERSION)
    throw new Error(`Unsupported collections schema version: ${String(value.schemaVersion)}`);
  if (!Array.isArray(value.collections)) throw new Error("collections must be an array");
  if (value.collections.length > MAX_COLLECTION_COUNT)
    throw new Error(`At most ${MAX_COLLECTION_COUNT} collections are supported`);
  const ids = new Set<string>();
  const names = new Set<string>();
  let totalPublicationIds = 0;
  const collections = value.collections.map((collection, index) => {
    const parsed = validCollection(collection, index);
    if (ids.has(parsed.id)) throw new Error("Collections store contains duplicate collection ids");
    const nameKey = parsed.name.toLowerCase();
    if (names.has(nameKey)) throw new Error("Collections store contains duplicate collection names");
    ids.add(parsed.id);
    names.add(nameKey);
    totalPublicationIds += parsed.publicationIds.length;
    return parsed;
  });
  if (totalPublicationIds > MAX_TOTAL_PUBLICATION_IDS)
    throw new Error(`At most ${MAX_TOTAL_PUBLICATION_IDS} publication ids across all collections are supported`);
  return {collections, schemaVersion: COLLECTIONS_SCHEMA_VERSION};
};

export const normalizeCollections = (collections: readonly UserCollection[]): readonly UserCollection[] => {
  const seenIds = new Set<string>();
  const result: UserCollection[] = [];
  for (const collection of collections) {
    if (seenIds.has(collection.id)) continue;
    seenIds.add(collection.id);
    const uniquePublicationIds = [...new Set(collection.publicationIds)].slice(0, MAX_PUBLICATION_IDS_PER_COLLECTION);
    result.push({
      ...collection,
      name: collection.name.trim(),
      publicationIds: uniquePublicationIds,
    });
  }
  return result;
};

export const loadCollections = async (workingDirectory: string): Promise<readonly UserCollection[]> => {
  try {
    const text = await readFile(collectionsPath(workingDirectory), "utf8");
    return parseCollectionsStore(JSON.parse(text) as unknown).collections;
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
};

const trimCollectionBackups = async (backupDirectory: string, maxBackups: number) => {
  const entries = await readdir(backupDirectory);
  const backupFiles = entries
    .filter((name) => COLLECTION_BACKUP_FILE_PATTERN.test(name))
    .map((name) => join(backupDirectory, name));
  if (backupFiles.length <= maxBackups) return;
  const filesWithMtime = await Promise.all(
    backupFiles.map(async (path) => ({path, mtime: (await stat(path)).mtimeMs})),
  );
  filesWithMtime.sort((a, b) => a.mtime - b.mtime);
  for (const file of filesWithMtime.slice(0, filesWithMtime.length - maxBackups)) {
    await unlink(file.path);
  }
};

const replaceCollectionsFile = async (temporaryPath: string, targetPath: string) => {
  try {
    await rename(temporaryPath, targetPath);
    return;
  } catch (error) {
    const code = errorCode(error);
    if (code !== "EEXIST" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
  }

  // Best-effort atomic write fallback on Windows uses remove-and-rename because
  // Windows does not replace an existing directory entry with rename().
  await rm(targetPath, {force: true});
  await rename(temporaryPath, targetPath);
};

const writeCollections = async (
  workingDirectory: string,
  collections: readonly UserCollection[],
): Promise<readonly UserCollection[]> => {
  const store: CollectionsStore = {
    collections: parseCollectionsStore({collections, schemaVersion: COLLECTIONS_SCHEMA_VERSION}).collections,
    schemaVersion: COLLECTIONS_SCHEMA_VERSION,
  };
  const targetPath = collectionsPath(workingDirectory);
  const backupDirectory = join(dirname(targetPath), "collections-backup");
  await mkdir(backupDirectory, {recursive: true});
  const serialized = `${JSON.stringify(store, null, 2)}\n`;
  const temporaryPath = join(dirname(targetPath), `.${basename(targetPath)}.staging-${process.pid}-${randomUUID()}`);
  try {
    await writeFile(temporaryPath, serialized, {flag: "wx"});
    await replaceCollectionsFile(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }

  const backupPath = join(backupDirectory, `collections.backup-${Date.now()}-${randomUUID()}.json`);
  try {
    await writeFile(backupPath, serialized, {flag: "wx"});
    await trimCollectionBackups(backupDirectory, 15);
  } catch (error) {
    // The committed collection remains valid even if historical snapshot cleanup
    // is unavailable, so do not report a successful save as failed.
    console.warn("Could not maintain collection backups", error);
  }
  return store.collections;
};

export const saveCollections = async (
  workingDirectory: string,
  collections: readonly UserCollection[],
): Promise<readonly UserCollection[]> =>
  enqueueCollectionMutation(workingDirectory, () => writeCollections(workingDirectory, collections));

export const createCollection = async (
  workingDirectory: string,
  name: string,
  publicationIds: readonly string[] = [],
): Promise<UserCollection> => {
  return enqueueCollectionMutation(workingDirectory, async () => {
    const existing = await loadCollections(workingDirectory);
    const trimmedName = name.trim();
    if (existing.some((collection) => collection.name.toLowerCase() === trimmedName.toLowerCase()))
      throw new Error(`A collection named "${trimmedName}" already exists`);
    const collection: UserCollection = {
      id: randomUUID(),
      name: trimmedName,
      createdAt: new Date().toISOString(),
      publicationIds: [...new Set(publicationIds)],
    };
    await writeCollections(workingDirectory, [...existing, collection]);
    return collection;
  });
};

export const updateCollection = async (
  workingDirectory: string,
  id: string,
  changes: UserCollectionChanges,
): Promise<UserCollection> => {
  return enqueueCollectionMutation(workingDirectory, async () => {
    const normalizedId = validCollectionId(id);
    const existing = await loadCollections(workingDirectory);
    const current = existing.find((collection) => collection.id === normalizedId);
    if (!current) throw new Error("Collection not found");
    const nextName = changes.name?.trim() ?? current.name;
    if (
      nextName.toLowerCase() !== current.name.toLowerCase() &&
      existing.some(
        (collection) => collection.id !== current.id && collection.name.toLowerCase() === nextName.toLowerCase(),
      )
    )
      throw new Error(`A collection named "${nextName}" already exists`);
    if (
      changes.publicationIds !== undefined &&
      (changes.addPublicationIds !== undefined || changes.removePublicationIds !== undefined)
    )
      throw new Error("Collection publication replacement cannot be combined with add or remove operations");
    const removedPublicationIds = new Set(changes.removePublicationIds ?? []);
    const nextPublicationIds =
      changes.publicationIds !== undefined
        ? [...new Set(changes.publicationIds)]
        : [...new Set([...current.publicationIds, ...(changes.addPublicationIds ?? [])])].filter(
            (publicationId) => !removedPublicationIds.has(publicationId),
          );
    const updated: UserCollection = {
      ...current,
      name: nextName,
      publicationIds: nextPublicationIds,
      ...(changes.color === undefined ? {} : {color: changes.color}),
    };
    const nextCollections = existing.map((collection) => (collection.id === normalizedId ? updated : collection));
    await writeCollections(workingDirectory, nextCollections);
    return updated;
  });
};

export const deleteCollection = async (workingDirectory: string, id: string): Promise<void> => {
  return enqueueCollectionMutation(workingDirectory, async () => {
    const normalizedId = validCollectionId(id);
    const existing = await loadCollections(workingDirectory);
    const nextCollections = existing.filter((collection) => collection.id !== normalizedId);
    if (nextCollections.length === existing.length) throw new Error("Collection not found");
    await writeCollections(workingDirectory, nextCollections);
  });
};

export const addPublicationToCollection = async (
  workingDirectory: string,
  collectionId: string,
  publicationId: string,
): Promise<UserCollection> => {
  return enqueueCollectionMutation(workingDirectory, async () => {
    const normalizedCollectionId = validCollectionId(collectionId);
    const existing = await loadCollections(workingDirectory);
    const collection = existing.find((candidate) => candidate.id === normalizedCollectionId);
    if (!collection) throw new Error("Collection not found");
    if (collection.publicationIds.includes(publicationId)) return collection;
    const updated = {
      ...collection,
      publicationIds: [...collection.publicationIds, publicationId],
    };
    await writeCollections(
      workingDirectory,
      existing.map((candidate) => (candidate.id === normalizedCollectionId ? updated : candidate)),
    );
    return updated;
  });
};
