import {randomUUID} from "node:crypto";
import {readFile, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {
  type LibraryPublicationDiff,
  type LibraryFetchMoreRequest,
  type LibraryFetchMoreResult,
  type LibraryScanRequest,
  type LibraryScanResult,
  type LibrarySnapshotDescriptor,
  type LibrarySnapshotIndex,
  type LibraryUpdateClient,
  type LibraryUpdatePhase,
  type LibraryUpdateState,
  type LibraryUpdateStateListener,
} from "~/content/libraryUpdate/protocol";
import {
  activeSnapshotFromIndex,
  assertSnapshotId,
  LibrarySnapshotIndexStore,
} from "~/content/libraryUpdate/snapshotIndex";
import {normalizeTags} from "~/content/normalize";
import {migrateLibrarySourcesWithRegistry} from "~/content/librarySourceMigrationRegistry";
import type {LibrarySourceMigrationReport} from "~/content/librarySourceMigrations";
import {
  createLibraryProviderRegistry,
  DEFAULT_LIBRARY_PROVIDER_ID,
  type LibraryProviderRegistry,
} from "~/content/providers/registry";
import type {
  LibraryProviderDescriptor,
  LibraryProviderSyncOptions,
  LibraryProviderSyncReport,
} from "~/content/providers/types";
import {PublicationBlacklistStore} from "~/content/libraryUpdate/publicationBlacklist";
import {
  discardLibraryAssetSet,
  promoteLibraryAssetSet,
  retireUnreferencedLibraryAssetSets,
} from "~/content/libraryUpdate/libraryAssetPool";
import type {
  ContentPackCatalog,
  SeedContentPackOptions,
  SeedContentPackResult,
} from "~/content/schema";
import {seedContentPack} from "~/content/seed";

const DEFAULT_LANGUAGES = ["english", "japanese"] as const;

export interface SnapshotCatalogSummary {
  contentHash: string;
  publications: Array<{
    contentHash: string;
    id: string;
    localSourceId?: string;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSnapshotCatalogSummary = (
  value: unknown,
  field: string,
): SnapshotCatalogSummary => {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  if (typeof value.contentHash !== "string" || !value.contentHash)
    throw new Error(`${field}.contentHash must be a non-empty string`);
  if (!Array.isArray(value.publications))
    throw new Error(`${field}.publications must be an array`);
  const publications = value.publications.map((publication, index) => {
    if (!isRecord(publication))
      throw new Error(`${field}.publications[${index}] must be an object`);
    if (typeof publication.id !== "string" || !publication.id)
      throw new Error(
        `${field}.publications[${index}].id must be a non-empty string`,
      );
    if (typeof publication.contentHash !== "string" || !publication.contentHash)
      throw new Error(
        `${field}.publications[${index}].contentHash must be a non-empty string`,
      );
    if (
      publication.localSourceId !== undefined &&
      (typeof publication.localSourceId !== "string" ||
        !publication.localSourceId)
    )
      throw new Error(
        `${field}.publications[${index}].localSourceId must be a non-empty string`,
      );
    return {
      contentHash: publication.contentHash,
      id: publication.id,
      ...(publication.localSourceId === undefined
        ? {}
        : {localSourceId: publication.localSourceId}),
    };
  });
  if (
    new Set(publications.map((publication) => publication.id)).size !==
    publications.length
  )
    throw new Error(`${field}.publications contains duplicate IDs`);
  return {contentHash: value.contentHash, publications};
};

const summarizeCatalog = (catalog: ContentPackCatalog) =>
  parseSnapshotCatalogSummary(catalog, "generated catalog");

export const diffLibraryPublications = (
  previous: SnapshotCatalogSummary | undefined,
  next: SnapshotCatalogSummary,
): LibraryPublicationDiff => {
  const previousById = new Map(
    previous?.publications.map((publication) => [
      publication.id,
      publication,
    ]) ?? [],
  );
  const nextById = new Map(
    next.publications.map((publication) => [publication.id, publication]),
  );
  const addedPublicationIds: string[] = [];
  const unchangedPublicationIds: string[] = [];
  const updatedPublicationIds: string[] = [];
  for (const publication of next.publications) {
    const previousPublication = previousById.get(publication.id);
    if (!previousPublication) {
      addedPublicationIds.push(publication.id);
      continue;
    }
    if (previousPublication.contentHash === publication.contentHash)
      unchangedPublicationIds.push(publication.id);
    else updatedPublicationIds.push(publication.id);
  }
  const removedPublicationIds = previous
    ? previous.publications
        .filter((publication) => !nextById.has(publication.id))
        .map((publication) => publication.id)
    : [];
  return {
    addedPublicationIds,
    removedPublicationIds,
    unchangedPublicationIds,
    updatedPublicationIds,
  };
};

export interface LibraryUpdateServiceOptions {
  catalogDirectory?: string;
  libraryDirectory: string;
  packId?: string;
  sourceDirectory: string;
}

export interface LibraryUpdateServiceDependencies {
  activateSnapshot(
    snapshot: LibrarySnapshotDescriptor,
  ): Promise<LibrarySnapshotIndex>;
  createRequestId?: () => string;
  createSnapshotId?: (now: Date) => string;
  discardSnapshot?: (snapshotDirectory: string) => Promise<void>;
  discardAssetSet?: (revisionId: string) => Promise<void>;
  now?: () => Date;
  readBlacklist(): Promise<readonly string[]>;
  readIndex(): Promise<LibrarySnapshotIndex>;
  readSnapshotCatalog(
    snapshot: LibrarySnapshotDescriptor,
  ): Promise<SnapshotCatalogSummary>;
  promoteAssetSet?: (
    revisionDirectory: string,
    revisionId: string,
  ) => Promise<void>;
  retireUnreferencedAssetSets?: (catalog: ContentPackCatalog) => Promise<void>;
  runMigrations?: (
    sourceDirectory: string,
    onProgress?: (message: string) => void,
  ) => Promise<LibrarySourceMigrationReport>;
  runSeed(
    catalogDirectory: string,
    options: SeedContentPackOptions,
    excludedPublicationIds: ReadonlySet<string>,
    previousSnapshot?: LibrarySnapshotDescriptor,
  ): Promise<SeedContentPackResult>;
  defaultProviderId?: string;
  getProviderDescriptor?: (providerId: string) => LibraryProviderDescriptor;
  runSync(
    options: LibraryProviderSyncOptions,
    providerId: string,
  ): Promise<LibraryProviderSyncReport>;
}

export class LibraryUpdateInProgressError extends Error {
  constructor() {
    super("A library operation is already in progress");
    this.name = "LibraryUpdateInProgressError";
  }
}

const defaultSnapshotId = (now: Date) =>
  `${now.toISOString().toLowerCase().replaceAll(":", "").replaceAll("-", "").replace(".", "-")}-${randomUUID().slice(0, 8)}`;

export class LibraryUpdateService implements LibraryUpdateClient {
  readonly #dependencies: LibraryUpdateServiceDependencies;
  readonly #catalogDirectory: string;
  readonly #libraryDirectory: string;
  readonly #listeners = new Set<LibraryUpdateStateListener>();
  readonly #packId: string;
  readonly #sourceDirectory: string;
  #initializePromise: Promise<LibraryUpdateState> | undefined;
  #operationPromise: Promise<unknown> | undefined;
  #state: LibraryUpdateState = {phase: "idle", status: "idle"};

  constructor(
    options: LibraryUpdateServiceOptions,
    dependencies: LibraryUpdateServiceDependencies,
  ) {
    this.#dependencies = dependencies;
    this.#catalogDirectory = resolve(
      options.catalogDirectory ?? options.sourceDirectory,
    );
    this.#libraryDirectory = resolve(options.libraryDirectory);
    this.#packId = options.packId ?? "afterleaf-library";
    this.#sourceDirectory = resolve(options.sourceDirectory);
  }

  getState() {
    return this.#state;
  }

  async initialize() {
    const initializePromise = this.#initializePromise ?? this.#initialize();
    this.#initializePromise = initializePromise;
    await initializePromise;
    return this.#state;
  }

  subscribe(listener: LibraryUpdateStateListener) {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  fetchMore(request: LibraryFetchMoreRequest) {
    return this.#startOperation(() =>
      this.#runOperation(request, "fetch-more"),
    );
  }

  scan(request: LibraryScanRequest) {
    return this.#startOperation(() => this.#runOperation(request, "scan"));
  }

  #startOperation<Result>(operation: () => Promise<Result>) {
    if (this.#operationPromise)
      return Promise.reject(new LibraryUpdateInProgressError());
    const operationPromise = operation();
    this.#operationPromise = operationPromise;
    void operationPromise.then(
      () => {
        if (this.#operationPromise === operationPromise)
          this.#operationPromise = undefined;
      },
      () => {
        if (this.#operationPromise === operationPromise)
          this.#operationPromise = undefined;
      },
    );
    return operationPromise;
  }

  async #initialize() {
    const index = await this.#dependencies.readIndex();
    const activeSnapshot = activeSnapshotFromIndex(index);
    this.#setState({
      ...(activeSnapshot === undefined ? {} : {activeSnapshot}),
      phase: "idle",
      status: "idle",
    });
    return this.#state;
  }

  #runOperation(
    request: LibraryScanRequest,
    mode: "scan",
  ): Promise<LibraryScanResult>;
  #runOperation(
    request: LibraryFetchMoreRequest,
    mode: "fetch-more",
  ): Promise<LibraryFetchMoreResult>;
  async #runOperation(
    request: LibraryFetchMoreRequest | LibraryScanRequest,
    mode: "fetch-more" | "scan",
  ): Promise<LibraryFetchMoreResult | LibraryScanResult> {
    await this.initialize();
    const startedAt = (this.#dependencies.now?.() ?? new Date()).toISOString();
    const requestId = this.#dependencies.createRequestId?.() ?? randomUUID();
    const previousSnapshot = this.#state.activeSnapshot;
    let completedSteps = 0;
    let failurePhase: Exclude<
      LibraryUpdatePhase,
      "idle" | "complete" | "failed"
    > = "syncing";
    this.#setRunningState(
      "syncing",
      mode === "scan"
        ? "Scanning local publications"
        : "Searching for new publications",
      completedSteps,
      requestId,
      startedAt,
      previousSnapshot,
    );
    try {
      const previousCatalog = previousSnapshot
        ? await this.#dependencies.readSnapshotCatalog(previousSnapshot)
        : undefined;
      const acquisitionLimit = request.limit ?? 20;
      const blacklistedPublicationIds = [
        ...(await this.#dependencies.readBlacklist()),
      ].toSorted();
      const excludedPublicationIds = new Set(blacklistedPublicationIds);
      const remoteRequest =
        mode === "scan" ? undefined : (request as LibraryFetchMoreRequest);
      const providerId =
        remoteRequest?.providerId ??
        this.#dependencies.defaultProviderId ??
        DEFAULT_LIBRARY_PROVIDER_ID;
      const providerDescriptor = remoteRequest
        ? this.#dependencies.getProviderDescriptor?.(providerId)
        : undefined;
      const acquisitionLanguages = remoteRequest
        ? (request.languages ??
          providerDescriptor?.defaultLanguages ?? [...DEFAULT_LANGUAGES])
        : (request.languages ?? [...DEFAULT_LANGUAGES]);
      const catalogLanguages = remoteRequest
        ? [...DEFAULT_LANGUAGES]
        : acquisitionLanguages;
      const syncReport = !remoteRequest
        ? undefined
        : await this.#dependencies.runSync(
            {
              blockedTags: normalizeTags(
                remoteRequest.blockedTags ??
                  providerDescriptor?.defaultBlockedTags ??
                  [],
              ),
              excludedPublicationIds: blacklistedPublicationIds,
              languages: acquisitionLanguages,
              limit: acquisitionLimit,
              maxSearchPages: remoteRequest.maxSearchPages ?? 10,
              onProgress: (message) =>
                this.#setRunningState(
                  "syncing",
                  message,
                  completedSteps,
                  requestId,
                  startedAt,
                  previousSnapshot,
                ),
              outputDirectory: this.#dependencies.getProviderDescriptor
                ? resolve(this.#sourceDirectory, providerId)
                : this.#sourceDirectory,
              query:
                remoteRequest.query ?? providerDescriptor?.defaultQuery ?? "",
              selectionMode: "unseen",
              write: true,
            },
            providerId,
          );
      const migrationReport =
        remoteRequest && this.#dependencies.runMigrations
          ? await this.#dependencies.runMigrations(
              this.#sourceDirectory,
              (message) =>
                this.#setRunningState(
                  "syncing",
                  message,
                  completedSteps,
                  requestId,
                  startedAt,
                  previousSnapshot,
                ),
            )
          : {
              diagnostics: [],
              failedCount: 0,
              migratedCount: 0,
              pendingCount: 0,
            };
      completedSteps = 1;
      if (
        syncReport &&
        previousSnapshot &&
        request.localSourceChanged === false &&
        syncReport.addedCount === 0 &&
        syncReport.updatedCount === 0 &&
        migrationReport.pendingCount === 0
      ) {
        const finishedAt = (
          this.#dependencies.now?.() ?? new Date()
        ).toISOString();
        const result: LibraryFetchMoreResult = {
          blacklistedPublicationIds,
          diff: {
            addedPublicationIds: [],
            removedPublicationIds: [],
            source: {
              addedCount: syncReport.addedCount,
              unchangedCount: syncReport.unchangedCount,
              updatedCount: syncReport.updatedCount,
            },
            unchangedPublicationIds:
              previousCatalog?.publications.map(({id}) => id) ?? [],
            updatedPublicationIds: [],
          },
          finishedAt,
          previousSnapshot,
          requestId,
          snapshot: previousSnapshot,
          startedAt,
          syncReport,
        };
        this.#setState({
          activeSnapshot: previousSnapshot,
          phase: "complete",
          result,
          status: "succeeded",
        });
        return result;
      }
      failurePhase = "seeding";
      this.#setRunningState(
        "seeding",
        "Updating the derived library asset pool",
        completedSteps,
        requestId,
        startedAt,
        previousSnapshot,
      );
      const snapshotDate = this.#dependencies.now?.() ?? new Date();
      const snapshotId = assertSnapshotId(
        this.#dependencies.createSnapshotId?.(snapshotDate) ??
          defaultSnapshotId(snapshotDate),
      );
      if (snapshotId === previousSnapshot?.snapshotId)
        throw new Error(
          "A library operation cannot replace the active snapshot in place",
        );
      const snapshotDirectory = resolve(
        this.#libraryDirectory,
        "revisions",
        snapshotId,
      );
      const snapshotLimit =
        mode === "scan" && request.limit !== undefined
          ? request.limit
          : Number.MAX_SAFE_INTEGER;
      const seedResult = await this.#dependencies.runSeed(
        this.#catalogDirectory,
        {
          allowEmpty: true,
          dryRun: false,
          excludedTags: [],
          force: false,
          forceRebuild:
            mode === "scan" && (request as LibraryScanRequest).repair === true,
          languages: catalogLanguages,
          limit: snapshotLimit,
          match: request.match ?? "all",
          onDiagnostic: (diagnostic) =>
            this.#setRunningState(
              "seeding",
              `Scan issue: ${diagnostic.message}`,
              completedSteps,
              requestId,
              startedAt,
              previousSnapshot,
            ),
          outputDirectory: snapshotDirectory,
          packId: this.#packId,
          assetPathPrefix: `assets/${snapshotId}`,
          persistentAssetDirectory: this.#libraryDirectory,
          seed: request.seed ?? "afterleaf-library",
          tags: normalizeTags(request.tags ?? []),
        },
        excludedPublicationIds,
        previousSnapshot,
      );
      seedResult.report.diagnostics.unshift(
        ...migrationReport.diagnostics.map(({message, sourceId}) => ({
          code: "migration-failed" as const,
          message,
          sourceId,
        })),
      );
      if (!seedResult.catalog)
        throw new Error(
          "Content seeding completed without a generated catalog",
        );
      completedSteps = 2;
      const nextCatalog = summarizeCatalog(seedResult.catalog);
      const publicationDiff = diffLibraryPublications(
        previousCatalog,
        nextCatalog,
      );
      const unsafeRemovalDiagnostics = new Set([
        "duplicate-id",
        "invalid-assets",
        "invalid-manifest",
      ]);
      const unsafeSourceIds = new Set(
        seedResult.report.diagnostics.flatMap((diagnostic) =>
          unsafeRemovalDiagnostics.has(diagnostic.code) && diagnostic.sourceId
            ? [diagnostic.sourceId]
            : [],
        ),
      );
      const previousPublicationById = new Map(
        previousCatalog?.publications.map((publication) => [
          publication.id,
          publication,
        ]) ?? [],
      );
      const removalAffectedByScanErrors =
        publicationDiff.removedPublicationIds.some((publicationId) => {
          const publication = previousPublicationById.get(publicationId);
          // Catalogs created before source tracking cannot safely attribute an
          // error, so retain the conservative behavior for their first scan.
          if (!publication?.localSourceId) return unsafeSourceIds.size > 0;
          return unsafeSourceIds.has(publication.localSourceId);
        });
      if (
        previousCatalog &&
        publicationDiff.removedPublicationIds.length > 0 &&
        removalAffectedByScanErrors
      ) {
        await Promise.allSettled([
          this.#dependencies.discardSnapshot?.(snapshotDirectory),
          this.#dependencies.discardAssetSet?.(snapshotId),
        ]);
        throw new Error(
          `Library scan kept the current catalog because ${publicationDiff.removedPublicationIds.length} existing ${publicationDiff.removedPublicationIds.length === 1 ? "publication was" : "publications were"} missing after scan errors`,
        );
      }
      if (syncReport && Array.isArray(syncReport.selectedPublicationIds)) {
        const materializedPublicationIds = syncReport.selectedPublicationIds;
        const cataloguedSourcePublicationIds = new Set(
          seedResult.catalog.publications.flatMap((publication) => [
            publication.id,
            ...publication.alternates.map(({id}) => id),
          ]),
        );
        const missingSyncedPublicationIds = materializedPublicationIds.filter(
          (publicationId) => !cataloguedSourcePublicationIds.has(publicationId),
        );
        this.#setRunningState(
          "seeding",
          `${providerId} import pipeline: provider materialized ${materializedPublicationIds.length} (${syncReport.addedCount} added, ${syncReport.updatedCount} updated, ${syncReport.unchangedCount} unchanged); derived catalog has ${nextCatalog.publications.length} publications (${publicationDiff.addedPublicationIds.length} newly visible, ${publicationDiff.updatedPublicationIds.length} updated)`,
          completedSteps,
          requestId,
          startedAt,
          previousSnapshot,
        );
        for (const publicationId of missingSyncedPublicationIds) {
          const reasons = seedResult.report.diagnostics
            .filter(
              (diagnostic) =>
                diagnostic.sourceId === publicationId ||
                diagnostic.sourceId?.endsWith(`/${publicationId}`),
            )
            .map(({message}) => message);
          this.#setRunningState(
            "seeding",
            `${publicationId} was materialized by ${providerId} but did not enter the derived catalog: ${reasons.join("; ") || "no matching seed diagnostic was emitted"}`,
            completedSteps,
            requestId,
            startedAt,
            previousSnapshot,
          );
        }
      }
      let snapshot: LibrarySnapshotDescriptor;
      if (
        previousSnapshot &&
        previousCatalog?.contentHash === nextCatalog.contentHash
      ) {
        this.#setRunningState(
          "activating",
          "Catalog unchanged; keeping the active library revision",
          completedSteps,
          requestId,
          startedAt,
          previousSnapshot,
        );
        await Promise.allSettled([
          this.#dependencies.discardSnapshot?.(snapshotDirectory),
          this.#dependencies.discardAssetSet?.(snapshotId),
        ]);
        snapshot = previousSnapshot;
      } else {
        failurePhase = "activating";
        this.#setRunningState(
          "activating",
          "Promoting new derived library assets",
          completedSteps,
          requestId,
          startedAt,
          previousSnapshot,
        );
        snapshot = {
          catalogContentHash: nextCatalog.contentHash,
          catalogPath: `revisions/${snapshotId}/catalog.json`,
          createdAt: (this.#dependencies.now?.() ?? new Date()).toISOString(),
          directory: `revisions/${snapshotId}`,
          packId: seedResult.catalog.id,
          publicationCount: nextCatalog.publications.length,
          snapshotId,
        };
        try {
          await this.#dependencies.promoteAssetSet?.(
            snapshotDirectory,
            snapshotId,
          );
          this.#setRunningState(
            "activating",
            "Activating the completed library catalog revision",
            completedSteps,
            requestId,
            startedAt,
            previousSnapshot,
          );
          await this.#dependencies.activateSnapshot(snapshot);
          this.#setRunningState(
            "activating",
            "Scheduling retired library assets for cleanup",
            completedSteps,
            requestId,
            startedAt,
            snapshot,
          );
          await this.#dependencies
            .retireUnreferencedAssetSets?.(seedResult.catalog)
            .catch(() => {});
        } catch (error) {
          await Promise.allSettled([
            this.#dependencies.discardSnapshot?.(snapshotDirectory),
            this.#dependencies.discardAssetSet?.(snapshotId),
          ]);
          throw error;
        }
      }
      completedSteps = 3;
      const finishedAt = (
        this.#dependencies.now?.() ?? new Date()
      ).toISOString();
      const scanResult: LibraryScanResult = {
        blacklistedPublicationIds,
        diff: publicationDiff,
        finishedAt,
        ...(previousSnapshot === undefined ? {} : {previousSnapshot}),
        requestId,
        seedReport: seedResult.report,
        snapshot,
        startedAt,
      };
      if (!syncReport) {
        this.#setState({
          activeSnapshot: snapshot,
          phase: "idle",
          status: "idle",
        });
        return scanResult;
      }
      const result: LibraryFetchMoreResult = {
        ...scanResult,
        diff: {
          ...publicationDiff,
          source: {
            addedCount: syncReport.addedCount,
            unchangedCount: syncReport.unchangedCount,
            updatedCount: syncReport.updatedCount,
          },
        },
        syncReport,
      };
      this.#setState({
        activeSnapshot: snapshot,
        phase: "complete",
        result,
        status: "succeeded",
      });
      return result;
    } catch (error) {
      const failedAt = (this.#dependencies.now?.() ?? new Date()).toISOString();
      this.#setState({
        ...(previousSnapshot === undefined
          ? {}
          : {activeSnapshot: previousSnapshot}),
        completedSteps,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "Error",
        },
        failedAt,
        failedPhase: failurePhase,
        phase: "failed",
        requestId,
        startedAt,
        status: "failed",
        totalSteps: 3,
      });
      throw error;
    }
  }

  #setRunningState(
    phase: "syncing" | "seeding" | "activating",
    message: string,
    completedSteps: number,
    requestId: string,
    startedAt: string,
    activeSnapshot: LibrarySnapshotDescriptor | undefined,
  ) {
    this.#setState({
      ...(activeSnapshot === undefined ? {} : {activeSnapshot}),
      completedSteps,
      message,
      phase,
      requestId,
      startedAt,
      status: "running",
      totalSteps: 3,
    });
  }

  #setState(state: LibraryUpdateState) {
    this.#state = state;
    for (const listener of this.#listeners) {
      try {
        listener(state);
      } catch {
        continue;
      }
    }
  }
}

