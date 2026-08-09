import {createHash, randomUUID} from "node:crypto";
import {
  access,
  cp,
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
  type LibraryProviderDiagnostic,
  type LibraryProviderSyncOptions,
  type LibraryProviderSyncReport,
  type LocalPublicationDocument,
} from "@afterleaf/provider-sdk";
import {
  WeebCentralClient,
  type WeebCentralChapter,
  type WeebCentralSeries,
} from "./client";
import {
  WEEBCENTRAL_SPARSE_METADATA_FILE,
  createWeebCentralSparseMetadata,
} from "./sparseMetadata";

const PROVIDER_ID = "weebcentral";
const MAX_CONCURRENT_CHAPTER_MATERIALIZATIONS = 2;

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
    throw new Error("WeebCentral catalog output cannot be a filesystem root");
  if (basename(outputDirectory) === "." || basename(outputDirectory) === "..")
    throw new Error("WeebCentral catalog output must be a named directory");
  return outputDirectory;
};

const remotePublicationId = (seriesId: string, chapterId: string) =>
  `${PROVIDER_ID}-${seriesId}-${chapterId}`;

const publicationId = (seriesId: string, chapterId: string) =>
  remotePublicationId(seriesId, chapterId).toLowerCase();

const publicationGroupId = (seriesId: string) =>
  `${PROVIDER_ID}-${seriesId}`.toLowerCase();

const logicalChapterKey = (seriesId: string, chapterNumber: number) =>
  `${seriesId.toLowerCase()}:english:chapter:${chapterNumber}`;

const manifestLogicalChapterKey = (manifest: LocalPublicationDocument) => {
  if (
    manifest.source?.provider !== PROVIDER_ID ||
    !manifest.groupId?.startsWith(`${PROVIDER_ID}-`) ||
    manifest.issue?.number === undefined
  )
    return undefined;
  return logicalChapterKey(
    manifest.groupId.slice(`${PROVIDER_ID}-`.length),
    manifest.issue.number,
  );
};

const pageExtension = (pageUrl: string) => {
  const extension = new URL(pageUrl).pathname
    .match(/\.([a-z\d]+)$/iu)?.[1]
    ?.toLowerCase();
  return extension === "png" ||
    extension === "webp" ||
    extension === "jpeg" ||
    extension === "avif"
    ? extension
    : "jpg";
};

const metadataHash = (
  series: WeebCentralSeries,
  chapter: WeebCentralChapter,
  pages: readonly string[],
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        chapter,
        pages,
        series: {
          adult: series.adult,
          authors: series.authors,
          id: series.id,
          officialTranslation: series.officialTranslation,
          tags: series.tags,
          title: series.title,
          type: series.type,
          year: series.year,
        },
      }),
    )
    .digest("hex");

const manifestForChapter = (
  series: WeebCentralSeries,
  chapter: WeebCentralChapter,
  pageUrls: readonly string[],
  retrievedAt: string,
  sourceOrigin: string,
): LocalPublicationDocument => {
  if (pageUrls.length === 0)
    throw new Error(`WeebCentral chapter ${chapter.id} has no pages`);
  const title = `${series.title} · ${chapter.label}`;
  const tags = normalizeTags(["manga", "english", ...series.tags]);
  const identity = inferPreparedPublicationIdentity(title, tags);
  const pageDigits = Math.max(3, String(pageUrls.length).length);
  const pagePath = (pageIndex: number) => {
    const pageUrl = pageUrls[pageIndex];
    if (!pageUrl)
      throw new Error(
        `WeebCentral chapter ${chapter.id} lacks page metadata for page ${pageIndex + 1}`,
      );
    return `pages/${String(pageIndex + 1).padStart(pageDigits, "0")}.${pageExtension(pageUrl)}`;
  };
  const pagePlan = createRepresentativePagePlan(pageUrls.length);
  const pages = pagePlan.initialPageIndexes.map(pagePath);
  const firstPage = pages[0];
  if (!firstPage)
    throw new Error(`WeebCentral chapter ${chapter.id} has no pages`);
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: publicationId(series.id, chapter.id),
    groupId: publicationGroupId(series.id),
    issue: {label: chapter.label, number: chapter.number},
    kind: identity.kind ?? "commercial-volume",
    title: identity.title,
    language: "english",
    pageCount: pageUrls.length,
    tags: identity.tags,
    assets: {
      back: pagePath(pagePlan.backPageIndex),
      front: firstPage,
      pages,
    },
    source: {
      metadataHash: metadataHash(series, chapter, pageUrls),
      provider: PROVIDER_ID,
      remoteId: chapter.id,
      retrievedAt,
      sourceUrl: `${sourceOrigin}${chapter.path}`,
    },
    physical: {readingDirection: "rtl"},
  };
};

