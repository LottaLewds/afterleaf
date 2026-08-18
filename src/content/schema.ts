export const CONTENT_SCHEMA_VERSION = 1 as const;

export const SUPPORTED_LANGUAGES = ["english", "japanese"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type MatchMode = "all" | "any";

export const PUBLICATION_KINDS = [
  "anthology",
  "commercial-volume",
  "doujinshi",
  "magazine",
] as const;
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

export interface PublicationIssue {
  year?: number;
  month?: number;
  number?: number;
  label?: string;
}

export interface PublicationProvenance {
  provider: string;
  remoteId: string;
  sourceUrl: string;
  retrievedAt: string;
  metadataHash: string;
}

export interface PublicationPhysical {
  aspectRatio?: number;
  readingDirection?: "ltr" | "rtl";
  thicknessMm?: number;
  trim?: string;
}

export interface PublicationAssets {
  pages: string[];
  front?: string;
  back?: string;
  spine?: string;
}

export interface LocalPublicationDocument {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  aspectRatioInferenceVersion?: number;
  id: string;
  groupId?: string;
  issue?: PublicationIssue;
  kind?: PublicationKind;
  title: string;
  language: string;
  pageCount?: number;
  tags: string[];
  assets: PublicationAssets;
  source?: PublicationProvenance;
  physical?: PublicationPhysical;
}

export interface PublicationCandidate {
  document: LocalPublicationDocument;
  language: SupportedLanguage;
  normalizedTags: string[];
  alternates?: PublicationAlternateCandidate[];
  localSourceId?: string;
  sourceDirectory: string;
}

export interface PublicationAlternateCandidate {
  id: string;
  originalTags: string[];
  source?: PublicationProvenance;
  title: string;
}

export interface PublicationSourceReference {
  sourceId: string;
}

export interface PublicationMaterial {
  pages: string[];
  front?: string;
  back?: string;
  spine?: string;
  alternates?: PublicationAlternateMaterial[];
  fingerprint?: string;
}

export interface PublicationAlternateMaterial {
  id: string;
  page0: string;
  sourceDirectory: string;
}

export interface ContentSeedDiagnostic {
  code:
    | "duplicate-id"
    | "fewer-than-limit"
    | "invalid-assets"
    | "invalid-manifest"
    | "migration-failed"
    | "provider-repair-failed"
    | "shadowed-manifest"
    | "suspected-duplicate"
    | "skipped-symlink"
    | "unsupported-language";
  message: string;
  sourceId?: string;
}

export interface PublicationSearchQuery {
  excludedTags: string[];
  languages: SupportedLanguage[];
  limit: number;
  match: MatchMode;
  seed: string;
  tags: string[];
}

export interface PublicationSource {
  readonly diagnostics: readonly ContentSeedDiagnostic[];
  readonly name: string;
  search(query: PublicationSearchQuery): Promise<PublicationSourceReference[]>;
  getMetadata(
    reference: PublicationSourceReference,
  ): Promise<PublicationCandidate>;
  materialize(
    reference: PublicationSourceReference,
  ): Promise<PublicationMaterial>;
}

export interface SeedContentPackOptions extends PublicationSearchQuery {
  allowEmpty?: boolean;
  assetPathPrefix?: string;
  dryRun: boolean;
  force: boolean;
  forceRebuild?: boolean;
  onDiagnostic?: (diagnostic: ContentSeedDiagnostic) => void;
  outputDirectory: string;
  packId: string;
  persistentAssetDirectory?: string;
  reuse?: {
    catalog: ContentPackCatalog;
    directory: string;
  };
}

export interface ShelfAtlasDescriptor {
  path: string;
  formatVersion?: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  contentHash: string;
  firstPublicationIndex: number;
  publicationCount: number;
  regions?: ShelfAtlasRegion[];
}

export interface ShelfAtlasRegion {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface PackedPublication {
  id: string;
  localSourceId?: string;
  groupId?: string;
  issue?: PublicationIssue;
  kind?: PublicationKind;
  title: string;
  language: SupportedLanguage;
  pageCount?: number;
  tags: string[];
  originalTags: string[];
  alternates: PackedPublicationAlternate[];
  physical: PublicationPhysical & {aspectRatio: number};
  source?: PublicationProvenance;
  assets: {
    front: string;
    frontDetail: string;
    back: string;
    backDetail?: string;
    spine: string;
    pages: string[];
  };
  shelfAtlasIndex: number;
  aspectRatioInferenceVersion?: number;
  backFormatVersion?: number;
  spineFormatVersion?: number;
  contentHash: string;
  materialFingerprint?: string;
  materialPageCount?: number;
}

export interface PackedPublicationAlternate {
  id: string;
  originalTags: string[];
  page0: string;
  source?: PublicationProvenance;
  title: string;
}

export interface ContentPackCatalog {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  selection: {
    excludedTags: string[];
    languages: SupportedLanguage[];
    limit: number;
    match: MatchMode;
    seed: string;
    source: string;
    tags: string[];
  };
  atlases: {
    front: ShelfAtlasDescriptor[];
    back: ShelfAtlasDescriptor[];
    spine: ShelfAtlasDescriptor[];
  };
  publications: PackedPublication[];
  contentHash: string;
}

export interface ContentSeedReport {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  packId: string;
  source: string;
  outputDirectory: string;
  outputWritten: boolean;
  requestedLimit: number;
  selectedCount: number;
  selectedPublicationIds: string[];
  diagnostics: ContentSeedDiagnostic[];
}

export interface SeedContentPackResult {
  catalog?: ContentPackCatalog;
  report: ContentSeedReport;
}
