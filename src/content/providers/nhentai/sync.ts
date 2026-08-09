import {createHash, randomUUID} from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {basename, parse, resolve} from "node:path";
import {
  CONTENT_SCHEMA_VERSION,
  createConcurrentAcquisitionPipeline,
  createRepresentativePagePlan,
  inferPreparedPublicationIdentity,
  normalizeTag,
  normalizeTags,
  parseLocalPublicationDocument,
  type LocalPublicationDocument,
  type SupportedLanguage,
} from "@afterleaf/provider-sdk";
import {
  NhentaiClient,
  NhentaiGalleryValidationError,
  type NhentaiGallery,
  type NhentaiGallerySummary,
  nhentaiPageExtension,
} from "./client";
import {
  NHENTAI_SPARSE_METADATA_FILE,
  createNhentaiSparseMetadata,
} from "./sparseMetadata";
import {nhentaiGalleryIdFromText} from "./url";

export interface NhentaiSyncOptions {
  blockedTags: string[];
  languages: SupportedLanguage[];
  limit: number;
  maxSearchPages: number;
  onProgress?: (message: string) => void;
  outputDirectory: string;
  previewPageCount?: number;
  query: string;
  searchPageDelayMs?: number;
  excludedPublicationIds?: readonly string[];
  selectionMode?: "recent" | "unseen";
  write: boolean;
}

export interface NhentaiSyncDiagnostic {
  code:
    | "blacklisted"
    | "blocked-tag"
    | "duplicate"
    | "existing-complete"
    | "fewer-than-limit"
    | "invalid-gallery"
    | "unsupported-language";
  galleryId?: number;
  message: string;
}

export interface NhentaiSyncReport {
  addedCount: number;
  diagnostics: NhentaiSyncDiagnostic[];
  outputDirectory: string;
  query: string;
  requestedLimit: number;
  selectedGalleryIds: number[];
  unchangedCount: number;
  updatedCount: number;
  wroteCatalog: boolean;
}

export interface NhentaiSyncDependencies {
  client?: NhentaiClient;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface SelectedGallery<Gallery extends NhentaiGallerySummary> {
  gallery: Gallery;
  language: SupportedLanguage;
  repair: boolean;
  repairReason?: string;
}

const MAX_CONCURRENT_GALLERY_MATERIALIZATIONS = 2;

const fileExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const assertSafeOutputDirectory = (path: string) => {
  const outputDirectory = resolve(path);
  if (outputDirectory === parse(outputDirectory).root)
    throw new Error("The nHentai catalog output cannot be a filesystem root");
  if (basename(outputDirectory) === "." || basename(outputDirectory) === "..")
    throw new Error("The nHentai catalog output must be a named directory");
  return outputDirectory;
};

const galleryLanguage = (
  gallery: NhentaiGallerySummary,
  languages: readonly SupportedLanguage[],
) => {
  const languageTags = new Set(
    gallery.tags
      .filter((tag) => normalizeTag(tag.type) === "language")
      .map((tag) => normalizeTag(tag.name)),
  );
  return languages.find((language) => languageTags.has(language));
};

const galleryMetadataHash = (gallery: NhentaiGallery) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        id: gallery.id,
        mediaId: gallery.mediaId,
        numPages: gallery.numPages,
        pages: gallery.pages,
        tags: gallery.tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          type: tag.type,
        })),
        title: gallery.title,
        uploadDate: gallery.uploadDate,
      }),
    )
    .digest("hex");

const chooseTitle = (gallery: NhentaiGallery, language: SupportedLanguage) => {
  if (language === "english")
    return (
      gallery.title.english ?? gallery.title.pretty ?? gallery.title.japanese
    );
  return (
    gallery.title.japanese ?? gallery.title.pretty ?? gallery.title.english
  );
};

