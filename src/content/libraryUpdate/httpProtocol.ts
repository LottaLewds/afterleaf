import type {LibraryProviderDescriptor} from "../providers/types";
import {parseLibraryProviderDescriptor} from "../providers/manifest";

export const LIBRARY_SCAN_ENDPOINT = "/api/library/scan";
export const LIBRARY_FETCH_MORE_ENDPOINT = "/api/library/fetch-more";
export const LIBRARY_PROVIDERS_ENDPOINT = "/api/library/providers";
export const LIBRARY_PASTE_RESOLVE_ENDPOINT = "/api/library/resolve-paste";
export const LIBRARY_BLACKLIST_ENDPOINT = "/api/library/blacklist";
export const LIBRARY_STATUS_ENDPOINT = "/api/library/status";
export const LIBRARY_SOURCE_STATUS_ENDPOINT = "/api/library/source-status";
export const LIBRARY_CONFIG_ENDPOINT = "/api/library/config";
export const LIBRARY_ROOT_ENROLL_ENDPOINT = "/api/library/root-enroll";
export const LIBRARY_BROWSE_ENDPOINT = "/api/library/browse";
export const LIBRARY_ROMS_ENDPOINT = "/api/library/roms";
export const LIBRARY_ROM_FILE_ENDPOINT = "/api/library/roms/file";
export const LIBRARY_COLLECTIONS_ENDPOINT = "/api/library/collections";
export const MAX_LIBRARY_OPERATION_BODY_BYTES = 64 * 1_024;
export const MAX_LIBRARY_OPERATION_RESPONSE_BYTES = 1024 * 1_024;
export const DEFAULT_LIBRARY_FETCH_LIMIT = 20;
export const MIN_LIBRARY_FETCH_LIMIT = 1;
export const MAX_LIBRARY_FETCH_LIMIT = 100;
export const DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT = 10;
export const MIN_LIBRARY_SEARCH_PAGE_LIMIT = 1;
export const MAX_LIBRARY_SEARCH_PAGE_LIMIT = 100;

const MAX_BLACKLIST_COUNT = 2_000;
const MAX_PASTED_TEXT_LENGTH = 16_384;
const MAX_BLOCKED_TAG_COUNT = 100;
const MAX_BLOCKED_TAG_LENGTH = 100;
const MAX_RESPONSE_STRING_LENGTH = 2_048;
const MAX_COLLECTION_COUNT = 200;
const MAX_COLLECTION_NAME_LENGTH = 100;
const MAX_PUBLICATION_IDS_PER_COLLECTION = 10_000;
const MAX_TOTAL_COLLECTION_PUBLICATION_IDS = 100_000;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const COLLECTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PUBLICATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,199}$/u;
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;

export type LibrarySnapshotOperation = "fetch-more" | "scan";

export type LibraryScanRequest = {
  redownloadProviderAssets?: boolean;
  repair?: boolean;
  repairProviderMetadata?: boolean;
};

export type LibraryFetchMoreRequest = {
  blockedTags?: readonly string[];
  limit?: number;
  maxSearchPages?: number;
  providerId?: string;
  query?: string;
};

export type LibraryBlacklistRequest = {
  publicationId: string;
};

export type LibraryPasteResolveRequest = {
  text: string;
};

export type LibraryPasteImportMatch = {
  providerId: string;
  publicationId?: string;
  query: string;
};

export type LibraryPasteResolveHttpSuccess = {
  match?: LibraryPasteImportMatch;
  ok: true;
};

export type LibrarySnapshotHttpSuccess = {
  changes: {
    addedCount: number;
    removedCount: number;
    unchangedCount: number;
    updatedCount: number;
  };
  ok: true;
  operation: LibrarySnapshotOperation;
  snapshot: {
    catalogContentHash: string;
    packId: string;
    publicationCount: number;
    snapshotId: string;
  };
};

export type LibraryBlacklistHttpSuccess = {
  added: boolean;
  blacklistedCount: number;
  ok: true;
  publicationId: string;
};

export type LibraryBlacklistListHttpSuccess = {
  ok: true;
  publicationIds: readonly string[];
};

