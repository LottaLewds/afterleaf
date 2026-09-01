import {randomUUID} from "node:crypto";
import {mkdir, readdir, readFile, stat, unlink, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

import {collectionsPath} from "./dataRoot";

export const COLLECTIONS_SCHEMA_VERSION = 1 as const;

const MAX_COLLECTION_COUNT = 200;
const MAX_COLLECTION_NAME_LENGTH = 100;
const MAX_PUBLICATION_IDS_PER_COLLECTION = 10_000;
const MAX_TOTAL_PUBLICATION_IDS = 100_000;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";

const validCollectionId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new Error("Collection id must be a UUID");
  return value;
};

const validCollectionName = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_COLLECTION_NAME_LENGTH)
    throw new Error(`Collection name must be a non-empty string of at most ${MAX_COLLECTION_NAME_LENGTH} characters`);
  return value.trim();
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
  const createdAt =
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
      ? value.createdAt
      : new Date().toISOString();
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
  let totalPublicationIds = 0;
  const collections = value.collections.map((collection, index) => {
    const parsed = validCollection(collection, index);
    if (ids.has(parsed.id)) throw new Error("Collections store contains duplicate collection ids");
    ids.add(parsed.id);
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
    .filter((name) => name.startsWith("collections.staging-") && name.endsWith(".json"))
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

export const saveCollections = async (
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
  const temporaryPath = join(backupDirectory, `collections.staging-${process.pid}-${Date.now()}.json`);
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  try {
    await writeFile(targetPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort atomic write fallback on Windows is a direct overwrite.
  }
  await trimCollectionBackups(backupDirectory, 15);
  return store.collections;
};

export const createCollection = async (
  workingDirectory: string,
  name: string,
  publicationIds: readonly string[] = [],
): Promise<UserCollection> => {
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
  await saveCollections(workingDirectory, [...existing, collection]);
  return collection;
};

export const updateCollection = async (
  workingDirectory: string,
  id: string,
  changes: {name?: string; publicationIds?: readonly string[]; color?: string},
): Promise<UserCollection> => {
  const existing = await loadCollections(workingDirectory);
  const current = existing.find((collection) => collection.id === id);
  if (!current) throw new Error("Collection not found");
  const nextName = changes.name?.trim() ?? current.name;
  if (
    nextName.toLowerCase() !== current.name.toLowerCase() &&
    existing.some(
      (collection) => collection.id !== current.id && collection.name.toLowerCase() === nextName.toLowerCase(),
    )
  )
    throw new Error(`A collection named "${nextName}" already exists`);
  const nextPublicationIds =
    changes.publicationIds !== undefined ? [...new Set(changes.publicationIds)] : current.publicationIds;
  const updated: UserCollection = {
    ...current,
    name: nextName,
    publicationIds: nextPublicationIds,
    ...(changes.color ? {color: changes.color} : {}),
  };
  const nextCollections = existing.map((collection) => (collection.id === id ? updated : collection));
  await saveCollections(workingDirectory, nextCollections);
  return updated;
};

export const deleteCollection = async (workingDirectory: string, id: string): Promise<void> => {
  const existing = await loadCollections(workingDirectory);
  const nextCollections = existing.filter((collection) => collection.id !== id);
  if (nextCollections.length === existing.length) throw new Error("Collection not found");
  await saveCollections(workingDirectory, nextCollections);
};

export const addPublicationToCollection = async (
  workingDirectory: string,
  collectionId: string,
  publicationId: string,
): Promise<UserCollection> => {
  const existing = await loadCollections(workingDirectory);
  const collection = existing.find((candidate) => candidate.id === collectionId);
  if (!collection) throw new Error("Collection not found");
  if (collection.publicationIds.includes(publicationId)) return collection;
  return updateCollection(workingDirectory, collectionId, {
    publicationIds: [...collection.publicationIds, publicationId],
  });
};