const manifestForGallery = (
  gallery: NhentaiGallery,
  language: SupportedLanguage,
  retrievedAt: string,
  previewPageCount = gallery.numPages,
): LocalPublicationDocument => {
  const tags = normalizeTags(gallery.tags.map((tag) => tag.name));
  const title = chooseTitle(gallery, language) ?? `nHentai ${gallery.id}`;
  const identity = inferPreparedPublicationIdentity(title, tags);
  const pageDigits = Math.max(3, String(gallery.numPages).length);
  const pagePath = (pageIndex: number) => {
    const page = gallery.pages[pageIndex];
    if (!page)
      throw new Error(
        `Gallery ${gallery.id} lacks page metadata for page ${pageIndex + 1}`,
      );
    return `pages/${String(pageIndex + 1).padStart(pageDigits, "0")}.${nhentaiPageExtension(page)}`;
  };
  const pagePlan = createRepresentativePagePlan(
    gallery.numPages,
    previewPageCount,
  );
  const pages = pagePlan.initialPageIndexes.map(pagePath);
  const firstPage = pages[0];
  if (!firstPage) throw new Error(`Gallery ${gallery.id} has no pages`);
  const backPage = pagePath(pagePlan.backPageIndex);
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: `nhentai-${gallery.id}`,
    ...(identity.groupId === undefined ? {} : {groupId: identity.groupId}),
    ...(identity.issue === undefined ? {} : {issue: identity.issue}),
    kind: identity.kind ?? "doujinshi",
    title: identity.title,
    language,
    ...(pages.length === gallery.numPages ? {} : {pageCount: gallery.numPages}),
    tags: identity.tags,
    assets: {back: backPage, front: firstPage, pages},
    source: {
      provider: "nhentai",
      remoteId: String(gallery.id),
      sourceUrl: `https://nhentai.net/g/${gallery.id}/`,
      retrievedAt,
      metadataHash: galleryMetadataHash(gallery),
    },
    physical: {
      readingDirection: "rtl",
      thicknessMm: Math.max(4, Math.min(24, 4 + gallery.numPages * 0.055)),
      trim: "B5",
    },
  };
};

const existingManifest = async (publicationDirectory: string) => {
  const manifestPath = resolve(publicationDirectory, "publication.json");
  if (!(await fileExists(manifestPath))) return undefined;
  try {
    const value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    return parseLocalPublicationDocument(value, manifestPath);
  } catch {
    return undefined;
  }
};

const publicationIncompleteReason = async (
  publicationDirectory: string,
  document: LocalPublicationDocument,
) => {
  if (
    document.pageCount !== undefined &&
    document.pageCount > document.assets.pages.length &&
    document.assets.back === undefined
  )
    return "the sparse publication manifest has no back-cover asset";
  const assetPaths = new Set([
    ...document.assets.pages,
    document.assets.front,
    document.assets.back,
    document.assets.spine,
  ]);
  for (const assetPath of assetPaths) {
    if (!assetPath) continue;
    if (!(await fileExists(resolve(publicationDirectory, assetPath))))
      return `local asset ${JSON.stringify(assetPath)} is missing`;
  }
  return undefined;
};

const publicationIsComplete = async (
  publicationDirectory: string,
  document: LocalPublicationDocument,
) =>
  (await publicationIncompleteReason(publicationDirectory, document)) ===
  undefined;

const publicationAssetsMatch = (
  first: LocalPublicationDocument["assets"],
  second: LocalPublicationDocument["assets"],
) =>
  first.front === second.front &&
  first.back === second.back &&
  first.spine === second.spine &&
  first.pages.length === second.pages.length &&
  first.pages.every((page, index) => page === second.pages[index]);

const cachedPublicationState = async (outputDirectory: string) => {
  const completePublicationIds = new Set<string>();
  const incompleteReasonByPublicationId = new Map<string, string>();
  const publicationIds = new Set<string>();
  let entries;
  try {
    entries = await readdir(outputDirectory, {withFileTypes: true});
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {
        completePublicationIds,
        incompleteReasonByPublicationId,
        publicationIds,
      };
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const publicationDirectory = resolve(outputDirectory, entry.name);
    const manifest = await existingManifest(publicationDirectory);
    if (manifest?.id !== entry.name) continue;
    publicationIds.add(manifest.id);
    const incompleteReason = await publicationIncompleteReason(
      publicationDirectory,
      manifest,
    );
    if (!incompleteReason) completePublicationIds.add(manifest.id);
    else incompleteReasonByPublicationId.set(manifest.id, incompleteReason);
  }
  return {
    completePublicationIds,
    incompleteReasonByPublicationId,
    publicationIds,
  };
};

