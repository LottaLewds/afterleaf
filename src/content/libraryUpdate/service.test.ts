import {describe, expect, test} from "bun:test";
import {resolve} from "node:path";
import type {
  LibraryFetchMoreRequest,
  LibrarySnapshotDescriptor,
  LibrarySnapshotIndex,
  LibraryUpdatePhase,
} from "~/content/libraryUpdate/protocol";
import {
  LibraryUpdateInProgressError,
  LibraryUpdateService,
  type LibraryUpdateServiceDependencies,
  type SnapshotCatalogSummary,
} from "~/content/libraryUpdate/service";
import type {
  ContentPackCatalog,
  PackedPublication,
  SeedContentPackResult,
} from "~/content/schema";
import type {LibraryProviderDescriptor} from "~/content/providers/types";

const request: LibraryFetchMoreRequest = {};

const previousSnapshot: LibrarySnapshotDescriptor = {
  catalogContentHash: "previous-catalog-hash",
  catalogPath: "snapshots/previous/catalog.json",
  createdAt: "2026-07-28T12:00:00.000Z",
  directory: "snapshots/previous",
  packId: "afterleaf-library",
  publicationCount: 2,
  snapshotId: "previous",
};

const previousIndex: LibrarySnapshotIndex = {
  activeSnapshotId: "previous",
  revision: 1,
  schemaVersion: 1,
  snapshots: [previousSnapshot],
};

const publication = (id: string, contentHash: string): PackedPublication => ({
  alternates: [],
  assets: {
    back: `publications/${id}/back.webp`,
    front: `publications/${id}/front.webp`,
    frontDetail: `publications/${id}/front-detail.webp`,
    pages: [`publications/${id}/pages/001.webp`],
    spine: `publications/${id}/spine.webp`,
  },
  contentHash,
  id,
  language: "english",
  originalTags: ["big-breasts"],
  physical: {aspectRatio: 2 / 3, readingDirection: "ltr"},
  shelfAtlasIndex: 0,
  tags: ["big-breasts"],
  title: id,
});

const atlas = (surface: "front" | "back" | "spine") => ({
  cellHeight: 384,
  cellWidth: surface === "spine" ? 48 : 256,
  columns: 1,
  contentHash: `${surface}-hash`,
  firstPublicationIndex: 0,
  height: 384,
  path: `atlases/${surface}.webp`,
  publicationCount: 1,
  rows: 1,
  width: surface === "spine" ? 48 : 256,
});

const generatedCatalog: ContentPackCatalog = {
  atlases: {
    back: [atlas("back")],
    front: [atlas("front")],
    spine: [atlas("spine")],
  },
  contentHash: "next-catalog-hash",
  id: "afterleaf-library",
  publications: [
    publication("kept", "kept-v2"),
    {
      ...publication("added", "added-v1"),
      alternates: [
        {
          id: "alternate",
          originalTags: ["big-breasts"],
          page0: "publications/added/alternates/alternate/page-000.webp",
          title: "Alternate",
        },
      ],
    },
  ],
  schemaVersion: 1,
  selection: {
    excludedTags: [],
    languages: ["english", "japanese"],
    limit: 20,
    match: "all",
    seed: "afterleaf-library",
    source: "local-catalog",
    tags: ["big-breasts"],
  },
};

const seedResult: SeedContentPackResult = {
  catalog: generatedCatalog,
  report: {
    diagnostics: [],
    outputDirectory: resolve("/library/revisions/next"),
    outputWritten: true,
    packId: "afterleaf-library",
    requestedLimit: 20,
    schemaVersion: 1,
    selectedCount: 2,
    selectedPublicationIds: ["kept", "added"],
    source: "local-catalog",
  },
};

const syncReport = {
  addedCount: 2,
  diagnostics: [],
  outputDirectory: resolve("/source"),
  providerId: "nhentai",
  query: 'tag:"big breasts"',
  requestedLimit: 20,
  selectedPublicationIds: ["kept", "added", "alternate", "missing"],
  unchangedCount: 1,
  updatedCount: 1,
  wroteCatalog: true,
};

const previousCatalog: SnapshotCatalogSummary = {
  contentHash: "previous-catalog-hash",
  publications: [
    {contentHash: "kept-v1", id: "kept"},
    {contentHash: "removed-v1", id: "removed"},
  ],
};

