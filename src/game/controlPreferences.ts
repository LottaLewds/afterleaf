export const CONTROL_PREFERENCES_STORAGE_KEY =
  "afterleaf-control-preferences-v1";
export const DEFAULT_MOUSE_SENSITIVITY = 0.75;
export const MIN_MOUSE_SENSITIVITY = 0.2;
export const MAX_MOUSE_SENSITIVITY = 2;
export const DEFAULT_READING_DIRECTION = "LTR";
export const DEFAULT_RESPECT_BOOK_READING_DIRECTION = true;
export const DEFAULT_TV_SCREEN_LIGHTING = false;

export type ReadingDirection = "LTR" | "RTL";

export type ControlPreferences = {
  defaultReadingDirection: ReadingDirection;
  mouseSensitivity: number;
  respectBookReadingDirection: boolean;
  tvScreenLighting: boolean;
};

export const normalizeMouseSensitivity = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_MOUSE_SENSITIVITY;
  return Math.min(
    Math.max(value, MIN_MOUSE_SENSITIVITY),
    MAX_MOUSE_SENSITIVITY,
  );
};

const parseControlPreferences = (
  value: unknown,
): ControlPreferences | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  const preferences = value as Partial<ControlPreferences> & {
    readingDirection?: unknown;
  };
  if (typeof preferences.mouseSensitivity !== "number") return;
  const legacyReadingDirection = preferences.readingDirection;
  let defaultReadingDirection: ReadingDirection = DEFAULT_READING_DIRECTION;
  if (
    preferences.defaultReadingDirection === "LTR" ||
    preferences.defaultReadingDirection === "RTL"
  )
    defaultReadingDirection = preferences.defaultReadingDirection;
  else if (legacyReadingDirection === "LTR" || legacyReadingDirection === "RTL")
    defaultReadingDirection = legacyReadingDirection;

  let respectBookReadingDirection = DEFAULT_RESPECT_BOOK_READING_DIRECTION;
  if (typeof preferences.respectBookReadingDirection === "boolean")
    respectBookReadingDirection = preferences.respectBookReadingDirection;
  else if (legacyReadingDirection === "LTR" || legacyReadingDirection === "RTL")
    respectBookReadingDirection = false;
  const tvScreenLighting =
    typeof preferences.tvScreenLighting === "boolean"
      ? preferences.tvScreenLighting
      : DEFAULT_TV_SCREEN_LIGHTING;
  return {
    defaultReadingDirection,
    mouseSensitivity: normalizeMouseSensitivity(preferences.mouseSensitivity),
    respectBookReadingDirection,
    tvScreenLighting,
  };
};

const defaultControlPreferences = (): ControlPreferences => ({
  defaultReadingDirection: DEFAULT_READING_DIRECTION,
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  respectBookReadingDirection: DEFAULT_RESPECT_BOOK_READING_DIRECTION,
  tvScreenLighting: DEFAULT_TV_SCREEN_LIGHTING,
});

export const loadControlPreferences = (
  storage: Pick<Storage, "getItem"> = localStorage,
): ControlPreferences => {
  try {
    const stored = storage.getItem(CONTROL_PREFERENCES_STORAGE_KEY);
    if (!stored) return defaultControlPreferences();
    return (
      parseControlPreferences(JSON.parse(stored) as unknown) ??
      defaultControlPreferences()
    );
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
    mouseSensitivity: normalizeMouseSensitivity(preferences.mouseSensitivity),
    respectBookReadingDirection: preferences.respectBookReadingDirection,
    tvScreenLighting: preferences.tvScreenLighting,
  };
  try {
    storage.setItem(
      CONTROL_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizedPreferences),
    );
  } catch {
    // Controls remain usable for this session when storage is unavailable.
  }
  return normalizedPreferences;
};