const replaceDirectoryOnWindows = async (
  stagingDirectory: string,
  publicationDirectory: string,
) => {
  try {
    await rename(stagingDirectory, publicationDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(publicationDirectory, {recursive: true, force: true});
    await rename(stagingDirectory, publicationDirectory);
  }
};

const commitPublication = async (
  stagingDirectory: string,
  publicationDirectory: string,
) => {
  if (!(await fileExists(publicationDirectory))) {
    await rename(stagingDirectory, publicationDirectory);
    return "added" as const;
  }
  const backupDirectory = `${publicationDirectory}.backup-${randomUUID()}`;
  await rename(publicationDirectory, backupDirectory);
  try {
    await replaceDirectoryOnWindows(stagingDirectory, publicationDirectory);
    await rm(backupDirectory, {recursive: true, force: true});
    return "updated" as const;
  } catch (error) {
    if (!(await fileExists(publicationDirectory)))
      await rename(backupDirectory, publicationDirectory);
    throw error;
  }
};

const materializeGallery = async (
  client: NhentaiClient,
  selected: SelectedGallery<NhentaiGallery>,
  outputDirectory: string,
  retrievedAt: string,
  previewPageCount?: number,
  onDownloadStart?: () => void,
) => {
  const document = manifestForGallery(
    selected.gallery,
    selected.language,
    retrievedAt,
    previewPageCount,
  );
  const publicationDirectory = resolve(outputDirectory, document.id);
  const existing = await existingManifest(publicationDirectory);
  const metadataHash = document.source?.metadataHash;
  if (!metadataHash)
    throw new Error(`Gallery ${selected.gallery.id} lacks a metadata hash`);
  const sparseMetadata = `${JSON.stringify(
    createNhentaiSparseMetadata(selected.gallery, metadataHash),
    null,
    2,
  )}\n`;
  if (
    existing?.source?.metadataHash === document.source?.metadataHash &&
    publicationAssetsMatch(existing.assets, document.assets) &&
    (await publicationIsComplete(publicationDirectory, existing))
  ) {
    const sparseMetadataPath = resolve(
      publicationDirectory,
      NHENTAI_SPARSE_METADATA_FILE,
    );
    if (!(await fileExists(sparseMetadataPath)))
      await writeFile(sparseMetadataPath, sparseMetadata);
    return "unchanged" as const;
  }

  const stagingDirectory = resolve(
    outputDirectory,
    `.${document.id}.staging-${randomUUID()}`,
  );
  const pagesDirectory = resolve(stagingDirectory, "pages");
  await mkdir(pagesDirectory, {recursive: true});
  try {
    const downloads = document.assets.pages.map((path, pageIndex) => ({
      pageIndex,
      path,
    }));
    const lastPageIndex = selected.gallery.numPages - 1;
    const backPath = document.assets.back;
    if (backPath && !downloads.some(({path}) => path === backPath))
      downloads.push({pageIndex: lastPageIndex, path: backPath});
    let nextDownloadIndex = 0;
    const workerCount = Math.min(3, downloads.length);
    await Promise.all(
      Array.from({length: workerCount}, async () => {
        while (nextDownloadIndex < downloads.length) {
          const download = downloads[nextDownloadIndex];
          nextDownloadIndex += 1;
          if (!download) continue;
          onDownloadStart?.();
          const bytes = await client.downloadPage(
            selected.gallery,
            download.pageIndex,
          );
          await writeFile(resolve(stagingDirectory, download.path), bytes);
        }
      }),
    );
    await writeFile(
      resolve(stagingDirectory, "publication.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    await writeFile(
      resolve(stagingDirectory, NHENTAI_SPARSE_METADATA_FILE),
      sparseMetadata,
    );
    const incompleteReason = await publicationIncompleteReason(
      stagingDirectory,
      document,
    );
    if (incompleteReason)
      throw new Error(
        `Gallery ${selected.gallery.id} staging verification failed: ${incompleteReason}`,
      );
    return await commitPublication(stagingDirectory, publicationDirectory);
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true});
    throw error;
  }
};

const writeSyncLedger = async (
  outputDirectory: string,
  report: NhentaiSyncReport,
  syncedAt: string,
) => {
  const path = resolve(outputDirectory, ".nhentai-sync.json");
  const temporaryPath = `${path}.staging-${randomUUID()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({schemaVersion: 1, syncedAt, ...report}, null, 2)}\n`,
  );
  await rename(temporaryPath, path);
};

