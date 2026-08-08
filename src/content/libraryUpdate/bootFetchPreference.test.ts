import {describe, expect, test} from "bun:test";

import {
  BOOT_FETCH_PREFERENCE_KEY,
  loadBootFetchPreference,
  saveBootFetchPreference,
} from "~/content/libraryUpdate/bootFetchPreference";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
};

describe("boot fetch preference", () => {
  test("persists enabled and disabled settings", () => {
    const storage = memoryStorage();
    expect(saveBootFetchPreference(true, storage)).toEqual({
      enabled: true,
      schemaVersion: 1,
    });
    expect(loadBootFetchPreference(storage)?.enabled).toBe(true);

    saveBootFetchPreference(false, storage);
    expect(loadBootFetchPreference(storage)?.enabled).toBe(false);
  });

  test("fails closed for corrupt, stale, and unavailable storage", () => {
    const storage = memoryStorage();
    storage.values.set(BOOT_FETCH_PREFERENCE_KEY, "not json");
    expect(loadBootFetchPreference(storage)).toBeUndefined();
    storage.values.set(
      BOOT_FETCH_PREFERENCE_KEY,
      JSON.stringify({
        enabled: true,
        schemaVersion: 2,
      }),
    );
    expect(loadBootFetchPreference(storage)).toBeUndefined();
    expect(
      loadBootFetchPreference({
        getItem: () => {
          throw new Error("unavailable");
        },
      }),
    ).toBeUndefined();
    expect(
      saveBootFetchPreference(true, {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      }),
    ).toBeUndefined();
  });
});
