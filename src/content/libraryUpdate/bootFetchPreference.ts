export const BOOT_FETCH_PREFERENCE_KEY = "afterleaf-boot-fetch-preference-v1";
export const BOOT_FETCH_PREFERENCE_VERSION = 1 as const;

export type BootFetchPreference = {
  enabled: boolean;
  schemaVersion: typeof BOOT_FETCH_PREFERENCE_VERSION;
};

const parseBootFetchPreference = (value: unknown): BootFetchPreference | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const preference = value as Partial<BootFetchPreference>;
  if (preference.schemaVersion !== BOOT_FETCH_PREFERENCE_VERSION || typeof preference.enabled !== "boolean") return;
  return {
    enabled: preference.enabled,
    schemaVersion: BOOT_FETCH_PREFERENCE_VERSION,
  };
};

export const loadBootFetchPreference = (
  storage: Pick<Storage, "getItem"> = localStorage,
): BootFetchPreference | undefined => {
  try {
    const stored = storage.getItem(BOOT_FETCH_PREFERENCE_KEY);
    return stored ? parseBootFetchPreference(JSON.parse(stored) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

export const saveBootFetchPreference = (enabled: boolean, storage: Pick<Storage, "setItem"> = localStorage) => {
  try {
    const preference: BootFetchPreference = {
      enabled,
      schemaVersion: BOOT_FETCH_PREFERENCE_VERSION,
    };
    storage.setItem(BOOT_FETCH_PREFERENCE_KEY, JSON.stringify(preference));
    return preference;
  } catch {
    return undefined;
  }
};
