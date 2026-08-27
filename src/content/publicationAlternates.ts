import {normalizeTags} from "~/content/normalize";
import type {ContentSeedDiagnostic, PublicationCandidate, PublicationMaterial} from "~/content/schema";

interface AlternateEntry {
  candidate: PublicationCandidate;
  material: PublicationMaterial;
  reference: {sourceId: string};
}

const BRACKETED_EDITION_MARKER_PATTERN =
  /\[\s*(?:digital|uncensored|english(?:\s+translation)?|eng|en|japanese|jpn|jp)\s*\]/giu;
const BRACKETED_UNCENSORED_PATTERN = /\[\s*uncensored\s*\]/giu;

const removeBracketedEditionMarkers = (title: string) =>
  title.replace(BRACKETED_EDITION_MARKER_PATTERN, (marker, offset: number) =>
    title.slice(0, offset).trim().length === 0 ? marker : " ",
  );

const hasUncensoredEditionMarker = (title: string) => {
  const normalizedTitle = title.normalize("NFKC");
  for (const match of normalizedTitle.matchAll(BRACKETED_UNCENSORED_PATTERN))
    if (normalizedTitle.slice(0, match.index).trim().length > 0) return true;
  return false;
};

export const alternateTitleKey = (title: string) => {
  const withoutEditionMarkers = removeBracketedEditionMarkers(title.normalize("NFKC").toLocaleLowerCase("en-US"));
  return withoutEditionMarkers
    .replace(/\p{Number}+/gu, (digits) => digits.replace(/^0+(?=\d)/u, ""))
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
};

const isUncensored = (candidate: PublicationCandidate) =>
  candidate.normalizedTags.includes("uncensored") || hasUncensoredEditionMarker(candidate.document.title);

const canonicalOrder = (left: AlternateEntry, right: AlternateEntry) => {
  const uncensoredDifference = Number(isUncensored(right.candidate)) - Number(isUncensored(left.candidate));
  if (uncensoredDifference !== 0) return uncensoredDifference;
  return left.candidate.document.id.localeCompare(right.candidate.document.id);
};

const groupKey = (candidate: PublicationCandidate) => {
  const titleKey = alternateTitleKey(candidate.document.title);
  return titleKey ? `${candidate.language}\0${titleKey}` : `${candidate.language}\0id:${candidate.document.id}`;
};

export const associatePublicationAlternates = <Entry extends AlternateEntry>(
  entries: readonly Entry[],
  diagnostics: ContentSeedDiagnostic[],
): Entry[] => {
  const groups = Map.groupBy(entries, (entry) => groupKey(entry.candidate));
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0] as Entry;
    const ordered = group.toSorted(canonicalOrder);
    const canonical = ordered[0];
    if (!canonical) throw new Error("Alternate group has no canonical entry");
    const alternates = ordered.slice(1);
    const alternateIds = alternates.map(({candidate}) => candidate.document.id);
    diagnostics.push({
      code: "suspected-duplicate",
      sourceId: canonical.reference.sourceId,
      message: `Associated ${alternateIds.map((id) => JSON.stringify(id)).join(", ")} as alternate${alternateIds.length === 1 ? "" : "s"} of ${JSON.stringify(canonical.candidate.document.id)}`,
    });
    const candidate = Object.assign({}, canonical.candidate, {
      alternates: alternates.map(({candidate: alternateCandidate}) =>
        Object.assign(
          {
            id: alternateCandidate.document.id,
            originalTags: normalizeTags(alternateCandidate.document.tags),
            title: alternateCandidate.document.title,
          },
          alternateCandidate.document.source === undefined ? {} : {source: alternateCandidate.document.source},
        ),
      ),
      normalizedTags: normalizeTags(
        ordered.flatMap(({candidate: orderedCandidate}) => orderedCandidate.normalizedTags),
      ),
    });
    const material = Object.assign({}, canonical.material, {
      alternates: alternates.map(({candidate: alternateCandidate, material: alternateMaterial}) => {
        const page0 = alternateMaterial.pages[0] ?? alternateMaterial.front;
        if (!page0) throw new Error(`Alternate publication ${alternateCandidate.document.id} has no page zero`);
        return {
          id: alternateCandidate.document.id,
          page0,
          sourceDirectory: alternateCandidate.sourceDirectory,
        };
      }),
    });
    return Object.assign({}, canonical, {candidate, material}) as Entry;
  });
};
