import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {
  NhentaiClient,
  parseNhentaiGallery,
  type NhentaiRequestRetryEvent,
} from "~/content/providers/nhentai/client";
import {parseNhentaiSyncCliOptions} from "~/content/providers/nhentai/cli";
import {createNhentaiProvider} from "~/content/providers/nhentai/plugin";
import {syncNhentaiCatalog} from "~/content/providers/nhentai/sync";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {seedContentPack} from "~/content/seed";
import {parseLocalPublicationDocument} from "~/content/validation";
import {stubFetch} from "~/test/fetchStub";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

const gallery = (id: number, language: string, extraTags: string[] = []) => ({
  id,
  media_id: String(8_000 + id),
  title: {
    english: `Gallery ${id} English`,
    japanese: `ギャラリー ${id}`,
    pretty: `Gallery ${id}`,
  },
  images: {
    pages: [
      {t: "j", w: 800, h: 1_200},
      {t: "p", w: 800, h: 1_200},
    ],
  },
  tags: [
    {id: id * 10, type: "language", name: language},
    {id: id * 10 + 1, type: "tag", name: "big breasts"},
    ...extraTags.map((name, index) => ({
      id: id * 10 + index + 2,
      type: "tag",
      name,
    })),
  ],
  num_pages: 2,
  upload_date: 1_700_000_000 + id,
});

type GalleryFixture = ReturnType<typeof gallery>;

const pageExtension: Record<string, string> = {
  j: "jpg",
  p: "png",
  w: "webp",
};

const gallerySearchResult = (value: GalleryFixture) => ({
  english_title: value.title.english,
  id: value.id,
  japanese_title: value.title.japanese,
  media_id: value.media_id,
  num_pages: value.num_pages,
  tag_ids: value.tags.map(({id}) => id),
});

const galleryDetail = (value: GalleryFixture) => ({
  id: value.id,
  media_id: value.media_id,
  num_pages: value.num_pages,
  pages: value.images.pages.map((page, index) => ({
    height: page.h,
    number: index + 1,
    path: `galleries/${value.media_id}/${index + 1}.${pageExtension[page.t]}`,
    width: page.w,
  })),
  tags: value.tags,
  title: value.title,
  upload_date: value.upload_date,
});

const createFetcher = async (
  galleries: GalleryFixture[],
  searchPageSize = galleries.length,
) => {
  const jpeg = await sharp({
    create: {width: 16, height: 24, channels: 3, background: "#702040"},
  })
    .jpeg()
    .toBuffer();
  const png = await sharp({
    create: {width: 16, height: 24, channels: 3, background: "#204070"},
  })
    .png()
    .toBuffer();
  let imageRequestCount = 0;
  const galleryDetailRequestIds: number[] = [];
  const searchQueries: string[] = [];
  const fetcher = stubFetch(async (input) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.pathname === "/api/v2/search") {
      searchQueries.push(url.searchParams.get("query") ?? "");
      const page = Number(url.searchParams.get("page") ?? "1");
      const offset = (page - 1) * searchPageSize;
      const result = galleries
        .slice(offset, offset + searchPageSize)
        .map(gallerySearchResult);
      return Response.json({
        result,
      });
    }
    if (url.pathname === "/api/v2/tags/ids") {
      const requestedIds = new Set(
        url.searchParams.get("ids")?.split(",").map(Number) ?? [],
      );
      const tags = new Map(
        galleries
          .flatMap(({tags}) => tags)
          .filter(({id}) => requestedIds.has(id))
          .map((tag) => [tag.id, tag]),
      );
      return Response.json([...tags.values()]);
    }
    if (url.pathname.startsWith("/api/v2/galleries/")) {
      const id = Number(url.pathname.split("/").at(-1));
      galleryDetailRequestIds.push(id);
      const matchingGallery = galleries.find((gallery) => gallery.id === id);
      if (!matchingGallery) return new Response("missing", {status: 404});
      return Response.json(galleryDetail(matchingGallery));
    }
    imageRequestCount += 1;
    const image = url.pathname.endsWith(".png") ? png : jpeg;
    return new Response(image, {
      headers: {"content-length": String(image.byteLength)},
    });
  });
  return {
    fetcher,
    galleryDetailRequestIds: () => galleryDetailRequestIds,
    imageRequestCount: () => imageRequestCount,
    searchQueries: () => searchQueries,
  };
};

