import {
  ACTIVE_LIBRARY_CATALOG_ENDPOINT,
  activeLibraryAssetUrl,
} from "~/content/libraryUpdate/activeLibraryRoutes";

export type CatalogLanguage = "english" | "japanese";

export type CatalogIdentity = {
  catalogContentHash: string;
  packId: string;
  snapshotId?: string;
};

export type RuntimeLibrary = {
  atlases: CatalogAtlases;
  identity: CatalogIdentity;
  publications: readonly CatalogItem[];
};

export type CatalogShelfAtlas = {
  cellHeight: number;
  cellWidth: number;
  columns: number;
  firstPublicationIndex: number;
  height: number;
  publicationCount: number;
  regions?: readonly CatalogShelfAtlasRegion[];
  rows: number;
  url: string;
  width: number;
};

export type CatalogShelfAtlasRegion = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type CatalogAtlases = {
  back: readonly CatalogShelfAtlas[];
  front: readonly CatalogShelfAtlas[];
  spine: readonly CatalogShelfAtlas[];
};

export type CatalogItem = {
  id: string;
  title: string;
  titleJp: string;
  collection: string;
  issue: number;
  language: CatalogLanguage;
  tags: readonly string[];
  originalTags?: readonly string[];
  alternates?: readonly CatalogItemAlternate[];
  cover: string;
  detailCover?: string;
  back?: string;
  spine?: string;
  pages: readonly string[];
  added: string;
  trim: string;
  thicknessMm: number;
  aspectRatio?: number;
  direction: "LTR" | "RTL";
  readingDirectionUnspecified?: true;
  shelfAtlas?: {cellIndex: number; index: number};
  accent: string;
};

export type CatalogItemAlternate = {
  id: string;
  originalTags: readonly string[];
  page0: string;
  title: string;
};

export const emptyLibrary: RuntimeLibrary = Object.freeze({
  atlases: Object.freeze({
    back: Object.freeze([]),
    front: Object.freeze([]),
    spine: Object.freeze([]),
  }),
  identity: Object.freeze({
    catalogContentHash: "empty-library",
    packId: "afterleaf-library",
  }),
  publications: [],
});

export const isRuntimeLibraryAvailable = (
  library: RuntimeLibrary | undefined,
): library is RuntimeLibrary =>
  library !== undefined && library !== emptyLibrary;

interface RuntimePublication {
  id: string;
  groupId?: string;
  issue?: {month?: number; number?: number; year?: number};
  kind?: string;
  title: string;
  language: CatalogLanguage;
  pageCount?: number;
  tags: string[];
  originalTags?: string[];
  alternates?: RuntimePublicationAlternate[];
  physical: {
    aspectRatio?: number;
    readingDirection?: "ltr" | "rtl";
    thicknessMm?: number;
    trim?: string;
  };
  source?: {retrievedAt?: string};
  shelfAtlasIndex?: number;
  assets: {
    back?: string;
    backDetail?: string;
    front: string;
    frontDetail?: string;
    pages: string[];
    spine?: string;
  };
}

type RuntimeShelfAtlas = {
  cellHeight: number;
  cellWidth: number;
  columns: number;
  firstPublicationIndex: number;
  height: number;
  path: string;
  publicationCount: number;
  regions?: RuntimeShelfAtlasRegion[];
  rows: number;
  width: number;
};

type RuntimeShelfAtlasRegion = CatalogShelfAtlasRegion;

interface RuntimePublicationAlternate {
  id: string;
  originalTags: string[];
  page0: string;
  title: string;
}

const accents = ["#b72f25", "#e3584d", "#377c98", "#755194", "#d0527e"];

const runtimeReadingDirections = {
  ltr: "LTR",
  rtl: "RTL",
} as const satisfies Record<
  NonNullable<RuntimePublication["physical"]["readingDirection"]>,
  CatalogItem["direction"]
>;

