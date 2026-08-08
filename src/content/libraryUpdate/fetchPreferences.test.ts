import {describe, expect, test} from "bun:test";

import {
  LIBRARY_FETCH_PREFERENCES_STORAGE_KEY,
  loadLibraryFetchPreferences,
  saveLibraryFetchPreferences,
} from "~/content/libraryUpdate/fetchPreferences";
import {
  DEFAULT_LIBRARY_FETCH_LIMIT,
  DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
  MAX_LIBRARY_FETCH_LIMIT,
  MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  MIN_LIBRARY_FETCH_LIMIT,
  MIN_LIBRARY_SEARCH_PAGE_LIMIT,
} from "~/content/libraryUpdate/httpProtocol";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
};

describe("library fetch preferences", () => {
  test("persists the selected acquisition and search limits", () => {
    const storage = memoryStorage();

    expect(
      saveLibraryFetchPreferences({limit: 35, maxSearchPages: 24}, storage),
    ).toEqual({
      limit: 35,
      maxSearchPages: 24,
    });
    expect(loadLibraryFetchPreferences(storage)).toEqual({
      limit: 35,
      maxSearchPages: 24,
    });
  });

  test("normalizes missing, corrupt, fractional, and out-of-range values", () => {
    const storage = memoryStorage();
    expect(loadLibraryFetchPreferences(storage)).toEqual({
      limit: DEFAULT_LIBRARY_FETCH_LIMIT,
      maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
    });

    storage.values.set(LIBRARY_FETCH_PREFERENCES_STORAGE_KEY, "not json");
    expect(loadLibraryFetchPreferences(storage)).toEqual({
      limit: DEFAULT_LIBRARY_FETCH_LIMIT,
      maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
    });

    expect(
      saveLibraryFetchPreferences({limit: 12.6, maxSearchPages: 23.7}, storage),
    ).toEqual({
      limit: 13,
      maxSearchPages: 24,
    });
    expect(
      saveLibraryFetchPreferences(
        {
          limit: Number.POSITIVE_INFINITY,
          maxSearchPages: Number.POSITIVE_INFINITY,
        },
        storage,
      ),
    ).toEqual({
      limit: DEFAULT_LIBRARY_FETCH_LIMIT,
      maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
    });
    expect(
      saveLibraryFetchPreferences({limit: -5, maxSearchPages: -5}, storage),
    ).toEqual({
      limit: MIN_LIBRARY_FETCH_LIMIT,
      maxSearchPages: MIN_LIBRARY_SEARCH_PAGE_LIMIT,
    });
    expect(
      saveLibraryFetchPreferences(
        {limit: 1_000, maxSearchPages: 1_000},
        storage,
      ),
    ).toEqual({
      limit: MAX_LIBRARY_FETCH_LIMIT,
      maxSearchPages: MAX_LIBRARY_SEARCH_PAGE_LIMIT,
    });

    storage.values.set(
      LIBRARY_FETCH_PREFERENCES_STORAGE_KEY,
      JSON.stringify({limit: 17}),
    );
    expect(loadLibraryFetchPreferences(storage)).toEqual({
      limit: 17,
      maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
    });
  });

  test("tolerates unavailable storage", () => {
    expect(
      loadLibraryFetchPreferences({
        getItem: () => {
          throw new Error("unavailable");
        },
      }),
    ).toEqual({
      limit: DEFAULT_LIBRARY_FETCH_LIMIT,
      maxSearchPages: DEFAULT_LIBRARY_SEARCH_PAGE_LIMIT,
    });
    expect(
      saveLibraryFetchPreferences(
        {limit: 40, maxSearchPages: 20},
        {
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
      ),
    ).toEqual({limit: 40, maxSearchPages: 20});
  });
});
