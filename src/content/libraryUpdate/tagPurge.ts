import {normalizeTagBlacklist, normalizeTag} from "~/content/tagBlacklistPreference";

export type TaggablePublication = {
  id: string;
  tags: readonly string[];
};

export const findBlacklistedTagMatches = <Publication extends TaggablePublication>(
  publications: readonly Publication[],
  blacklistedTags: readonly string[],
) => {
  const blockedTags = new Set(normalizeTagBlacklist(blacklistedTags));
  if (blockedTags.size === 0) return [];

  const includedPublicationIds = new Set<string>();
  return publications.filter((publication) => {
    if (
      includedPublicationIds.has(publication.id) ||
      !publication.tags.some((tag) => blockedTags.has(normalizeTag(tag)))
    )
      return false;
    includedPublicationIds.add(publication.id);
    return true;
  });
};
