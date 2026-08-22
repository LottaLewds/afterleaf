import {afterEach, expect, test} from "bun:test";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {MangaDexClient} from "~/content/providers/mangadex/client";
import {MANGADEX_SPARSE_METADATA_FILE} from "~/content/providers/mangadex/sparseMetadata";
import {syncMangaDexCatalog} from "~/content/providers/mangadex/sync";
import {stubFetch} from "~/test/fetchStub";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

test("MangaDex sync writes a sparse local catalog", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-mangadex-"));
  temporaryDirectories.push(root);
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = String(input);
      if (url.includes("/manga?"))
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  altTitles: [],
                  contentRating: "safe",
                  description: {en: "A test manga"},
                  tags: [],
                  title: {en: "Test Manga"},
                },
                id: "manga-id",
                relationships: [],
              },
            ],
          }),
        );
      if (url.includes("/manga/manga-id/feed"))
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  chapter: "1",
                  pages: 4,
                  translatedLanguage: "en",
                },
                id: "chapter-id",
                relationships: [{id: "manga-id", type: "manga"}],
              },
            ],
          }),
        );
      if (url.includes("/at-home/server/chapter-id"))
        return new Response(
          JSON.stringify({
            baseUrl: "https://uploads.mangadex.test",
            chapter: {
              data: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              dataSaver: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              hash: "hash",
            },
          }),
        );
      if (url.includes("/data/hash/"))
        return new Response(new Uint8Array([1, 2, 3]));
      throw new Error(`Unexpected URL ${url}`);
    }),
    retryCount: 0,
  });

  const report = await syncMangaDexCatalog(
    {
      blockedTags: [],
      excludedPublicationIds: [],
      languages: ["english"],
      limit: 1,
      maxSearchPages: 1,
      outputDirectory: root,
      query: "Test Manga",
      selectionMode: "unseen",
      write: true,
    },
    {client, now: () => new Date("2026-08-03T12:00:00.000Z")},
  );
  const manifest = JSON.parse(
    await readFile(
      resolve(root, "mangadex-manga-id-chapter-id/publication.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const sparseMetadata = JSON.parse(
    await readFile(
      resolve(
        root,
        "mangadex-manga-id-chapter-id",
        MANGADEX_SPARSE_METADATA_FILE,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;

  expect(report).toMatchObject({
    addedCount: 1,
    providerId: "mangadex",
    selectedPublicationIds: ["mangadex-manga-id-chapter-id"],
  });
  expect(manifest).toMatchObject({
    aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION,
    id: "mangadex-manga-id-chapter-id",
    language: "english",
    pageCount: 4,
    physical: {aspectRatio: 2 / 3},
    source: {provider: "mangadex", remoteId: "chapter-id"},
  });
  expect(sparseMetadata).toMatchObject({
    chapterId: "chapter-id",
    schemaVersion: 1,
    server: {chapter: {data: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]}},
  });
});

test("MangaDex sync advances past cached and duplicate chapter uploads", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-mangadex-"));
  temporaryDirectories.push(root);
  const chapters = [
    {chapter: "1", id: "chapter-1", pages: 4, title: "Chapter One"},
    {chapter: "1.0", id: "chapter-1-alt", pages: 4, title: "Chapter One"},
    {chapter: "2", id: "chapter-2", pages: 4, title: "Chapter Two"},
    {chapter: "3", id: "chapter-3", pages: 4, title: "Chapter Three"},
  ];
  let chapterFeedRequestCount = 0;
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = String(input);
      if (url.includes("/manga?"))
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  altTitles: [],
                  contentRating: "safe",
                  description: {en: "A test manga"},
                  tags: [],
                  title: {en: "Test Manga"},
                },
                id: "manga-id",
                relationships: [],
              },
            ],
          }),
        );
      if (url.includes("/manga/manga-id/feed")) {
        chapterFeedRequestCount += 1;
        const feedChapters =
          chapterFeedRequestCount === 1
            ? chapters
            : [...chapters.slice(0, 2).toReversed(), ...chapters.slice(2)];
        return new Response(
          JSON.stringify({
            data: feedChapters.map((chapter) => ({
              attributes: {
                chapter: chapter.chapter,
                pages: chapter.pages,
                title: chapter.title,
                translatedLanguage: "en",
              },
              id: chapter.id,
              relationships: [{id: "manga-id", type: "manga"}],
            })),
            limit: 100,
            offset: 0,
            total: chapters.length,
          }),
        );
      }
      const serverMatch = url.match(/\/at-home\/server\/(chapter-[\w-]+)/u);
      if (serverMatch?.[1])
        return new Response(
          JSON.stringify({
            baseUrl: "https://uploads.mangadex.test",
            chapter: {
              data: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              dataSaver: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              hash: serverMatch[1],
            },
          }),
        );
      if (url.includes("https://uploads.mangadex.test/data/"))
        return new Response(new Uint8Array([1, 2, 3]));
      throw new Error(`Unexpected URL ${url}`);
    }),
    retryCount: 0,
  });
  const options = {
    blockedTags: [],
    excludedPublicationIds: [],
    languages: ["english" as const],
    maxSearchPages: 2,
    outputDirectory: root,
    query: "Test Manga",
    selectionMode: "unseen" as const,
    write: true,
  };

  const first = await syncMangaDexCatalog(
    {...options, limit: 1},
    {client, now: () => new Date("2026-08-03T12:00:00.000Z")},
  );
  const second = await syncMangaDexCatalog(
    {...options, limit: 2},
    {client, now: () => new Date("2026-08-03T12:05:00.000Z")},
  );

  expect(first.selectedPublicationIds).toEqual(["mangadex-manga-id-chapter-1"]);
  expect(second.selectedPublicationIds).toEqual([
    "mangadex-manga-id-chapter-2",
    "mangadex-manga-id-chapter-3",
  ]);
  expect(second.addedCount).toBe(2);
});