const englishOnlyProvider: LibraryProviderDescriptor = {
  contentKinds: ["commercial-volume"],
  defaultBlockedTags: [],
  defaultLanguages: ["english"],
  defaultQuery: "",
  id: "weebcentral",
  name: "WeebCentral",
  queryHelp: "Test provider",
  queryLabel: "Title search",
  queryPlaceholder: "Search manga titles",
  requiresLanguageTag: true,
  summary: "Test provider",
};

const createDependencies = (
  overrides: Partial<LibraryUpdateServiceDependencies> = {},
): LibraryUpdateServiceDependencies => ({
  activateSnapshot: async (snapshot) => ({
    activeSnapshotId: snapshot.snapshotId,
    revision: 2,
    schemaVersion: 1,
    snapshots: [snapshot, previousSnapshot],
  }),
  createRequestId: () => "request-1",
  createSnapshotId: () => "next",
  discardSnapshot: async () => {},
  now: () => new Date("2026-07-29T12:00:00.000Z"),
  readBlacklist: async () => [],
  readIndex: async () => previousIndex,
  readSnapshotCatalog: async () => previousCatalog,
  runSeed: async () => seedResult,
  runSync: async () => syncReport,
  ...overrides,
});

describe("LibraryUpdateService", () => {
  test("fetches unseen publications, seeds a fresh directory, activates last, and reports the publication diff", async () => {
    const calls: string[] = [];
    let seededOutputDirectory = "";
    const dependencies = createDependencies({
      activateSnapshot: async (snapshot) => {
        calls.push(`activate:${snapshot.snapshotId}`);
        return {
          activeSnapshotId: snapshot.snapshotId,
          revision: 2,
          schemaVersion: 1,
          snapshots: [snapshot, previousSnapshot],
        };
      },
      getProviderDescriptor: () => englishOnlyProvider,
      readBlacklist: async () => ["blacklisted-publication"],
      runSeed: async (catalogDirectory, options, excludedPublicationIds) => {
        calls.push("seed");
        expect(catalogDirectory).toBe(resolve("/source"));
        expect(options.force).toBe(false);
        expect(options.dryRun).toBe(false);
        expect(options.excludedTags).toEqual([]);
        expect(options.assetPathPrefix).toBe("assets/next");
        expect(options.persistentAssetDirectory).toBe(resolve("/library"));
        expect(options.languages).toEqual(["english", "japanese"]);
        expect([...excludedPublicationIds]).toEqual([
          "blacklisted-publication",
        ]);
        seededOutputDirectory = options.outputDirectory;
        return seedResult;
      },
      runSync: async (options) => {
        calls.push("sync");
        expect(options.write).toBe(true);
        expect(options.languages).toEqual(["english"]);
        expect(options.excludedPublicationIds).toEqual([
          "blacklisted-publication",
        ]);
        expect(options.blockedTags).toEqual([]);
        expect(options.selectionMode).toBe("unseen");
        options.onProgress?.("Fetching publication 1 of 20");
        return syncReport;
      },
    });
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      dependencies,
    );
    const phases: LibraryUpdatePhase[] = [];
    const messages: string[] = [];
    service.subscribe((state) => {
      phases.push(state.phase);
      messages.push(state.message);
    });

    const result = await service.fetchMore({
      ...request,
      providerId: "weebcentral",
    });

    expect(calls).toEqual(["sync", "seed", "activate:next"]);
    expect(seededOutputDirectory).toBe(resolve("/library/revisions/next"));
    expect(result.previousSnapshot).toEqual(previousSnapshot);
    expect(result.blacklistedPublicationIds).toEqual([
      "blacklisted-publication",
    ]);
    expect(result.diff).toEqual({
      addedPublicationIds: ["added"],
      removedPublicationIds: ["removed"],
      source: {addedCount: 2, unchangedCount: 1, updatedCount: 1},
      unchangedPublicationIds: [],
      updatedPublicationIds: ["kept"],
    });
    expect(phases).toEqual([
      "idle",
      "idle",
      "syncing",
      "syncing",
      "seeding",
      "seeding",
      "seeding",
      "activating",
      "activating",
      "activating",
      "complete",
    ]);
    expect(messages).toContain("Fetching publication 1 of 20");
    expect(messages).toContain(
      "weebcentral import pipeline: provider materialized 4 (2 added, 1 updated, 1 unchanged); derived catalog has 2 publications (1 newly visible, 1 updated)",
    );
    expect(messages).not.toContainEqual(
      expect.stringContaining(
        "alternate was materialized by weebcentral but did not enter the derived catalog",
      ),
    );
    expect(messages).toContainEqual(
      expect.stringContaining(
        "missing was materialized by weebcentral but did not enter the derived catalog",
      ),
    );
    expect(messages).toContain("Promoting new derived library assets");
    expect(messages).toContain(
      "Activating the completed library catalog revision",
    );
    expect(messages).toContain("Scheduling retired library assets for cleanup");
    expect(service.getState()).toMatchObject({
      activeSnapshot: {snapshotId: "next"},
      phase: "complete",
      status: "succeeded",
    });
    await expect(service.initialize()).resolves.toMatchObject({
      activeSnapshot: {snapshotId: "next"},
      status: "succeeded",
    });
  });

  test("keeps the active snapshot when provider sync and pending archives are unchanged", async () => {
    const calls: string[] = [];
    const unchangedSyncReport = {
      ...syncReport,
      addedCount: 0,
      selectedPublicationIds: [],
      unchangedCount: 403,
      updatedCount: 0,
    };
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        activateSnapshot: async () => {
          calls.push("activate");
          return previousIndex;
        },
        runSeed: async () => {
          calls.push("seed");
          return seedResult;
        },
        runSync: async () => {
          calls.push("sync");
          return unchangedSyncReport;
        },
      }),
    );

    const result = await service.fetchMore({
      ...request,
      localSourceChanged: false,
    });

    expect(calls).toEqual(["sync"]);
    expect(result.snapshot).toBe(previousSnapshot);
    expect(result.seedReport).toBeUndefined();
    expect(result.diff).toEqual({
      addedPublicationIds: [],
      removedPublicationIds: [],
      source: {addedCount: 0, unchangedCount: 403, updatedCount: 0},
      unchangedPublicationIds: ["kept", "removed"],
      updatedPublicationIds: [],
    });
    expect(service.getState()).toMatchObject({
      activeSnapshot: previousSnapshot,
      phase: "complete",
      status: "succeeded",
    });
  });

  test("reports a failed migration instead of taking the unchanged fetch fast path", async () => {
    const calls: string[] = [];
    const unchangedSyncReport = {
      ...syncReport,
      addedCount: 0,
      selectedPublicationIds: [],
      unchangedCount: 403,
      updatedCount: 0,
    };
    const localSeedResult = structuredClone(seedResult);
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        activateSnapshot: async (snapshot) => {
          calls.push("activate");
          return {
            activeSnapshotId: snapshot.snapshotId,
            revision: 2,
            schemaVersion: 1,
            snapshots: [snapshot, previousSnapshot],
          };
        },
        runMigrations: async () => {
          calls.push("migrate");
          return {
            diagnostics: [
              {
                message: "Could not migrate provider/book: remote unavailable",
                migrationId: "test-migration",
                sourceId: "provider/book",
              },
            ],
            failedCount: 1,
            migratedCount: 0,
            pendingCount: 1,
          };
        },
        runSeed: async () => {
          calls.push("seed");
          return localSeedResult;
        },
        runSync: async () => {
          calls.push("sync");
          return unchangedSyncReport;
        },
      }),
    );

    const result = await service.fetchMore({
      ...request,
      localSourceChanged: false,
    });

    expect(calls).toEqual(["sync", "migrate", "seed", "activate"]);
    expect(result.seedReport?.diagnostics).toContainEqual({
      code: "migration-failed",
      message: "Could not migrate provider/book: remote unavailable",
      sourceId: "provider/book",
    });
  });

  test("builds a snapshot for imported archives even when provider sync is unchanged", async () => {
    const calls: string[] = [];
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        activateSnapshot: async (snapshot) => {
          calls.push("activate");
          return {
            activeSnapshotId: snapshot.snapshotId,
            revision: 2,
            schemaVersion: 1,
            snapshots: [snapshot, previousSnapshot],
          };
        },
        runSeed: async () => {
          calls.push("seed");
          return seedResult;
        },
        runSync: async () => {
          calls.push("sync");
          return {
            ...syncReport,
            addedCount: 0,
            unchangedCount: 403,
            updatedCount: 0,
          };
        },
      }),
    );

    await service.fetchMore({...request, localSourceChanged: true});

    expect(calls).toEqual(["sync", "seed", "activate"]);
  });

  test("keeps the previous snapshot active and removes only the candidate if activation fails", async () => {
    const discarded: string[] = [];
    const dependencies = createDependencies({
      activateSnapshot: async () => {
        throw new Error("index write failed");
      },
      discardSnapshot: async (directory) => {
        discarded.push(directory);
      },
    });
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      dependencies,
    );

    await expect(service.fetchMore(request)).rejects.toThrow(
      "index write failed",
    );

    expect(discarded).toEqual([resolve("/library/revisions/next")]);
    expect(service.getState()).toMatchObject({
      activeSnapshot: previousSnapshot,
      completedSteps: 2,
      error: {message: "index write failed"},
      failedPhase: "activating",
      phase: "failed",
      status: "failed",
    });
  });

  test("blocks tags only during acquisition and keeps matching disk content eligible for the snapshot", async () => {
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        runSeed: async (_catalogDirectory, options) => {
          expect(options.excludedTags).toEqual([]);
          return seedResult;
        },
        runSync: async (options) => {
          expect(options.blockedTags).toEqual(["school-girl", "full-color"]);
          return syncReport;
        },
      }),
    );

    await service.fetchMore({
      ...request,
      blockedTags: ["School Girl", "full color"],
    });
  });

  test("rejects overlapping fetches while the first sync is in flight", async () => {
    let releaseSync: ((value: typeof syncReport) => void) | undefined;
    const pendingSync = new Promise<typeof syncReport>((resolvePromise) => {
      releaseSync = resolvePromise;
    });
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({runSync: () => pendingSync}),
    );

    const firstFetch = service.fetchMore(request);
    await Promise.resolve();
    await expect(service.fetchMore(request)).rejects.toBeInstanceOf(
      LibraryUpdateInProgressError,
    );
    releaseSync?.(syncReport);
    await expect(firstFetch).resolves.toMatchObject({requestId: "request-1"});
  });

  test("runs host migrations before scanning without invoking provider search", async () => {
    const calls: string[] = [];
    const service = new LibraryUpdateService(
      {
        catalogDirectory: "/catalog",
        libraryDirectory: "/library",
        sourceDirectory: "/source",
      },
      createDependencies({
        activateSnapshot: async (snapshot) => {
          calls.push("activate");
          return {
            activeSnapshotId: snapshot.snapshotId,
            revision: 2,
            schemaVersion: 1,
            snapshots: [snapshot, previousSnapshot],
          };
        },
        readBlacklist: async () => ["removed"],
        runMigrations: async (sourceDirectory, onProgress) => {
          calls.push("migrate");
          expect(sourceDirectory).toBe(resolve("/source"));
          onProgress?.("Library migrations: running test migration");
          return {
            diagnostics: [],
            failedCount: 0,
            migratedCount: 1,
            pendingCount: 1,
          };
        },
        runSeed: async (
          catalogDirectory,
          options,
          excludedIds,
          reusableSnapshot,
        ) => {
          calls.push("seed");
          expect(catalogDirectory).toBe(resolve("/catalog"));
          expect(options.limit).toBe(Number.MAX_SAFE_INTEGER);
          expect(options.tags).toEqual([]);
          expect([...excludedIds]).toEqual(["removed"]);
          expect(reusableSnapshot).toBe(previousSnapshot);
          return seedResult;
        },
        runSync: async () => {
          calls.push("sync");
          throw new Error("scan must not sync");
        },
      }),
    );

    const result = await service.scan({});

    expect(calls).toEqual(["migrate", "seed", "activate"]);
    expect(result.blacklistedPublicationIds).toEqual(["removed"]);
    expect(result.diff.removedPublicationIds).toEqual(["removed"]);
    expect(service.getState()).toMatchObject({
      activeSnapshot: {snapshotId: "next"},
      status: "idle",
    });
  });

  test("keeps the active snapshot when a scan produces an identical catalog", async () => {
    const calls: string[] = [];
    const unchangedSeedResult = structuredClone(seedResult);
    if (!unchangedSeedResult.catalog)
      throw new Error("Test seed result must contain a catalog");
    unchangedSeedResult.catalog.contentHash = previousCatalog.contentHash;
    unchangedSeedResult.catalog.publications = [
      publication("kept", "kept-v1"),
      publication("removed", "removed-v1"),
    ];
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        activateSnapshot: async () => {
          calls.push("activate");
          return previousIndex;
        },
        discardAssetSet: async (revisionId) => {
          calls.push("discard-assets");
          expect(revisionId).toBe("next");
        },
        discardSnapshot: async (snapshotDirectory) => {
          calls.push("discard-snapshot");
          expect(snapshotDirectory).toBe(resolve("/library/revisions/next"));
        },
        promoteAssetSet: async () => {
          calls.push("promote");
        },
        retireUnreferencedAssetSets: async () => {
          calls.push("retire");
        },
        runSeed: async () => {
          calls.push("seed");
          return unchangedSeedResult;
        },
      }),
    );

    const result = await service.scan({});

    expect(calls).toEqual(["seed", "discard-snapshot", "discard-assets"]);
    expect(result.snapshot).toBe(previousSnapshot);
    expect(result.previousSnapshot).toBe(previousSnapshot);
    expect(result.diff).toEqual({
      addedPublicationIds: [],
      removedPublicationIds: [],
      unchangedPublicationIds: ["kept", "removed"],
      updatedPublicationIds: [],
    });
    expect(service.getState()).toMatchObject({
      activeSnapshot: previousSnapshot,
      phase: "idle",
      status: "idle",
    });
  });

  test("continues scanning and reports isolated migration failures", async () => {
    const localSeedResult = structuredClone(seedResult);
    const service = new LibraryUpdateService(
      {libraryDirectory: "/library", sourceDirectory: "/source"},
      createDependencies({
        runMigrations: async () => ({
          diagnostics: [
            {
              message: "Could not migrate provider/book: remote unavailable",
              migrationId: "test-migration",
              sourceId: "provider/book",
            },
          ],
          failedCount: 1,
          migratedCount: 0,
          pendingCount: 1,
        }),
        runSeed: async () => localSeedResult,
      }),
    );

    const result = await service.scan({});

    expect(result.seedReport.diagnostics).toContainEqual({
      code: "migration-failed",
      message: "Could not migrate provider/book: remote unavailable",
      sourceId: "provider/book",
    });
    expect(result.snapshot.snapshotId).toBe("next");
  });

  test("promotes only newly derived assets before activating a catalog revision", async () => {
    const calls: string[] = [];
    const service = new LibraryUpdateService(
      {
        catalogDirectory: "/catalog",
        libraryDirectory: "/library",
        sourceDirectory: "/source",
      },
      createDependencies({
        activateSnapshot: async (snapshot) => {
          calls.push("activate");
          return {
            activeSnapshotId: snapshot.snapshotId,
            revision: 2,
            schemaVersion: 1,
            snapshots: [snapshot, previousSnapshot],
          };
        },
        readSnapshotCatalog: async () => ({
          contentHash: "previous-catalog-hash",
          publications: [
            {contentHash: "kept-v2", id: "kept"},
            {contentHash: "removed-v1", id: "removed"},
          ],
        }),
        promoteAssetSet: async (revisionDirectory, revisionId) => {
          calls.push("promote");
          expect(revisionDirectory).toBe(resolve("/library/revisions/next"));
          expect(revisionId).toBe("next");
        },
      }),
    );

    const result = await service.scan({});

    expect(calls).toEqual(["promote", "activate"]);
    expect(result.diff.unchangedPublicationIds).toEqual(["kept"]);
  });

  test("fetch-more performs unseen sync before the shared disk scan", async () => {
    const calls: string[] = [];
    const service = new LibraryUpdateService(
      {
        catalogDirectory: "/catalog",
        libraryDirectory: "/library",
        sourceDirectory: "/source",
      },
      createDependencies({
        activateSnapshot: async (snapshot) => {
          calls.push("activate");
          return {
            activeSnapshotId: snapshot.snapshotId,
            revision: 2,
            schemaVersion: 1,
            snapshots: [snapshot, previousSnapshot],
          };
        },
        readBlacklist: async () => ["nhentai-99"],
        runSeed: async (catalogDirectory, options, excludedIds) => {
          calls.push("seed");
          expect(catalogDirectory).toBe(resolve("/catalog"));
          expect(options.limit).toBe(Number.MAX_SAFE_INTEGER);
          expect([...excludedIds]).toEqual(["nhentai-99"]);
          return seedResult;
        },
        runSync: async (options) => {
          calls.push("sync");
          expect(options.outputDirectory).toBe(resolve("/source"));
          expect(options.selectionMode).toBe("unseen");
          expect(options.limit).toBe(20);
          expect(options.excludedPublicationIds).toEqual(["nhentai-99"]);
          return syncReport;
        },
      }),
    );

    const result = await service.fetchMore(request);

    expect(calls).toEqual(["sync", "seed", "activate"]);
    expect(result.blacklistedPublicationIds).toEqual(["nhentai-99"]);
  });
});
