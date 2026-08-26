import {describe, expect, test} from "bun:test";

import {
  CONTROL_PREFERENCES_STORAGE_KEY,
  DEFAULT_GAMEPAD_LOOK_SENSITIVITY,
  DEFAULT_MOUSE_SENSITIVITY,
  DEFAULT_RESPECT_BOOK_READING_DIRECTION,
  DEFAULT_TV_SCREEN_LIGHTING,
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

const fullPreferences = (
  overrides?: Partial<{
    defaultReadingDirection: "LTR" | "RTL";
    gamepadLookSensitivity: number;
    mouseSensitivity: number;
    respectBookReadingDirection: boolean;
    tvScreenLighting: boolean;
  }>,
) => ({
  defaultReadingDirection: "LTR" as const,
  gamepadLookSensitivity: DEFAULT_GAMEPAD_LOOK_SENSITIVITY,
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
  tvScreenLighting: DEFAULT_TV_SCREEN_LIGHTING,
  ...overrides,
});

describe("control preferences", () => {
  test("persists sensitivity and reading direction preferences", () => {
    const storage = memoryStorage();

    expect(
      saveControlPreferences(
        {
          defaultReadingDirection: "RTL",
          gamepadLookSensitivity: 1.5,
          mouseSensitivity: 0.55,
          respectBookReadingDirection: false,
          tvScreenLighting: true,
        },
        storage,
      ),
    ).toEqual({
      defaultReadingDirection: "RTL",
      gamepadLookSensitivity: 1.5,
      mouseSensitivity: 0.55,
      respectBookReadingDirection: false,
      tvScreenLighting: true,
    });
    expect(loadControlPreferences(storage)).toEqual({
      defaultReadingDirection: "RTL",
      gamepadLookSensitivity: 1.5,
      mouseSensitivity: 0.55,
      respectBookReadingDirection: false,
      tvScreenLighting: true,
    });
  });

  test("normalizes invalid, corrupt, and out-of-range values", () => {
    const storage = memoryStorage();
    expect(loadControlPreferences(storage)).toEqual(fullPreferences());

    storage.values.set(CONTROL_PREFERENCES_STORAGE_KEY, "not json");
    expect(loadControlPreferences(storage)).toEqual(fullPreferences());

    storage.values.set(
      CONTROL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({mouseSensitivity: 99, gamepadLookSensitivity: 99}),
    );
    expect(loadControlPreferences(storage)).toEqual(fullPreferences({mouseSensitivity: 2, gamepadLookSensitivity: 3}));
  });

  test("defaults gamepad look sensitivity when absent from storage", () => {
    const storage = memoryStorage();
    // Preferences written before the option existed must keep loading.
    storage.values.set(CONTROL_PREFERENCES_STORAGE_KEY, JSON.stringify({mouseSensitivity: 0.8}));
    expect(loadControlPreferences(storage).gamepadLookSensitivity).toBe(1);
  });

  test("tolerates unavailable storage", () => {
    expect(
      loadControlPreferences({
        getItem: () => {
          throw new Error("unavailable");
        },
      }),
    ).toEqual(fullPreferences());
    expect(
      saveControlPreferences(
        {
          defaultReadingDirection: "RTL",
          gamepadLookSensitivity: 1,
          mouseSensitivity: 1,
          respectBookReadingDirection: true,
          tvScreenLighting: false,
        },
        {
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
      ),
    ).toEqual({
      defaultReadingDirection: "RTL",
      gamepadLookSensitivity: 1,
      mouseSensitivity: 1,
      respectBookReadingDirection: true,
      tvScreenLighting: false,
    });
  });

  test("migrates the earlier combined reading direction preference", () => {
    const storage = memoryStorage();
    storage.values.set(
      CONTROL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({mouseSensitivity: 0.8, readingDirection: "RTL"}),
    );

    expect(loadControlPreferences(storage)).toEqual(
      fullPreferences({
        defaultReadingDirection: "RTL",
        mouseSensitivity: 0.8,
        respectBookReadingDirection: false,
      }),
    );
  });
});
