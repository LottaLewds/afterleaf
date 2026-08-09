import type {
  PackedPublication,
  PublicationKind,
  SupportedLanguage,
} from "../schema";

export const LIBRARY_PROVIDER_API_VERSION = 1 as const;

export interface LibraryProviderQueryGuideEntry {
  description: string;
  exclusion: string;
  expression: string;
}

export interface LibraryProviderQueryGuide {
  entries: readonly LibraryProviderQueryGuideEntry[];
  examples: readonly string[];
  introduction: string;
}

export interface LibraryProviderDescriptor {
  contentKinds: readonly PublicationKind[];
  defaultBlockedTags: readonly string[];
  defaultLanguages: readonly SupportedLanguage[];
  defaultQuery: string;
  id: string;
  name: string;
  queryGuide?: LibraryProviderQueryGuide;
  queryHelp: string;
  queryLabel: string;
  queryPlaceholder: string;
  requiresLanguageTag: boolean;
  summary: string;
}

export interface LibraryProviderManifest {
  $schema?: string;
  apiVersion: typeof LIBRARY_PROVIDER_API_VERSION;
  descriptor: LibraryProviderDescriptor;
  entry: string;
  kind: "afterleaf-content-provider";
}

export interface LibraryProviderSyncOptions {
  blockedTags: readonly string[];
  excludedPublicationIds: readonly string[];
  languages: readonly SupportedLanguage[];
  limit: number;
  maxSearchPages: number;
  onProgress?: (message: string) => void;
  outputDirectory: string;
  query: string;
  selectionMode: "recent" | "unseen";
  write: boolean;
}

export interface LibraryProviderDiagnostic {
  code: string;
  message: string;
  publicationId?: string;
}

export interface LibraryProviderSyncReport {
  addedCount: number;
  diagnostics: readonly LibraryProviderDiagnostic[];
  outputDirectory: string;
  providerId: string;
  query: string;
  requestedLimit: number;
  selectedPublicationIds: readonly string[];
  unchangedCount: number;
  updatedCount: number;
  wroteCatalog: boolean;
}

/** A provider-owned match that the host can pass through its normal sync job. */
export interface LibraryProviderPasteImport {
  publicationId?: string;
  query: string;
}

export interface LibraryProviderSparsePageRequest {
  metadataHash: string;
  pageCount: number;
  pageNumber: number;
  publication: PackedPublication;
  sourceDirectory: string;
}

export interface LibraryProvider {
  readonly descriptor: LibraryProviderDescriptor;
  materializePage?(request: LibraryProviderSparsePageRequest): Promise<Buffer>;
  /** Recognizes pasted text without acquiring content; the host starts sync. */
  resolvePastedImport?(
    text: string,
  ):
    | LibraryProviderPasteImport
    | Promise<LibraryProviderPasteImport | undefined>
    | undefined;
  sync(options: LibraryProviderSyncOptions): Promise<LibraryProviderSyncReport>;
}

export interface LibraryProviderPluginContext {
  readonly descriptor: LibraryProviderDescriptor;
  readonly pluginDirectory: string;
}

export interface LibraryProviderPluginModule {
  createProvider(
    context: LibraryProviderPluginContext,
  ): LibraryProvider | Promise<LibraryProvider>;
}
