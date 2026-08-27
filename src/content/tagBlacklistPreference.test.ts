import {describe, expect, test} from "bun:test";

import {TAG_BLACKLIST_PREFERENCE_KEY, loadTagBlacklist, saveTagBlacklist} from "~/content/tagBlacklistPreference";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
};

describe("tag blacklist preference", () => {
  test("starts empty and persists normalized custom tags", () => {
    const storage = memoryStorage();

    expect(loadTagBlacklist(storage)).toEqual([]);
    expect(saveTagBlacklist(["  Big   Breasts ", "YURI", "big breasts", ""], storage)).toEqual(["big breasts", "yuri"]);
    expect(loadTagBlacklist(storage)).toEqual(["big breasts", "yuri"]);
  });

  test("fails closed for corrupt, stale, and unavailable storage", () => {
    const storage = memoryStorage();
    storage.values.set(TAG_BLACKLIST_PREFERENCE_KEY, "not json");
    expect(loadTagBlacklist(storage)).toEqual([]);
    storage.values.set(TAG_BLACKLIST_PREFERENCE_KEY, JSON.stringify({schemaVersion: 2, tags: ["office"]}));
    expect(loadTagBlacklist(storage)).toEqual([]);
    expect(
      loadTagBlacklist({
        getItem: () => {
          throw new Error("unavailable");
        },
      }),
    ).toEqual([]);
    expect(
      saveTagBlacklist(["office"], {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      }),
    ).toEqual(["office"]);
  });
});
