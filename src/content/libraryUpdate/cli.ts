import {isAbsolute, relative, resolve} from "node:path";
import {libraryPackDirectory, preparedCatalogDirectory, providersDirectory} from "~/content/dataRoot";
import {importLocalMedia} from "~/content/libraryMedia";
import type {LibraryUpdateState} from "~/content/libraryUpdate/protocol";
import {PublicationBlacklistStore} from "~/content/libraryUpdate/publicationBlacklist";
import {discardManagedPublicationSources} from "~/content/libraryUpdate/sourceDiscard";
import {createLibraryUpdateService} from "~/content/libraryUpdate/service";
import {DEFAULT_LIBRARY_PROVIDER_ID} from "~/content/providers/registry";
import {createLibraryProviderRegistry} from "~/content/providers/registry";
import {normalizeTags, parseSupportedLanguage} from "~/content/normalize";
import type {SupportedLanguage} from "~/content/schema";

export interface LibraryUpdateCliOptions {
  catalogDirectory: string;
  help: boolean;
  libraryDirectory: string;
  mediaPaths: string[];
  providerId: string;
  sync: {
    blockedTags: string[];
    languages: SupportedLanguage[];
    limit: number;
    maxSearchPages: number;
    query: string;
    redownloadProviderAssets: boolean;
    repair: boolean;
    repairProviderMetadata: boolean;
    write: boolean;
  };
}

const extractLibraryDirectories = (arguments_: readonly string[], workingDirectory: string) => {
  const remainingArguments: string[] = [];
  let catalogDirectory = providersDirectory(workingDirectory);
  let libraryDirectory = libraryPackDirectory(workingDirectory);
  const mediaPaths: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument?.startsWith("--library=")) {
      libraryDirectory = argument.slice("--library=".length);
      continue;
    }
    if (argument?.startsWith("--catalog-root=")) {
      catalogDirectory = argument.slice("--catalog-root=".length);
      continue;
    }
    if (argument?.startsWith("--media-path=")) {
      const value = argument.slice("--media-path=".length);
      if (!value) throw new Error("--media-path requires a value");
      mediaPaths.push(value);
      continue;
    }
    if (argument === "--catalog-root") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--catalog-root requires a value");
      catalogDirectory = value;
      index += 1;
      continue;
    }
    if (argument === "--library") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--library requires a value");
      libraryDirectory = value;
      index += 1;
      continue;
    }
    if (argument === "--media-path") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--media-path requires a value");
      mediaPaths.push(value);
      index += 1;
      continue;
    }
    if (argument) remainingArguments.push(argument);
  }
  return {
    catalogDirectory: resolve(workingDirectory, catalogDirectory),
    libraryDirectory: resolve(workingDirectory, libraryDirectory),
    mediaPaths: mediaPaths.map((path) => resolve(workingDirectory, path)),
    remainingArguments,
  };
};

const parseProviderId = (arguments_: readonly string[]) => {
  const remainingArguments: string[] = [];
  let providerId: string = DEFAULT_LIBRARY_PROVIDER_ID;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument?.startsWith("--provider=")) {
      providerId = argument.slice("--provider=".length);
      continue;
    }
    if (argument === "--provider") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--provider requires a value");
      providerId = value;
      index += 1;
      continue;
    }
    remainingArguments.push(argument ?? "");
  }
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(providerId)) throw new Error("--provider must be a portable provider identifier");
  return {providerId, remainingArguments};
};

const genericProviderOptions = new Set([
  "blocked-tags",
  "blocked-tags-json",
  "languages",
  "limit",
  "max-search-pages",
  "query",
]);
const genericProviderFlags = new Set([
  "help",
  "redownload-provider-assets",
  "repair",
  "repair-provider-metadata",
  "write",
]);