const publicationAssetsMatch = (
  first: LocalPublicationDocument,
  second: LocalPublicationDocument,
) =>
  first.source?.metadataHash === second.source?.metadataHash &&
  first.assets.front === second.assets.front &&
  first.assets.back === second.assets.back &&
  first.assets.pages.length === second.assets.pages.length &&
  first.assets.pages.every(
    (page, index) => page === second.assets.pages[index],
  );

const existingManifest = async (publicationDirectory: string) => {
  try {
    return parseLocalPublicationDocument(
      JSON.parse(
        await readFile(
          resolve(publicationDirectory, "publication.json"),
          "utf8",
        ),
      ) as unknown,
      resolve(publicationDirectory, "publication.json"),
    );
  } catch {
    return undefined;
  }
};

const publicationIsComplete = async (
  publicationDirectory: string,
  manifest: LocalPublicationDocument,
) => {
  const paths = [
    ...manifest.assets.pages,
    ...(manifest.assets.front ? [manifest.assets.front] : []),
    ...(manifest.assets.back ? [manifest.assets.back] : []),
    ...(manifest.assets.spine ? [manifest.assets.spine] : []),
  ];
  return paths.every((asset) =>
    fileExists(resolve(publicationDirectory, asset)),
  );
};

const cachedPublicationState = async (outputDirectory: string) => {
  const completePublicationIds = new Set<string>();
  const completeLogicalChapterKeys = new Set<string>();
  let entries;
  try {
    entries = await readdir(outputDirectory, {withFileTypes: true});
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {completeLogicalChapterKeys, completePublicationIds};
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const publicationDirectory = resolve(outputDirectory, entry.name);
    const manifest = await existingManifest(publicationDirectory);
    if (!manifest || manifest.id !== entry.name) continue;
    if (!(await publicationIsComplete(publicationDirectory, manifest)))
      continue;
    completePublicationIds.add(manifest.id);
    const logicalKey = manifestLogicalChapterKey(manifest);
    if (logicalKey) completeLogicalChapterKeys.add(logicalKey);
  }
  return {completeLogicalChapterKeys, completePublicationIds};
};

const replaceDirectory = async (
  stagingDirectory: string,
  publicationDirectory: string,
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(stagingDirectory, publicationDirectory);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  // Filesystem watchers, indexers, and antivirus tools can briefly block a
  // rename. Use the same atomic-first, copy-fallback behavior on every host.
  try {
    await rm(publicationDirectory, {recursive: true, force: true});
    await cp(stagingDirectory, publicationDirectory, {
      recursive: true,
      force: false,
    });
    await rm(stagingDirectory, {recursive: true, force: true});
  } catch {
    throw lastError;
  }
};

const commitPublication = async (
  stagingDirectory: string,
  publicationDirectory: string,
) => {
  if (!(await fileExists(publicationDirectory))) {
    await replaceDirectory(stagingDirectory, publicationDirectory);
    return "added" as const;
  }
  const backupDirectory = `${publicationDirectory}.backup-${randomUUID()}`;
  await rename(publicationDirectory, backupDirectory);
  try {
    await replaceDirectory(stagingDirectory, publicationDirectory);
    await rm(backupDirectory, {recursive: true, force: true});
    return "updated" as const;
  } catch (error) {
    if (!(await fileExists(publicationDirectory)))
      await rename(backupDirectory, publicationDirectory);
    throw error;
  }
};

