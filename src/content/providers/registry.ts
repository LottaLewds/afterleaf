import {isDeepStrictEqual} from "node:util";
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {basename, delimiter, dirname, resolve} from "node:path";
import {
  createBunProviderModuleLoader,
  type LibraryProviderModuleLocation,
} from "./bunRuntime";
import {
  LIBRARY_PROVIDER_MANIFEST_NAME,
  parseLibraryProviderDescriptor,
  parseLibraryProviderManifest,
} from "./manifest";
import type {
  LibraryProvider,
  LibraryProviderDescriptor,
  LibraryProviderManifest,
  LibraryProviderPluginModule,
} from "./types";

export const DEFAULT_LIBRARY_PROVIDER_ID = "nhentai" as const;

interface DiscoveredLibraryProvider {
  entryPath: string;
  manifest: LibraryProviderManifest;
  manifestPath: string;
  pluginDirectory: string;
  projectDirectory: string;
}

export interface LibraryProviderRegistryOptions {
  /** Host-specific module loader. Defaults to the project-rooted Bun runtime. */
  loadModule?: LibraryProviderModuleLoader;
  /** Additional plugin directories or manifest paths. */
  pluginPaths?: readonly string[];
  /** Preconstructed providers used by tests and specialized embedding hosts. */
  providers?: readonly LibraryProvider[];
  /** Afterleaf application root containing src/content/providers. */
  rootDirectory?: string;
}

export interface LibraryProviderRegistry {
  descriptors(): readonly LibraryProviderDescriptor[];
  getDescriptor(providerId: string): LibraryProviderDescriptor;
  load(providerId: string): Promise<LibraryProvider>;
}

export type LibraryProviderModuleLoader = (
  location: LibraryProviderModuleLocation,
) => Promise<unknown>;

const manifestPathsIn = (parentDirectory: string) => {
  if (!existsSync(parentDirectory)) return [];
  return readdirSync(parentDirectory, {withFileTypes: true}).flatMap(
    (entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) return [];
      const manifestPath = resolve(
        parentDirectory,
        entry.name,
        LIBRARY_PROVIDER_MANIFEST_NAME,
      );
      return existsSync(manifestPath) ? [manifestPath] : [];
    },
  );
};

const manifestPathsFromExplicitPath = (path: string) => {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath))
    throw new Error(
      `Content provider plugin path does not exist: ${resolvedPath}`,
    );
  if (statSync(resolvedPath).isFile()) {
    if (basename(resolvedPath) !== LIBRARY_PROVIDER_MANIFEST_NAME)
      throw new Error(
        `Content provider manifest must be named ${LIBRARY_PROVIDER_MANIFEST_NAME}: ${resolvedPath}`,
      );
    return [resolvedPath];
  }
  const directManifest = resolve(resolvedPath, LIBRARY_PROVIDER_MANIFEST_NAME);
  if (existsSync(directManifest)) return [directManifest];
  const nestedManifests = manifestPathsIn(resolvedPath);
  if (nestedManifests.length > 0) return nestedManifests;
  throw new Error(
    `No ${LIBRARY_PROVIDER_MANIFEST_NAME} found under ${resolvedPath}`,
  );
};