const parseGenericProviderSyncOptions = (
  arguments_: readonly string[],
  providerId: string,
): {help: boolean; sync: LibraryUpdateCliOptions["sync"]} => {
  const descriptor = createLibraryProviderRegistry().getDescriptor(providerId);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith("--")) throw new Error(`Unexpected positional argument: ${argument ?? ""}`);
    const equalsIndex = argument.indexOf("=");
    const name = argument.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
    if (genericProviderFlags.has(name)) {
      if (inlineValue !== undefined) throw new Error(`--${name} does not accept a value`);
      flags.add(name);
      continue;
    }
    if (!genericProviderOptions.has(name)) throw new Error(`Unknown option for ${providerId}: --${name}`);
    const value = inlineValue ?? arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
    if (inlineValue === undefined) index += 1;
    values.set(name, value);
  }
  const parsePositiveInteger = (name: string, fallback: number) => {
    const value = Number(values.get(name) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
    return value;
  };
  const languages = (values.get("languages") ?? descriptor.defaultLanguages.join(","))
    .split(",")
    .map((language) => parseSupportedLanguage(language.trim()))
    .filter((language): language is SupportedLanguage => language !== undefined);
  if (languages.length === 0) throw new Error("--languages must include english or japanese");
  const blockedTagsValue = values.get("blocked-tags");
  const blockedTagsJson = values.get("blocked-tags-json");
  if (blockedTagsValue !== undefined && blockedTagsJson !== undefined)
    throw new Error("Pass either --blocked-tags or --blocked-tags-json, not both");
  let blockedTags: string[] = blockedTagsValue?.split(",") ?? [];
  if (blockedTagsJson !== undefined) {
    const parsed = JSON.parse(blockedTagsJson) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string"))
      throw new Error("--blocked-tags-json must be an array of strings");
    blockedTags = parsed;
  }
  const repair = flags.has("repair");
  const redownloadProviderAssets = flags.has("redownload-provider-assets");
  const repairProviderMetadata = flags.has("repair-provider-metadata");
  if (!repair && (redownloadProviderAssets || repairProviderMetadata))
    throw new Error("Remote repair options require --repair");
  return {
    help: flags.has("help"),
    sync: {
      blockedTags: normalizeTags(
        blockedTagsValue === undefined && blockedTagsJson === undefined ? descriptor.defaultBlockedTags : blockedTags,
      ),
      languages: [...new Set(languages)],
      limit: parsePositiveInteger("limit", 20),
      maxSearchPages: parsePositiveInteger("max-search-pages", 10),
      query: values.get("query")?.trim() ?? descriptor.defaultQuery,
      redownloadProviderAssets,
      repair,
      repairProviderMetadata,
      write: flags.has("write"),
    },
  };
};

export const parseLibraryUpdateCliOptions = (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
): LibraryUpdateCliOptions => {
  const {catalogDirectory, libraryDirectory, mediaPaths, remainingArguments} = extractLibraryDirectories(
    arguments_,
    workingDirectory,
  );
  const {providerId, remainingArguments: providerArguments} = parseProviderId(remainingArguments);
  const parsed = parseGenericProviderSyncOptions(providerArguments, providerId);
  return {
    catalogDirectory,
    help: parsed.help,
    libraryDirectory,
    mediaPaths,
    providerId,
    sync: parsed.sync,
  };
};

const pathIsWithin = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

const importPendingLocalMedia = async (options: LibraryUpdateCliOptions, workingDirectory: string) => {
  const result = await importLocalMedia(
    workingDirectory,
    preparedCatalogDirectory(workingDirectory),
    options.mediaPaths,
    {repair: options.sync.repair},
  );
  return {
    ...result,
    additionalCatalogDirectories: result.catalogDirectories.filter(
      (directory) => !pathIsWithin(options.catalogDirectory, directory),
    ),
  };
};

export const LIBRARY_SCAN_HELP = `Scan existing disk content and activate a new Afterleaf library catalog revision.

Usage:
  bun run library:scan --write [--repair] [options]

This command never contacts a remote provider. It imports CBZ, ZIP, CBR, RAR,
and image-folder publications from built-in and configured media paths, scans
--catalog-root (default: the providers folder), excludes persistent blacklist entries,
updates the persistent derived-asset pool, and atomically advances the active
catalog revision.

Repeat --media-path <file-or-directory> to add media for this run. Import & scan
also reads comicPaths and mangaPaths from afterleaf.library.json in the
Afterleaf data folder.

Quick scans reuse unchanged generated assets using local file metadata. Pass
--repair to rebuild and validate every local publication and archive. Add
--repair-provider-metadata to upgrade older cached provider manifests, or
--redownload-provider-assets to refresh every cached provider preview and back
cover. The provider options may contact remotes but do not search for or add
books.
`;

