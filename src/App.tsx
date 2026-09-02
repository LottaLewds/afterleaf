import {
  FiAlertTriangle,
  FiBookOpen,
  FiClock,
  FiCommand,
  FiDownload,
  FiGrid,
  FiMenu,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiSliders,
  FiStar,
  FiTool,
  FiX,
} from "solid-icons/fi";
import {
  For,
  Loading,
  createEffect,
  lazy,
  onSettled,
  Show,
  createMemo,
  createSignal,
  isPending,
  resolve,
  untrack,
} from "solid-js";
import {loadShortcuts, saveShortcuts, type ShortcutsConfig} from "~/game/input/bindings";

import {emptyLibrary, isRuntimeLibraryAvailable, loadRuntimeLibrary, type CatalogItem} from "~/catalog";
import {
  BrowserLibraryOperationError,
  blacklistPublication,
  createCollection,
  deleteCollection,
  fetchMorePublications,
  loadActiveLibraryJob,
  loadBlacklistedPublications,
  loadCollections,
  loadLibraryOperationStatus,
  loadLibraryProviders,
  loadLibrarySourceStatus,
  resolvePastedLibraryImport,
  scanLocalLibrary,
  loadLibraryConfig,
  reenrollLibraryRoot,
  saveLibraryConfig,
  updateCollection,
  type LocalLibraryJob,
  type LocalLibrarySnapshotResult,
} from "~/content/libraryUpdate/browserClient";
import type {LibraryCollection} from "~/content/libraryUpdate/httpProtocol";
import type {LibraryProviderDescriptor} from "~/content/providers/types";
import {
  loadPadMappingOverrides,
  savePadMappingOverrides,
  type ArcadePadMappingOverrides,
} from "~/arcade/controllerMappings";
import {findBlacklistedTagMatches} from "~/content/libraryUpdate/tagPurge";
import {OptionsPanel} from "~/components/options/OptionsPanel";
import {ShortcutsPanel} from "~/components/shortcuts/ShortcutsPanel";
import {PurgeBlacklistedWorksDialog} from "~/components/library/PurgeBlacklistedWorksDialog";
import {AdultGate} from "~/components/library/AdultGate";
import {LibraryRepairDialog, type LibraryRepairOptions} from "~/components/library/LibraryRepairDialog";
import {LibraryUpdateDialog} from "~/components/library/LibraryUpdateDialog";
import {LibraryActivityToast} from "~/components/library/LibraryActivityToast";
import {LibraryCard} from "~/components/library/LibraryCard";
import {DetailPanel} from "~/components/library/DetailPanel";
import {CoverContextMenu} from "~/components/library/CoverContextMenu";
import {languageLabels, type LanguageFilter} from "~/components/library/languageLabels";
import {GlobalEscapeShortcuts} from "~/components/GlobalEscapeShortcuts";
import {bookLocationKeys, configLocationsChanged, visualMediaLocationKeys} from "~/components/locations/locationKinds";
import {loadBootFetchPreference, saveBootFetchPreference} from "~/content/libraryUpdate/bootFetchPreference";
import {loadLibraryFetchPreferences, saveLibraryFetchPreferences} from "~/content/libraryUpdate/fetchPreferences";
import {loadLibraryProviderPreference, saveLibraryProviderPreference} from "~/content/libraryUpdate/providerPreference";
import {loadTagBlacklist, normalizeTag, saveTagBlacklist} from "~/content/tagBlacklistPreference";
import {loadControlPreferences, saveControlPreferences, type ReadingDirection} from "~/game/controlPreferences";
import {createEscapeScope} from "~/game/modalModes";
import {UiModeProvider} from "~/game/uiMode";
import {loadReaderBookmarks, saveReaderBookmark} from "~/reader/bookmarks";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";
import type {ShopViewportControls} from "~/components/ShopViewport";

type LibraryOperation = "fetch-more" | "scan";
type LibraryScanMode = "quick" | "repair";
type LibraryUpdateStage = "loading-library" | "working";
type MenuTab = "library" | "options" | "shortcuts";

const ShopViewport = lazy(async () => {
  const module = await import("~/components/ShopViewport");
  return {default: module.ShopViewport};
});

