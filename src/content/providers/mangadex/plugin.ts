import {MangaDexClient, type MangaDexClientOptions} from "./client";
import {createMangaDexSparsePageMaterializer} from "./sparsePage";
import {syncMangaDexCatalog} from "./sync";
import type {
  LibraryProvider,
  LibraryProviderDescriptor,
  LibraryProviderPluginModule,
  LibraryProviderSyncOptions,
} from "@afterleaf/provider-sdk";

export const MANGADEX_PROVIDER_ID = "mangadex" as const;

export interface MangaDexProviderOptions {
  client?: MangaDexClient;
  clientOptions?: MangaDexClientOptions;
}

export const createMangaDexProvider = (
  descriptor: LibraryProviderDescriptor,
  options: MangaDexProviderOptions = {},
): LibraryProvider => {
  const client = options.client ?? new MangaDexClient(options.clientOptions);
  return {
    descriptor,
    materializePage: createMangaDexSparsePageMaterializer(client),
    sync: (syncOptions: LibraryProviderSyncOptions) =>
      syncMangaDexCatalog(syncOptions, {client}),
  };
};

export const createProvider: LibraryProviderPluginModule["createProvider"] = (
  context,
) => createMangaDexProvider(context.descriptor);