export const LIBRARY_FETCH_MORE_HELP = `Fetch unseen publications from a discovered provider, then update and activate the library catalog.

Usage:
  bun run library:fetch-more --provider <id> --write [options]

Providers are discovered from afterleaf-provider.json manifests. Each provider
owns its search, configuration, and page-materialization rules.
The limit counts newly added source publications; incomplete cached publications
may be repaired outside that limit.
`;

export const runLibraryScanCli = async (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
  onState?: (state: LibraryUpdateState) => void,
) => {
  const options = parseLibraryUpdateCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  if (!options.sync.write) throw new Error("Library scans write a new snapshot; pass --write to continue");
  const localMedia = await importPendingLocalMedia(options, workingDirectory);
  const service = createLibraryUpdateService({
    additionalCatalogDirectories: localMedia.additionalCatalogDirectories,
    catalogDirectory: options.catalogDirectory,
    libraryDirectory: options.libraryDirectory,
    sourceDirectory: options.catalogDirectory,
  });
  const unsubscribe = onState ? service.subscribe(onState) : undefined;
  try {
    return await service.scan({
      languages: options.sync.languages,
      ...(options.sync.redownloadProviderAssets ? {redownloadProviderAssets: true} : {}),
      ...(options.sync.repair ? {repair: true} : {}),
      ...(options.sync.repairProviderMetadata ? {repairProviderMetadata: true} : {}),
    });
  } finally {
    unsubscribe?.();
  }
};

export const runLibraryFetchMoreCli = async (
  arguments_: readonly string[],
  workingDirectory = process.cwd(),
  onState?: (state: LibraryUpdateState) => void,
) => {
  const options = parseLibraryUpdateCliOptions(arguments_, workingDirectory);
  if (options.help) return undefined;
  if (!options.sync.write)
    throw new Error("Fetching more content writes source files and a snapshot; pass --write to continue");
  const localMedia = await importPendingLocalMedia(options, workingDirectory);
  const service = createLibraryUpdateService({
    additionalCatalogDirectories: localMedia.additionalCatalogDirectories,
    catalogDirectory: options.catalogDirectory,
    libraryDirectory: options.libraryDirectory,
    sourceDirectory: options.catalogDirectory,
  });
  const unsubscribe = onState ? service.subscribe(onState) : undefined;
  try {
    return await service.fetchMore({
      blockedTags: options.sync.blockedTags,
      languages: options.sync.languages,
      limit: options.sync.limit,
      maxSearchPages: options.sync.maxSearchPages,
      providerId: options.providerId,
      ...(options.sync.query ? {query: options.sync.query} : {}),
      localSourceChanged:
        localMedia.archivePreparedCount > 0 ||
        localMedia.archiveRemovedCount > 0 ||
        localMedia.imageFolderPreparedCount > 0,
    });
  } finally {
    unsubscribe?.();
  }
};

export const runLibraryBlacklistCli = async (arguments_: readonly string[], workingDirectory = process.cwd()) => {
  const {libraryDirectory, remainingArguments} = extractLibraryDirectories(arguments_, workingDirectory);
  const store = new PublicationBlacklistStore(libraryDirectory);
  const discardManagedSources = remainingArguments.includes("--discard-managed-sources");
  const commandArguments = remainingArguments.filter((argument) => argument !== "--discard-managed-sources");
  if (commandArguments.length === 1 && commandArguments[0] === "--list") return {publicationIds: await store.list()};

  let publicationId: string | undefined;
  if (commandArguments[0]?.startsWith("--publication-id="))
    publicationId = commandArguments[0].slice("--publication-id=".length);
  else if (commandArguments[0] === "--publication-id") publicationId = commandArguments[1];
  else if (commandArguments.length === 1) publicationId = commandArguments[0];
  const expectedArgumentCount = commandArguments[0] === "--publication-id" ? 2 : 1;
  if (!publicationId || commandArguments.length !== expectedArgumentCount)
    throw new Error("Usage: bun run library:blacklist [--library <directory>] (--list | --publication-id <id>)");
  const result = await store.add(publicationId);
  if (!discardManagedSources) return result;
  const discarded = await discardManagedPublicationSources(workingDirectory, publicationId);
  return {...result, managedSourceCount: discarded.managedSourceCount};
};
