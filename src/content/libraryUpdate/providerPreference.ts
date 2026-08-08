export const LIBRARY_PROVIDER_PREFERENCE_KEY =
  "afterleaf-library-provider-preference-v1";

const providerIdPattern = /^[a-z][a-z0-9-]{0,63}$/u;

export const loadLibraryProviderPreference = (
  storage: Pick<Storage, "getItem"> = localStorage,
) => {
  try {
    const value = storage.getItem(LIBRARY_PROVIDER_PREFERENCE_KEY);
    return value && providerIdPattern.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const saveLibraryProviderPreference = (
  providerId: string,
  storage: Pick<Storage, "setItem"> = localStorage,
) => {
  if (!providerIdPattern.test(providerId)) return undefined;
  try {
    storage.setItem(LIBRARY_PROVIDER_PREFERENCE_KEY, providerId);
  } catch {
    // The selected provider remains usable for this session.
  }
  return providerId;
};