export interface LibraryUpdateServiceConfig {
  additionalCatalogDirectories?: readonly string[];
  catalogDirectory?: string;
  libraryDirectory: string;
  packId?: string;
  providerRegistry?: LibraryProviderRegistry;
  sourceDirectory: string;
}

export const createLibraryUpdateService = (
  config: LibraryUpdateServiceConfig,
) => {
  const libraryDirectory = resolve(config.libraryDirectory);
  const indexStore = new LibrarySnapshotIndexStore(libraryDirectory);
  const blacklistStore = new PublicationBlacklistStore(libraryDirectory);
  const providerRegistry =
    config.providerRegistry ?? createLibraryProviderRegistry();
  const additionalCatalogDirectories =
    config.additionalCatalogDirectories?.map((directory) =>
      resolve(directory),
    ) ?? [];
  return new LibraryUpdateService(
    {
      ...(config.catalogDirectory === undefined
        ? {}
        : {catalogDirectory: config.catalogDirectory}),
      libraryDirectory,
      ...(config.packId === undefined ? {} : {packId: config.packId}),
      sourceDirectory: config.sourceDirectory,
    },
    {
      activateSnapshot: (snapshot) => indexStore.activate(snapshot),
      discardAssetSet: (revisionId) =>
        discardLibraryAssetSet(libraryDirectory, revisionId),
      discardSnapshot: (snapshotDirectory) =>
        rm(snapshotDirectory, {force: true, recursive: true}),
      promoteAssetSet: (revisionDirectory, revisionId) =>
        promoteLibraryAssetSet(
          libraryDirectory,
          revisionDirectory,
          revisionId,
        ).then(() => {}),
      readBlacklist: () => blacklistStore.list(),
      readIndex: () => indexStore.read(),
      readSnapshotCatalog: async (snapshot) => {
        const text = await readFile(
          resolve(libraryDirectory, snapshot.catalogPath),
          "utf8",
        );
        return parseSnapshotCatalogSummary(
          JSON.parse(text) as unknown,
          snapshot.catalogPath,
        );
      },
      retireUnreferencedAssetSets: (catalog) =>
        retireUnreferencedLibraryAssetSets(libraryDirectory, catalog).then(
          () => {},
        ),
      runSeed: async (
        catalogDirectory,
        options,
        excludedPublicationIds,
        previousSnapshot,
      ) => {
        let reuse: SeedContentPackOptions["reuse"];
        if (previousSnapshot) {
          const directory = indexStore.resolveSnapshotPath(previousSnapshot);
          const parsed = JSON.parse(
            await readFile(resolve(directory, "catalog.json"), "utf8"),
          ) as ContentPackCatalog;
          if (
            !Array.isArray(parsed.publications) ||
            !parsed.atlases ||
            !Array.isArray(parsed.atlases.front) ||
            !Array.isArray(parsed.atlases.back) ||
            !Array.isArray(parsed.atlases.spine)
          )
            throw new Error("Active snapshot catalog cannot be reused");
          reuse = {catalog: parsed, directory};
        }
        return seedContentPack(
          new LocalCatalogSource(
            [catalogDirectory, ...additionalCatalogDirectories],
            {
              excludedPublicationIds,
              requiresLanguageTag: (providerId) => {
                try {
                  return providerRegistry.getDescriptor(providerId)
                    .requiresLanguageTag;
                } catch {
                  return false;
                }
              },
            },
          ),
          {...options, ...(reuse === undefined ? {} : {reuse})},
        );
      },
      defaultProviderId: DEFAULT_LIBRARY_PROVIDER_ID,
      getProviderDescriptor: (providerId) =>
        providerRegistry.getDescriptor(providerId),
      runMigrations: (sourceDirectory, onProgress) =>
        migrateLibrarySourcesWithRegistry(
          sourceDirectory,
          providerRegistry,
          onProgress,
        ),
      runSync: (options, providerId) =>
        providerRegistry
          .load(providerId)
          .then((provider) => provider.sync(options)),
    },
  );
};