const defaultOptions = (outputDirectory: string) => ({
  blockedTags: [],
  languages: ["english", "japanese"] as const,
  limit: 2,
  maxSearchPages: 2,
  outputDirectory,
  query: 'tag:"big breasts"',
  write: true,
});

describe("nHentai response validation", () => {
  test("rejects unsupported remote page media before acquisition", () => {
    const invalid = gallery(1, "english");
    invalid.images.pages[0] = {t: "g", w: 800, h: 1_200};
    expect(() => parseNhentaiGallery(invalid)).toThrow(
      "unsupported media type g",
    );
  });

  test("sends configured authentication and User-Agent headers", async () => {
    let requestHeaders: Headers | undefined;
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      cookie: "session=authenticated",
      fetcher: stubFetch(async (_input, init) => {
        requestHeaders = new Headers(init?.headers);
        return Response.json({result: []});
      }),
      retryCount: 0,
      userAgent: "Afterleaf authenticated client",
    });

    await client.search('tag:"big breasts"', 1);

    expect(requestHeaders?.get("Cookie")).toBe("session=authenticated");
    expect(requestHeaders?.get("User-Agent")).toBe(
      "Afterleaf authenticated client",
    );
  });

  test("honors Retry-After when nHentai rate limits a request", async () => {
    let requestCount = 0;
    const retryDelays: number[] = [];
    const retryEvents: NhentaiRequestRetryEvent[] = [];
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      fetcher: stubFetch(async () => {
        requestCount += 1;
        if (requestCount === 1)
          return new Response("rate limited", {
            headers: {"Retry-After": "1.5"},
            status: 429,
          });
        return Response.json({result: []});
      }),
      onRetry: (event) => retryEvents.push(event),
      retryCount: 1,
      sleep: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
    });

    await expect(client.search("books", 1)).resolves.toEqual([]);
    expect(retryDelays).toEqual([1_500]);
    expect(retryEvents).toEqual([
      {
        delayMilliseconds: 1_500,
        delaySource: "retry-after",
        retryAttempt: 1,
        retryLimit: 1,
        status: 429,
        url: "https://example.test/api/v2/search?query=books&sort=date&page=1",
      },
    ]);
  });

  test("honors nHentai rate-limit instructions and uses a two-second fallback", async () => {
    let requestCount = 0;
    const retryEvents: NhentaiRequestRetryEvent[] = [];
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      fetcher: stubFetch(async () => {
        requestCount += 1;
        if (requestCount === 1)
          return new Response("rate limited", {
            headers: {"Retry-After": "30"},
            status: 429,
          });
        if (requestCount === 2)
          return new Response("rate limited", {status: 429});
        return Response.json({result: []});
      }),
      onRetry: (event) => retryEvents.push(event),
      retryCount: 2,
      sleep: async () => {},
    });

    await expect(client.search("books", 1)).resolves.toEqual([]);
    expect(retryEvents.map((event) => event.delayMilliseconds)).toEqual([
      30_000, 2_000,
    ]);
    expect(retryEvents.map((event) => event.delaySource)).toEqual([
      "retry-after",
      "backoff",
    ]);
  });

  test("does not fail a successful API request when the cache is unwritable", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-cache-"));
    temporaryDirectories.push(root);
    const cachePath = join(root, "not-a-directory");
    await writeFile(cachePath, "occupied");
    const remote = await createFetcher([]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      cacheDirectory: cachePath,
      fetcher: remote.fetcher,
      retryCount: 0,
    });

    await expect(client.search("books", 1)).resolves.toEqual([]);
    expect(remote.searchQueries()).toEqual(["books"]);
  });

  test("reuses fresh API responses from disk across client processes", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-cache-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([gallery(12, "english")]);
    const cacheHits: string[] = [];
    const createClient = () =>
      new NhentaiClient({
        apiOrigin: "https://example.test",
        cacheDirectory: root,
        fetcher: remote.fetcher,
        onCacheHit: ({url}) => cacheHits.push(url),
        retryCount: 0,
      });

    const first = await createClient().search("books", 1);
    const second = await createClient().search("books", 1);

    expect(first).toEqual(second);
    expect(remote.searchQueries()).toEqual(["books"]);
    expect(cacheHits).toContain(
      "https://example.test/api/v2/search?query=books&sort=date&page=1",
    );
    expect(cacheHits).toContain(
      "https://example.test/api/v2/tags/ids?ids=120%2C121",
    );
  });
});