const materializeChapter = async (
  client: WeebCentralClient,
  series: WeebCentralSeries,
  chapter: WeebCentralChapter,
  outputDirectory: string,
  retrievedAt: string,
  pageUrls: readonly string[],
  markStarted: () => void,
) => {
  const document = manifestForChapter(
    series,
    chapter,
    pageUrls,
    retrievedAt,
    client.origin,
  );
  const publicationDirectory = resolve(outputDirectory, document.id);
  const documentMetadataHash = document.source?.metadataHash;
  if (!documentMetadataHash)
    throw new Error(`WeebCentral chapter ${chapter.id} lacks a metadata hash`);
  const sparseMetadata = `${JSON.stringify(
    createWeebCentralSparseMetadata(chapter.id, documentMetadataHash, pageUrls),
    null,
    2,
  )}\n`;
  const legacyPublicationDirectory = resolve(
    outputDirectory,
    remotePublicationId(series.id, chapter.id),
  );
  const legacyAndCanonicalAreSame =
    process.platform === "win32"
      ? legacyPublicationDirectory.toLowerCase() ===
        publicationDirectory.toLowerCase()
      : legacyPublicationDirectory === publicationDirectory;
  const hasLegacyPublication =
    !legacyAndCanonicalAreSame &&
    (await fileExists(legacyPublicationDirectory));
  const existing = await existingManifest(publicationDirectory);
  if (
    existing &&
    publicationAssetsMatch(existing, document) &&
    (await publicationIsComplete(publicationDirectory, existing))
  ) {
    const sparseMetadataPath = resolve(
      publicationDirectory,
      WEEBCENTRAL_SPARSE_METADATA_FILE,
    );
    if (!(await fileExists(sparseMetadataPath)))
      await writeFile(sparseMetadataPath, sparseMetadata);
    return "unchanged" as const;
  }

  const stagingDirectory = resolve(
    outputDirectory,
    `.${document.id}.staging-${randomUUID()}`,
  );
  await mkdir(resolve(stagingDirectory, "pages"), {recursive: true});
  try {
    const pagePlan = createRepresentativePagePlan(pageUrls.length);
    const downloads = pagePlan.representativePageIndexes.map((pageIndex) => ({
      pageIndex,
      path: document.assets.pages[pageIndex] ?? document.assets.back,
    }));
    let nextDownloadIndex = 0;
    await Promise.all(
      Array.from({length: Math.min(3, downloads.length)}, async () => {
        while (nextDownloadIndex < downloads.length) {
          const download = downloads[nextDownloadIndex];
          nextDownloadIndex += 1;
          if (!download) continue;
          const pageUrl = pageUrls[download.pageIndex];
          if (!pageUrl)
            throw new Error(
              `WeebCentral chapter ${chapter.id} has incomplete page metadata`,
            );
          markStarted();
          await writeFile(
            resolve(stagingDirectory, download.path),
            await client.downloadPage(pageUrl),
          );
        }
      }),
    );
    await writeFile(
      resolve(stagingDirectory, "publication.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    await writeFile(
      resolve(stagingDirectory, WEEBCENTRAL_SPARSE_METADATA_FILE),
      sparseMetadata,
    );
    const result = await commitPublication(
      stagingDirectory,
      publicationDirectory,
    );
    if (!hasLegacyPublication) return result;
    await rm(legacyPublicationDirectory, {recursive: true, force: true});
    return result === "added" ? "updated" : result;
  } catch (error) {
    await rm(stagingDirectory, {recursive: true, force: true});
    throw error;
  }
};

const writeSyncLedger = async (
  outputDirectory: string,
  report: LibraryProviderSyncReport,
  syncedAt: string,
) => {
  const path = resolve(outputDirectory, ".weebcentral-sync.json");
  const temporaryPath = `${path}.staging-${randomUUID()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({schemaVersion: 1, syncedAt, ...report}, null, 2)}\n`,
  );
  await rename(temporaryPath, path);
};