export type LibraryCollection = {
  id: string;
  name: string;
  createdAt: string;
  publicationIds: readonly string[];
  color?: string;
};

export type LibraryCollectionsListHttpSuccess = {
  collections: readonly LibraryCollection[];
  ok: true;
};

export type LibraryCollectionCreateHttpSuccess = {
  collection: LibraryCollection;
  ok: true;
};

export type LibraryCollectionUpdateHttpSuccess = {
  collection: LibraryCollection;
  ok: true;
};

export type LibraryCollectionDeleteHttpSuccess = {
  ok: true;
};

export type LibraryCollectionsHttpResponse =
  | LibraryCollectionsListHttpSuccess
  | LibraryCollectionCreateHttpSuccess
  | LibraryCollectionUpdateHttpSuccess
  | LibraryCollectionDeleteHttpSuccess
  | LibraryOperationHttpFailure;

export type LibraryOperationHttpFailure = {
  error: {
    code: string;
    message: string;
  };
  ok: false;
};

export type LibraryOperationStartHttpSuccess = {
  jobId: string;
  ok: true;
  operation: LibrarySnapshotOperation;
  state: "running";
};

type LibraryOperationStatusBase = {
  completedSteps: number;
  jobId: string;
  message: string;
  ok: true;
  operation: LibrarySnapshotOperation;
  subProgress?: {completed: number; total: number};
  totalSteps: number;
};

export type LibraryOperationStatusHttpSuccess =
  | (LibraryOperationStatusBase & {state: "running"})
  | (LibraryOperationStatusBase & {
      result: LibrarySnapshotHttpSuccess;
      state: "succeeded";
    })
  | (LibraryOperationStatusBase & {
      error: LibraryOperationHttpFailure["error"];
      state: "failed";
    });

export type LibraryOperationHttpResponse =
  | LibraryBlacklistHttpSuccess
  | LibraryBlacklistListHttpSuccess
  | LibraryOperationHttpFailure
  | LibraryOperationStartHttpSuccess
  | LibraryOperationStatusHttpSuccess
  | LibraryPasteResolveHttpSuccess
  | LibraryProvidersHttpSuccess
  | LibraryRomsHttpSuccess
  | LibrarySourceStatusHttpSuccess
  | LibrarySnapshotHttpSuccess;

/** Success payload of the per-system ROM folder listing endpoint. */
export type LibraryRomsHttpSuccess = {
  ok: true;
  path: string;
  roms: readonly {name: string; sizeBytes: number}[];
};

export type LibraryProvidersHttpSuccess = {
  ok: true;
  providers: readonly LibraryProviderDescriptor[];
};

export type LibraryProvidersHttpResponse = LibraryOperationHttpFailure | LibraryProvidersHttpSuccess;

export type LibraryPasteResolveHttpResponse = LibraryOperationHttpFailure | LibraryPasteResolveHttpSuccess;

export type LibrarySourceStatusHttpSuccess = {
  ok: true;
  reenrollableBookPaths: readonly string[];
  unavailableBookPathCount: number;
};

export type LibrarySourceStatusHttpResponse = LibraryOperationHttpFailure | LibrarySourceStatusHttpSuccess;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireExactKeys = (value: unknown, expectedKeys: readonly string[], operation: string) => {
  if (!isRecord(value)) throw new Error(`Library ${operation} request must be an object`);
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  )
    throw new Error(`Library ${operation} request contains unsupported fields`);
  return value;
};

const boundedString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_RESPONSE_STRING_LENGTH)
    throw new Error(`${field} must be a non-empty bounded string`);
  return value;
};

const publicationId = (value: unknown, field = "publicationId") => {
  if (typeof value !== "string" || !PUBLICATION_ID_PATTERN.test(value))
    throw new Error(`${field} must be a portable publication identifier`);
  return value;
};

const providerId = (value: unknown) => {
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value))
    throw new Error("providerId must be a portable provider identifier");
  return value;
};

export const parseLibraryJobId = (value: unknown) => {
  if (typeof value !== "string" || !JOB_ID_PATTERN.test(value)) throw new Error("jobId must be a UUID");
  return value;
};

