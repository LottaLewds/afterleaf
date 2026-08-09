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
  type SupportedLanguage,
} from "@afterleaf/provider-sdk";
import {
  MangaDexClient,
  type MangaDexAtHomeServer,
  type MangaDexChapter,
  type MangaDexManga,
} from "./client";
import {
  MANGADEX_SPARSE_METADATA_FILE,
  createMangaDexSparseMetadata,
} from "./sparseMetadata";

const PROVIDER_ID = "mangadex";
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
    throw new Error("MangaDex catalog output cannot be a filesystem root");
  if (basename(outputDirectory) === "." || basename(outputDirectory) === "..")
    throw new Error("MangaDex catalog output must be a named directory");
  return outputDirectory;
};

const publicationId = (mangaId: string, chapterId: string) =>
  `${PROVIDER_ID}-${mangaId}-${chapterId}`;

const normalizeChapterIdentifier = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : normalizeTag(value);
};

const logicalChapterKey = (
  mangaId: string,
  language: string,
  chapter: Pick<MangaDexChapter, "chapter" | "id" | "title">,
) => {
  const chapterNumber = chapter.chapter?.trim();
  if (chapterNumber)
    return `${mangaId}:${language}:chapter:${normalizeChapterIdentifier(chapterNumber)}`;
  const title = chapter.title ? normalizeTag(chapter.title) : undefined;
  return `${mangaId}:${language}:${title ? `title:${title}` : `upload:${chapter.id}`}`;
};

const manifestLogicalChapterKey = (manifest: LocalPublicationDocument) => {
  if (manifest.source?.provider !== PROVIDER_ID || !manifest.groupId)
    return undefined;
  const mangaId = manifest.groupId.startsWith(`${PROVIDER_ID}-`)
    ? manifest.groupId.slice(`${PROVIDER_ID}-`.length)
    : undefined;
  if (!mangaId) return undefined;
  const chapterNumber = manifest.issue?.number;
  if (chapterNumber !== undefined)
    return `${mangaId}:${manifest.language}:chapter:${normalizeChapterIdentifier(String(chapterNumber))}`;
  const label = manifest.issue?.label;
  if (!label) return undefined;
  const chapterIdentifier = label.match(/^chapter\s+([^:]+)(?::|$)/iu)?.[1];
  if (chapterIdentifier)
    return `${mangaId}:${manifest.language}:chapter:${normalizeChapterIdentifier(chapterIdentifier)}`;
  return `${mangaId}:${manifest.language}:title:${normalizeTag(label.replace(/^chapter\s*:?\s*/iu, ""))}`;
};

const languageCode = (language: SupportedLanguage) =>
  language === "english" ? "en" : "ja";

const chapterLanguage = (
  chapter: MangaDexChapter,
  languages: readonly SupportedLanguage[],
) =>
  languages.find(
    (language) => languageCode(language) === chapter.translatedLanguage,
  );

const titleForLanguage = (
  manga: MangaDexManga,
  language: SupportedLanguage,
) => {
  const codes = language === "english" ? ["en"] : ["ja", "ja-ro"];
  for (const code of codes) {
    const title = manga.title[code];
    if (title) return title;
  }
  return Object.values(manga.title)[0] ?? `MangaDex ${manga.id}`;
};

const chapterTitle = (chapter: MangaDexChapter) => {
  const number = chapter.chapter ? `Chapter ${chapter.chapter}` : "Chapter";
  return chapter.title ? `${number}: ${chapter.title}` : number;
};

const pageExtension = (filename: string) => {
  const extension = filename.match(/\.([a-z\d]+)$/iu)?.[1]?.toLowerCase();
  return extension === "png" || extension === "webp" || extension === "jpeg"
    ? extension
    : "jpg";
};

const metadataHash = (
  manga: MangaDexManga,
  chapter: MangaDexChapter,
  server: MangaDexAtHomeServer,
) =>
  createHash("sha256")
    .update(JSON.stringify({chapter, manga, pages: server.chapter.data}))
    .digest("hex");

