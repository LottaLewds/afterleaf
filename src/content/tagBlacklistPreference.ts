export const TAG_BLACKLIST_PREFERENCE_KEY = "afterleaf-tag-blacklist-preference-v1";

const TAG_BLACKLIST_SCHEMA_VERSION = 1;
const MAX_BLACKLISTED_TAGS = 100;
const MAX_TAG_LENGTH = 100;

type TagBlacklistPreference = {
  schemaVersion: typeof TAG_BLACKLIST_SCHEMA_VERSION;
  tags: string[];
};

export const normalizeTag = (tag: string) => tag.trim().replaceAll(/\s+/gu, " ").toLowerCase().slice(0, MAX_TAG_LENGTH);

export const normalizeTagBlacklist = (tags: readonly string[]) => {
  const normalizedTags: string[] = [];
  const includedTags = new Set<string>();
  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag || includedTags.has(normalizedTag)) continue;
    includedTags.add(normalizedTag);
    normalizedTags.push(normalizedTag);
    if (normalizedTags.length >= MAX_BLACKLISTED_TAGS) break;
  }
  return normalizedTags;
};

const parseTagBlacklistPreference = (value: unknown): TagBlacklistPreference | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const preference = value as Partial<TagBlacklistPreference>;
  if (
    preference.schemaVersion !== TAG_BLACKLIST_SCHEMA_VERSION ||
    !Array.isArray(preference.tags) ||
    !preference.tags.every((tag) => typeof tag === "string")
  )
    return;
  return {
    schemaVersion: TAG_BLACKLIST_SCHEMA_VERSION,
    tags: normalizeTagBlacklist(preference.tags),
  };
};

export const loadTagBlacklist = (storage: Pick<Storage, "getItem"> = localStorage) => {
  try {
    const stored = storage.getItem(TAG_BLACKLIST_PREFERENCE_KEY);
    if (!stored) return [];
    return parseTagBlacklistPreference(JSON.parse(stored) as unknown)?.tags ?? [];
  } catch {
    return [];
  }
};

export const saveTagBlacklist = (tags: readonly string[], storage: Pick<Storage, "setItem"> = localStorage) => {
  const normalizedTags = normalizeTagBlacklist(tags);
  try {
    storage.setItem(
      TAG_BLACKLIST_PREFERENCE_KEY,
      JSON.stringify({
        schemaVersion: TAG_BLACKLIST_SCHEMA_VERSION,
        tags: normalizedTags,
      } satisfies TagBlacklistPreference),
    );
  } catch {
    // The blacklist remains usable for this session when storage is unavailable.
  }
  return normalizedTags;
};