const nonNegativeInteger = (value: unknown, field: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error(`${field} must be a non-negative safe integer`);
  return Number(value);
};

const parseFailure = (value: Record<string, unknown>): LibraryOperationHttpFailure | undefined => {
  if (value.ok !== false) return;
  if (!isRecord(value.error)) throw new Error("Library operation error response is malformed");
  return {
    error: {
      code: boundedString(value.error.code, "error.code"),
      message: boundedString(value.error.message, "error.message"),
    },
    ok: false,
  };
};

export const parseLibraryScanRequest = (value: unknown): LibraryScanRequest => {
  if (!isRecord(value)) throw new Error("Library scan request must be an object");
  const expectedKeys = [
    ...(value.redownloadProviderAssets === undefined ? [] : ["redownloadProviderAssets"]),
    ...(value.repair === undefined ? [] : ["repair"]),
    ...(value.repairProviderMetadata === undefined ? [] : ["repairProviderMetadata"]),
  ];
  const request = requireExactKeys(value, expectedKeys, "scan");
  const parseFlag = (field: string): boolean | undefined => {
    const flag = request[field];
    if (flag === undefined) return undefined;
    if (typeof flag !== "boolean") throw new Error(`Library scan ${field} must be a boolean`);
    return flag;
  };
  const redownloadProviderAssets = parseFlag("redownloadProviderAssets");
  const repair = parseFlag("repair");
  const repairProviderMetadata = parseFlag("repairProviderMetadata");
  if (repair !== true && (repairProviderMetadata === true || redownloadProviderAssets === true))
    throw new Error("Remote repair options require a deep repair scan");
  return {
    ...(redownloadProviderAssets === undefined ? {} : {redownloadProviderAssets}),
    ...(repair === undefined ? {} : {repair}),
    ...(repairProviderMetadata === undefined ? {} : {repairProviderMetadata}),
  };
};

export const parseLibraryPasteResolveRequest = (value: unknown): LibraryPasteResolveRequest => {
  const request = requireExactKeys(value, ["text"], "resolve-paste");
  if (typeof request.text !== "string" || request.text.length === 0 || request.text.length > MAX_PASTED_TEXT_LENGTH)
    throw new Error("Pasted text must be a non-empty bounded string");
  return {text: request.text};
};

export const parseLibraryFetchMoreRequest = (value: unknown): LibraryFetchMoreRequest => {
  if (!isRecord(value)) throw new Error("Library fetch-more request must be an object");
  const expectedKeys = [
    ...(value.blockedTags === undefined ? [] : ["blockedTags"]),
    ...(value.limit === undefined ? [] : ["limit"]),
    ...(value.maxSearchPages === undefined ? [] : ["maxSearchPages"]),
    ...(value.providerId === undefined ? [] : ["providerId"]),
    ...(value.query === undefined ? [] : ["query"]),
  ];
  const request = requireExactKeys(value, expectedKeys, "fetch-more");
  const blockedTags = request.blockedTags;
  if (
    blockedTags !== undefined &&
    (!Array.isArray(blockedTags) ||
      blockedTags.length > MAX_BLOCKED_TAG_COUNT ||
      !blockedTags.every(
        (tag) =>
          typeof tag === "string" && tag.length > 0 && tag.length <= MAX_BLOCKED_TAG_LENGTH && !/[\p{Cc}]/u.test(tag),
      ))
  )
    throw new Error(`blockedTags must contain at most ${MAX_BLOCKED_TAG_COUNT} bounded tags`);
  const limit = request.limit;
  if (
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || Number(limit) < MIN_LIBRARY_FETCH_LIMIT || Number(limit) > MAX_LIBRARY_FETCH_LIMIT)
  )
    throw new Error(`limit must be an integer from ${MIN_LIBRARY_FETCH_LIMIT} to ${MAX_LIBRARY_FETCH_LIMIT}`);
  const maxSearchPages = request.maxSearchPages;
  if (
    maxSearchPages !== undefined &&
    (!Number.isSafeInteger(maxSearchPages) ||
      Number(maxSearchPages) < MIN_LIBRARY_SEARCH_PAGE_LIMIT ||
      Number(maxSearchPages) > MAX_LIBRARY_SEARCH_PAGE_LIMIT)
  )
    throw new Error(
      `maxSearchPages must be an integer from ${MIN_LIBRARY_SEARCH_PAGE_LIMIT} to ${MAX_LIBRARY_SEARCH_PAGE_LIMIT}`,
    );
  const query = typeof request.query === "string" ? request.query.trim() : undefined;
  if (query !== undefined && (query.length === 0 || query.length > 100 || /[\p{Cc}]/u.test(query)))
    throw new Error("query must be a non-empty bounded query");
  const normalizedProviderId = request.providerId === undefined ? undefined : providerId(request.providerId);
  return {
    ...(blockedTags === undefined ? {} : {blockedTags: [...blockedTags]}),
    ...(limit === undefined ? {} : {limit: Number(limit)}),
    ...(maxSearchPages === undefined ? {} : {maxSearchPages: Number(maxSearchPages)}),
    ...(normalizedProviderId === undefined ? {} : {providerId: normalizedProviderId}),
    ...(query === undefined ? {} : {query}),
  };
};

