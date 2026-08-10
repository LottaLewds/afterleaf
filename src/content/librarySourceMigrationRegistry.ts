import {
  runLibrarySourceMigrations,
  type LibrarySourceMigration,
} from "~/content/librarySourceMigrations";
import {createProviderAspectRatioMigration} from "~/content/providerAspectRatioMigrations";
import type {LibraryProviderRegistry} from "~/content/providers/registry";

export const createLibrarySourceMigrationRegistry = (
  providerRegistry: LibraryProviderRegistry,
): readonly LibrarySourceMigration[] => [
  createProviderAspectRatioMigration({
    loadProvider: (providerId) => providerRegistry.load(providerId),
    providerIds: new Set(
      providerRegistry.descriptors().map((descriptor) => descriptor.id),
    ),
  }),
];

export const migrateLibrarySourcesWithRegistry = (
  sourceDirectory: string,
  providerRegistry: LibraryProviderRegistry,
  onProgress?: (message: string) => void,
) =>
  runLibrarySourceMigrations({
    migrations: createLibrarySourceMigrationRegistry(providerRegistry),
    ...(onProgress === undefined ? {} : {onProgress}),
    sourceDirectory,
  });