test("MangaDex sync overlaps materialization with later search pages", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-mangadex-"));
  temporaryDirectories.push(root);
  let firstChapterDownloadPending = false;
  let releaseFirstChapterDownloads = () => {};
  const firstChapterDownloadsReleased = new Promise<void>((resolvePromise) => {
    releaseFirstChapterDownloads = resolvePromise;
  });
  let observedOverlap = false;
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/manga") {
        const page = Number(url.searchParams.get("offset")) === 0 ? 1 : 2;
        if (page === 2) {
          observedOverlap = firstChapterDownloadPending;
          releaseFirstChapterDownloads();
        }
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  altTitles: [],
                  contentRating: "safe",
                  description: {en: `Manga ${page}`},
                  tags: [],
                  title: {en: `Manga ${page}`},
                },
                id: `manga-${page}`,
                relationships: [],
              },
            ],
          }),
        );
      }
      const feedMatch = url.pathname.match(/^\/manga\/(manga-\d+)\/feed$/u);
      if (feedMatch?.[1]) {
        const number = feedMatch[1].slice(-1);
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  chapter: number,
                  pages: 4,
                  translatedLanguage: "en",
                },
                id: `chapter-${number}`,
                relationships: [{id: feedMatch[1], type: "manga"}],
              },
            ],
            limit: 100,
            offset: 0,
            total: 1,
          }),
        );
      }
      const serverMatch = url.pathname.match(
        /^\/at-home\/server\/(chapter-\d+)$/u,
      );
      if (serverMatch?.[1])
        return new Response(
          JSON.stringify({
            baseUrl: "https://uploads.mangadex.test",
            chapter: {
              data: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              dataSaver: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              hash: serverMatch[1],
            },
          }),
        );
      if (url.hostname === "uploads.mangadex.test") {
        if (url.pathname.includes("/data/chapter-1/")) {
          firstChapterDownloadPending = true;
          await firstChapterDownloadsReleased;
          firstChapterDownloadPending = false;
        }
        return new Response(new Uint8Array([1, 2, 3]));
      }
      throw new Error(`Unexpected URL ${url}`);
    }),
    retryCount: 0,
  });

  const report = await syncMangaDexCatalog(
    {
      blockedTags: [],
      excludedPublicationIds: [],
      languages: ["english"],
      limit: 2,
      maxSearchPages: 2,
      outputDirectory: root,
      query: "",
      selectionMode: "unseen",
      write: true,
    },
    {client},
  );

  expect(observedOverlap).toBe(true);
  expect(report.selectedPublicationIds).toEqual([
    "mangadex-manga-1-chapter-1",
    "mangadex-manga-2-chapter-2",
  ]);
  expect(report.addedCount).toBe(2);
});

test("MangaDex sync bounds concurrent chapter materializations and reports discovery order", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-mangadex-"));
  temporaryDirectories.push(root);
  const activeChapters = new Set<string>();
  let maximumActiveChapters = 0;
  let releaseDownloads = () => {};
  const downloadsReleased = new Promise<void>((resolvePromise) => {
    releaseDownloads = resolvePromise;
  });
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/manga")
        return new Response(
          JSON.stringify({
            data: [1, 2, 3].map((number) => ({
              attributes: {
                altTitles: [],
                contentRating: "safe",
                description: {en: `Manga ${number}`},
                tags: [],
                title: {en: `Manga ${number}`},
              },
              id: `manga-${number}`,
              relationships: [],
            })),
          }),
        );
      const feedMatch = url.pathname.match(/^\/manga\/manga-(\d+)\/feed$/u);
      if (feedMatch?.[1])
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {
                  chapter: feedMatch[1],
                  pages: 4,
                  translatedLanguage: "en",
                },
                id: `chapter-${feedMatch[1]}`,
                relationships: [{id: `manga-${feedMatch[1]}`, type: "manga"}],
              },
            ],
            limit: 100,
            offset: 0,
            total: 1,
          }),
        );
      const serverMatch = url.pathname.match(
        /^\/at-home\/server\/chapter-(\d+)$/u,
      );
      if (serverMatch?.[1])
        return new Response(
          JSON.stringify({
            baseUrl: "https://uploads.mangadex.test",
            chapter: {
              data: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              dataSaver: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"],
              hash: `chapter-${serverMatch[1]}`,
            },
          }),
        );
      const downloadMatch = url.pathname.match(/^\/data\/chapter-(\d+)\//u);
      if (downloadMatch?.[1]) {
        activeChapters.add(downloadMatch[1]);
        maximumActiveChapters = Math.max(
          maximumActiveChapters,
          activeChapters.size,
        );
        if (activeChapters.size === 2) releaseDownloads();
        await downloadsReleased;
        activeChapters.delete(downloadMatch[1]);
        return new Response(new Uint8Array([1, 2, 3]));
      }
      throw new Error(`Unexpected URL ${url}`);
    }),
    retryCount: 0,
  });

  const report = await syncMangaDexCatalog(
    {
      blockedTags: [],
      excludedPublicationIds: [],
      languages: ["english"],
      limit: 3,
      maxSearchPages: 1,
      outputDirectory: root,
      query: "",
      selectionMode: "unseen",
      write: true,
    },
    {client},
  );

  expect(maximumActiveChapters).toBe(2);
  expect(report.selectedPublicationIds).toEqual([
    "mangadex-manga-1-chapter-1",
    "mangadex-manga-2-chapter-2",
    "mangadex-manga-3-chapter-3",
  ]);
  expect(report.addedCount).toBe(3);
});
