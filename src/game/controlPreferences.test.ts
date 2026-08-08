import {describe, expect, test} from "bun:test";

import {
  CONTROL_PREFERENCES_STORAGE_KEY,
  DEFAULT_MOUSE_SENSITIVITY,
  DEFAULT_READING_DIRECTION,
  DEFAULT_RESPECT_BOOK_READING_DIRECTION,
  loadControlPreferences,
  saveControlPreferences,
} from "~/game/controlPreferences";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
};

describe("control preferences", () => {
  test("persists mouse sensitivity and reading direction preferences", () => {
    const storage = memoryStorage();

    expect(
      saveControlPreferences(
        {
          defaultReadingDirection: "RTL",
          mouseSensitivity: 0.55,
          respectBookReadingDirection: false,
        },
        storage,
      ),
    ).toEqual({
      defaultReadingDirection: "RTL",
      mouseSensitivity: 0.55,
      respectBookReadingDirection: false,
    });
    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: "RTL",
      mouseSensitivity: 0.55,
      respectBookReadingDirection: false,
    });
  });

  test("normalizes invalid, corrupt, and out-of-range values", () => {
    const storage = memoryStorage();
    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: DEFAULT_READING_DIRECTION,
      mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
      respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
    });

    storage.values.set(CONTROL_PREFERENCES_STORAGE_KEY, "not json");
    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: DEFAULT_READING_DIRECTION,
      mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
      respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
    });

    storage.values.set(
      CONTROL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({mouseSensitivity: 99}),
    );
    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: DEFAULT_READING_DIRECTION,
      mouseSensitivity: 2,
      respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
    });
  });

  test("tolerates unavailable storage", () => {
    expect(
      loadControlPreferences({
        getItem: () => {
          throw new Error("unavailable");
        },
      }),
    ).toEqual({
      defaultReadingDirection: DEFAULT_READING_DIRECTION,
      mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
      respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
    });
    expect(
      saveControlPreferences(
        {
          defaultReadingDirection: "RTL",
          mouseSensitivity: 1,
          respectBookReadingDirection: true,
        },
        {
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
      ),
    ).toEqual({
      defaultReadingDirection: "RTL",
      mouseSensitivity: 1,
      respectBookReadingDirection: true,
    });
  });

  test("migrates the earlier combined reading direction preference", () => {
    const storage = memoryStorage();
    storage.values.set(
      CONTROL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({mouseSensitivity: 0.8, readingDirection: "RTL"}),
    );

    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: "RTL",
      mouseSensitivity: 0.8,
      respectBookReadingDirection: false,
    });
  });
});