const readProviderManifest = (
  manifestPath: string,
  projectDirectory: string,
): DiscoveredLibraryProvider => {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Could not parse content provider manifest ${manifestPath}`,
      {
        cause: error,
      },
    );
  }
  const manifest = parseLibraryProviderManifest(value, manifestPath);
  const pluginDirectory = dirname(manifestPath);
  const entryPath = resolve(pluginDirectory, manifest.entry);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile())
    throw new Error(
      `Content provider ${manifest.descriptor.id} entry does not exist: ${entryPath}`,
    );
  return {
    entryPath,
    manifest,
    manifestPath,
    pluginDirectory,
    projectDirectory,
  };
};

const environmentPluginPaths = () =>
  process.env.AFTERLEAF_CONTENT_PLUGIN_PATHS?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean) ?? [];

const discoverProviders = (
  options: LibraryProviderRegistryOptions,
  rootDirectory: string,
) => {
  const manifestLocations: readonly (readonly [string, string])[] = [
    ...manifestPathsIn(resolve(rootDirectory, "src/content/providers")).map(
      (manifestPath) => [manifestPath, rootDirectory] as const,
    ),
    ...manifestPathsIn(resolve(rootDirectory, "content-plugins")).map(
      (manifestPath) => [manifestPath, dirname(manifestPath)] as const,
    ),
    ...(options.pluginPaths ?? [])
      .flatMap(manifestPathsFromExplicitPath)
      .map((manifestPath) => [manifestPath, dirname(manifestPath)] as const),
    ...environmentPluginPaths()
      .flatMap(manifestPathsFromExplicitPath)
      .map((manifestPath) => [manifestPath, dirname(manifestPath)] as const),
  ];
  const providers = new Map<string, DiscoveredLibraryProvider>();
  const visitedManifests = new Set<string>();
  for (const [manifestPath, projectDirectory] of manifestLocations) {
    if (visitedManifests.has(manifestPath)) continue;
    visitedManifests.add(manifestPath);
    const provider = readProviderManifest(manifestPath, projectDirectory);
    const id = provider.manifest.descriptor.id;
    const existing = providers.get(id);
    if (existing)
      throw new Error(
        `Duplicate content provider ${id}: ${existing.manifestPath} and ${provider.manifestPath}`,
      );
    providers.set(id, provider);
  }
  return providers;
};

const validateLoadedProvider = (
  value: unknown,
  discovered: DiscoveredLibraryProvider,
) => {
  if (typeof value !== "object" || value === null)
    throw new Error("createProvider() must return an object");
  const provider = value as Partial<LibraryProvider>;
  if (typeof provider.sync !== "function")
    throw new Error("createProvider() must return a sync function");
  if (
    provider.materializePage !== undefined &&
    typeof provider.materializePage !== "function"
  )
    throw new Error("materializePage must be a function when provided");
  if (
    provider.resolvePastedImport !== undefined &&
    typeof provider.resolvePastedImport !== "function"
  )
    throw new Error("resolvePastedImport must be a function when provided");
  const descriptor = parseLibraryProviderDescriptor(
    provider.descriptor,
    `${discovered.manifestPath} runtime descriptor`,
  );
  if (!isDeepStrictEqual(descriptor, discovered.manifest.descriptor))
    throw new Error(
      `Content provider ${discovered.manifest.descriptor.id} runtime descriptor does not match its manifest`,
    );
  return provider as LibraryProvider;
};

const loadProvider = async (
  discovered: DiscoveredLibraryProvider,
  loadModule: LibraryProviderModuleLoader,
) => {
  try {
    const loadedModule = await loadModule({
      entryPath: discovered.entryPath,
      projectDirectory: discovered.projectDirectory,
    });
    if (typeof loadedModule !== "object" || loadedModule === null)
      throw new Error("entry module must export createProvider(context)");
    const imported = loadedModule as Partial<LibraryProviderPluginModule>;
    if (typeof imported.createProvider !== "function")
      throw new Error("entry module must export createProvider(context)");
    const provider = await imported.createProvider({
      descriptor: discovered.manifest.descriptor,
      pluginDirectory: discovered.pluginDirectory,
    });
    return validateLoadedProvider(provider, discovered);
  } catch (error) {
    throw new Error(
      `Could not load content provider ${discovered.manifest.descriptor.id} from ${discovered.entryPath}`,
      {cause: error},
    );
  }
};

export const createLibraryProviderRegistry = (
  options: LibraryProviderRegistryOptions = {},
): LibraryProviderRegistry => {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const discovered = discoverProviders(options, rootDirectory);
  const loadModule =
    options.loadModule ??
    createBunProviderModuleLoader(
      resolve(rootDirectory, "src/content/providers/bunRuntimeHost.mjs"),
      resolve(rootDirectory, "src/content/providers/publicSdk.ts"),
    );
  const providers = new Map(
    options.providers?.map((provider) => [provider.descriptor.id, provider]) ??
      [],
  );
  const loadPromises = new Map<string, Promise<LibraryProvider>>();
  const descriptors = new Map(
    [...discovered].map(([id, provider]) => [id, provider.manifest.descriptor]),
  );
  for (const [id, provider] of providers)
    descriptors.set(id, provider.descriptor);
  const orderedDescriptors = [...descriptors.values()].toSorted(
    (first, second) => {
      if (first.id === DEFAULT_LIBRARY_PROVIDER_ID) return -1;
      if (second.id === DEFAULT_LIBRARY_PROVIDER_ID) return 1;
      return first.name.localeCompare(second.name);
    },
  );
  return {
    descriptors: () => orderedDescriptors,
    getDescriptor: (providerId) => {
      const descriptor = descriptors.get(providerId);
      if (!descriptor)
        throw new Error(`Unknown library provider: ${providerId}`);
      return descriptor;
    },
    load: (providerId) => {
      const provider = providers.get(providerId);
      if (provider) return Promise.resolve(provider);
      const pending = loadPromises.get(providerId);
      if (pending) return pending;
      const plugin = discovered.get(providerId);
      if (!plugin)
        return Promise.reject(
          new Error(`Unknown library provider: ${providerId}`),
        );
      const next = loadProvider(plugin, loadModule);
      loadPromises.set(providerId, next);
      return next;
    },
  };
};

export const getLibraryProviderDescriptors = (
  options: LibraryProviderRegistryOptions = {},
) => createLibraryProviderRegistry(options).descriptors();