describe("syncNhentaiCatalog", () => {
  test("imports the exact gallery from an nHentai URL without searching", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([
      gallery(7, "english"),
      gallery(8, "english"),
    ]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });

    const report = await syncNhentaiCatalog(
      {
        ...defaultOptions(root),
        limit: 1,
        maxSearchPages: 1,
        query: "https://nhentai.net/g/7/",
        selectionMode: "unseen",
      },
      {client},
    );

    expect(report.selectedGalleryIds).toEqual([7]);
    expect(report.addedCount).toBe(1);
    expect(remote.searchQueries()).toEqual([]);
    expect(remote.galleryDetailRequestIds()).toEqual([7]);
    expect(await readdir(root)).toContain("nhentai-7");
    expect(await readdir(root)).not.toContain("nhentai-8");

    const initialImageRequestCount = remote.imageRequestCount();
    const existingReport = await syncNhentaiCatalog(
      {
        ...defaultOptions(root),
        limit: 1,
        maxSearchPages: 1,
        query: "https://nhentai.net/g/7/",
        selectionMode: "unseen",
      },
      {client},
    );

    expect(existingReport.diagnostics).toContainEqual({
      code: "existing-complete",
      galleryId: 7,
      message: "Skipped existing complete publication nhentai-7",
    });
    expect(remote.galleryDetailRequestIds()).toEqual([7]);
    expect(remote.imageRequestCount()).toBe(initialImageRequestCount);
  });

  test("does not implicitly block tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([
      gallery(1, "english", ["lolicon"]),
      gallery(2, "japanese", ["shotacon"]),
    ]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });

    const report = await syncNhentaiCatalog(defaultOptions(root), {client});

    expect(report.selectedGalleryIds).toEqual([1, 2]);
    expect(report.diagnostics.map(({code}) => code)).not.toContain(
      "blocked-tag",
    );
  });

  test("prefers English, allows Japanese, and rejects Chinese or blocked galleries", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([
      gallery(1, "chinese"),
      gallery(2, "japanese"),
      gallery(3, "english", ["blocked-test"]),
      gallery(4, "english"),
    ]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });
    const progressMessages: string[] = [];
    const report = await syncNhentaiCatalog(
      {
        ...defaultOptions(root),
        blockedTags: ["blocked-test"],
        onProgress: (message) => progressMessages.push(message),
      },
      {
        client,
        now: () => new Date("2026-07-29T10:00:00.000Z"),
      },
    );

    expect(report.selectedGalleryIds).toEqual([4, 2]);
    expect(report.addedCount).toBe(2);
    expect(progressMessages.slice(0, 6)).toEqual([
      "Searching page 1 of 2 for new publications",
      "Fetching nhentai-4 (new publication 1 of 2)",
      "Loaded nhentai-4 metadata; downloading preview/back assets",
      "Searching page 2 of 2 for new publications",
      "Fetching nhentai-2 (new publication 2 of 2)",
      "Loaded nhentai-2 metadata; downloading preview/back assets",
    ]);
    expect(progressMessages.slice(6, 8).toSorted()).toEqual([
      "Imported nhentai-2 (added)",
      "Imported nhentai-4 (added)",
    ]);
    expect(progressMessages.at(-1)).toBe(
      "Import complete: 2/2 new, 0/0 repairs; searched 4 unique galleries; filtered/skipped (unsupported-language: 1, blocked-tag: 1)",
    );
    expect(report.diagnostics.map(({code}) => code)).toEqual([
      "unsupported-language",
      "blocked-tag",
    ]);
    expect(remote.searchQueries()).toEqual([
      'tag:"big breasts" -language:"chinese" -tag:"blocked-test"',
      'tag:"big breasts" -language:"chinese" -tag:"blocked-test"',
    ]);
    const englishDocument = parseLocalPublicationDocument(
      JSON.parse(
        await readFile(resolve(root, "nhentai-4/publication.json"), "utf8"),
      ) as unknown,
      "publication.json",
    );
    expect(englishDocument).toMatchObject({
      id: "nhentai-4",
      language: "english",
      source: {
        provider: "nhentai",
        remoteId: "4",
        sourceUrl: "https://nhentai.net/g/4/",
      },
      physical: {readingDirection: "rtl"},
    });
    const japaneseDocument = parseLocalPublicationDocument(
      JSON.parse(
        await readFile(resolve(root, "nhentai-2/publication.json"), "utf8"),
      ) as unknown,
      "publication.json",
    );
    expect(japaneseDocument).toMatchObject({
      id: "nhentai-2",
      language: "japanese",
      physical: {readingDirection: "rtl"},
    });
    expect(await readdir(root)).not.toContain("nhentai-1");
  });

  test("replaces a gallery with invalid detail metadata from the candidate pool", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([
      gallery(1, "english"),
      gallery(2, "english"),
    ]);
    const fetcher = stubFetch(async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (url.pathname !== "/api/v2/galleries/1")
        return remote.fetcher(input, init);
      const invalid = galleryDetail(gallery(1, "english"));
      return Response.json({
        ...invalid,
        pages: invalid.pages.map((page, index) =>
          index === 0
            ? {height: page.height, number: page.number, width: page.width}
            : page,
        ),
      });
    });

    const report = await syncNhentaiCatalog(
      {...defaultOptions(root), limit: 1},
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          imageOrigin: "https://images.example.test",
          fetcher,
          retryCount: 0,
        }),
      },
    );

    expect(report.selectedGalleryIds).toEqual([2]);
    expect(report.addedCount).toBe(1);
    expect(report.diagnostics).toContainEqual({
      code: "invalid-gallery",
      galleryId: 1,
      message:
        "Skipped gallery 1 because its remote metadata is invalid: gallery.pages[0].t uses unsupported media type undefined",
    });
    expect(await readdir(root)).toContain("nhentai-2");
  });

  test("downloads resolved galleries while the next API request is rate limited", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([
      gallery(1, "english"),
      gallery(2, "english"),
    ]);
    let activeFirstGalleryDownloads = 0;
    let overlapObserved = false;
    let rateLimited = false;
    let releaseFirstGalleryDownloads = () => {};
    let noteFirstGalleryDownloadStarted = () => {};
    const firstGalleryDownloadGate = new Promise<void>((resolvePromise) => {
      releaseFirstGalleryDownloads = resolvePromise;
    });
    const firstGalleryDownloadStarted = new Promise<void>((resolvePromise) => {
      noteFirstGalleryDownloadStarted = resolvePromise;
    });
    const fetcher = stubFetch(async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (url.pathname.includes("/galleries/8001/")) {
        activeFirstGalleryDownloads += 1;
        noteFirstGalleryDownloadStarted();
        await firstGalleryDownloadGate;
        activeFirstGalleryDownloads -= 1;
      }
      if (!rateLimited && url.pathname === "/api/v2/galleries/2") {
        rateLimited = true;
        return new Response("slow down", {
          headers: {"Retry-After": "1"},
          status: 429,
        });
      }
      return remote.fetcher(input, init);
    });
    const progressMessages: string[] = [];
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      fetcher,
      imageOrigin: "https://images.example.test",
      onRetry: (event) =>
        progressMessages.push(`retry:${event.status}:${event.url}`),
      retryCount: 1,
      sleep: async () => {
        await firstGalleryDownloadStarted;
        overlapObserved = activeFirstGalleryDownloads > 0;
        releaseFirstGalleryDownloads();
      },
    });

    const report = await syncNhentaiCatalog(
      {...defaultOptions(root), limit: 2, maxSearchPages: 1},
      {client},
    );

    expect(report.selectedGalleryIds).toEqual([1, 2]);
    expect(overlapObserved).toBe(true);
    expect(progressMessages).toContain(
      "retry:429:https://example.test/api/v2/galleries/2",
    );
  });

  test("starts image downloads before requesting the next search page", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher(
      [gallery(1, "english"), gallery(2, "english")],
      1,
    );
    let activeFirstGalleryDownloads = 0;
    let overlapObserved = false;
    let releaseFirstGalleryDownloads = () => {};
    const firstGalleryDownloadGate = new Promise<void>((resolvePromise) => {
      releaseFirstGalleryDownloads = resolvePromise;
    });
    const fetcher = stubFetch(async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (url.pathname.includes("/galleries/8001/")) {
        activeFirstGalleryDownloads += 1;
        await firstGalleryDownloadGate;
        activeFirstGalleryDownloads -= 1;
      }
      if (
        url.pathname === "/api/v2/search" &&
        url.searchParams.get("page") === "2"
      ) {
        overlapObserved = activeFirstGalleryDownloads > 0;
        releaseFirstGalleryDownloads();
      }
      return remote.fetcher(input, init);
    });

    const report = await syncNhentaiCatalog(
      {...defaultOptions(root), limit: 2, maxSearchPages: 2},
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          fetcher,
          imageOrigin: "https://images.example.test",
          retryCount: 0,
        }),
      },
    );

    expect(report.selectedGalleryIds).toEqual([1, 2]);
    expect(overlapObserved).toBe(true);
  });

  test("keeps stable entries and avoids downloading unchanged pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const remote = await createFetcher([gallery(5, "english")]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });
    const options = {...defaultOptions(root), limit: 1};
    const first = await syncNhentaiCatalog(options, {client});
    const second = await syncNhentaiCatalog(options, {client});

    expect(first).toMatchObject({addedCount: 1, unchangedCount: 0});
    expect(second).toMatchObject({addedCount: 0, unchangedCount: 1});
    expect(remote.imageRequestCount()).toBe(2);
  });

  test("materializes a three-page preview while retaining the remote page count", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-sparse-"));
    temporaryDirectories.push(root);
    const sourceDirectory = resolve(root, "source");
    const sparseGallery = gallery(9, "english");
    sparseGallery.images.pages.push(
      {t: "w", w: 800, h: 1_200},
      {t: "j", w: 800, h: 1_200},
      {t: "p", w: 800, h: 1_200},
    );
    sparseGallery.num_pages = sparseGallery.images.pages.length;
    const remote = await createFetcher([sparseGallery]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });

    await syncNhentaiCatalog(
      {...defaultOptions(sourceDirectory), limit: 1, previewPageCount: 3},
      {client},
    );
    const document = parseLocalPublicationDocument(
      JSON.parse(
        await readFile(
          resolve(sourceDirectory, "nhentai-9/publication.json"),
          "utf8",
        ),
      ) as unknown,
      "publication.json",
    );
    const seeded = await seedContentPack(
      new LocalCatalogSource(sourceDirectory),
      {
        dryRun: false,
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        outputDirectory: resolve(root, "revision"),
        packId: "sparse-test",
        persistentAssetDirectory: root,
        seed: "sparse-test",
        tags: [],
      },
    );

    expect(document.pageCount).toBe(5);
    expect(document.aspectRatioInferenceVersion).toBe(
      BOOK_ASPECT_RATIO_INFERENCE_VERSION,
    );
    expect(document.physical?.aspectRatio).toBeCloseTo(2 / 3);
    expect(document.assets.pages).toHaveLength(3);
    expect(document.assets.back).toBe("pages/005.png");
    expect(remote.imageRequestCount()).toBe(5);
    expect(
      await sharp(
        resolve(sourceDirectory, "nhentai-9/pages/005.png"),
      ).metadata(),
    ).toMatchObject({format: "png"});
    const sparsePublication = seeded.catalog?.publications[0];
    expect(sparsePublication).toMatchObject({
      id: "nhentai-9",
      pageCount: 5,
    });
    expect(sparsePublication?.assets.back).toStartWith(
      "assets/publications/nhentai-9/back-",
    );
    expect(sparsePublication?.assets.pages).toHaveLength(3);
    if (!sparsePublication) throw new Error("Sparse publication is missing");
    const packedBackStats = await sharp(
      resolve(root, sparsePublication.assets.back),
    ).stats();
    expect(packedBackStats.channels[2]?.mean).toBeGreaterThan(
      (packedBackStats.channels[0]?.mean ?? 0) * 1.5,
    );
  });

  test("produces a supported-language catalog that seeds into runtime-ready assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-pack-"));
    temporaryDirectories.push(root);
    const sourceDirectory = resolve(root, "source");
    const remote = await createFetcher([
      gallery(11, "chinese"),
      gallery(12, "japanese"),
      gallery(13, "english"),
    ]);
    const client = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: remote.fetcher,
      retryCount: 0,
    });

    await syncNhentaiCatalog(defaultOptions(sourceDirectory), {client});
    const result = await seedContentPack(
      new LocalCatalogSource(sourceDirectory),
      {
        dryRun: false,
        excludedTags: [],
        languages: ["english", "japanese"],
        limit: 20,
        match: "all",
        outputDirectory: resolve(root, "revision"),
        packId: "afterleaf-integration",
        persistentAssetDirectory: root,
        seed: "afterleaf-integration-v1",
        tags: ["big-breasts"],
      },
    );

    expect(result.catalog?.publications.map(({id}) => id)).toEqual([
      "nhentai-13",
      "nhentai-12",
    ]);
    expect(await readdir(sourceDirectory)).not.toContain("nhentai-11");
    const englishPublication = result.catalog?.publications.find(
      ({id}) => id === "nhentai-13",
    );
    const japanesePublication = result.catalog?.publications.find(
      ({id}) => id === "nhentai-12",
    );
    if (!englishPublication || !japanesePublication)
      throw new Error("Seeded publications are missing");
    await expect(
      sharp(resolve(root, englishPublication.assets.front)).metadata(),
    ).resolves.toMatchObject({format: "webp", height: 384, width: 256});
    await expect(
      sharp(
        resolve(root, japanesePublication.assets.pages[0] ?? ""),
      ).metadata(),
    ).resolves.toMatchObject({format: "webp"});
  });

  test("fetch-more pages past complete and blacklisted IDs without loading their details", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const initialRemote = await createFetcher([gallery(1, "english")]);
    await syncNhentaiCatalog(
      {...defaultOptions(root), limit: 1},
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          imageOrigin: "https://images.example.test",
          fetcher: initialRemote.fetcher,
          retryCount: 0,
        }),
      },
    );

    const remote = await createFetcher(
      [
        gallery(1, "english"),
        gallery(2, "english"),
        gallery(3, "english"),
        gallery(4, "english"),
      ],
      1,
    );
    const report = await syncNhentaiCatalog(
      {
        ...defaultOptions(root),
        excludedPublicationIds: ["nhentai-2"],
        limit: 2,
        maxSearchPages: 4,
        selectionMode: "unseen",
      },
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          imageOrigin: "https://images.example.test",
          fetcher: remote.fetcher,
          retryCount: 0,
        }),
      },
    );

    expect(report.selectedGalleryIds).toEqual([3, 4]);
    expect(report.addedCount).toBe(2);
    expect(remote.galleryDetailRequestIds()).toEqual([3, 4]);
    expect(report.diagnostics.map(({code}) => code)).toEqual([
      "existing-complete",
      "blacklisted",
    ]);
  });

  test("fetch-more repairs cached galleries outside the new-publication limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const existingGallery = gallery(1, "english");
    existingGallery.images.pages.push(
      {t: "j", w: 800, h: 1_200},
      {t: "p", w: 800, h: 1_200},
      {t: "j", w: 800, h: 1_200},
    );
    existingGallery.num_pages = existingGallery.images.pages.length;
    const initialRemote = await createFetcher([existingGallery]);
    await syncNhentaiCatalog(
      {...defaultOptions(root), limit: 1, previewPageCount: 3},
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          imageOrigin: "https://images.example.test",
          fetcher: initialRemote.fetcher,
          retryCount: 0,
        }),
      },
    );
    const manifestPath = resolve(root, "nhentai-1/publication.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      assets: {back?: string};
    };
    delete manifest.assets.back;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const remote = await createFetcher(
      [existingGallery, gallery(2, "english"), gallery(3, "english")],
      1,
    );
    const progressMessages: string[] = [];
    const report = await syncNhentaiCatalog(
      {
        ...defaultOptions(root),
        limit: 2,
        maxSearchPages: 3,
        onProgress: (message) => progressMessages.push(message),
        selectionMode: "unseen",
      },
      {
        client: new NhentaiClient({
          apiOrigin: "https://example.test",
          imageOrigin: "https://images.example.test",
          fetcher: remote.fetcher,
          retryCount: 0,
        }),
      },
    );

    expect(report.selectedGalleryIds).toEqual([1, 2, 3]);
    expect(report).toMatchObject({addedCount: 2, updatedCount: 1});
    expect(remote.galleryDetailRequestIds()).toEqual([1, 2, 3]);
    expect(progressMessages).toContain(
      "Repairing nhentai-1 (repair 1): the sparse publication manifest has no back-cover asset",
    );
    expect(progressMessages).toContain("Repaired nhentai-1 (updated)");
  });

  test("atomically replaces changed metadata and repairs its complete page set", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const firstGallery = gallery(6, "english");
    const firstRemote = await createFetcher([firstGallery]);
    const firstClient = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: firstRemote.fetcher,
      retryCount: 0,
    });
    const options = {...defaultOptions(root), limit: 1};
    await syncNhentaiCatalog(options, {client: firstClient});

    const changedGallery = gallery(6, "english");
    changedGallery.title.english = "Changed English Title";
    const changedRemote = await createFetcher([changedGallery]);
    const changedClient = new NhentaiClient({
      apiOrigin: "https://example.test",
      imageOrigin: "https://images.example.test",
      fetcher: changedRemote.fetcher,
      retryCount: 0,
    });
    const result = await syncNhentaiCatalog(options, {client: changedClient});
    const document = parseLocalPublicationDocument(
      JSON.parse(
        await readFile(resolve(root, "nhentai-6/publication.json"), "utf8"),
      ) as unknown,
      "publication.json",
    );

    expect(result).toMatchObject({updatedCount: 1, unchangedCount: 0});
    expect(document.title).toBe("Changed English Title");
    expect(changedRemote.imageRequestCount()).toBe(2);
  });

  test("preserves the prior publication when a changed download fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
    temporaryDirectories.push(root);
    const initialRemote = await createFetcher([gallery(7, "english")]);
    const options = {...defaultOptions(root), limit: 1};
    await syncNhentaiCatalog(options, {
      client: new NhentaiClient({
        apiOrigin: "https://example.test",
        imageOrigin: "https://images.example.test",
        fetcher: initialRemote.fetcher,
        retryCount: 0,
      }),
    });
    const originalManifest = await readFile(
      resolve(root, "nhentai-7/publication.json"),
      "utf8",
    );

    const changedGallery = gallery(7, "english");
    changedGallery.title.english = "Interrupted Replacement";
    const changedRemote = await createFetcher([changedGallery]);
    const failingFetcher = stubFetch(async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (url.pathname.endsWith("/2.png"))
        return new Response("temporary failure", {status: 503});
      return changedRemote.fetcher(input, init);
    });

    const progressMessages: string[] = [];
    await expect(
      syncNhentaiCatalog(
        {
          ...options,
          onProgress: (message) => progressMessages.push(message),
        },
        {
          client: new NhentaiClient({
            apiOrigin: "https://example.test",
            imageOrigin: "https://images.example.test",
            fetcher: failingFetcher,
            retryCount: 0,
          }),
        },
      ),
    ).rejects.toThrow("HTTP 503");
    expect(progressMessages).toContain(
      "Failed to import nhentai-7: Request failed with HTTP 503: https://images.example.test/galleries/8007/2.png.",
    );
    expect(
      await readFile(resolve(root, "nhentai-7/publication.json"), "utf8"),
    ).toBe(originalManifest);
    expect(
      (await readdir(root)).some((name) => name.includes(".staging-")),
    ).toBe(false);
  });
});

