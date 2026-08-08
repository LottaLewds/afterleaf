import type {
  LibraryProvider,
  LibraryProviderDescriptor,
  LibraryProviderPluginModule,
  LibraryProviderSyncOptions,
} from "@afterleaf/provider-sdk";
import {WeebCentralClient, type WeebCentralClientOptions} from "./client";
import {createWeebCentralSparsePageMaterializer} from "./sparsePage";
import {syncWeebCentralCatalog} from "./sync";

export const WEEBCENTRAL_PROVIDER_ID = "weebcentral" as const;

export interface WeebCentralProviderOptions {
  client?: WeebCentralClient;
  clientOptions?: WeebCentralClientOptions;
}

export const createWeebCentralProvider = (
  descriptor: LibraryProviderDescriptor,
  options: WeebCentralProviderOptions = {},
): LibraryProvider => {
  const client = options.client ?? new WeebCentralClient(options.clientOptions);
  return {
    descriptor,
    materializePage: createWeebCentralSparsePageMaterializer(client),
    sync: (syncOptions: LibraryProviderSyncOptions) =>
      syncWeebCentralCatalog(syncOptions, {client}),
  };
};

export const createProvider: LibraryProviderPluginModule["createProvider"] = (
  context,
) => createWeebCentralProvider(context.descriptor);
