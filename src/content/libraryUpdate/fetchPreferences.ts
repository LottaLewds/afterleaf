import {
  DEFAULT_LIBRARY_FETCH_LIMIT,
  DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
  MAX_LIBRARY_FETCH_LIMIT,
  MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  MIN_LIBRARY_FETCH_LIMIT,
  MIN_LIBRARY_SEARCH_PAGE_LIMIT,
} from "~/content/libraryUpdate/httpProtocol";

export const LIBRARY_FETCH_PREFERENCES_STORAGE_KEY =
  "afterleaf-library-fetch-preferences-v1";

export type LibraryFetchPreferences = {
  limit: number;
  maxSearchPages: number;
};

export const normalizeLibraryFetchLimit = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_LIBRARY_FETCH_LIMIT;
  return Math.min(
    Math.max(Math.round(value), MIN_LIBRARY_FETCH_LIMIT),
    MAX_LIBRARY_FETCH_LIMIT,
  );
};

export const normalizeLibrarySearchPageLimit = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT;
  return Math.min(
    Math.max(Math.round(value), MIN_LIBRARY_SEARCH_PAGE_LIMIT),
    MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  );
};

const defaultLibraryFetchPreferences = (): LibraryFetchPreferences => ({
  limit: DEFAULT_LIBRARY_FETCH_LIMIT,
  maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
});

const parseLibraryFetchPreferences = (
  value: unknown,
): LibraryFetchPreferences | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  const preferences = value as Partial<LibraryFetchPreferences>;
  if (typeof preferences.limit !== "number") return;
  return {
    limit: normalizeLibraryFetchLimit(preferences.limit),
    maxSearchPages:
      typeof preferences.maxSearchPages === "number"
        ? normalizeLibrarySearchPageLimit(preferences.maxSearchPages)
        : DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
  };
};

export const loadLibraryFetchPreferences = (
  storage: Pick<Storage, "getItem"> = localStorage,
): LibraryFetchPreferences => {
  try {
    const stored = storage.getItem(LIBRARY_FETCH_PREFERENCES_STORAGE_KEY);
    if (!stored) return defaultLibraryFetchPreferences();
    return (
      parseLibraryFetchPreferences(JSON.parse(stored) as unknown) ??
      defaultLibraryFetchPreferences()
    );
  } catch {
    return defaultLibraryFetchPreferences();
  }
};

export const saveLibraryFetchPreferences = (
  preferences: LibraryFetchPreferences,
  storage: Pick<Storage, "setItem"> = localStorage,
) => {
  const normalizedPreferences = {
    limit: normalizeLibraryFetchLimit(preferences.limit),
    maxSearchPages: normalizeLibrarySearchPageLimit(preferences.maxSearchPages),
  };
  try {
    storage.setItem(
      LIBRARY_FETCH_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizedPreferences),
    );
  } catch {
    // The selected batch size remains usable for this session.
  }
  return normalizedPreferences;
};