test("nHentai client can use FlareSolverr after an API 403", async () => {
  const requests: Array<{input: string; init: RequestInit | undefined}> = [];
  const fetcher = stubFetch(async (input, init) => {
    const url = String(input);
    requests.push({input: url, init});
    if (url === "http://127.0.0.1:8191/v1")
      return new Response(
        JSON.stringify({
          solution: {
            cookies: [{name: "cf_clearance", value: "solved"}],
            response: JSON.stringify({result: []}),
            status: 200,
            userAgent: "Solved Browser",
          },
          status: "ok",
        }),
        {headers: {"Content-Type": "application/json"}},
      );
    return new Response("Forbidden", {status: 403});
  });
  const client = new NhentaiClient({
    apiOrigin: "https://example.test",
    fetcher,
    flaresolverrUrl: "http://127.0.0.1:8191/v1",
    retryCount: 0,
  });

  await expect(client.search("test", 1)).resolves.toEqual([]);
  expect(requests.map(({input}) => input)).toEqual([
    "https://example.test/api/v2/search?query=test&sort=date&page=1",
    "http://127.0.0.1:8191/v1",
  ]);
  expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
    cmd: "request.get",
    url: "https://example.test/api/v2/search?query=test&sort=date&page=1",
  });
});

test("nHentai provider reports HTTP retries through import progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-nhentai-"));
  temporaryDirectories.push(root);
  const remote = await createFetcher([gallery(9, "english")]);
  let rateLimited = false;
  const fetcher = stubFetch(async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (!rateLimited && url.pathname === "/api/v2/search") {
      rateLimited = true;
      return new Response("slow down", {
        headers: {"Retry-After": "1"},
        status: 429,
      });
    }
    return remote.fetcher(input, init);
  });
  const provider = createNhentaiProvider({
    clientOptions: {
      apiOrigin: "https://example.test",
      fetcher,
      imageOrigin: "https://images.example.test",
      onRetry: () => {},
      retryCount: 1,
      sleep: async () => {},
    },
    descriptor: {
      contentKinds: ["doujinshi"],
      defaultBlockedTags: [],
      defaultLanguages: ["english", "japanese"],
      defaultQuery: "big breasts",
      id: "nhentai",
      name: "nHentai",
      queryHelp: "Search",
      queryLabel: "Search",
      queryPlaceholder: "Search",
      requiresLanguageTag: true,
      summary: "Adult doujinshi from nHentai",
    },
  });
  expect(
    await provider.resolvePastedImport?.("Read https://nhentai.net/g/9/ next"),
  ).toEqual({
    publicationId: "nhentai-9",
    query: "https://nhentai.net/g/9/",
  });
  expect(await provider.resolvePastedImport?.("not a gallery")).toBeUndefined();

  const progressMessages: string[] = [];

  await provider.sync({
    blockedTags: [],
    excludedPublicationIds: [],
    languages: ["english"],
    limit: 1,
    maxSearchPages: 1,
    onProgress: (message) => progressMessages.push(message),
    outputDirectory: root,
    query: "big breasts",
    selectionMode: "unseen",
    write: true,
  });

  expect(progressMessages).toContain(
    "nHentai HTTP 429; retry 1/1 in 1000 ms (retry-after): https://example.test/api/v2/search?query=tag%3A%22big+breasts%22+-language%3A%22chinese%22&sort=date&page=1",
  );
});

