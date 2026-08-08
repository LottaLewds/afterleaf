import {resolve} from "node:path";
import {NhentaiClient, type NhentaiClientOptions} from "./client";
import {nhentaiClientOptionsFromEnvironment} from "./environment";
import {createNhentaiSparsePageMaterializer} from "./sparsePage";
import {syncNhentaiCatalog, type NhentaiSyncReport} from "./sync";
import {nhentaiGalleryIdFromText, nhentaiGalleryUrl} from "./url";
import type {
  LibraryProvider,
  LibraryProviderDescriptor,
  LibraryProviderPluginModule,
  LibraryProviderSyncOptions,
  LibraryProviderSyncReport,
} from "@afterleaf/provider-sdk";

export const NHENTAI_PROVIDER_ID = "nhentai" as const;

const normalizeQuery = (query: string) => {
  const normalized = query.trim();
  if (!normalized) return 'tag:"big breasts"';
  return normalized.includes(":")
    ? normalized
    : `tag:${JSON.stringify(normalized)}`;
};

const reportFromNhentai = (
  report: NhentaiSyncReport,
): LibraryProviderSyncReport => ({
  addedCount: report.addedCount,
  diagnostics: report.diagnostics,
  outputDirectory: report.outputDirectory,
  providerId: NHENTAI_PROVIDER_ID,
  query: report.query,
  requestedLimit: report.requestedLimit,
  selectedPublicationIds: report.selectedGalleryIds.map(
    (galleryId) => `nhentai-${galleryId}`,
  ),
  unchangedCount: report.unchangedCount,
  updatedCount: report.updatedCount,
  wroteCatalog: report.wroteCatalog,
});

export interface NhentaiProviderOptions {
  client?: NhentaiClient;
  clientOptions?: NhentaiClientOptions;
}

const logNhentaiRetry: NonNullable<NhentaiClientOptions["onRetry"]> = (
  event,
) => {
  const status = event.status ? `HTTP ${event.status}` : "network failure";
  console.warn(
    `[afterleaf] nHentai ${status}; retry ${event.retryAttempt}/${event.retryLimit} in ${event.delayMilliseconds} ms (${event.delaySource}): ${event.url}`,
  );
};

const nhentaiRetryProgress = (
  event: Parameters<NonNullable<NhentaiClientOptions["onRetry"]>>[0],
) => {
  const status = event.status ? `HTTP ${event.status}` : "network failure";
  return `nHentai ${status}; retry ${event.retryAttempt}/${event.retryLimit} in ${event.delayMilliseconds} ms (${event.delaySource}): ${event.url}`;
};

export const createNhentaiProviderFromEnvironment = (
  descriptor: LibraryProviderDescriptor,
) => {
  return createNhentaiProvider({
    descriptor,
    clientOptions: nhentaiClientOptionsFromEnvironment(),
  });
};

export const createNhentaiProvider = (
  options: NhentaiProviderOptions & {descriptor: LibraryProviderDescriptor},
): LibraryProvider => {
  const sparsePageClient =
    options.client ??
    new NhentaiClient({
      ...options.clientOptions,
      onRetry: options.clientOptions?.onRetry ?? logNhentaiRetry,
    });
  return {
    descriptor: options.descriptor,
    materializePage: createNhentaiSparsePageMaterializer(sparsePageClient),
    resolvePastedImport: (text) => {
      const galleryId = nhentaiGalleryIdFromText(text);
      if (galleryId === undefined) return;
      return {
        publicationId: `nhentai-${galleryId}`,
        query: nhentaiGalleryUrl(galleryId),
      };
    },
    sync: async (syncOptions: LibraryProviderSyncOptions) => {
      const syncClient =
        options.client ??
        new NhentaiClient({
          ...options.clientOptions,
          cacheDirectory: resolve(
            syncOptions.outputDirectory,
            ".afterleaf-api-cache",
          ),
          onCacheHit: ({ageMilliseconds, url}) =>
            syncOptions.onProgress?.(
              `nHentai API cache hit (${Math.round(ageMilliseconds / 1_000)}s old): ${url}`,
            ),
          onRetry: (event) => {
            (options.clientOptions?.onRetry ?? logNhentaiRetry)(event);
            syncOptions.onProgress?.(nhentaiRetryProgress(event));
          },
        });
      return reportFromNhentai(
        await syncNhentaiCatalog(
          {
            blockedTags: [...syncOptions.blockedTags],
            excludedPublicationIds: [...syncOptions.excludedPublicationIds],
            languages: [...syncOptions.languages],
            limit: syncOptions.limit,
            maxSearchPages: syncOptions.maxSearchPages,
            onProgress: syncOptions.onProgress,
            outputDirectory: syncOptions.outputDirectory,
            previewPageCount: 3,
            query: normalizeQuery(syncOptions.query),
            searchPageDelayMs: 2_000,
            selectionMode: syncOptions.selectionMode,
            write: syncOptions.write,
          },
          {client: syncClient},
        ),
      );
    },
  };
};

export const createProvider: LibraryProviderPluginModule["createProvider"] = (
  context,
) => createNhentaiProviderFromEnvironment(context.descriptor);