const runtimeReadingDirection = (
  publication: RuntimePublication,
): Pick<CatalogItem, "direction" | "readingDirectionUnspecified"> => {
  const direction = publication.physical.readingDirection;
  if (direction) return {direction: runtimeReadingDirections[direction]};
  return {
    direction: "LTR",
    readingDirectionUnspecified: true,
  };
};

const accentForId = (id: string) => {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return accents[Math.abs(hash) % accents.length] ?? accents[0] ?? "#d94c3f";
};

const issueNumber = (publication: RuntimePublication) =>
  publication.issue?.number ??
  publication.issue?.month ??
  publication.issue?.year ??
  1;

const addedLabel = (publication: RuntimePublication) => {
  const retrievedAt = publication.source?.retrievedAt;
  if (!retrievedAt) return "Local pack";
  const date = new Date(retrievedAt);
  if (Number.isNaN(date.valueOf())) return "Local pack";
  return date.toLocaleDateString(undefined, {month: "short", day: "numeric"});
};

const isSafePackAssetPath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.split(/[\\/]/u).some((segment) => segment === "..");

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isRuntimePublicationAlternate = (
  value: unknown,
): value is RuntimePublicationAlternate => {
  if (typeof value !== "object" || value === null) return false;
  const alternate = value as Partial<RuntimePublicationAlternate>;
  return (
    typeof alternate.id === "string" &&
    typeof alternate.title === "string" &&
    isStringArray(alternate.originalTags) &&
    isSafePackAssetPath(alternate.page0)
  );
};

const packAssetUrl = (path: string, identity: CatalogIdentity) => {
  const assetRevision =
    identity.snapshotId ?? `${identity.packId}:${identity.catalogContentHash}`;
  return `${activeLibraryAssetUrl(path)}?afterleaf=${encodeURIComponent(assetRevision)}`;
};

const sparsePageUrl = (
  publicationId: string,
  pageIndex: number,
  identity: CatalogIdentity,
) => {
  const assetRevision =
    identity.snapshotId ?? `${identity.packId}:${identity.catalogContentHash}`;
  return `/api/library/publications/${encodeURIComponent(publicationId)}/pages/${pageIndex + 1}?afterleaf=${encodeURIComponent(assetRevision)}`;
};

const isRuntimePublication = (value: unknown): value is RuntimePublication => {
  if (typeof value !== "object" || value === null) return false;
  const publication = value as Partial<RuntimePublication>;
  return (
    typeof publication.id === "string" &&
    typeof publication.title === "string" &&
    (publication.language === "english" ||
      publication.language === "japanese") &&
    isStringArray(publication.tags) &&
    (publication.originalTags === undefined ||
      isStringArray(publication.originalTags)) &&
    (publication.alternates === undefined ||
      (Array.isArray(publication.alternates) &&
        publication.alternates.every(isRuntimePublicationAlternate))) &&
    isSafePackAssetPath(publication.assets?.front) &&
    (publication.assets.frontDetail === undefined ||
      isSafePackAssetPath(publication.assets.frontDetail)) &&
    (publication.assets.back === undefined ||
      isSafePackAssetPath(publication.assets.back)) &&
    (publication.assets.backDetail === undefined ||
      isSafePackAssetPath(publication.assets.backDetail)) &&
    (publication.assets.spine === undefined ||
      isSafePackAssetPath(publication.assets.spine)) &&
    Array.isArray(publication.assets.pages) &&
    publication.assets.pages.every(isSafePackAssetPath) &&
    (publication.assets.pages.length > 0 ||
      (Number.isSafeInteger(publication.pageCount) &&
        Number(publication.pageCount) >= 1)) &&
    (publication.pageCount === undefined ||
      (Number.isSafeInteger(publication.pageCount) &&
        publication.pageCount >= 1 &&
        publication.pageCount >= publication.assets.pages.length)) &&
    (publication.shelfAtlasIndex === undefined ||
      (Number.isSafeInteger(publication.shelfAtlasIndex) &&
        publication.shelfAtlasIndex >= 0)) &&
    publication.physical !== undefined &&
    (publication.physical.readingDirection === undefined ||
      publication.physical.readingDirection === "ltr" ||
      publication.physical.readingDirection === "rtl") &&
    (publication.physical.aspectRatio === undefined ||
      (Number.isFinite(publication.physical.aspectRatio) &&
        publication.physical.aspectRatio >= 0.35 &&
        publication.physical.aspectRatio <= 1.5))
  );
};

