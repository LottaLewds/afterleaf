export const CONTROL_PREFERENCES_STORAGE_KEY = "afterleaf-control-preferences-v1";
export const DEFAULT_MOUSE_SENSITIVITY = 0.75;
export const MIN_MOUSE_SENSITIVITY = 0.2;
export const MAX_MOUSE_SENSITIVITY = 2;
export const DEFAULT_GAMEPAD_LOOK_SENSITIVITY = 1;
export const MIN_GAMEPAD_LOOK_SENSITIVITY = 0.2;
export const MAX_GAMEPAD_LOOK_SENSITIVITY = 3;
export const DEFAULT_READING_DIRECTION = "LTR";
export const DEFAULT_RESPECT_BOOK_READING_DIRECTION = true;
export const DEFAULT_TV_SCREEN_LIGHTING = false;

export type ReadingDirection = "LTR" | "RTL";

export type ControlPreferences = {
  defaultReadingDirection: ReadingDirection;
  /** Multiplier on top of the base right-stick look speed. */
  gamepadLookSensitivity: number;
  mouseSensitivity: number;
  respectBookReadingDirection: boolean;
  tvScreenLighting: boolean;
};

const normalizeSensitivity = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

export const normalizeMouseSensitivity = (value: number) =>
  normalizeSensitivity(value, MIN_MOUSE_SENSITIVITY, MAX_MOUSE_SENSITIVITY, DEFAULT_MOUSE_SENSITIVITY);

export const normalizeGamepadLookSensitivity = (value: number) =>
  normalizeSensitivity(
    value,
    MIN_GAMEPAD_LOOK_SENSITIVITY,
    MAX_GAMEPAD_LOOK_SENSITIVITY,
    DEFAULT_GAMEPAD_LOOK_SENSITIVITY,
  );

const isReadingDirection = (value: unknown): value is ReadingDirection => value === "LTR" || value === "RTL";

const readDefaultReadingDirection = (
  preferences: Partial<ControlPreferences> & {readingDirection?: unknown},
): ReadingDirection => {
  if (isReadingDirection(preferences.defaultReadingDirection)) return preferences.defaultReadingDirection;
  if (isReadingDirection(preferences.readingDirection)) return preferences.readingDirection;
  return DEFAULT_READING_DIRECTION;
};

const readRespectBookReadingDirection = (
  preferences: Partial<ControlPreferences> & {readingDirection?: unknown},
): boolean => {
  if (typeof preferences.respectBookReadingDirection === "boolean") return preferences.respectBookReadingDirection;
  if (isReadingDirection(preferences.readingDirection)) return false;
  return DEFAULT_RESPECT_BOOK_READING_DIRECTION;
};

const readNumberPreference = (value: unknown, fallback: number, normalize: (value: number) => number) =>
  typeof value === "number" ? normalize(value) : fallback;

const readBooleanPreference = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const parseControlPreferences = (value: unknown): ControlPreferences | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const preferences = value as Partial<ControlPreferences> & {
    readingDirection?: unknown;
  };
  if (typeof preferences.mouseSensitivity !== "number") return;
  return {
    defaultReadingDirection: readDefaultReadingDirection(preferences),
    gamepadLookSensitivity: readNumberPreference(
      preferences.gamepadLookSensitivity,
      DEFAULT_GAMEPAD_LOOK_SENSITIVITY,
      normalizeGamepadLookSensitivity,
    ),
    mouseSensitivity: normalizeMouseSensitivity(preferences.mouseSensitivity),
    respectBookReadingDirection: readRespectBookReadingDirection(preferences),
    tvScreenLighting: readBooleanPreference(preferences.tvScreenLighting, DEFAULT_TV_SCREEN_LIGHTING),
  };
};

const defaultControlPreferences = (): ControlPreferences => ({
  defaultReadingDirection: DEFAULT_READING_DIRECTION,
  gamepadLookSensitivity: DEFAULT_GAMEPAD_LOOK_SENSITIVITY,
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
  tvScreenLighting: DEFAULT_TV_SCREEN_LIGHTING,
});

export const loadControlPreferences = (storage: Pick<Storage, "getItem"> = localStorage): ControlPreferences => {
  try {
    const stored = storage.getItem(CONTROL_PREFERENCES_STORAGE_KEY);
    if (!stored) return defaultControlPreferences();
    return parseControlPreferences(JSON.parse(stored) as unknown) ?? defaultControlPreferences();
  } catch {
    return defaultControlPreferences();
  }
};

export const saveControlPreferences = (
  preferences: ControlPreferences,
  storage: Pick<Storage, "setItem"> = localStorage,
) => {
  const normalizedPreferences = {
    defaultReadingDirection: preferences.defaultReadingDirection,
    gamepadLookSensitivity: normalizeGamepadLookSensitivity(preferences.gamepadLookSensitivity),
    mouseSensitivity: normalizeMouseSensitivity(preferences.mouseSensitivity),
    respectBookReadingDirection: preferences.respectBookReadingDirection,
    tvScreenLighting: preferences.tvScreenLighting,
  };
  try {
    storage.setItem(CONTROL_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizedPreferences));
  } catch {
    // Controls remain usable for this session when storage is unavailable.
  }
  return normalizedPreferences;
};