export const parseLibraryProvidersHttpResponse = (value: unknown): LibraryProvidersHttpResponse => {
  if (!isRecord(value)) throw new Error("Library providers response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || !Array.isArray(value.providers)) throw new Error("Library providers response is malformed");
  return {
    ok: true,
    providers: value.providers.map((provider, index) =>
      parseLibraryProviderDescriptor(provider, `providers[${index}]`),
    ),
  };
};

export const parseLibraryPasteResolveHttpResponse = (value: unknown): LibraryPasteResolveHttpResponse => {
  if (!isRecord(value)) throw new Error("Library paste resolution response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true) throw new Error("Library paste resolution response is malformed");
  if (value.match === undefined) return {ok: true};
  if (!isRecord(value.match)) throw new Error("Library paste resolution match must be an object");
  const match = value.match;
  const query = typeof match.query === "string" ? match.query.trim() : "";
  if (!query || query.length > 100 || /[\p{Cc}]/u.test(query))
    throw new Error("Library paste resolution query is invalid");
  return {
    match: {
      providerId: providerId(match.providerId),
      ...(match.publicationId === undefined ? {} : {publicationId: publicationId(match.publicationId)}),
      query,
    },
    ok: true,
  };
};

export const parseLibrarySourceStatusHttpResponse = (value: unknown): LibrarySourceStatusHttpResponse => {
  if (!isRecord(value)) throw new Error("Library source-status response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true) throw new Error("Library source-status response is malformed");
  if (
    !Array.isArray(value.reenrollableBookPaths) ||
    !value.reenrollableBookPaths.every((path) => typeof path === "string" && path.length > 0)
  )
    throw new Error("Library source-status reenrollableBookPaths must be an array of paths");
  return {
    ok: true,
    reenrollableBookPaths: value.reenrollableBookPaths,
    unavailableBookPathCount: nonNegativeInteger(value.unavailableBookPathCount, "unavailableBookPathCount"),
  };
};

export const parseLibraryBlacklistRequest = (value: unknown): LibraryBlacklistRequest => {
  const request = requireExactKeys(value, ["publicationId"], "blacklist");
  return {publicationId: publicationId(request.publicationId)};
};

export const parseLibrarySnapshotHttpResponse = (
  value: unknown,
): LibraryOperationHttpFailure | LibrarySnapshotHttpSuccess => {
  if (!isRecord(value)) throw new Error("Library snapshot response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (
    value.ok !== true ||
    !isRecord(value.snapshot) ||
    !isRecord(value.changes) ||
    (value.operation !== "scan" && value.operation !== "fetch-more")
  )
    throw new Error("Library snapshot success response is malformed");
  return {
    changes: {
      addedCount: nonNegativeInteger(value.changes.addedCount, "changes.addedCount"),
      removedCount: nonNegativeInteger(value.changes.removedCount, "changes.removedCount"),
      unchangedCount: nonNegativeInteger(value.changes.unchangedCount, "changes.unchangedCount"),
      updatedCount: nonNegativeInteger(value.changes.updatedCount, "changes.updatedCount"),
    },
    ok: true,
    operation: value.operation,
    snapshot: {
      catalogContentHash: boundedString(value.snapshot.catalogContentHash, "snapshot.catalogContentHash"),
      packId: boundedString(value.snapshot.packId, "snapshot.packId"),
      publicationCount: nonNegativeInteger(value.snapshot.publicationCount, "snapshot.publicationCount"),
      snapshotId: boundedString(value.snapshot.snapshotId, "snapshot.snapshotId"),
    },
  };
};

export const parseLibraryOperationStartHttpResponse = (
  value: unknown,
): LibraryOperationStartHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library operation-start response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (
    value.ok !== true ||
    value.state !== "running" ||
    (value.operation !== "scan" && value.operation !== "fetch-more")
  )
    throw new Error("Library operation-start response is malformed");
  return {
    jobId: parseLibraryJobId(value.jobId),
    ok: true,
    operation: value.operation,
    state: "running",
  };
};

export const parseLibraryOperationStatusHttpResponse = (
  value: unknown,
): LibraryOperationStatusHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library operation-status response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (
    value.ok !== true ||
    (value.state !== "running" && value.state !== "succeeded" && value.state !== "failed") ||
    (value.operation !== "scan" && value.operation !== "fetch-more")
  )
    throw new Error("Library operation-status response is malformed");
  const completedSteps = nonNegativeInteger(value.completedSteps, "completedSteps");
  const totalSteps = nonNegativeInteger(value.totalSteps, "totalSteps");
  if (completedSteps > totalSteps) throw new Error("completedSteps cannot exceed totalSteps");
  let subProgress: LibraryOperationStatusBase["subProgress"];
  if (value.subProgress !== undefined) {
    if (!isRecord(value.subProgress)) throw new Error("subProgress must be an object");
    const subCompleted = nonNegativeInteger(value.subProgress.completed, "subProgress.completed");
    const subTotal = nonNegativeInteger(value.subProgress.total, "subProgress.total");
    if (subTotal <= 0) throw new Error("subProgress.total must be a positive integer");
    if (subCompleted > subTotal) throw new Error("subProgress.completed cannot exceed subProgress.total");
    subProgress = {completed: subCompleted, total: subTotal};
  }
  const base: LibraryOperationStatusBase = {
    completedSteps,
    jobId: parseLibraryJobId(value.jobId),
    message: boundedString(value.message, "message"),
    ok: true,
    operation: value.operation,
    ...(subProgress === undefined ? {} : {subProgress}),
    totalSteps,
  };
  if (value.state === "running") return {...base, state: "running"};
  if (value.state === "failed") {
    if (!isRecord(value.error)) throw new Error("Library operation failed status is malformed");
    return {
      ...base,
      error: {
        code: boundedString(value.error.code, "error.code"),
        message: boundedString(value.error.message, "error.message"),
      },
      state: "failed",
    };
  }
  const result = parseLibrarySnapshotHttpResponse(value.result);
  if (!result.ok || result.operation !== value.operation)
    throw new Error("Library operation succeeded status is malformed");
  return {...base, result, state: "succeeded"};
};

export const parseLibraryBlacklistHttpResponse = (
  value: unknown,
): LibraryBlacklistHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library blacklist response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || typeof value.added !== "boolean")
    throw new Error("Library blacklist success response is malformed");
  return {
    added: value.added,
    blacklistedCount: nonNegativeInteger(value.blacklistedCount, "blacklistedCount"),
    ok: true,
    publicationId: publicationId(value.publicationId),
  };
};