export const App = () => {
  const bootFetchWasEnabled = loadBootFetchPreference()?.enabled === true;
  const initialControlPreferences = loadControlPreferences();
  const initialLibraryFetchPreferences = loadLibraryFetchPreferences();
  const initialProviderId = loadLibraryProviderPreference() ?? "nhentai";
  const [libraryConfig, setLibraryConfig] = createSignal<AfterleafLibraryConfig>({
    artFramePaths: [],
    comicPaths: [],
    mangaPaths: [],
    posterPaths: [],
    romPaths: {},
    tvChannelPaths: [],
  });
  onSettled(() => {
    void loadLibraryConfig()
      .then(setLibraryConfig)
      .catch(() => {});
    void loadCollections()
      .then(setCollections)
      .catch((error) => console.error("Could not load collections", error));
  });
  const updateLibraryConfig = async (config: AfterleafLibraryConfig) => {
    const previousConfig = libraryConfig();
    const bookLocationsChanged = configLocationsChanged(previousConfig, config, bookLocationKeys);
    const visualMediaLocationsChanged = configLocationsChanged(previousConfig, config, visualMediaLocationKeys);
    const romFoldersChanged = JSON.stringify(previousConfig.romPaths ?? {}) !== JSON.stringify(config.romPaths ?? {});
    setLibraryConfig(config);
    await saveLibraryConfig(config);
    if (romFoldersChanged) {
      setLibraryUpdateNotice("ROM folders saved. Reopen the arcade picker to see its games.");
      return;
    }
    if (bookLocationsChanged && visualMediaLocationsChanged) {
      setLibraryUpdateNotice("Locations saved. Visual media will refresh automatically; run Scan new to update books.");
      return;
    }
    if (bookLocationsChanged) {
      setLibraryUpdateNotice("Book locations saved. Run Scan new to update the library.");
      return;
    }
    if (visualMediaLocationsChanged) {
      setLibraryUpdateNotice("Media locations saved. TV, poster, and art frame catalogs will refresh automatically.");
      return;
    }
    setLibraryUpdateNotice("Locations are already up to date.");
  };

  // Profiling/automation mode (?profile=1) skips interactive gates so CDP
  // runs can boot the shop unattended.
  const [ageConfirmed, setAgeConfirmed] = createSignal(
    new URLSearchParams(window.location.search).has("profile") ||
      sessionStorage.getItem("afterleaf-age-confirmed") === "yes",
  );
  const [query, setQuery] = createSignal("");
  const [language, setLanguage] = createSignal<LanguageFilter>("all");
  const [tag, setTag] = createSignal<string | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let shopViewportControls: ShopViewportControls | undefined;
  const openMenu = () => {
    if (menuOpen()) return;
    setMenuOpen(true);
  };
  const closeMenu = (requestPointerLock = true) => {
    if (!menuOpen()) return;
    setMenuOpen(false);
    if (requestPointerLock) shopViewportControls?.requestPointerLock();
  };
  const [menuTab, setMenuTab] = createSignal<MenuTab>("library");
  const [purgeBlacklistedOpen, setPurgeBlacklistedOpen] = createSignal(false);
  const [libraryRepairOpen, setLibraryRepairOpen] = createSignal(false);
  const [unstuckRequest, setUnstuckRequest] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal("");
  const [selectedPublicationIds, setSelectedPublicationIds] = createSignal<ReadonlySet<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = createSignal<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = createSignal(false);
  const [bookmarks, setBookmarks] = createSignal(loadReaderBookmarks());
  const [libraryUpdateNotice, setLibraryUpdateNotice] = createSignal<string>();
  const [libraryUpdateFailed, setLibraryUpdateFailed] = createSignal(false);
  const [libraryUpdateOpen, setLibraryUpdateOpen] = createSignal(false);
  const [libraryUpdating, setLibraryUpdating] = createSignal(false);
  const [libraryOperation, setLibraryOperation] = createSignal<LibraryOperation>();
  const [libraryScanMode, setLibraryScanMode] = createSignal<LibraryScanMode>("quick");
  const [libraryUpdateStage, setLibraryUpdateStage] = createSignal<LibraryUpdateStage>("working");
  const [libraryUpdateCompletedSteps, setLibraryUpdateCompletedSteps] = createSignal(0);
  const [libraryUpdateTotalSteps, setLibraryUpdateTotalSteps] = createSignal(3);
  const [libraryUpdateSubProgress, setLibraryUpdateSubProgress] = createSignal<{
    completed: number;
    total: number;
  }>();
  const [libraryUpdateProgressMessage, setLibraryUpdateProgressMessage] = createSignal("Starting library job");
  const [libraryUpdateElapsedSeconds, setLibraryUpdateElapsedSeconds] = createSignal(0);
  const [newPublicationIds, setNewPublicationIds] = createSignal<readonly string[]>([]);
  const [fetchOnBoot, setFetchOnBoot] = createSignal(bootFetchWasEnabled);
  const [selectedProviderId, setSelectedProviderId] = createSignal(initialProviderId);
  const [libraryFetchLimit, setLibraryFetchLimit] = createSignal(initialLibraryFetchPreferences.limit);
  const [librarySearchPageLimit, setLibrarySearchPageLimit] = createSignal(
    initialLibraryFetchPreferences.maxSearchPages,
  );
  const [lastChecked, setLastChecked] = createSignal("when the shop opened");
  const [mouseSensitivity, setMouseSensitivity] = createSignal(initialControlPreferences.mouseSensitivity);
  const [gamepadLookSensitivity, setGamepadLookSensitivity] = createSignal(
    initialControlPreferences.gamepadLookSensitivity,
  );
  const [shortcutsConfig, setShortcutsConfig] = createSignal(loadShortcuts());
  const [padMappingOverrides, setPadMappingOverrides] = createSignal(loadPadMappingOverrides());
  const [tvScreenLighting, setTvScreenLighting] = createSignal(initialControlPreferences.tvScreenLighting);
  const [defaultReadingDirection, setDefaultReadingDirection] = createSignal(
    initialControlPreferences.defaultReadingDirection,
  );
  const [respectBookReadingDirection, setRespectBookReadingDirection] = createSignal(
    initialControlPreferences.respectBookReadingDirection,
  );
  const [blacklistedTags, setBlacklistedTags] = createSignal(loadTagBlacklist());
  const [collections, setCollections] = createSignal<readonly LibraryCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = createSignal<string | null>(null);
  const [editingCollectionId, setEditingCollectionId] = createSignal<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = createSignal("");
  const [highlightedPublicationIds, setHighlightedPublicationIds] = createSignal<readonly string[]>([]);
  const [highlightedCollectionId, setHighlightedCollectionId] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{item: CatalogItem; x: number; y: number} | null>(null);
  const [collectionDialogOpen, setCollectionDialogOpen] = createSignal(false);
  const [collectionDialogInitialPublicationIds, setCollectionDialogInitialPublicationIds] = createSignal<
    readonly string[] | undefined
  >(undefined);
  const [newCollectionName, setNewCollectionName] = createSignal("");
  const [runtimeLibraryRefresh, setRuntimeLibraryRefresh] = createSignal(0, {equals: false});
  const runtimeLibrary = createMemo(
    () => {
      runtimeLibraryRefresh();
      return loadRuntimeLibrary();
    },
    {loadingValue: emptyLibrary},
  );
  const refetch = async () => {
    setRuntimeLibraryRefresh((revision) => revision + 1);
    return resolve(runtimeLibrary);
  };
  type LibraryProvidersState = {
    providers: readonly LibraryProviderDescriptor[];
    error: string | undefined;
  };
  const libraryProviders = createMemo<LibraryProvidersState>(
    () =>
      loadLibraryProviders()
        .then((providers) => ({providers, error: undefined}))
        .catch((error) => ({
          providers: [],
          error: error instanceof Error ? error.message : "The library providers could not be loaded.",
        })),
    {loadingValue: {providers: [], error: undefined}},
  );
  let latestLibrarySourceStatus = {
    reenrollableBookPaths: [] as readonly string[],
    unavailableBookPathCount: 0,
  };
  const [librarySourceStatusRefresh, setLibrarySourceStatusRefresh] = createSignal(0, {equals: false});
  const librarySourceStatus = createMemo(
    () => {
      librarySourceStatusRefresh();
      return loadLibrarySourceStatus()
        .then((status) => {
          latestLibrarySourceStatus = status;
          return latestLibrarySourceStatus;
        })
        .catch(() => {
          // Keep the last safety status if a later health check is interrupted.
          return latestLibrarySourceStatus;
        });
    },
    {loadingValue: latestLibrarySourceStatus},
  );
  const refetchLibrarySourceStatus = async () => {
    setLibrarySourceStatusRefresh((revision) => revision + 1);
    return resolve(librarySourceStatus);
  };
  const blacklistedPublications = createMemo(() => loadBlacklistedPublications().catch(() => [] as readonly string[]), {
    loadingValue: [] as readonly string[],
  });
  const [blacklistedPublicationOverride, setBlacklistedPublicationOverride] = createSignal<readonly string[]>();
  const resolvedRuntimeLibrary = () => runtimeLibrary();
  const availableLibraryProviders = createMemo(() => libraryProviders().providers);
  const libraryProviderError = () => libraryProviders().error;
  const unavailableBookPathCount = () => librarySourceStatus().unavailableBookPathCount;
  const reenrollableBookPaths = createMemo(() => new Set(librarySourceStatus().reenrollableBookPaths));
  const reenrollBookRoot = async (path: string) => {
    await reenrollLibraryRoot(path);
    await refetchLibrarySourceStatus();
    setLibraryUpdateNotice("Library root re-enrolled. Run Scan new to reconcile its books.");
  };
  createEffect(
    () => [availableLibraryProviders(), selectedProviderId()] as const,
    ([providers, selectedProviderIdValue]) => {
      if (providers.some((provider) => provider.id === selectedProviderIdValue)) return;
      const fallback = providers[0];
      if (!fallback) return;
      setSelectedProviderId(fallback.id);
      saveLibraryProviderPreference(fallback.id);
    },
  );
  createEffect(
    () => unavailableBookPathCount(),
    (count) => {
      if (count === 0) return;
      const sourceStatusInterval = window.setInterval(() => void untrack(refetchLibrarySourceStatus), 3_000);
      return () => window.clearInterval(sourceStatusInterval);
    },
  );
  const activeLibrary = () => resolvedRuntimeLibrary() ?? emptyLibrary;
  const blacklistedPublicationIds = createMemo(
    () => new Set(blacklistedPublicationOverride() ?? blacklistedPublications()),
  );
  const publicationLibrary = createMemo(() =>
    activeLibrary().publications.filter((publication) => !blacklistedPublicationIds().has(publication.id)),
  );
  const blacklistedTagWorkCandidates = createMemo(() =>
    findBlacklistedTagMatches(publicationLibrary(), blacklistedTags()),
  );
  const availableTags = createMemo(() =>
    [...new Set(publicationLibrary().flatMap((item) => item.tags))].sort((left, right) => left.localeCompare(right)),
  );
  const library = createMemo(() => {
    const publications = publicationLibrary();
    const defaultDirection = defaultReadingDirection();
    const respectMetadata = respectBookReadingDirection();
    return publications.map((publication) => {
      const direction =
        respectMetadata && !publication.readingDirectionUnspecified ? publication.direction : defaultDirection;
      return publication.direction === direction ? publication : Object.assign({}, publication, {direction});
    });
  });
  const queryTokens = createMemo(() => query().trim().toLowerCase().split(/\s+/).filter(Boolean));
  const visibleTags = createMemo(() => {
    const tags = [...new Set(library().flatMap((item) => item.tags))].sort();
    const tokens = queryTokens();
    if (!tokens.length) return tags;
    return tags.filter((catalogTag) => tokens.some((token) => catalogTag.toLowerCase().includes(token)));
  });
  let libraryUpdateStartedAt = 0;
  let libraryUpdateTimer: number | undefined;
  let libraryStatusRequestPending = false;
  // `reconnect` marks a job adopted after a page reload, so a vanished job
  // (server restarted mid-run) cleans up silently instead of failing loudly.
  type MonitoredLibraryJob = LocalLibraryJob & {
    automatic: boolean;
    reconnect?: boolean;
  };
  let activeLibraryJob: MonitoredLibraryJob | undefined;
  const finishLibraryUpdate = () => {
    if (libraryUpdateTimer !== undefined) window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = undefined;
    activeLibraryJob = undefined;
    setLibraryUpdating(false);
    setLibraryOperation(undefined);
  };
  const scanButtonLabel = () => {
    if (isPending(runtimeLibrary)) return "Loading…";
    if (libraryOperation() === "scan")
      return `${libraryScanMode() === "repair" ? "Repairing" : "Scanning"} · ${libraryUpdateElapsedSeconds()}s`;
    if (libraryUpdating()) return "Library busy…";
    return "Scan new";
  };
  const fetchButtonLabel = () =>
    libraryOperation() === "fetch-more" ? `Fetching · ${libraryUpdateElapsedSeconds()}s` : "Fetch more";
  const libraryActivityStatus = () => {
    if (libraryUpdateStage() === "loading-library") return "Injecting the finished stock into the mounted shop…";
    return libraryUpdateProgressMessage();
  };

  const selectedCollection = createMemo(() =>
    collections().find((collection) => collection.id === selectedCollectionId()),
  );

  const filteredCatalog = createMemo(() => {
    const tokens = queryTokens();
    const collection = selectedCollection();
    const collectionPublicationIds = collection ? new Set(collection.publicationIds) : undefined;
    const collectionsByPublicationId = new Map<string, string[]>();
    for (const userCollection of collections()) {
      for (const publicationId of userCollection.publicationIds) {
        const names = collectionsByPublicationId.get(publicationId);
        if (names) names.push(userCollection.name);
        else collectionsByPublicationId.set(publicationId, [userCollection.name]);
      }
    }
    return library().filter((item) => {
      if (language() !== "all" && item.language !== language()) return false;
      const selectedTag = tag();
      if (selectedTag && !item.tags.includes(selectedTag)) return false;
      if (collectionPublicationIds && !collectionPublicationIds.has(item.id)) return false;
      const userCollectionNames = collectionsByPublicationId.get(item.id) ?? [];
      return tokens.every((token) =>
        [item.title, item.titleJp, item.collection, ...item.tags, ...userCollectionNames].some((value) =>
          value.toLowerCase().includes(token),
        ),
      );
    });
  });

  const selectedItem = createMemo(() => library().find((item) => item.id === selectedId()) ?? library()[0]);

  const handleSelectCard = (item: CatalogItem, event: MouseEvent) => {
    const items = filteredCatalog();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) return;

    if (event.ctrlKey || event.metaKey) {
      setSelectedPublicationIds((current) => {
        const next = new Set(current);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setSelectedId(item.id);
      setLastSelectedId(item.id);
      return;
    }

    if (event.shiftKey && lastSelectedId()) {
      const anchorIndex = items.findIndex((candidate) => candidate.id === lastSelectedId());
      const start = Math.min(anchorIndex < 0 ? index : anchorIndex, index);
      const end = Math.max(anchorIndex < 0 ? index : anchorIndex, index);
      setSelectedPublicationIds((current) => {
        const next = new Set(current);
        for (let i = start; i <= end; i++) {
          const selectedItem = items[i];
          if (selectedItem) next.add(selectedItem.id);
        }
        return next;
      });
      setSelectedId(item.id);
      return;
    }

    setSelectedPublicationIds(new Set([item.id]));
    setSelectedId(item.id);
    setLastSelectedId(item.id);
  };

  const recordLibraryResult = async (
    result: LocalLibrarySnapshotResult,
    operation: "Fetched" | "Imported & scanned",
  ) => {
    const previousPublicationIds = new Set(library().map((publication) => publication.id));
    const currentLibrary = resolvedRuntimeLibrary();
    const activatedLibrary =
      currentLibrary?.identity.snapshotId === result.snapshotId ? currentLibrary : await refetch();
    if (!activatedLibrary)
      throw new Error(`The library refresh returned no snapshot while activating ${result.snapshotId}`);
    if (activatedLibrary.identity.snapshotId !== result.snapshotId)
      throw new Error(
        `The library activated snapshot ${result.snapshotId}, but the game loaded ${activatedLibrary.identity.snapshotId ?? "an empty library"}`,
      );
    const arrivedPublicationIds = activatedLibrary.publications
      .filter((publication) => !previousPublicationIds.has(publication.id))
      .map((publication) => publication.id);
    // This signal is an arrival event for the Three runtime. Publishing a new
    // empty array would look like a stock change and rebuild every book batch.
    if (arrivedPublicationIds.length > 0) setNewPublicationIds(arrivedPublicationIds);
    setLastChecked(
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    setLibraryUpdateNotice(
      `${operation}: ${arrivedPublicationIds.length} delivered to the live shop · ${result.publicationCount} catalogued · ${result.updatedCount} updated`,
    );
    setLibraryUpdateFailed(false);
  };

  const reportLibraryFailure = (operation: LibraryOperation, automatic: boolean, message: string) => {
    setLibraryUpdateFailed(true);
    if (operation === "scan") {
      setLibraryUpdateNotice(`Import and scan failed: ${message}`);
      return;
    }
    setLibraryUpdateNotice(automatic ? `Automatic fetch failed: ${message}` : `Fetch failed: ${message}`);
  };

  const settleLibraryJob = async (
    job: MonitoredLibraryJob,
    status: Awaited<ReturnType<typeof loadLibraryOperationStatus>>,
  ) => {
    if (activeLibraryJob?.jobId !== job.jobId) return;
    setLibraryUpdateCompletedSteps(status.completedSteps);
    setLibraryUpdateTotalSteps(status.totalSteps);
    setLibraryUpdateSubProgress(status.subProgress);
    setLibraryUpdateProgressMessage(status.message);
    if (status.state === "running") return;
    try {
      if (status.state === "failed") {
        reportLibraryFailure(job.operation, job.automatic, status.error.message);
        return;
      }
      setLibraryUpdateStage("loading-library");
      setLibraryUpdateProgressMessage("Injecting stock into the mounted shop");
      await recordLibraryResult(status.result, job.operation === "fetch-more" ? "Fetched" : "Imported & scanned");
    } catch (error) {
      reportLibraryFailure(
        job.operation,
        job.automatic,
        error instanceof Error ? error.message : "The finished library could not be loaded.",
      );
    } finally {
      if (activeLibraryJob?.jobId === job.jobId) finishLibraryUpdate();
    }
  };

  const refreshLibraryUpdateStatus = async (job: MonitoredLibraryJob) => {
    if (libraryStatusRequestPending || activeLibraryJob?.jobId !== job.jobId) return;
    libraryStatusRequestPending = true;
    try {
      const status = await loadLibraryOperationStatus(job.jobId);
      await settleLibraryJob(job, status);
    } catch (error) {
      if (
        activeLibraryJob?.jobId === job.jobId &&
        error instanceof BrowserLibraryOperationError &&
        error.code === "job_not_found"
      ) {
        // A reattached job whose process is gone just winds down silently;
        // the server restarted, so there is nothing left to report.
        if (!job.reconnect) reportLibraryFailure(job.operation, job.automatic, error.message);
        finishLibraryUpdate();
      }
    } finally {
      libraryStatusRequestPending = false;
    }
  };

  const startLibraryStatusPolling = () => {
    if (libraryUpdateTimer !== undefined) window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = window.setInterval(
      () =>
        untrack(() => {
          const job = activeLibraryJob;
          if (job) void refreshLibraryUpdateStatus(job);
          setLibraryUpdateElapsedSeconds(Math.floor((performance.now() - libraryUpdateStartedAt) / 1_000));
        }),
      1_000,
    );
  };

  const beginLibraryUpdate = (operation: LibraryOperation, operationQuery?: string) => {
    libraryUpdateStartedAt = performance.now();
    activeLibraryJob = undefined;
    setLibraryUpdateElapsedSeconds(0);
    setLibraryUpdateFailed(false);
    setLibraryOperation(operation);
    setLibraryUpdateStage("working");
    setLibraryUpdateCompletedSteps(0);
    setLibraryUpdateTotalSteps(3);
    setLibraryUpdateSubProgress(undefined);
    setLibraryUpdateProgressMessage(
      operation === "fetch-more" && operationQuery
        ? `Starting provider search for “${operationQuery}”`
        : "Starting library job",
    );
    setLibraryUpdating(true);
    startLibraryStatusPolling();
  };

  const monitorLibraryJob = (job: LocalLibraryJob, automatic: boolean) => {
    activeLibraryJob = {...job, automatic};
    void refreshLibraryUpdateStatus(activeLibraryJob);
  };

  /**
   * Reattaches to a job that is already running on the server, e.g. after a
   * page reload. The server-persisted epoch start reconstructs the true
   * elapsed time instead of counting from the reload.
   */
  const reconnectActiveLibraryJob = async () => {
    const job = await loadActiveLibraryJob().catch(() => undefined);
    if (!job || libraryUpdating()) return;
    const elapsedMilliseconds = Math.max(0, Date.now() - job.startedAt);
    libraryUpdateStartedAt = performance.now() - elapsedMilliseconds;
    activeLibraryJob = {...job, automatic: true, reconnect: true};
    setLibraryUpdateFailed(false);
    setLibraryOperation(job.operation);
    setLibraryUpdateStage("working");
    setLibraryUpdateCompletedSteps(0);
    setLibraryUpdateTotalSteps(3);
    setLibraryUpdateSubProgress(undefined);
    setLibraryUpdateProgressMessage("Reattaching to the running library job");
    setLibraryUpdating(true);
    setLibraryUpdateElapsedSeconds(Math.floor(elapsedMilliseconds / 1_000));
    startLibraryStatusPolling();
    void refreshLibraryUpdateStatus(activeLibraryJob);
  };

  const fetchMoreLibrary = async (
    options: {
      automatic?: boolean;
      limit?: number;
      maxSearchPages?: number;
      rememberBootFetch?: boolean;
      providerId?: string;
      query?: string;
      transient?: boolean;
    } = {},
  ) => {
    if (libraryUpdating()) return;
    const providerId = options.providerId ?? selectedProviderId();
    const provider = availableLibraryProviders().find((candidate) => candidate.id === providerId);
    const searchQuery = options.query ?? provider?.defaultQuery ?? "";
    beginLibraryUpdate("fetch-more", searchQuery);
    setLibraryUpdateNotice(undefined);
    if (!options.transient) {
      setSelectedProviderId(providerId);
      saveLibraryProviderPreference(providerId);
    }
    if (options.rememberBootFetch !== undefined) {
      saveBootFetchPreference(options.rememberBootFetch);
      setFetchOnBoot(options.rememberBootFetch);
    }
    let acquisitionLimit = options.limit ?? libraryFetchLimit();
    let searchPageLimit = options.maxSearchPages ?? librarySearchPageLimit();
    if (!options.transient && (options.limit !== undefined || options.maxSearchPages !== undefined)) {
      const preferences = saveLibraryFetchPreferences({
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
      });
      acquisitionLimit = preferences.limit;
      searchPageLimit = preferences.maxSearchPages;
      setLibraryFetchLimit(preferences.limit);
      setLibrarySearchPageLimit(preferences.maxSearchPages);
    }
    if (!options.automatic) {
      setLibraryUpdateOpen(false);
      closeMenu();
    }
    try {
      const blockedTags = blacklistedTags();
      const job = await fetchMorePublications({
        ...(blockedTags.length === 0 ? {} : {blockedTags}),
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
        providerId,
        ...(searchQuery ? {query: searchQuery} : {}),
      });
      monitorLibraryJob(job, options.automatic === true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The local acquisition service could not fetch more stock.";
      reportLibraryFailure("fetch-more", options.automatic === true, message);
      finishLibraryUpdate();
    }
  };

  const scanLibrary = async (mode: LibraryScanMode = "quick", repairOptions?: LibraryRepairOptions) => {
    if (libraryUpdating()) return;
    setLibraryScanMode(mode);
    beginLibraryUpdate("scan");
    setLibraryUpdateNotice(undefined);
    try {
      const job = await scanLocalLibrary(
        mode === "repair"
          ? {
              repair: true,
              ...(repairOptions?.redownloadProviderAssets ? {redownloadProviderAssets: true} : {}),
              ...(repairOptions?.repairProviderMetadata ? {repairProviderMetadata: true} : {}),
            }
          : {},
      );
      monitorLibraryJob(job, false);
    } catch (error) {
      reportLibraryFailure(
        "scan",
        false,
        error instanceof Error ? error.message : "The local library could not be imported and scanned.",
      );
      finishLibraryUpdate();
    }
  };

  const importPastedPublication = async (text: string) => {
    let match;
    try {
      match = await resolvePastedLibraryImport(text);
    } catch (error) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(
        error instanceof Error
          ? `Could not resolve the pasted text: ${error.message}`
          : "Could not ask library providers about the pasted text.",
      );
      return false;
    }
    if (!match) return false;
    const importLabel = match.publicationId ?? `${match.providerId} publication`;
    if (
      match.publicationId &&
      activeLibrary().publications.some((publication) => publication.id === match.publicationId)
    ) {
      setLibraryUpdateFailed(false);
      setLibraryUpdateNotice(`${importLabel} is already imported.`);
      return true;
    }
    if (libraryUpdating()) {
      setLibraryUpdateNotice(`Could not import ${importLabel} because another library job is running.`);
      return true;
    }
    if (unavailableBookPathCount() > 0) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(`Could not import ${importLabel} until the configured book paths are remounted.`);
      return true;
    }
    void fetchMoreLibrary({
      limit: 1,
      maxSearchPages: 1,
      providerId: match.providerId,
      query: match.query,
      transient: true,
    });
    return true;
  };

  let bootFetchStarted = false;
  const maybeFetchOnBoot = () => {
    if (!ageConfirmed() || !bootFetchWasEnabled || bootFetchStarted) return;
    bootFetchStarted = true;
    void fetchMoreLibrary({automatic: true});
  };

  const confirmAge = () => {
    sessionStorage.setItem("afterleaf-age-confirmed", "yes");
    setAgeConfirmed(true);
    maybeFetchOnBoot();
  };

  const closeLibraryUpdate = () => {
    setFetchOnBoot(loadBootFetchPreference()?.enabled === true);
    setLibraryUpdateOpen(false);
  };

  const discardPublication = async (publicationId: string) => {
    await blacklistPublication({publicationId});
    setBlacklistedPublicationOverride((current = []) => [...new Set([...current, publicationId])]);
    return true;
  };

  const refreshCollections = async () => {
    const nextCollections = await loadCollections();
    setCollections(nextCollections);
  };

  const openCollectionDialog = (publicationIds?: readonly string[]) => {
    setCollectionDialogInitialPublicationIds(publicationIds);
    setNewCollectionName("");
    setCollectionDialogOpen(true);
  };

  const closeCollectionDialog = () => {
    setCollectionDialogOpen(false);
    setCollectionDialogInitialPublicationIds(undefined);
    setNewCollectionName("");
  };

  const confirmCreateCollection = async () => {
    const name = newCollectionName().trim();
    if (!name) return;
    const publicationIds = collectionDialogInitialPublicationIds();
    await createCollection(name, publicationIds ? [...new Set(publicationIds)] : []);
    closeCollectionDialog();
    await refreshCollections();
  };

  const handleAddToCollection = async (publicationIds: readonly string[], collectionId: string) => {
    const collection = collections().find((candidate) => candidate.id === collectionId);
    if (!collection) return;
    await updateCollection(collectionId, {
      publicationIds: [...new Set([...collection.publicationIds, ...publicationIds])],
    });
    await refreshCollections();
  };

  const handleRemoveFromCollection = async (publicationIds: readonly string[], collectionId: string) => {
    const collection = collections().find((candidate) => candidate.id === collectionId);
    if (!collection) return;
    const idsToRemove = new Set(publicationIds);
    await updateCollection(collectionId, {
      publicationIds: collection.publicationIds.filter((id) => !idsToRemove.has(id)),
    });
    await refreshCollections();
  };

  const handleDeleteCollection = async (collectionId: string) => {
    await deleteCollection(collectionId);
    if (selectedCollectionId() === collectionId) setSelectedCollectionId(null);
    if (highlightedCollectionId() === collectionId) {
      setHighlightedCollectionId(null);
      setHighlightedPublicationIds([]);
    }
    await refreshCollections();
  };

  const handleRenameCollection = async (collectionId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const collection = collections().find((candidate) => candidate.id === collectionId);
    if (!collection || collection.name === trimmed) return;
    await updateCollection(collectionId, {name: trimmed});
    await refreshCollections();
  };

  const handleHighlightPublications = (publicationIds: readonly string[], collectionId?: string | null) => {
    setHighlightedPublicationIds([...new Set(publicationIds)]);
    setHighlightedCollectionId(collectionId ?? null);
  };

  const handleClearHighlight = () => {
    setHighlightedPublicationIds([]);
    setHighlightedCollectionId(null);
  };

  const purgeBlacklistedWorks = async () => {
    const candidates = blacklistedTagWorkCandidates();
    if (candidates.length === 0 || libraryUpdating() || unavailableBookPathCount() > 0) return;

    setLibraryScanMode("quick");
    beginLibraryUpdate("scan");
    setLibraryUpdateNotice(undefined);
    setLibraryUpdateTotalSteps(candidates.length + 3);
    const purgedPublicationIds: string[] = [];
    try {
      for (const [index, publication] of candidates.entries()) {
        setLibraryUpdateCompletedSteps(index);
        setLibraryUpdateProgressMessage(`Purging ${publication.title} (${index + 1} of ${candidates.length})`);
        await blacklistPublication({publicationId: publication.id});
        purgedPublicationIds.push(publication.id);
      }
      setPurgeBlacklistedOpen(false);
      setBlacklistedPublicationOverride((current = []) => [...new Set([...current, ...purgedPublicationIds])]);
      setLibraryUpdateCompletedSteps(0);
      setLibraryUpdateTotalSteps(3);
      setLibraryUpdateProgressMessage("Rebuilding the purged library");
      const job = await scanLocalLibrary();
      monitorLibraryJob(job, false);
    } catch (error) {
      if (purgedPublicationIds.length > 0)
        setBlacklistedPublicationOverride((current = []) => [...new Set([...current, ...purgedPublicationIds])]);
      reportLibraryFailure(
        "scan",
        false,
        error instanceof Error
          ? `Could not finish purging blacklisted works: ${error.message}`
          : "Could not finish purging blacklisted works.",
      );
      finishLibraryUpdate();
    }
  };

  const updateMouseSensitivity = (value: number) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      gamepadLookSensitivity: gamepadLookSensitivity(),
      mouseSensitivity: value,
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setMouseSensitivity(preferences.mouseSensitivity);
  };

  const updateGamepadLookSensitivity = (value: number) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      gamepadLookSensitivity: value,
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setGamepadLookSensitivity(preferences.gamepadLookSensitivity);
  };

  const updateShortcuts = (config: ShortcutsConfig) => {
    saveShortcuts(config);
    setShortcutsConfig(config);
  };

  const updatePadMappingOverrides = (overrides: ArcadePadMappingOverrides) => {
    savePadMappingOverrides(overrides);
    setPadMappingOverrides(overrides);
  };

  const updateDefaultReadingDirection = (value: ReadingDirection) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: value,
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setDefaultReadingDirection(preferences.defaultReadingDirection);
  };

  const updateRespectBookReadingDirection = (value: boolean) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: value,
      tvScreenLighting: tvScreenLighting(),
    });
    setRespectBookReadingDirection(preferences.respectBookReadingDirection);
  };

  const updateTvScreenLighting = (value: boolean) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: value,
    });
    setTvScreenLighting(preferences.tvScreenLighting);
  };

  const updateBlacklistedTags = (tags: readonly string[]) => {
    const nextTags = saveTagBlacklist(tags);
    setBlacklistedTags(nextTags);
    const selectedTag = tag();
    if (selectedTag && nextTags.includes(normalizeTag(selectedTag))) setTag(null);
  };

  onSettled(() =>
    untrack(() => {
      // Reattach to a job that survived the reload before the boot fetch can
      // consider starting a second one; adoption marks the library busy.
      void reconnectActiveLibraryJob().then(() => untrack(maybeFetchOnBoot));
    }),
  );
  // Modal scopes mirror their dialog signals; the stack decides which one
  // owns Escape instead of a fixed priority chain in the key handler.
  createEscapeScope("purge-blacklisted", purgeBlacklistedOpen, () => {
    if (!libraryUpdating()) setPurgeBlacklistedOpen(false);
    return true;
  });
  createEscapeScope("library-repair", libraryRepairOpen, () => {
    setLibraryRepairOpen(false);
    return true;
  });
  createEscapeScope("library-update", libraryUpdateOpen, () => {
    if (!libraryUpdating()) closeLibraryUpdate();
    return true;
  });
  createEscapeScope("mobile-detail", mobileDetailOpen, () => {
    setMobileDetailOpen(false);
    return true;
  });
  onSettled(() => {
    return () => {
      if (libraryUpdateTimer !== undefined) window.clearInterval(libraryUpdateTimer);
    };
  });

  return (
    <UiModeProvider paused={menuOpen}>
      <GlobalEscapeShortcuts
        onFallback={() => {
          // Closing back into regular gameplay re-acquires the pointer
          // lock; ShopScene ignores the request while arcade sessions or
          // inspection spreads own the cursor.
          if (menuOpen()) closeMenu();
          else openMenu();
        }}
      />
      <main class="h-[100dvh] overflow-hidden bg-[#071010] text-[#d9d6cc]">
        <Show when={ageConfirmed()} fallback={<AdultGate onEnter={confirmAge} />}>
          <div class="fixed inset-0">
            <Loading
              fallback={
                <div class="grid size-full place-items-center bg-[#071010]">
                  <p class="text-[9px] font-semibold tracking-[0.2em] text-[#7e918b] uppercase">
                    Opening the shop floor…
                  </p>
                </div>
              }
            >
              <Show when={resolvedRuntimeLibrary()}>
                {(runtime) => (
                  <ShopViewport
                    catalogAtlases={() => runtime().atlases}
                    catalogAvailable={() => isRuntimeLibraryAvailable(runtime())}
                    catalogIdentity={() => runtime().identity}
                    gamepadLookSensitivity={gamepadLookSensitivity}
                    highlightedPublicationIds={highlightedPublicationIds}
                    mouseSensitivity={mouseSensitivity}
                    newPublicationIds={newPublicationIds}
                    onControlsChange={(controls) => {
                      shopViewportControls = controls;
                    }}
                    pageIndexForPublication={(publicationId) => bookmarks()[publicationId] ?? 0}
                    publications={library}
                    selectedPublicationId={() => selectedItem()?.id}
                    tvScreenLighting={tvScreenLighting}
                    unstuckRequest={unstuckRequest}
                    paused={menuOpen}
                    onOpenMenu={openMenu}
                    onCloseMenu={() => closeMenu()}
                    shortcutsConfig={shortcutsConfig}
                    padMappingOverrides={padMappingOverrides}
                    onPasteText={importPastedPublication}
                    onDiscardPublication={discardPublication}
                    onPageIndexChange={(publicationId, pageIndex) =>
                      setBookmarks((current) => saveReaderBookmark(current, publicationId, pageIndex))
                    }
                    onSelectPublication={(publicationId) => {
                      setSelectedId(publicationId);
                    }}
                  />
                )}
              </Show>
            </Loading>

            <LibraryActivityToast
              busy={libraryUpdating()}
              completedSteps={libraryUpdateCompletedSteps()}
              elapsedSeconds={libraryUpdateElapsedSeconds()}
              failed={libraryUpdateFailed()}
              notice={libraryUpdateNotice()}
              status={libraryActivityStatus()}
              subProgress={libraryUpdateSubProgress()}
              totalSteps={libraryUpdateTotalSteps()}
              onDismiss={() => {
                setLibraryUpdateFailed(false);
                setLibraryUpdateNotice(undefined);
              }}
            />

            <Show when={highlightedPublicationIds().length > 0}>
              <aside
                class="fixed top-4 right-4 z-40 flex items-center gap-3 border border-[#f5c542]/60 bg-[#2a2310]/95 px-4 py-2.5 text-[#f5c542] shadow-[0_16px_50px_#000b] backdrop-blur-md"
                aria-live="polite"
              >
                <FiStar size={14} style={{"flex-shrink": "0"}} />
                <p class="text-[11px] leading-4">
                  {highlightedCollectionId() ? (
                    <>
                      Highlighting collection &quot;
                      {collections().find((collection) => collection.id === highlightedCollectionId())?.name ?? ""}
                      &quot;
                    </>
                  ) : (
                    <>Highlighting {highlightedPublicationIds().length} book(s)</>
                  )}
                </p>
                <button
                  class="ml-2 text-[10px] font-semibold tracking-wide uppercase hover:text-white"
                  onClick={handleClearHighlight}
                >
                  Clear
                </button>
              </aside>
            </Show>

            <Show when={unavailableBookPathCount()}>
              {(count) => (
                <aside
                  class="fixed top-4 left-1/2 z-40 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 border border-[#d94c3f]/60 bg-[#250d0b]/95 px-4 py-3 text-[#ff796c] shadow-[0_16px_50px_#000b] backdrop-blur-md"
                  aria-live="assertive"
                >
                  <FiAlertTriangle size={16} style={{"margin-top": "0.125rem", "flex-shrink": "0"}} />
                  <p class="text-[11px] leading-5">
                    {count()} configured book {count() === 1 ? "path is" : "paths are"} unavailable. Library updates are
                    locked so the current books cannot be removed. Remount the expected storage and restore its
                    Afterleaf library root marker to continue. Enrolled book roots may be empty; missing or mismatched
                    markers are treated as unavailable storage.
                  </p>
                </aside>
              )}
            </Show>

            <Show when={menuOpen()}>
              <div
                class="fixed inset-0 z-30 overflow-hidden bg-[#080d0c]/80 p-0 backdrop-blur-sm sm:p-4 lg:p-7"
                role="dialog"
                aria-modal="true"
                aria-label="Afterleaf pause menu"
              >
                <div class="mx-auto flex size-full max-w-[1800px] flex-col overflow-hidden border-white/10 bg-[#101716]/98 shadow-[0_30px_120px_#000] sm:border">
                  <header class="flex h-[72px] shrink-0 items-center border-b border-white/8 bg-[#121918]/95 px-4 sm:px-5 lg:px-6">
                    <div class="flex min-w-0 items-center gap-4">
                      <div class="brand-mark grid size-9 shrink-0 place-items-center bg-[#d94c3f] font-serif text-lg text-white">
                        葉
                      </div>
                      <div class="min-w-0">
                        <h1 class="truncate font-serif text-xl tracking-[-0.03em] text-[#f0ebdf]">Afterleaf</h1>
                        <p class="hidden text-[9px] font-semibold tracking-[0.22em] text-[#6f7a76] uppercase sm:block">
                          Closing shift · local library
                        </p>
                      </div>
                    </div>
                    <div class="ml-auto flex items-center gap-2 sm:gap-3">
                      <div class="mr-2 hidden items-center gap-2 text-[10px] text-[#6f7b76] md:flex">
                        <span class="size-1.5 rounded-full bg-[#75aa91] shadow-[0_0_8px_#75aa91]" /> Local library
                      </div>
                      <button
                        class="flex h-9 items-center gap-2 border border-white/10 px-3 text-[11px] text-[#aab2ae] transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-50"
                        disabled={
                          isPending(() => runtimeLibrary()) || libraryUpdating() || unavailableBookPathCount() > 0
                        }
                        onClick={() => void scanLibrary("quick")}
                        title={
                          unavailableBookPathCount() > 0
                            ? "Remount the configured book paths before updating the library"
                            : "Find new or normally changed local books and reuse unchanged generated assets"
                        }
                      >
                        <span
                          class={{
                            "animate-spin": isPending(() => runtimeLibrary()) || libraryUpdating(),
                          }}
                        >
                          <FiRefreshCw size={14} />
                        </span>
                        <span class="hidden sm:inline">{scanButtonLabel()}</span>
                      </button>
                      <button
                        aria-label="Deep scan and repair library"
                        class="grid size-9 place-items-center border border-white/10 text-[#8d9893] transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-50"
                        disabled={
                          isPending(() => runtimeLibrary()) || libraryUpdating() || unavailableBookPathCount() > 0
                        }
                        onClick={() => setLibraryRepairOpen(true)}
                        title={
                          unavailableBookPathCount() > 0
                            ? "Remount the configured book paths before repairing the library"
                            : "Choose local and optional provider repair actions"
                        }
                      >
                        <FiTool size={14} />
                      </button>
                      <button
                        class="flex h-9 items-center gap-2 bg-[#ece6d8] px-3.5 text-[11px] font-bold text-[#1b2321] transition hover:bg-white disabled:cursor-wait"
                        disabled={
                          isPending(() => runtimeLibrary()) || libraryUpdating() || unavailableBookPathCount() > 0
                        }
                        onClick={() => {
                          setFetchOnBoot(loadBootFetchPreference()?.enabled === true);
                          setLibraryUpdateOpen(true);
                        }}
                      >
                        <FiDownload size={14} />
                        <span class="hidden sm:inline">{fetchButtonLabel()}</span>
                      </button>
                      <button
                        class="grid size-9 place-items-center text-[#8d9893] transition hover:bg-white/5 hover:text-white"
                        aria-label="Close menu and return to shop"
                        title="Return to shop (Tab)"
                        onPointerDown={(event) => {
                          if (event.button === 0) closeMenu();
                        }}
                        onClick={() => closeMenu()}
                      >
                        <FiX size={17} />
                      </button>
                    </div>
                  </header>

                  <nav class="flex shrink-0 border-b border-white/8 bg-[#121918] p-2 xl:hidden">
                    <button
                      class={[
                        "flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition",
                        {
                          "bg-[#1c2523] text-[#ece8dd]": menuTab() === "library",
                          "text-[#78837e] hover:bg-white/[0.025] hover:text-white": menuTab() !== "library",
                        },
                      ]}
                      aria-pressed={menuTab() === "library" ? "true" : "false"}
                      onClick={() => setMenuTab("library")}
                      type="button"
                    >
                      <FiGrid size={13} /> Library
                    </button>
                    <button
                      class={[
                        "flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition",
                        {
                          "bg-[#1c2523] text-[#ece8dd]": menuTab() === "options",
                          "text-[#78837e] hover:bg-white/[0.025] hover:text-white": menuTab() !== "options",
                        },
                      ]}
                      aria-pressed={menuTab() === "options" ? "true" : "false"}
                      onClick={() => setMenuTab("options")}
                      type="button"
                    >
                      <FiSettings size={13} /> Options
                    </button>
                    <button
                      class={[
                        "flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition",
                        {
                          "bg-[#1c2523] text-[#ece8dd]": menuTab() === "shortcuts",
                          "text-[#78837e] hover:bg-white/[0.025] hover:text-white": menuTab() !== "shortcuts",
                        },
                      ]}
                      aria-pressed={menuTab() === "shortcuts" ? "true" : "false"}
                      onClick={() => setMenuTab("shortcuts")}
                      type="button"
                    >
                      <FiCommand size={13} /> Shortcuts
                    </button>
                  </nav>

                  <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)_330px]">
                    <nav class="hidden border-r border-white/8 bg-[#121918] px-5 py-7 xl:flex xl:flex-col">
                      <p class="px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">Menu</p>
                      <div class="mt-4 space-y-1">
                        <button
                          class={[
                            "flex w-full items-center gap-3 px-3 py-2.5 text-xs transition",
                            {
                              "bg-[#1c2523] font-semibold text-[#ece8dd]": menuTab() === "library",
                              "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]": menuTab() !== "library",
                            },
                          ]}
                          aria-pressed={menuTab() === "library" ? "true" : "false"}
                          onClick={() => setMenuTab("library")}
                          type="button"
                        >
                          <FiGrid color="#e25a4d" size={14} /> Library{" "}
                          <span class="ml-auto text-[10px] text-[#7c8681]">
                            {String(library().length).padStart(2, "0")}
                          </span>
                        </button>
                        <button
                          class={[
                            "flex w-full items-center gap-3 px-3 py-2.5 text-xs transition",
                            {
                              "bg-[#1c2523] font-semibold text-[#ece8dd]": menuTab() === "options",
                              "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]": menuTab() !== "options",
                            },
                          ]}
                          aria-pressed={menuTab() === "options" ? "true" : "false"}
                          onClick={() => setMenuTab("options")}
                          type="button"
                        >
                          <FiSettings color="#e25a4d" size={14} /> Options
                        </button>
                        <button
                          class={[
                            "flex w-full items-center gap-3 px-3 py-2.5 text-xs transition",
                            {
                              "bg-[#1c2523] font-semibold text-[#ece8dd]": menuTab() === "shortcuts",
                              "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]": menuTab() !== "shortcuts",
                            },
                          ]}
                          aria-pressed={menuTab() === "shortcuts" ? "true" : "false"}
                          onClick={() => setMenuTab("shortcuts")}
                          type="button"
                        >
                          <FiCommand color="#e25a4d" size={14} /> Shortcuts
                        </button>
                      </div>

                      <p class="mt-9 px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">Browse</p>
                      <div class="mt-4 space-y-1">
                        <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                          <FiClock size={14} /> Recently added
                        </button>
                        <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                          <FiBookOpen size={14} /> Continue reading
                        </button>
                      </div>

                      <p class="mt-9 px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                        Collections
                      </p>
                      <div class="mt-4 space-y-1">
                        <For each={collections()}>
                          {(collection) => (
                            <button
                              class={[
                                "group flex w-full items-center gap-2 px-3 py-2.5 text-xs transition",
                                {
                                  "bg-[#1c2523] font-semibold text-[#ece8dd]": selectedCollectionId() === collection.id,
                                  "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                                    selectedCollectionId() !== collection.id,
                                },
                              ]}
                              aria-pressed={selectedCollectionId() === collection.id ? "true" : "false"}
                              onClick={() =>
                                setSelectedCollectionId((current) => (current === collection.id ? null : collection.id))
                              }
                              onContextMenu={(event) => {
                                event.preventDefault();
                                handleHighlightPublications(collection.publicationIds, collection.id);
                              }}
                              title="Right-click to highlight in shop&#10;Double-click to rename"
                              type="button"
                            >
                              <span
                                class="size-2 rounded-full"
                                style={{"background-color": collection.color ?? "#d94c3f"}}
                              />
                              <Show
                                when={editingCollectionId() === collection.id}
                                fallback={
                                  <span
                                    class="truncate"
                                    onDblClick={(event) => {
                                      event.stopPropagation();
                                      setEditingCollectionId(collection.id);
                                      setEditingCollectionName(collection.name);
                                    }}
                                  >
                                    {collection.name}
                                  </span>
                                }
                              >
                                <input
                                  ref={(element) => {
                                    element?.focus();
                                    element?.select();
                                  }}
                                  class="min-w-0 flex-1 border border-[#70a28b]/60 bg-[#0f1615] px-1.5 py-0.5 text-xs text-[#ece8dd] outline-none ring-1 ring-[#70a28b]/30"
                                  value={editingCollectionName()}
                                  onInput={(event) => setEditingCollectionName(event.currentTarget.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void handleRenameCollection(collection.id, editingCollectionName());
                                      setEditingCollectionId(null);
                                    } else if (event.key === "Escape") {
                                      event.preventDefault();
                                      setEditingCollectionId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingCollectionId() === collection.id) {
                                      void handleRenameCollection(collection.id, editingCollectionName());
                                    }
                                    setEditingCollectionId(null);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  onDblClick={(event) => event.stopPropagation()}
                                  type="text"
                                />
                              </Show>
                              <span class="ml-auto text-[10px] text-[#7c8681]">
                                {String(collection.publicationIds.length).padStart(2, "0")}
                              </span>
                              <span
                                class="ml-1 opacity-0 transition group-hover:opacity-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteCollection(collection.id);
                                }}
                                title="Delete collection"
                                role="button"
                              >
                                <FiX size={12} />
                              </span>
                            </button>
                          )}
                        </For>
                        <button
                          class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]"
                          onClick={() => openCollectionDialog()}
                          type="button"
                        >
                          <FiPlus size={14} /> New collection
                        </button>
                      </div>

                      <div class="mt-auto border-t border-white/8 pt-5">
                        <div class="flex items-center gap-3 px-2">
                          <span class="grid size-8 place-items-center rounded-full bg-[#24312e] text-[#789488]">
                            <FiShield size={13} />
                          </span>
                          <div>
                            <p class="text-[10px] font-semibold text-[#9ca6a1]">Local catalog</p>
                            <p class="mt-0.5 text-[9px] text-[#56615c]">Stored on this device</p>
                          </div>
                        </div>
                      </div>
                    </nav>

                    <section
                      class={[
                        "min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9",
                        {hidden: menuTab() !== "library"},
                      ]}
                    >
                      <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                        <div>
                          <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
                            First floor · current stock
                          </p>
                          <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
                            The night shelf
                          </h2>
                          <p class="mt-2 text-xs text-[#6e7974]">
                            {library().length} publications catalogued ·{" "}
                            {library().length > 0 ? "all covers verified" : "ready for import"}
                          </p>
                        </div>
                        <div class="flex items-center gap-3 border border-white/8 bg-[#151e1c] px-4 py-3">
                          <span class="relative flex size-7 items-center justify-center">
                            <span class="absolute size-6 rounded-full border border-[#70a28b]/20" />
                            <span class="size-2 rounded-full bg-[#70a28b] shadow-[0_0_10px_#70a28b]" />
                          </span>
                          <div>
                            <p class="text-[10px] font-semibold text-[#b8c1bc]">Library is current</p>
                            <p class="mt-0.5 text-[9px] text-[#5f6b66]">Last checked {lastChecked()}</p>
                            <Show when={libraryUpdating()}>
                              <p class="mt-1 text-[9px] text-[#d66a60]">
                                {libraryActivityStatus()} · {libraryUpdateElapsedSeconds()}s
                              </p>
                            </Show>
                            <Show when={libraryUpdateNotice()}>
                              {(notice) => <p class="mt-1 text-[9px] text-[#7fa995]">{notice()}</p>}
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="mt-8 flex flex-col gap-3 border-y border-white/8 py-4 md:flex-row md:items-center">
                        <label class="flex h-10 flex-1 items-center gap-3 bg-[#19211f] px-3.5 text-[#7b8581] ring-[#d95145] focus-within:ring-1">
                          <FiSearch size={15} />
                          <input
                            class="min-w-0 flex-1 bg-transparent text-xs text-[#e2ded4] outline-none placeholder:text-[#65706c]"
                            value={query()}
                            onInput={(event) => setQuery(event.currentTarget.value)}
                            placeholder="Search title, collection, or tag…"
                          />
                          <Show when={query()}>
                            <button class="hover:text-white" aria-label="Clear search" onClick={() => setQuery("")}>
                              <FiX size={13} />
                            </button>
                          </Show>
                        </label>
                        <div class="flex h-10 items-center gap-1 overflow-x-auto bg-[#19211f] p-1">
                          <FiSliders
                            size={13}
                            color="#68736e"
                            style={{"margin-left": "0.5rem", "margin-right": "0.5rem", "flex-shrink": "0"}}
                          />
                          <For each={Object.entries(languageLabels) as [LanguageFilter, string][]}>
                            {(entry) => (
                              <button
                                class={[
                                  "h-8 shrink-0 px-3 text-[10px] font-semibold transition",
                                  {
                                    "bg-[#ede7d9] text-[#18201f]": language() === entry[0],
                                    "text-[#77827d] hover:text-white": language() !== entry[0],
                                  },
                                ]}
                                onClick={() => setLanguage(entry[0])}
                              >
                                {entry[1]}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>

                      <div class="scrollbar-themed-x mt-4 flex gap-2 overflow-x-auto pb-1">
                        <button
                          class={[
                            "shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition",
                            {
                              "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]": tag() === null,
                              "border-white/8 text-[#69746f] hover:border-white/15": tag() !== null,
                            },
                          ]}
                          onClick={() => setTag(null)}
                        >
                          All tags
                        </button>
                        <For each={visibleTags()}>
                          {(catalogTag) => (
                            <button
                              class={[
                                "shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition",
                                {
                                  "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]": tag() === catalogTag,
                                  "border-white/8 text-[#69746f] hover:border-white/15 hover:text-[#aeb5b1]":
                                    tag() !== catalogTag,
                                },
                              ]}
                              onClick={() => setTag(catalogTag)}
                            >
                              {catalogTag}
                            </button>
                          )}
                        </For>
                      </div>

                      <Show when={selectedCollection()}>
                        {(collection) => (
                          <div class="mt-4 flex items-center gap-2">
                            <span class="flex items-center gap-2 border border-[#d64e42] bg-[#d64e42]/10 px-3 py-1.5 text-[9px] font-semibold tracking-wide text-[#e46a60] uppercase">
                              Collection · {collection().name}
                              <button
                                class="hover:text-white"
                                aria-label="Clear collection filter"
                                onClick={() => setSelectedCollectionId(null)}
                              >
                                <FiX size={11} />
                              </button>
                            </span>
                          </div>
                        )}
                      </Show>

                      <div class="mt-5 flex items-center justify-between border-b border-white/8 pb-4">
                        <p class="text-[9px] leading-4 text-[#5f6a66]">
                          Inspect the catalog here, then press Tab to return to the shop floor.
                        </p>
                        <span class="hidden items-center gap-2 border border-white/10 px-3 py-2 text-[9px] font-semibold tracking-[0.12em] text-[#7d8883] uppercase sm:flex">
                          <FiMenu size={12} /> Menu (Tab)
                        </span>
                      </div>

                      <div class="mt-8">
                        <div class="mb-5 flex items-center justify-between">
                          <p class="text-[10px] font-semibold tracking-[0.17em] text-[#747f7a] uppercase">
                            Face-out rack{" "}
                            <span class="ml-2 text-[#4f5955]">
                              {filteredCatalog().length.toString().padStart(2, "0")}
                            </span>
                          </p>
                          <p class="text-[9px] text-[#515c57]">Newest added first</p>
                        </div>
                        <Show
                          when={filteredCatalog().length > 0}
                          fallback={
                            <div class="grid min-h-72 place-items-center border border-dashed border-white/10 text-center">
                              <div>
                                <FiSearch size={20} color="#53605a" style={{display: "block", margin: "0 auto"}} />
                                <p class="mt-4 text-sm text-[#9ba49f]">Nothing on this shelf</p>
                                <button
                                  class="mt-3 text-[10px] font-semibold text-[#d65a4f]"
                                  onClick={() => {
                                    setQuery("");
                                    setTag(null);
                                    setLanguage("all");
                                  }}
                                >
                                  Clear filters
                                </button>
                              </div>
                            </div>
                          }
                        >
                          <div class="shelf-grid grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                            <For each={filteredCatalog()}>
                              {(item) => {
                                const selected = () => selectedPublicationIds().has(item.id);
                                return (
                                  <LibraryCard
                                    item={item}
                                    active={selected()}
                                    multiSelected={selected() && selectedPublicationIds().size > 1}
                                    onSelect={(event) => {
                                      handleSelectCard(item, event);
                                      if (!event.ctrlKey && !event.metaKey && !event.shiftKey)
                                        setMobileDetailOpen(true);
                                    }}
                                    onContextMenu={(event) =>
                                      setContextMenu({item, x: event.clientX, y: event.clientY})
                                    }
                                  />
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </section>

                    <Show
                      when={menuTab() === "library" ? selectedItem() : undefined}
                      fallback={
                        <Show when={menuTab() === "library"}>
                          <aside class="hidden border-l border-white/8 bg-[#151c1b] xl:block" />
                        </Show>
                      }
                    >
                      {(item) => (
                        <div class="hidden xl:block">
                          <DetailPanel item={item()} onClose={() => setSelectedId("")} onInspect={() => closeMenu()} />
                        </div>
                      )}
                    </Show>

                    <Show when={menuTab() === "options"}>
                      <OptionsPanel
                        availableTags={availableTags()}
                        libraryConfig={libraryConfig()}
                        onLibraryConfigChange={(config) => void updateLibraryConfig(config)}
                        onReenrollLibraryRoot={reenrollBookRoot}
                        reenrollableBookPaths={reenrollableBookPaths()}
                        blacklistedTags={blacklistedTags()}
                        defaultReadingDirection={defaultReadingDirection()}
                        gamepadLookSensitivity={gamepadLookSensitivity()}
                        mouseSensitivity={mouseSensitivity()}
                        onBlacklistedTagsChange={updateBlacklistedTags}
                        onDefaultReadingDirectionChange={updateDefaultReadingDirection}
                        onGamepadLookSensitivityChange={updateGamepadLookSensitivity}
                        onMouseSensitivityChange={updateMouseSensitivity}
                        onPurgeBlacklistedWorks={() => setPurgeBlacklistedOpen(true)}
                        onUnstuck={() => {
                          setUnstuckRequest((request) => request + 1);
                          closeMenu();
                        }}
                        onRespectBookReadingDirectionChange={updateRespectBookReadingDirection}
                        onTvScreenLightingChange={updateTvScreenLighting}
                        purgeDisabled={
                          libraryUpdating() ||
                          unavailableBookPathCount() > 0 ||
                          blacklistedTagWorkCandidates().length === 0
                        }
                        purgeWorkCount={blacklistedTagWorkCandidates().length}
                        respectBookReadingDirection={respectBookReadingDirection()}
                        tvScreenLighting={tvScreenLighting()}
                      />
                    </Show>
                    <Show when={menuTab() === "shortcuts"}>
                      <ShortcutsPanel
                        config={shortcutsConfig()}
                        onChange={updateShortcuts}
                        padMappingOverrides={padMappingOverrides()}
                        onPadMappingChange={updatePadMappingOverrides}
                      />
                    </Show>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={contextMenu()}>
              {(menu) => (
                <CoverContextMenu
                  anchor={{x: menu().x, y: menu().y}}
                  collections={collections}
                  item={menu().item}
                  selectedCollectionId={selectedCollectionId}
                  selectedIds={selectedPublicationIds}
                  onClose={() => setContextMenu(null)}
                  onNewCollection={(_item, publicationIds) => openCollectionDialog(publicationIds)}
                  onAddToCollection={(publicationIds, collectionId) =>
                    void handleAddToCollection(publicationIds, collectionId)
                  }
                  onRemoveFromCollection={(publicationIds, collectionId) =>
                    void handleRemoveFromCollection(publicationIds, collectionId)
                  }
                  onHighlight={(publicationIds) => handleHighlightPublications(publicationIds)}
                />
              )}
            </Show>

            <Show when={mobileDetailOpen()}>
              <Show when={selectedItem()}>
                {(item) => (
                  <div class="fixed inset-0 z-40 bg-black/70 xl:hidden" onClick={() => setMobileDetailOpen(false)}>
                    <div
                      class="absolute inset-y-0 right-0 w-full max-w-sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DetailPanel
                        item={item()}
                        onClose={() => setMobileDetailOpen(false)}
                        onInspect={() => {
                          setMobileDetailOpen(false);
                          closeMenu();
                        }}
                      />
                    </div>
                  </div>
                )}
              </Show>
            </Show>

            <Show when={purgeBlacklistedOpen()}>
              <PurgeBlacklistedWorksDialog
                blacklistedTags={blacklistedTags()}
                busy={libraryUpdating()}
                workCount={blacklistedTagWorkCandidates().length}
                onCancel={() => setPurgeBlacklistedOpen(false)}
                onConfirm={() => void purgeBlacklistedWorks()}
              />
            </Show>

            <Show when={libraryRepairOpen()}>
              <LibraryRepairDialog
                onCancel={() => setLibraryRepairOpen(false)}
                onConfirm={(options) => {
                  setLibraryRepairOpen(false);
                  void scanLibrary("repair", options);
                }}
              />
            </Show>

            <Show when={libraryUpdateOpen()}>
              <LibraryUpdateDialog
                busy={libraryUpdating()}
                fetchOnBoot={fetchOnBoot()}
                fetchLimit={libraryFetchLimit()}
                maxSearchPages={librarySearchPageLimit()}
                providerId={selectedProviderId()}
                providers={availableLibraryProviders()}
                providerError={libraryProviderError()}
                onCancel={closeLibraryUpdate}
                onConfirm={(rememberBootFetch, providerId, queryText, fetchLimit, maxSearchPages) =>
                  void fetchMoreLibrary({
                    limit: fetchLimit,
                    maxSearchPages,
                    rememberBootFetch,
                    providerId,
                    query: queryText,
                  })
                }
                onFetchOnBootChange={setFetchOnBoot}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  saveLibraryProviderPreference(providerId);
                }}
              />
            </Show>

            <Show when={collectionDialogOpen()}>
              <div
                class="fixed inset-0 z-50 grid place-items-center bg-[#07100f]/78 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="Create collection"
                onClick={closeCollectionDialog}
              >
                <form
                  class="w-full max-w-md border border-white/12 bg-[#101716] shadow-[0_30px_100px_#000]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void confirmCreateCollection();
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <header class="flex items-start gap-4 border-b border-white/8 px-5 py-4">
                    <div class="min-w-0">
                      <p class="text-[9px] font-bold tracking-[0.2em] text-[#d05b50] uppercase">Collection</p>
                      <h2 class="mt-1 font-serif text-xl text-[#eee8dc]">Create new collection</h2>
                    </div>
                    <button
                      class="ml-auto grid size-9 shrink-0 place-items-center text-[#87938e] transition hover:bg-white/5 hover:text-white"
                      aria-label="Close collection dialog"
                      type="button"
                      onClick={closeCollectionDialog}
                    >
                      <FiX size={17} />
                    </button>
                  </header>
                  <div class="space-y-4 px-5 py-5">
                    <label class="block">
                      <span class="text-[9px] font-bold tracking-[0.14em] text-[#8f9b96] uppercase">Name</span>
                      <input
                        class="mt-2 h-11 w-full border border-white/12 bg-[#0a1110] px-3 text-sm text-[#f0ebdf] transition outline-none placeholder:text-[#4f5b57] focus:border-[#c7554b]"
                        value={newCollectionName()}
                        onInput={(event) => setNewCollectionName(event.currentTarget.value)}
                        placeholder="Late night reads"
                        maxlength={100}
                        autofocus
                      />
                    </label>
                  </div>
                  <footer class="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
                    <button
                      class="h-10 px-4 text-[10px] font-bold tracking-[0.08em] text-[#98a39e] uppercase transition hover:bg-white/5 hover:text-white"
                      type="button"
                      onClick={closeCollectionDialog}
                    >
                      Cancel
                    </button>
                    <button
                      class="flex h-10 items-center gap-2 bg-[#ece6d8] px-4 text-[10px] font-bold tracking-[0.08em] text-[#17201e] uppercase transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={newCollectionName().trim().length === 0}
                      type="submit"
                    >
                      Create
                    </button>
                  </footer>
                </form>
              </div>
            </Show>
          </div>
        </Show>
      </main>
    </UiModeProvider>
  );
};