const isRuntimeShelfAtlas = (value: unknown): value is RuntimeShelfAtlas => {
  if (typeof value !== "object" || value === null) return false;
  const atlas = value as Partial<RuntimeShelfAtlas>;
  return (
    isSafePackAssetPath(atlas.path) &&
    Number.isSafeInteger(atlas.cellWidth) &&
    Number(atlas.cellWidth) > 0 &&
    Number.isSafeInteger(atlas.cellHeight) &&
    Number(atlas.cellHeight) > 0 &&
    Number.isSafeInteger(atlas.width) &&
    Number(atlas.width) > 0 &&
    Number.isSafeInteger(atlas.height) &&
    Number(atlas.height) > 0 &&
    Number.isSafeInteger(atlas.columns) &&
    Number(atlas.columns) > 0 &&
    Number.isSafeInteger(atlas.rows) &&
    Number(atlas.rows) > 0 &&
    Number.isSafeInteger(atlas.firstPublicationIndex) &&
    Number(atlas.firstPublicationIndex) >= 0 &&
    Number.isSafeInteger(atlas.publicationCount) &&
    Number(atlas.publicationCount) > 0 &&
    (atlas.regions === undefined ||
      (Array.isArray(atlas.regions) &&
        atlas.regions.length === atlas.publicationCount &&
        atlas.regions.every(
          (region) =>
            Number.isSafeInteger(region.x) &&
            region.x >= 0 &&
            Number.isSafeInteger(region.y) &&
            region.y >= 0 &&
            Number.isSafeInteger(region.width) &&
            region.width > 0 &&
            region.x + region.width <= Number(atlas.width) &&
            Number.isSafeInteger(region.height) &&
            region.height > 0 &&
            region.y + region.height <= Number(atlas.height),
        )))
  );
};

const isCatalogIdentity = <T extends {contentHash?: unknown; id?: unknown}>(
  value: T,
): value is T & {contentHash: string; id: string} =>
  typeof value.id === "string" &&
  value.id.length > 0 &&
  typeof value.contentHash === "string" &&
  value.contentHash.length > 0;

/**
 * Minimal network surface the catalog loaders need. Accepting a structural
 * subset of `fetch` keeps dependency injection simple for callers and tests.
 */
type CatalogFetcher = (
  input: string,
  init?: {cache?: RequestCache},
) => Promise<Response>;

