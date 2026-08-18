import {
  LIBRARY_BLACKLIST_ENDPOINT,
  LIBRARY_CONFIG_ENDPOINT,
  LIBRARY_BROWSE_ENDPOINT,
  LIBRARY_FETCH_MORE_ENDPOINT,
  LIBRARY_PASTE_RESOLVE_ENDPOINT,
  LIBRARY_PROVIDERS_ENDPOINT,
  LIBRARY_ROOT_ENROLL_ENDPOINT,
  LIBRARY_SCAN_ENDPOINT,
  LIBRARY_SOURCE_STATUS_ENDPOINT,
  LIBRARY_STATUS_ENDPOINT,
  MAX_LIBRARY_OPERATION_RESPONSE_BYTES,
  parseLibraryBlacklistHttpResponse,
  parseLibraryBlacklistListHttpResponse,
  parseLibraryOperationStartHttpResponse,
  parseLibraryPasteResolveHttpResponse,
  parseLibraryProvidersHttpResponse,
  parseLibrarySourceStatusHttpResponse,
  parseLibraryOperationStatusHttpResponse,
  type LibraryBlacklistRequest,
  type LibraryFetchMoreRequest,
  type LibraryOperationHttpFailure,
  type LibraryPasteImportMatch,
  type LibraryScanRequest,
  type LibrarySnapshotOperation,
} from "~/content/libraryUpdate/httpProtocol";
import type {LibraryProviderDescriptor} from "~/content/providers/types";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";

export type LibraryOperationFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

export class BrowserLibraryOperationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "BrowserLibraryOperationError";
    this.code = code;
    this.status = status;
  }
}

export type LocalLibrarySnapshotResult = {
  addedCount: number;
  publicationCount: number;
  removedCount: number;
  snapshotId: string;
  unchangedCount: number;
  updatedCount: number;
};

export type LocalLibraryJob = {
  jobId: string;
  operation: LibrarySnapshotOperation;
};

export type LocalLibraryBlacklistResult = {
  added: boolean;
  blacklistedCount: number;
  publicationId: string;
};

type LocalLibraryOperationStatusBase = {
  completedSteps: number;
  jobId: string;
  message: string;
  operation: LibrarySnapshotOperation;
  totalSteps: number;
};

export type LocalLibraryOperationStatus =
  | (LocalLibraryOperationStatusBase & {state: "running"})
  | (LocalLibraryOperationStatusBase & {
      result: LocalLibrarySnapshotResult;
      state: "succeeded";
    })
  | (LocalLibraryOperationStatusBase & {
      error: {code: string; message: string};
      state: "failed";
    });