export const parseLibraryBlacklistListHttpResponse = (
  value: unknown,
): LibraryBlacklistListHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library blacklist-list response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || !Array.isArray(value.publicationIds) || value.publicationIds.length > MAX_BLACKLIST_COUNT)
    throw new Error("Library blacklist-list success response is malformed");
  const publicationIds = value.publicationIds.map((id, index) => publicationId(id, `publicationIds[${index}]`));
  if (new Set(publicationIds).size !== publicationIds.length)
    throw new Error("Library blacklist-list response contains duplicate IDs");
  return {ok: true, publicationIds};
};

const collectionId = (value: unknown, field = "id") => {
  if (typeof value !== "string" || !COLLECTION_ID_PATTERN.test(value))
    throw new Error(`${field} must be a collection UUID`);
  return value.toLowerCase();
};

const collectionName = (value: unknown, field = "name") => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_COLLECTION_NAME_LENGTH)
    throw new Error(`${field} must be a non-empty string of at most ${MAX_COLLECTION_NAME_LENGTH} characters`);
  return value.trim();
};

const collectionCreatedAt = (value: unknown, field = "createdAt") => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error(`${field} must be a valid date`);
  return value;
};

const collectionColor = (value: unknown, field = "color") => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/u.test(value))
    throw new Error(`${field} must be a 6-digit hex color`);
  return value.toLowerCase();
};