export const syncWeebCentralCatalog = async (
  options: LibraryProviderSyncOptions,
  dependencies: {
    client?: WeebCentralClient;
    now?: () => Date;
  } = {},
): Promise<LibraryProviderSyncReport> => {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0)
    throw new Error("WeebCentral sync limit must be a positive integer");
  if (
    !Number.isSafeInteger(options.maxSearchPages) ||
    options.maxSearchPages <= 0
  )
    throw new Error("WeebCentral search pages must be a positive integer");
  if (!options.languages.includes("english"))
    throw new Error("WeebCentral sync requires English catalog language");

  const outputDirectory = assertSafeOutputDirectory(options.outputDirectory);
  const client = dependencies.client ?? new WeebCentralClient();
  const diagnostics: LibraryProviderDiagnostic[] = [];
  const excludedPublicationIds = new Set(options.excludedPublicationIds);
  const cachedPublications =
    options.selectionMode === "unseen"
      ? await cachedPublicationState(outputDirectory)
      : {
          completeLogicalChapterKeys: new Set<string>(),
          completePublicationIds: new Set<string>(),
        };
  const blockedTags = new Set(options.blockedTags.map(normalizeTag));
  const selected: Array<{
    chapter: WeebCentralChapter;
    selectionIndex: number;
    series: WeebCentralSeries;
  }> = [];
  const seenSeriesIds = new Set<string>();
  const seenLogicalChapterKeys = new Set<string>();
  const now = dependencies.now ?? (() => new Date());
  const syncedAt = options.write ? now().toISOString() : "";
  type SelectedChapter = (typeof selected)[number];
  type PreparedChapter = SelectedChapter & {pageUrls: readonly string[]};
  type MaterializationResult = Awaited<ReturnType<typeof materializeChapter>>;
  const acquisitions = createConcurrentAcquisitionPipeline<
    SelectedChapter,
    PreparedChapter,
    MaterializationResult
  >({
    concurrency: MAX_CONCURRENT_CHAPTER_MATERIALIZATIONS,
    prepare: async (entry) => ({
      ...entry,
      pageUrls: await client.getPageList(entry.chapter.id),
    }),
    acquire: (entry, {markStarted}) => {
      options.onProgress?.(
        `Downloading WeebCentral publication ${entry.selectionIndex + 1} of ${options.limit}`,
      );
      return materializeChapter(
        client,
        entry.series,
        entry.chapter,
        outputDirectory,
        syncedAt,
        entry.pageUrls,
        markStarted,
      );
    },
  });

  try {
    for (let page = 1; page <= options.maxSearchPages; page += 1) {
      options.onProgress?.(
        `Searching WeebCentral page ${page} of ${options.maxSearchPages} for new publications`,
      );
      const searchPage = await client.searchSeries(
        options.query,
        page,
        options.languages,
        options.blockedTags,
      );
      let firstPageAcquisitionStarted: Promise<void> | undefined;
      for (const reference of searchPage.series) {
        if (seenSeriesIds.has(reference.id)) continue;
        seenSeriesIds.add(reference.id);
        const series = await client.getSeriesDetails(reference);
        if (series.adult) {
          diagnostics.push({
            code: "adult-content",
            message: `Skipped adult WeebCentral series ${series.id}`,
          });
          continue;
        }
        const normalizedTags = normalizeTags(series.tags);
        const blockedTag = normalizedTags.find((tag) => blockedTags.has(tag));
        if (blockedTag) {
          diagnostics.push({
            code: "blocked-tag",
            message: `Skipped WeebCentral series ${series.id} because it has blocked tag ${blockedTag}`,
          });
          continue;
        }
        const chapters = (await client.getChapterList(series.id)).toSorted(
          (left, right) =>
            left.number - right.number || left.id.localeCompare(right.id),
        );
        for (const chapter of chapters) {
          const logicalKey = logicalChapterKey(series.id, chapter.number);
          if (seenLogicalChapterKeys.has(logicalKey)) continue;
          seenLogicalChapterKeys.add(logicalKey);
          const id = publicationId(series.id, chapter.id);
          if (excludedPublicationIds.has(id)) {
            diagnostics.push({
              code: "blacklisted",
              message: `Skipped blacklisted publication ${id}`,
              publicationId: id,
            });
            continue;
          }
          if (
            cachedPublications.completePublicationIds.has(id) ||
            cachedPublications.completeLogicalChapterKeys.has(logicalKey)
          ) {
            diagnostics.push({
              code: "existing-complete",
              message: `Skipped existing complete publication ${id}`,
              publicationId: id,
            });
            continue;
          }
          const entry = {chapter, selectionIndex: selected.length, series};
          selected.push(entry);
          if (options.write) {
            const acquisition = acquisitions.enqueue(entry);
            firstPageAcquisitionStarted ??= acquisition.started;
          }
          if (selected.length >= options.limit) break;
        }
        if (selected.length >= options.limit) break;
      }
      await firstPageAcquisitionStarted;
      if (acquisitions.hasFailed()) break;
      if (selected.length >= options.limit || !searchPage.hasNextPage) break;
    }
  } catch (error) {
    acquisitions.abort(error);
    await acquisitions.drain().catch(() => {});
    throw error;
  }

  const selectedPublicationIds = selected.map(({chapter, series}) =>
    publicationId(series.id, chapter.id),
  );
  let addedCount = 0;
  let unchangedCount = 0;
  let updatedCount = 0;
  if (options.write) {
    const outcomes = await acquisitions.drain();
    for (const {result} of outcomes) {
      if (result === "added") addedCount += 1;
      else if (result === "updated") updatedCount += 1;
      else unchangedCount += 1;
    }
    if (selected.length < options.limit)
      diagnostics.push({
        code: "fewer-than-limit",
        message: `Only found ${selected.length} eligible WeebCentral publications for the requested ${options.limit}`,
      });
  }
  const report: LibraryProviderSyncReport = {
    addedCount,
    diagnostics,
    outputDirectory,
    providerId: PROVIDER_ID,
    query: options.query,
    requestedLimit: options.limit,
    selectedPublicationIds,
    unchangedCount,
    updatedCount,
    wroteCatalog: options.write,
  };
  if (options.write) await writeSyncLedger(outputDirectory, report, syncedAt);
  return report;
};