export const loadRuntimeLibraryWithFetcher = async (
  fetcher: CatalogFetcher,
): Promise<RuntimeLibrary> => {
  try {
    const response = await fetcher(
      `${ACTIVE_LIBRARY_CATALOG_ENDPOINT}?afterleaf=${Date.now()}`,
      {cache: "no-store"},
    );
    if (!response.ok) return emptyLibrary;
    const value = (await response.json()) as {
      atlases?: {back?: unknown; front?: unknown; spine?: unknown};
      contentHash?: unknown;
      id?: unknown;
      publications?: unknown;
    };
    if (!Array.isArray(value.publications) || !isCatalogIdentity(value))
      return emptyLibrary;
    const publications = value.publications.filter(isRuntimePublication);
    // A partially understood catalog is unavailable, not a smaller catalog.
    // Treating rejected entries as removals can destructively rewrite the world save.
    if (publications.length !== value.publications.length) return emptyLibrary;
    const snapshotId = response.headers.get("X-Afterleaf-Snapshot-Id")?.trim();
    const identity: CatalogIdentity = {
      catalogContentHash: value.contentHash,
      packId: value.id,
      ...(!snapshotId ? {} : {snapshotId}),
    };
    const mapAtlases = (atlases: unknown): CatalogShelfAtlas[] =>
      Array.isArray(atlases)
        ? atlases.filter(isRuntimeShelfAtlas).map((atlas) => ({
            cellHeight: atlas.cellHeight,
            cellWidth: atlas.cellWidth,
            columns: atlas.columns,
            firstPublicationIndex: atlas.firstPublicationIndex,
            height: atlas.height,
            publicationCount: atlas.publicationCount,
            ...(atlas.regions === undefined ? {} : {regions: atlas.regions}),
            rows: atlas.rows,
            url: packAssetUrl(atlas.path, identity),
            width: atlas.width,
          }))
        : [];
    const atlases: CatalogAtlases = {
      back: mapAtlases(value.atlases?.back),
      front: mapAtlases(value.atlases?.front),
      spine: mapAtlases(value.atlases?.spine),
    };
    return {
      atlases,
      identity,
      publications: publications.map((publication) => {
        const backAsset =
          publication.assets.backDetail ?? publication.assets.back;
        return {
          id: publication.id,
          title: publication.title,
          titleJp: publication.title,
          collection: publication.groupId ?? publication.kind ?? "Unsorted",
          issue: issueNumber(publication),
          language: publication.language,
          tags: publication.tags,
          originalTags: publication.originalTags ?? publication.tags,
          alternates: (publication.alternates ?? []).map((alternate) => ({
            id: alternate.id,
            originalTags: alternate.originalTags,
            page0: packAssetUrl(alternate.page0, identity),
            title: alternate.title,
          })),
          cover: packAssetUrl(publication.assets.front, identity),
          ...(publication.assets.frontDetail === undefined
            ? {}
            : {
                detailCover: packAssetUrl(
                  publication.assets.frontDetail,
                  identity,
                ),
              }),
          ...(backAsset === undefined
            ? {}
            : {back: packAssetUrl(backAsset, identity)}),
          ...(publication.assets.spine === undefined
            ? {}
            : {spine: packAssetUrl(publication.assets.spine, identity)}),
          pages: Array.from(
            {length: publication.pageCount ?? publication.assets.pages.length},
            (_, pageIndex) => {
              const page = publication.assets.pages[pageIndex];
              return page
                ? packAssetUrl(page, identity)
                : sparsePageUrl(publication.id, pageIndex, identity);
            },
          ),
          added: addedLabel(publication),
          trim: publication.physical.trim ?? "B5",
          thicknessMm: publication.physical.thicknessMm ?? 10,
          ...(publication.physical.aspectRatio === undefined
            ? {}
            : {aspectRatio: publication.physical.aspectRatio}),
          ...runtimeReadingDirection(publication),
          ...(publication.shelfAtlasIndex === undefined
            ? {}
            : {
                shelfAtlas: (() => {
                  const atlasIndex = atlases.front.findIndex(
                    (atlas) =>
                      publication.shelfAtlasIndex !== undefined &&
                      publication.shelfAtlasIndex >=
                        atlas.firstPublicationIndex &&
                      publication.shelfAtlasIndex <
                        atlas.firstPublicationIndex + atlas.publicationCount,
                  );
                  const atlas = atlases.front[atlasIndex];
                  return {
                    cellIndex: atlas
                      ? publication.shelfAtlasIndex -
                        atlas.firstPublicationIndex
                      : -1,
                    index: atlasIndex,
                  };
                })(),
              }),
          accent: accentForId(publication.id),
        };
      }),
    };
  } catch {
    return emptyLibrary;
  }
};

export const loadRuntimeLibrary = () => loadRuntimeLibraryWithFetcher(fetch);

export const loadRuntimeCatalog = async (fetcher: CatalogFetcher = fetch) =>
  (await loadRuntimeLibraryWithFetcher(fetcher)).publications;