export const syncNhentaiCatalog = async (
  options: NhentaiSyncOptions,
  dependencies: NhentaiSyncDependencies = {},
): Promise<NhentaiSyncReport> => {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0)
    throw new Error("nHentai sync limit must be a positive integer");
  if (
    !Number.isSafeInteger(options.maxSearchPages) ||
    options.maxSearchPages <= 0
  )
    throw new Error("nHentai max search pages must be a positive integer");
  if (options.languages.length === 0)
    throw new Error("nHentai sync requires at least one catalog language");
  if (
    options.previewPageCount !== undefined &&
    (!Number.isSafeInteger(options.previewPageCount) ||
      options.previewPageCount <= 0)
  )
    throw new Error("nHentai preview page count must be a positive integer");
  if (
    options.searchPageDelayMs !== undefined &&
    (!Number.isFinite(options.searchPageDelayMs) ||
      options.searchPageDelayMs < 0)
  )
    throw new Error("nHentai search page delay must be a non-negative number");

  const outputDirectory = assertSafeOutputDirectory(options.outputDirectory);
  const client = dependencies.client ?? new NhentaiClient();
  const diagnostics: NhentaiSyncDiagnostic[] = [];
  const excludedPublicationIds = new Set(options.excludedPublicationIds ?? []);
  const cachedPublications =
    options.selectionMode === "unseen"
      ? await cachedPublicationState(outputDirectory)
      : {
          completePublicationIds: new Set<string>(),
          incompleteReasonByPublicationId: new Map<string, string>(),
          publicationIds: new Set<string>(),
        };
  const candidatesByLanguage = new Map<
    SupportedLanguage,
    SelectedGallery<NhentaiGallerySummary>[]
  >(options.languages.map((language) => [language, []]));
  const newCandidateCountByLanguage = new Map<SupportedLanguage, number>(
    options.languages.map((language) => [language, 0]),
  );
  const seenGalleryIds = new Set<number>();
  const blockedTags = new Set(normalizeTags(options.blockedTags));
  const upstreamQuery = [
    options.query.trim(),
    '-language:"chinese"',
    ...[...blockedTags].map((tag) => `-tag:${JSON.stringify(tag)}`),
  ]
    .filter(Boolean)
    .join(" ");

  if (options.write) await mkdir(outputDirectory, {recursive: true});
  const syncedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const exactGalleryId = nhentaiGalleryIdFromText(options.query);
  const exactPublicationId = exactGalleryId
    ? `nhentai-${exactGalleryId}`
    : undefined;
  const exactGalleryAlreadyImported =
    exactPublicationId !== undefined &&
    cachedPublications.completePublicationIds.has(exactPublicationId);
  if (exactGalleryAlreadyImported)
    diagnostics.push({
      code: "existing-complete",
      galleryId: exactGalleryId,
      message: `Skipped existing complete publication ${exactPublicationId}`,
    });
  const exactGallery =
    exactGalleryId === undefined || exactGalleryAlreadyImported
      ? undefined
      : await client.loadGallery(exactGalleryId);
  type MaterializationResult = Awaited<ReturnType<typeof materializeGallery>>;
  interface QueuedAcquisition {
    candidateIndex: number;
    selectedGallery: SelectedGallery<NhentaiGallerySummary>;
  }
  interface PreparedAcquisition {
    candidateIndex: number;
    gallery: NhentaiGallery;
    language: SupportedLanguage;
    repair: boolean;
  }
  interface MaterializedAcquisition {
    gallery: NhentaiGallery;
    repair: boolean;
    result: MaterializationResult;
  }
  let scheduledNewGalleryCount = 0;
  let repairIndex = 0;

  const acquisitions = createConcurrentAcquisitionPipeline<
    QueuedAcquisition,
    PreparedAcquisition,
    MaterializedAcquisition
  >({
    concurrency: MAX_CONCURRENT_GALLERY_MATERIALIZATIONS,
    prepare: async ({candidateIndex, selectedGallery}) => {
      if (!selectedGallery.repair && scheduledNewGalleryCount >= options.limit)
        return undefined;
      if (selectedGallery.repair) {
        repairIndex += 1;
        options.onProgress?.(
          `Repairing nhentai-${selectedGallery.gallery.id} (repair ${repairIndex}): ${selectedGallery.repairReason ?? "the cached publication is incomplete"}`,
        );
      } else {
        options.onProgress?.(
          `Fetching nhentai-${selectedGallery.gallery.id} (new publication ${scheduledNewGalleryCount + 1} of ${options.limit})`,
        );
      }
      let gallery: NhentaiGallery;
      try {
        gallery =
          exactGallery?.id === selectedGallery.gallery.id
            ? exactGallery
            : await client.loadGallery(selectedGallery.gallery.id);
      } catch (error) {
        if (!(error instanceof NhentaiGalleryValidationError)) {
          options.onProgress?.(
            `Failed to load nhentai-${selectedGallery.gallery.id} metadata: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
        const message = `Skipped gallery ${error.galleryId} because its remote metadata is invalid: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
        diagnostics.push({
          code: "invalid-gallery",
          galleryId: error.galleryId,
          message,
        });
        options.onProgress?.(message);
        return undefined;
      }
      options.onProgress?.(
        `Loaded nhentai-${gallery.id} metadata; downloading preview/back assets`,
      );
      if (!selectedGallery.repair) scheduledNewGalleryCount += 1;
      return {
        candidateIndex,
        gallery,
        language: selectedGallery.language,
        repair: selectedGallery.repair,
      };
    },
    acquire: async (prepared, {markStarted}) => {
      try {
        const result = await materializeGallery(
          client,
          {gallery: prepared.gallery, language: prepared.language},
          outputDirectory,
          syncedAt,
          options.previewPageCount,
          markStarted,
        );
        options.onProgress?.(
          `${prepared.repair ? "Repaired" : "Imported"} nhentai-${prepared.gallery.id} (${result})`,
        );
        return {
          gallery: prepared.gallery,
          repair: prepared.repair,
          result,
        };
      } catch (error) {
        const action = prepared.repair ? "repair" : "import";
        options.onProgress?.(
          `Failed to ${action} nhentai-${prepared.gallery.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  });

  try {
    for (let page = 1; page <= options.maxSearchPages; page += 1) {
      if (exactGalleryId !== undefined && !exactGallery) break;
      if (exactGallery && page > 1) break;
      options.onProgress?.(
        exactGallery
          ? `Loading pasted nhentai-${exactGallery.id}`
          : `Searching page ${page} of ${options.maxSearchPages} for new publications`,
      );
      const galleries = exactGallery
        ? [exactGallery]
        : await client.search(upstreamQuery, page);
      if (galleries.length === 0) break;
      let firstPageAcquisitionStarted: Promise<void> | undefined;
      for (const gallery of galleries) {
        if (seenGalleryIds.has(gallery.id)) {
          diagnostics.push({
            code: "duplicate",
            galleryId: gallery.id,
            message: `Skipped duplicate gallery ${gallery.id}`,
          });
          continue;
        }
        seenGalleryIds.add(gallery.id);
        const publicationId = `nhentai-${gallery.id}`;
        if (excludedPublicationIds.has(publicationId)) {
          diagnostics.push({
            code: "blacklisted",
            galleryId: gallery.id,
            message: `Skipped blacklisted publication ${publicationId}`,
          });
          continue;
        }
        if (cachedPublications.completePublicationIds.has(publicationId)) {
          diagnostics.push({
            code: "existing-complete",
            galleryId: gallery.id,
            message: `Skipped existing complete publication ${publicationId}`,
          });
          continue;
        }
        const normalizedTags = normalizeTags(
          gallery.tags.map((tag) => tag.name),
        );
        const blockedTag = normalizedTags.find((tag) => blockedTags.has(tag));
        if (blockedTag) {
          diagnostics.push({
            code: "blocked-tag",
            galleryId: gallery.id,
            message: `Skipped gallery ${gallery.id} because it has blocked tag ${JSON.stringify(blockedTag)}`,
          });
          continue;
        }
        const language = galleryLanguage(gallery, options.languages);
        if (!language) {
          diagnostics.push({
            code: "unsupported-language",
            galleryId: gallery.id,
            message: `Skipped gallery ${gallery.id} because it has no explicitly allowed language tag`,
          });
          continue;
        }
        const repair = cachedPublications.publicationIds.has(publicationId);
        const selectedGallery = {
          gallery,
          language,
          repair,
          repairReason:
            cachedPublications.incompleteReasonByPublicationId.get(
              publicationId,
            ),
        };
        const languageCandidates = candidatesByLanguage.get(language);
        languageCandidates?.push(selectedGallery);
        if (
          options.write &&
          language === options.languages[0] &&
          languageCandidates
        ) {
          const acquisition = acquisitions.enqueue({
            candidateIndex: languageCandidates.length - 1,
            selectedGallery,
          });
          firstPageAcquisitionStarted ??= acquisition.started;
        }
        if (!repair)
          newCandidateCountByLanguage.set(
            language,
            (newCandidateCountByLanguage.get(language) ?? 0) + 1,
          );
      }
      await firstPageAcquisitionStarted;
      if (acquisitions.hasFailed()) break;
      const preferredLanguage = options.languages[0];
      if (
        preferredLanguage &&
        (newCandidateCountByLanguage.get(preferredLanguage) ?? 0) >=
          options.limit
      )
        break;
      if (options.searchPageDelayMs)
        await (
          dependencies.sleep ??
          ((milliseconds: number) =>
            new Promise<void>((resolvePromise) =>
              setTimeout(resolvePromise, milliseconds),
            ))
        )(options.searchPageDelayMs);
    }
  } catch (error) {
    acquisitions.abort(error);
    await acquisitions.drain().catch(() => {});
    throw error;
  }

  const orderedCandidates = options.languages.flatMap(
    (language) => candidatesByLanguage.get(language) ?? [],
  );
  let previewNewGalleryCount = 0;
  const previewSelected = orderedCandidates.filter((candidate) => {
    if (candidate.repair) return true;
    if (previewNewGalleryCount >= options.limit) return false;
    previewNewGalleryCount += 1;
    return true;
  });

  const addFewerThanLimitDiagnostic = (selectedCount: number) => {
    if (selectedCount >= options.limit) return;
    diagnostics.push({
      code: "fewer-than-limit",
      message: `Selected ${selectedCount} new galleries after filtering; requested ${options.limit}`,
    });
  };

  const report: NhentaiSyncReport = {
    addedCount: 0,
    diagnostics,
    outputDirectory,
    query: options.query,
    requestedLimit: options.limit,
    selectedGalleryIds: previewSelected.map(({gallery}) => gallery.id),
    unchangedCount: 0,
    updatedCount: 0,
    wroteCatalog: options.write,
  };
  if (!options.write) {
    addFewerThanLimitDiagnostic(previewNewGalleryCount);
    return report;
  }

  const repairCount = orderedCandidates.filter(({repair}) => repair).length;
  report.selectedGalleryIds = [];
  const preferredCandidateCount =
    candidatesByLanguage.get(options.languages[0] ?? "english")?.length ?? 0;
  for (
    let candidateIndex = preferredCandidateCount;
    candidateIndex < orderedCandidates.length;
    candidateIndex += 1
  ) {
    const selectedGallery = orderedCandidates[candidateIndex];
    if (!selectedGallery) continue;
    acquisitions.enqueue({candidateIndex, selectedGallery});
  }
  const outcomes = await acquisitions.drain();
  for (const {result: acquisition} of outcomes) {
    report.selectedGalleryIds.push(acquisition.gallery.id);
    if (acquisition.result === "added") report.addedCount += 1;
    if (acquisition.result === "updated") report.updatedCount += 1;
    if (acquisition.result === "unchanged") report.unchangedCount += 1;
  }
  const completedRepairCount = outcomes.filter(
    ({result}) => result.repair,
  ).length;
  addFewerThanLimitDiagnostic(scheduledNewGalleryCount);
  const diagnosticCounts = Object.entries(
    diagnostics.reduce<Record<string, number>>((counts, diagnostic) => {
      counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .map(([code, count]) => `${code}: ${count}`)
    .join(", ");
  options.onProgress?.(
    `Import complete: ${scheduledNewGalleryCount}/${options.limit} new, ${completedRepairCount}/${repairCount} repairs; searched ${seenGalleryIds.size} unique galleries${diagnosticCounts ? `; filtered/skipped (${diagnosticCounts})` : ""}`,
  );
  await writeSyncLedger(outputDirectory, report, syncedAt);
  return report;
};