const parseCollection = (value: unknown, index: number): LibraryCollection => {
  if (!isRecord(value)) throw new Error(`collections[${index}] must be an object`);
  const field = (name: string) => `collections[${index}].${name}`;
  const id = collectionId(value.id, field("id"));
  const name = collectionName(value.name, field("name"));
  const createdAt = collectionCreatedAt(value.createdAt, field("createdAt"));
  const color = collectionColor(value.color, field("color"));
  if (!Array.isArray(value.publicationIds)) throw new Error(`${field("publicationIds")} must be an array`);
  if (value.publicationIds.length > MAX_PUBLICATION_IDS_PER_COLLECTION)
    throw new Error(`${field("publicationIds")} must contain at most ${MAX_PUBLICATION_IDS_PER_COLLECTION} IDs`);
  const publicationIds = value.publicationIds.map((pid, pidIndex) =>
    publicationId(pid, `${field("publicationIds")}[${pidIndex}]`),
  );
  if (new Set(publicationIds).size !== publicationIds.length)
    throw new Error(`${field("publicationIds")} contains duplicates`);
  return {id, name, createdAt, publicationIds, ...(color === undefined ? {} : {color})};
};

export const parseLibraryCollectionsListHttpResponse = (
  value: unknown,
): LibraryCollectionsListHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library collections response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || !Array.isArray(value.collections))
    throw new Error("Library collections list response is malformed");
  if (value.collections.length > MAX_COLLECTION_COUNT)
    throw new Error(`Library collections list response supports at most ${MAX_COLLECTION_COUNT} collections`);
  const ids = new Set<string>();
  const names = new Set<string>();
  let totalPublicationIds = 0;
  const collections = value.collections.map(parseCollection);
  for (const collection of collections) {
    if (ids.has(collection.id)) throw new Error("Library collections list response contains duplicate IDs");
    if (names.has(collection.name.toLowerCase()))
      throw new Error("Library collections list response contains duplicate names");
    ids.add(collection.id);
    names.add(collection.name.toLowerCase());
    totalPublicationIds += collection.publicationIds.length;
  }
  if (totalPublicationIds > MAX_TOTAL_COLLECTION_PUBLICATION_IDS)
    throw new Error("Library collections list response contains too many publication IDs");
  return {collections, ok: true};
};

export const parseLibraryCollectionCreateHttpResponse = (
  value: unknown,
): LibraryCollectionCreateHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library collection create response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || !isRecord(value.collection))
    throw new Error("Library collection create response is malformed");
  return {collection: parseCollection(value.collection, 0), ok: true};
};

export const parseLibraryCollectionUpdateHttpResponse = (
  value: unknown,
): LibraryCollectionUpdateHttpSuccess | LibraryOperationHttpFailure => {
  if (!isRecord(value)) throw new Error("Library collection update response must be an object");
  const failure = parseFailure(value);
  if (failure) return failure;
  if (value.ok !== true || !isRecord(value.collection))
    throw new Error("Library collection update response is malformed");
  return {collection: parseCollection(value.collection, 0), ok: true};
};

export const parseLibraryCollectionRequest = (value: unknown): {name: string; publicationIds?: readonly string[]} => {
  if (!isRecord(value)) throw new Error("Library collection request must be an object");
  const name = collectionName(value.name, "name");
  if (value.publicationIds === undefined) return {name};
  if (!Array.isArray(value.publicationIds)) throw new Error("publicationIds must be an array");
  const publicationIds = value.publicationIds.map((pid, index) => publicationId(pid, `publicationIds[${index}]`));
  if (new Set(publicationIds).size !== publicationIds.length) throw new Error("publicationIds contains duplicates");
  return {name, publicationIds};
};