const manifestForChapter = (
  manga: MangaDexManga,
  chapter: MangaDexChapter,
  server: MangaDexAtHomeServer,
  language: SupportedLanguage,
  retrievedAt: string,
): LocalPublicationDocument => {
  const title = `${titleForLanguage(manga, language)} · ${chapterTitle(chapter)}`;
  const tags = normalizeTags([
    "manga",
    language,
    ...manga.tags.map((tag) => tag.name),
  ]);
  const identity = inferPreparedPublicationIdentity(title, tags);
  const pageDigits = Math.max(3, String(chapter.pages).length);
  const pagePath = (pageIndex: number) => {
    const filename = server.chapter.data[pageIndex];
    if (!filename)
      throw new Error(
        `MangaDex chapter ${chapter.id} lacks page metadata for page ${pageIndex + 1}`,
      );
    return `pages/${String(pageIndex + 1).padStart(pageDigits, "0")}.${pageExtension(filename)}`;
  };
  const pagePlan = createRepresentativePagePlan(chapter.pages);
  const pages = pagePlan.initialPageIndexes.map(pagePath);
  const firstPage = pages[0];
  if (!firstPage)
    throw new Error(`MangaDex chapter ${chapter.id} has no pages`);
  const backPage = pagePath(pagePlan.backPageIndex);
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: publicationId(manga.id, chapter.id),
    groupId: `${PROVIDER_ID}-${manga.id}`,
    issue: {
      label: chapterTitle(chapter),
      ...(chapter.chapter && Number.isFinite(Number(chapter.chapter))
        ? {number: Number(chapter.chapter)}
        : {}),
    },
    kind: identity.kind ?? "commercial-volume",
    title: identity.title,
    language,
    pageCount: chapter.pages,
    tags: identity.tags,
    assets: {back: backPage, front: firstPage, pages},
    source: {
      metadataHash: metadataHash(manga, chapter, server),
      provider: PROVIDER_ID,
      remoteId: chapter.id,
      retrievedAt,
      sourceUrl: `https://mangadex.org/chapter/${chapter.id}`,
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
  client: MangaDexClient,
  manga: MangaDexManga,
  chapter: MangaDexChapter,
  server: MangaDexAtHomeServer,
  language: SupportedLanguage,
  outputDirectory: string,
  retrievedAt: string,
  onDownloadStart?: () => void,
) => {
  const document = manifestForChapter(
    manga,
    chapter,
    server,
    language,
    retrievedAt,
  );
  const publicationDirectory = resolve(outputDirectory, document.id);
  const existing = await existingManifest(publicationDirectory);
  const documentMetadataHash = document.source?.metadataHash;
  if (!documentMetadataHash)
    throw new Error(`MangaDex chapter ${chapter.id} lacks a metadata hash`);
  const sparseMetadata = `${JSON.stringify(
    createMangaDexSparseMetadata(chapter.id, documentMetadataHash, server),
    null,
    2,
  )}\n`;
  if (
    existing &&
    publicationAssetsMatch(existing, document) &&
    (await publicationIsComplete(publicationDirectory, existing))
  ) {
    const sparseMetadataPath = resolve(
      publicationDirectory,
      MANGADEX_SPARSE_METADATA_FILE,
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
    const pagePlan = createRepresentativePagePlan(chapter.pages);
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
          onDownloadStart?.();
          const bytes = await client.downloadPage(
            server,
            server.chapter.data[download.pageIndex] ?? "",
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
      resolve(stagingDirectory, MANGADEX_SPARSE_METADATA_FILE),
      sparseMetadata,
    );
    return await commitPublication(stagingDirectory, publicationDirectory);
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
  const path = resolve(outputDirectory, ".mangadex-sync.json");
  const temporaryPath = `${path}.staging-${randomUUID()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({schemaVersion: 1, syncedAt, ...report}, null, 2)}\n`,
  );
  await rename(temporaryPath, path);
};

export const syncMangaDexCatalog = async (
  options: LibraryProviderSyncOptions,
  dependencies: {
    client?: MangaDexClient;
    now?: () => Date;
  } = {},
): Promise<LibraryProviderSyncReport> => {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0)
    throw new Error("MangaDex sync limit must be a positive integer");
  if (
    !Number.isSafeInteger(options.maxSearchPages) ||
    options.maxSearchPages <= 0
  )
    throw new Error("MangaDex search pages must be a positive integer");
  if (options.languages.length === 0)
    throw new Error("MangaDex sync requires at least one catalog language");

  const outputDirectory = assertSafeOutputDirectory(options.outputDirectory);
  const client = dependencies.client ?? new MangaDexClient();
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
  interface SelectedChapter {
    chapter: MangaDexChapter;
    language: SupportedLanguage;
    manga: MangaDexManga;
    selectionIndex: number;
  }
  interface PreparedChapter extends SelectedChapter {
    server: MangaDexAtHomeServer;
  }
  interface MaterializedChapter {
    result: Awaited<ReturnType<typeof materializeChapter>>;
  }

  const selected: SelectedChapter[] = [];
  const seenMangaIds = new Set<string>();
  const seenLogicalChapterKeys = new Set<string>();
  const now = dependencies.now ?? (() => new Date());
  const syncedAt = options.write ? now().toISOString() : "";
  const acquisitions = createConcurrentAcquisitionPipeline<
    SelectedChapter,
    PreparedChapter,
    MaterializedChapter
  >({
    concurrency: MAX_CONCURRENT_CHAPTER_MATERIALIZATIONS,
    prepare: async (entry) => ({
      ...entry,
      server: await client.getAtHomeServer(entry.chapter.id),
    }),
    acquire: async (entry, {markStarted}) => {
      options.onProgress?.(
        `Downloading MangaDex publication ${entry.selectionIndex + 1} of ${options.limit}`,
      );
      const result = await materializeChapter(
        client,
        entry.manga,
        entry.chapter,
        entry.server,
        entry.language,
        outputDirectory,
        syncedAt,
        markStarted,
      );
      return {result};
    },
  });

  try {
    for (let page = 1; page <= options.maxSearchPages; page += 1) {
      options.onProgress?.(
        `Searching MangaDex page ${page} of ${options.maxSearchPages} for new publications`,
      );
      const manga = await client.searchManga(
        options.query,
        page,
        options.languages,
        options.blockedTags,
      );
      if (manga.length === 0) break;
      let firstPageAcquisitionStarted: Promise<void> | undefined;
      for (const candidate of manga) {
        if (seenMangaIds.has(candidate.id)) continue;
        seenMangaIds.add(candidate.id);
        const normalizedTags = normalizeTags(
          candidate.tags.map((tag) => tag.name),
        );
        const blockedTag = normalizedTags.find((tag) => blockedTags.has(tag));
        if (blockedTag) {
          diagnostics.push({
            code: "blocked-tag",
            message: `Skipped MangaDex title ${candidate.id} because it has blocked tag ${blockedTag}`,
          });
          continue;
        }
        for (
          let chapterPage = 1;
          chapterPage <= options.maxSearchPages;
          chapterPage += 1
        ) {
          const feed = await client.getChapterFeedPage(
            candidate.id,
            options.languages,
            chapterPage,
          );
          for (const chapter of feed.chapters) {
            const language = chapterLanguage(chapter, options.languages);
            if (!language) continue;
            const logicalKey = logicalChapterKey(
              candidate.id,
              language,
              chapter,
            );
            if (seenLogicalChapterKeys.has(logicalKey)) continue;
            seenLogicalChapterKeys.add(logicalKey);
            const id = publicationId(candidate.id, chapter.id);
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
            const entry = {
              chapter,
              language,
              manga: candidate,
              selectionIndex: selected.length,
            };
            selected.push(entry);
            if (options.write) {
              const acquisition = acquisitions.enqueue(entry);
              firstPageAcquisitionStarted ??= acquisition.started;
            }
            if (selected.length >= options.limit) break;
          }
          if (acquisitions.hasFailed() || selected.length >= options.limit)
            break;
          if (feed.offset + feed.limit >= feed.total) break;
        }
        if (acquisitions.hasFailed() || selected.length >= options.limit) break;
      }
      await firstPageAcquisitionStarted;
      if (acquisitions.hasFailed() || selected.length >= options.limit) break;
    }
  } catch (error) {
    acquisitions.abort(error);
    await acquisitions.drain().catch(() => {});
    throw error;
  }

  const selectedPublicationIds = selected.map(({chapter, manga}) =>
    publicationId(manga.id, chapter.id),
  );
  let addedCount = 0;
  let unchangedCount = 0;
  let updatedCount = 0;
  if (options.write) {
    const outcomes = await acquisitions.drain();
    for (const {result: acquisition} of outcomes) {
      if (acquisition.result === "added") addedCount += 1;
      else if (acquisition.result === "updated") updatedCount += 1;
      else unchangedCount += 1;
    }
    if (selected.length < options.limit)
      diagnostics.push({
        code: "fewer-than-limit",
        message: `Only found ${selected.length} eligible MangaDex publications for the requested ${options.limit}`,
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