const requestJson = async (
  endpoint: string,
  init: RequestInit,
  fetcher: LibraryOperationFetch,
) => {
  const response = await fetcher(endpoint, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const text = await response.text();
  if (text.length > MAX_LIBRARY_OPERATION_RESPONSE_BYTES)
    throw new BrowserLibraryOperationError(
      "The library operation response was too large",
      "invalid_response",
      response.status,
    );
  try {
    return {response, value: JSON.parse(text) as unknown};
  } catch {
    const routeUnavailable = /^\s*(?:<!doctype\s+html|<html\b)/iu.test(text);
    throw new BrowserLibraryOperationError(
      routeUnavailable
        ? "The library API route is unavailable. Restart the Afterleaf dev server to load the updated Vite middleware."
        : "The library operation server returned invalid JSON",
      "invalid_response",
      response.status,
    );
  }
};

const throwResponseError = (
  response: Pick<Response, "ok" | "status">,
  result: LibraryOperationHttpFailure | {ok: true},
) => {
  if (response.ok && result.ok) return;
  const error = result.ok
    ? {
        code: "http_error",
        message: `Library operation failed with HTTP ${response.status}`,
      }
    : result.error;
  throw new BrowserLibraryOperationError(
    error.message,
    error.code,
    response.status,
  );
};

const requestSnapshotOperation = async (
  endpoint: string,
  operation: LibrarySnapshotOperation,
  body: unknown,
  fetcher: LibraryOperationFetch,
): Promise<LocalLibraryJob> => {
  const {response, value} = await requestJson(
    endpoint,
    {
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"},
      method: "POST",
    },
    fetcher,
  );
  let result;
  try {
    result = parseLibraryOperationStartHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library operation server returned an invalid response",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  if (!result.ok || result.operation !== operation)
    throw new BrowserLibraryOperationError(
      "The library operation server returned the wrong operation",
      "invalid_response",
      response.status,
    );
  return {
    jobId: result.jobId,
    operation: result.operation,
  };
};

export const scanLocalLibrary = (
  optionsOrFetcher: LibraryScanRequest | LibraryOperationFetch = {},
  fetcher: LibraryOperationFetch = fetch,
) => {
  const options =
    typeof optionsOrFetcher === "function" ? {} : optionsOrFetcher;
  const requestFetcher =
    typeof optionsOrFetcher === "function" ? optionsOrFetcher : fetcher;
  return requestSnapshotOperation(
    LIBRARY_SCAN_ENDPOINT,
    "scan",
    options,
    requestFetcher,
  );
};

export const loadLibraryOperationStatus = async (
  jobId: string,
  fetcher: LibraryOperationFetch = fetch,
): Promise<LocalLibraryOperationStatus> => {
  const {response, value} = await requestJson(
    `${LIBRARY_STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`,
    {method: "GET"},
    fetcher,
  );
  let result;
  try {
    result = parseLibraryOperationStatusHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library operation server returned an invalid status",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  if (!result.ok)
    throw new BrowserLibraryOperationError(
      "The library operation failed",
      "operation_failed",
      response.status,
    );
  if (result.jobId !== jobId)
    throw new BrowserLibraryOperationError(
      "The library operation server returned the wrong job",
      "invalid_response",
      response.status,
    );
  const {completedSteps, message, operation, totalSteps} = result;
  const base: LocalLibraryOperationStatusBase = {
    completedSteps,
    jobId: result.jobId,
    message,
    operation,
    totalSteps,
  };
  if (result.state === "running") return {...base, state: "running"};
  if (result.state === "failed")
    return {...base, error: result.error, state: "failed"};
  return {
    ...base,
    result: {
      addedCount: result.result.changes.addedCount,
      publicationCount: result.result.snapshot.publicationCount,
      removedCount: result.result.changes.removedCount,
      snapshotId: result.result.snapshot.snapshotId,
      unchangedCount: result.result.changes.unchangedCount,
      updatedCount: result.result.changes.updatedCount,
    },
    state: "succeeded",
  };
};

export const fetchMorePublications = (
  request: LibraryFetchMoreRequest,
  fetcher: LibraryOperationFetch = fetch,
) =>
  requestSnapshotOperation(
    LIBRARY_FETCH_MORE_ENDPOINT,
    "fetch-more",
    request,
    fetcher,
  );

export const resolvePastedLibraryImport = async (
  text: string,
  fetcher: LibraryOperationFetch = fetch,
): Promise<LibraryPasteImportMatch | undefined> => {
  const {response, value} = await requestJson(
    LIBRARY_PASTE_RESOLVE_ENDPOINT,
    {
      body: JSON.stringify({text}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
    },
    fetcher,
  );
  let result;
  try {
    result = parseLibraryPasteResolveHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library provider returned an invalid paste match",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  return result.ok ? result.match : undefined;
};

export const loadLibraryProviders = async (
  fetcher: LibraryOperationFetch = fetch,
): Promise<readonly LibraryProviderDescriptor[]> => {
  const {response, value} = await requestJson(
    LIBRARY_PROVIDERS_ENDPOINT,
    {method: "GET"},
    fetcher,
  );
  let result;
  try {
    result = parseLibraryProvidersHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library provider server returned an invalid response",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  if (!result.ok) return [];
  return result.providers;
};

export const loadLibrarySourceStatus = async (
  fetcher: LibraryOperationFetch = fetch,
) => {
  const {response, value} = await requestJson(
    LIBRARY_SOURCE_STATUS_ENDPOINT,
    {method: "GET"},
    fetcher,
  );
  let result;
  try {
    result = parseLibrarySourceStatusHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library source server returned an invalid response",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  return {
    reenrollableBookPaths: result.ok ? result.reenrollableBookPaths : [],
    unavailableBookPathCount: result.ok ? result.unavailableBookPathCount : 0,
  };
};

export const blacklistPublication = async (
  request: LibraryBlacklistRequest,
  fetcher: LibraryOperationFetch = fetch,
): Promise<LocalLibraryBlacklistResult> => {
  const {response, value} = await requestJson(
    LIBRARY_BLACKLIST_ENDPOINT,
    {
      body: JSON.stringify(request),
      headers: {"Content-Type": "application/json"},
      method: "POST",
    },
    fetcher,
  );
  let result;
  try {
    result = parseLibraryBlacklistHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library operation server returned an invalid response",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  if (!result.ok)
    throw new BrowserLibraryOperationError(
      "The library operation failed",
      "operation_failed",
      response.status,
    );
  const {added, blacklistedCount, publicationId} = result;
  return {added, blacklistedCount, publicationId};
};

export const loadBlacklistedPublications = async (
  fetcher: LibraryOperationFetch = fetch,
): Promise<readonly string[]> => {
  const {response, value} = await requestJson(
    LIBRARY_BLACKLIST_ENDPOINT,
    {method: "GET"},
    fetcher,
  );
  let result;
  try {
    result = parseLibraryBlacklistListHttpResponse(value);
  } catch {
    throw new BrowserLibraryOperationError(
      "The library operation server returned an invalid response",
      "invalid_response",
      response.status,
    );
  }
  throwResponseError(response, result);
  if (!result.ok)
    throw new BrowserLibraryOperationError(
      "The library operation failed",
      "operation_failed",
      response.status,
    );
  return result.publicationIds;
};

export const loadLibraryConfig = async (
  fetcher: LibraryOperationFetch = fetch,
): Promise<AfterleafLibraryConfig> => {
  const {response, value} = await requestJson(
    LIBRARY_CONFIG_ENDPOINT,
    {method: "GET"},
    fetcher,
  );
  if (
    !response.ok ||
    !value ||
    typeof value !== "object" ||
    !("config" in value)
  )
    throw new BrowserLibraryOperationError(
      "Could not load library locations",
      "config_failed",
      response.status,
    );
  return (value as {config: AfterleafLibraryConfig}).config;
};

export const saveLibraryConfig = async (
  config: AfterleafLibraryConfig,
  fetcher: LibraryOperationFetch = fetch,
): Promise<AfterleafLibraryConfig> => {
  const {response, value} = await requestJson(
    LIBRARY_CONFIG_ENDPOINT,
    {
      body: JSON.stringify({config}),
      headers: {"Content-Type": "application/json"},
      method: "PUT",
    },
    fetcher,
  );
  if (
    !response.ok ||
    !value ||
    typeof value !== "object" ||
    !("config" in value)
  )
    throw new BrowserLibraryOperationError(
      "Could not save library locations",
      "config_failed",
      response.status,
    );
  return (value as {config: AfterleafLibraryConfig}).config;
};

export const reenrollLibraryRoot = async (
  path: string,
  fetcher: LibraryOperationFetch = fetch,
) => {
  const {response, value} = await requestJson(
    LIBRARY_ROOT_ENROLL_ENDPOINT,
    {
      body: JSON.stringify({path}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
    },
    fetcher,
  );
  if (
    !response.ok ||
    !value ||
    typeof value !== "object" ||
    !("ok" in value) ||
    value.ok !== true
  )
    throw new BrowserLibraryOperationError(
      "Could not re-enroll library root",
      "config_failed",
      response.status,
    );
};

export type LibraryDirectoryEntry = {name: string; path: string};
export type LibraryDirectoryListing = {
  drives: readonly LibraryDirectoryEntry[];
  entries: readonly LibraryDirectoryEntry[];
  parent?: string;
  path: string;
};

export const browseLibraryLocation = async (
  directory?: string,
  fetcher: LibraryOperationFetch = fetch,
): Promise<LibraryDirectoryListing> => {
  const endpoint = directory
    ? `${LIBRARY_BROWSE_ENDPOINT}?path=${encodeURIComponent(directory)}`
    : LIBRARY_BROWSE_ENDPOINT;
  const {response, value} = await requestJson(
    endpoint,
    {method: "GET"},
    fetcher,
  );
  if (
    !response.ok ||
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as {entries?: unknown}).entries)
  )
    throw new BrowserLibraryOperationError(
      "Could not browse that folder",
      "browse_failed",
      response.status,
    );
  const listing = value as {
    drives?: LibraryDirectoryEntry[];
    entries: LibraryDirectoryEntry[];
    parent?: string;
    path: string;
  };
  return {...listing, drives: listing.drives ?? []};
};