export const parseLibraryCollectionUpdateRequest = (
  value: unknown,
): {
  addPublicationIds?: readonly string[];
  color?: string;
  name?: string;
  publicationIds?: readonly string[];
  removePublicationIds?: readonly string[];
} => {
  if (!isRecord(value)) throw new Error("Library collection update request must be an object");
  const result: {
    addPublicationIds?: readonly string[];
    color?: string;
    name?: string;
    publicationIds?: readonly string[];
    removePublicationIds?: readonly string[];
  } = {};
  if (value.name !== undefined) result.name = collectionName(value.name, "name");
  if (value.color !== undefined) {
    const color = collectionColor(value.color, "color");
    if (color !== undefined) result.color = color;
  }
  if (value.publicationIds !== undefined) {
    if (!Array.isArray(value.publicationIds)) throw new Error("publicationIds must be an array");
    result.publicationIds = value.publicationIds.map((pid, index) => publicationId(pid, `publicationIds[${index}]`));
    if (new Set(result.publicationIds).size !== result.publicationIds.length)
      throw new Error("publicationIds contains duplicates");
  }
  for (const field of ["addPublicationIds", "removePublicationIds"] as const) {
    const valueForField = value[field];
    if (valueForField === undefined) continue;
    if (!Array.isArray(valueForField)) throw new Error(`${field} must be an array`);
    const ids = valueForField.map((pid, index) => publicationId(pid, `${field}[${index}]`));
    if (new Set(ids).size !== ids.length) throw new Error(`${field} contains duplicates`);
    result[field] = ids;
  }
  if (
    result.publicationIds !== undefined &&
    (result.addPublicationIds !== undefined || result.removePublicationIds !== undefined)
  )
    throw new Error("publicationIds cannot be combined with add or remove operations");
  return result;
};

/** Reduces a snapshot CLI's detailed result to the browser-visible contract. */
export const summarizeLibrarySnapshotResult = (
  value: unknown,
  operation: LibrarySnapshotOperation,
): LibrarySnapshotHttpSuccess => {
  if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.diff))
    throw new Error(`Library ${operation} command returned a malformed result`);
  const diff = value.diff;
  const arrayLength = (field: string) => {
    const entries = diff[field];
    if (!Array.isArray(entries)) throw new Error(`Library snapshot result diff.${field} must be an array`);
    return entries.length;
  };
  const result = parseLibrarySnapshotHttpResponse({
    changes: {
      addedCount: arrayLength("addedPublicationIds"),
      removedCount: arrayLength("removedPublicationIds"),
      unchangedCount: arrayLength("unchangedPublicationIds"),
      updatedCount: arrayLength("updatedPublicationIds"),
    },
    ok: true,
    operation,
    snapshot: value.snapshot,
  });
  if (!result.ok) throw new Error(`Library ${operation} command returned an error result`);
  return result;
};

export const summarizeLibraryBlacklistResult = (value: unknown): LibraryBlacklistHttpSuccess => {
  const result = parseLibraryBlacklistHttpResponse(isRecord(value) ? {...value, ok: true} : value);
  if (!result.ok) throw new Error("Library blacklist command returned an error result");
  return result;
};

export const summarizeLibraryBlacklistListResult = (value: unknown): LibraryBlacklistListHttpSuccess => {
  const result = parseLibraryBlacklistListHttpResponse(isRecord(value) ? {...value, ok: true} : value);
  if (!result.ok) throw new Error("Library blacklist-list command returned an error result");
  return result;
};

export const libraryOperationFailure = (code: string, message: string): LibraryOperationHttpFailure => ({
  error: {
    code: code.slice(0, MAX_RESPONSE_STRING_LENGTH) || "operation_failed",
    message: message.slice(0, MAX_RESPONSE_STRING_LENGTH) || "Library operation failed",
  },
  ok: false,
});