test("nHentai CLI defaults to a non-writing 20-item English/Japanese preview", () => {
  const parsed = parseNhentaiSyncCliOptions([], "/work/afterleaf");
  expect(parsed.syncOptions).toMatchObject({
    blockedTags: [],
    languages: ["english", "japanese"],
    limit: 20,
    maxSearchPages: 10,
    outputDirectory: resolve("/work/afterleaf/content-sources/nhentai"),
    query: 'tag:"big breasts"',
    write: false,
  });
});

test("nHentai CLI accepts a FlareSolverr fallback URL", () => {
  const parsed = parseNhentaiSyncCliOptions(
    ["--flaresolverr-url", "http://127.0.0.1:8191/v1"],
    "/work/afterleaf",
  );
  expect(parsed.flaresolverrUrl).toBe("http://127.0.0.1:8191/v1");
});

test("nHentai CLI accepts explicit blocked tags", () => {
  const parsed = parseNhentaiSyncCliOptions(
    ["--blocked-tags", "School Girl,glasses"],
    "/work/afterleaf",
  );
  expect(parsed.syncOptions.blockedTags).toEqual(["school-girl", "glasses"]);
});

test("nHentai CLI accepts an exact JSON blocked-tag list", () => {
  const parsed = parseNhentaiSyncCliOptions(
    ["--blocked-tags-json", '["full color","group, female"]'],
    "/tmp",
  );

  expect(parsed.syncOptions.blockedTags).toEqual([
    "full-color",
    "group-female",
  ]);
});
