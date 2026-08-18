import {afterEach, expect, test} from "bun:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {WeebCentralClient} from "~/content/providers/weebcentral/client";
import {WEEBCENTRAL_SPARSE_METADATA_FILE} from "~/content/providers/weebcentral/sparseMetadata";
import {syncWeebCentralCatalog} from "~/content/providers/weebcentral/sync";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const seriesHtml = (tags = ["Action"]) => `<main>
  <h1>Test Manga</h1>
  <a href="/search?author=Test+Author">Test Author</a>
  ${tags.map((tag) => `<a href="/search?included_tag=${tag}">${tag}</a>`).join("")}
  <p class="whitespace-pre-wrap">Synthetic description.</p>
  <a href="/search?included_status=Ongoing">Ongoing</a>
  <a href="/search?included_type=Manga">Manga</a>
  <strong>Released: </strong><span>2024</span>
  <a href="/search?official=True">Yes</a>
  <a href="/search?adult=False">No</a>
</main>`;
const chapterListHtml = (uppercaseIds = false) => {
  const chapterId = (number: number) =>
    `${uppercaseIds ? "CHAPTER" : "chapter"}-${number}`;
  return `<div><a href="/chapters/${chapterId(3)}"><span>Chapter 3</span><time datetime="2026-01-03T00:00:00.000Z"></time></a></div>
  <div><a href="/chapters/${chapterId(2)}"><span>Chapter 2</span><time datetime="2026-01-02T00:00:00.000Z"></time></a></div>
  <div><a href="/chapters/${chapterId(1)}"><span>Chapter 1</span><time datetime="2026-01-01T00:00:00.000Z"></time></a></div>`;
};
const pageListHtml = (pageCount = 4) =>
  Array.from(
    {length: pageCount},
    (_, index) =>
      `<img alt="Page ${index + 1}" src="https://images.test/${String(index + 1).padStart(3, "0")}.png">`,
  ).join("");

const createClient = (
  options: {
    imageFailure?: boolean;
    pageCount?: number;
    tags?: string[];
    track?: string[];
    uppercaseIds?: boolean;
  } = {},
) => {
  const seriesId = options.uppercaseIds ? "SERIES-ID" : "series-id";
  const searchHtml = `<a href="/series/${seriesId}/Test-Manga">Test Manga</a>`;
  return new WeebCentralClient({
    fetcher: async (input) => {
      const url = new URL(String(input));
      options.track?.push(url.toString());
      if (url.pathname === "/search/data")
        return new Response(searchHtml, {
          headers: {"content-type": "text/html"},
        });
      if (url.pathname === `/series/${seriesId}/Test-Manga`)
        return new Response(seriesHtml(options.tags), {
          headers: {"content-type": "text/html"},
        });
      if (url.pathname.endsWith("/full-chapter-list"))
        return new Response(chapterListHtml(options.uppercaseIds), {
          headers: {"content-type": "text/html"},
        });
      if (url.pathname.endsWith("/images"))
        return new Response(pageListHtml(options.pageCount), {
          headers: {"content-type": "text/html"},
        });
      if (url.hostname === "images.test") {
        if (options.imageFailure && url.pathname.endsWith("004.png"))
          throw new Error("Synthetic image failure");
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: {"content-type": "image/png"},
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    origin: "https://weebcentral.test",
    requestIntervalMilliseconds: 0,
    retryCount: 0,
  });
};

const syncOptions = (outputDirectory: string) => ({
  blockedTags: [] as string[],
  excludedPublicationIds: [] as string[],
  languages: ["english" as const],
  limit: 1,
  maxSearchPages: 1,
  outputDirectory,
  query: "Test Manga",
  selectionMode: "unseen" as const,
  write: true,
});

test("WeebCentral sync writes a sparse local catalog", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const report = await syncWeebCentralCatalog(syncOptions(root), {
    client: createClient(),
    now: () => new Date("2026-08-05T12:00:00.000Z"),
  });
  const publicationDirectory = resolve(root, "weebcentral-series-id-chapter-1");
  const manifest = JSON.parse(
    await readFile(resolve(publicationDirectory, "publication.json"), "utf8"),
  ) as Record<string, unknown>;
  const sparseMetadata = JSON.parse(
    await readFile(
      resolve(publicationDirectory, WEEBCENTRAL_SPARSE_METADATA_FILE),
      "utf8",
    ),
  ) as Record<string, unknown>;

  expect(report).toMatchObject({
    addedCount: 1,
    providerId: "weebcentral",
    selectedPublicationIds: ["weebcentral-series-id-chapter-1"],
  });
  expect(manifest).toMatchObject({
    aspectRatioInferenceVersion: BOOK_ASPECT_RATIO_INFERENCE_VERSION,
    assets: {
      back: "pages/004.png",
      front: "pages/001.png",
      pages: ["pages/001.png", "pages/002.png", "pages/003.png"],
    },
    groupId: "weebcentral-series-id",
    id: "weebcentral-series-id-chapter-1",
    issue: {label: "Chapter 1", number: 1},
    language: "english",
    pageCount: 4,
    physical: {aspectRatio: 2 / 3},
    source: {
      provider: "weebcentral",
      remoteId: "chapter-1",
      sourceUrl: "https://weebcentral.test/chapters/chapter-1",
    },
  });
  expect(sparseMetadata).toMatchObject({
    chapterId: "chapter-1",
    pageUrls: [
      "https://images.test/001.png",
      "https://images.test/002.png",
      "https://images.test/003.png",
      "https://images.test/004.png",
    ],
    schemaVersion: 1,
  });
  await expect(
    stat(resolve(publicationDirectory, "pages/001.png")),
  ).resolves.toBeDefined();
  await expect(
    stat(resolve(publicationDirectory, "pages/004.png")),
  ).resolves.toBeDefined();
});

test("WeebCentral unseen sync advances through complete chapters", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const client = createClient();
  const first = await syncWeebCentralCatalog(syncOptions(root), {client});
  const second = await syncWeebCentralCatalog(
    {...syncOptions(root), limit: 2},
    {client},
  );

  expect(first.selectedPublicationIds).toEqual([
    "weebcentral-series-id-chapter-1",
  ]);
  expect(second.selectedPublicationIds).toEqual([
    "weebcentral-series-id-chapter-2",
    "weebcentral-series-id-chapter-3",
  ]);
  expect(second.addedCount).toBe(2);
});

test("WeebCentral skips blacklisted chapters without disturbing oldest-first order", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const report = await syncWeebCentralCatalog(
    {
      ...syncOptions(root),
      excludedPublicationIds: ["weebcentral-series-id-chapter-1"],
    },
    {client: createClient()},
  );

  expect(report.selectedPublicationIds).toEqual([
    "weebcentral-series-id-chapter-2",
  ]);
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "blacklisted",
      publicationId: "weebcentral-series-id-chapter-1",
    }),
  );
});

test("WeebCentral keeps remote ULIDs but canonicalizes and repairs local IDs", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const client = createClient({uppercaseIds: true});
  const first = await syncWeebCentralCatalog(syncOptions(root), {client});
  const publicationId = "weebcentral-series-id-chapter-1";
  const publicationDirectory = resolve(root, publicationId);
  const manifestPath = resolve(publicationDirectory, "publication.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    groupId: string;
    id: string;
    source: {remoteId: string};
  };

  expect(first.selectedPublicationIds).toEqual([publicationId]);
  expect(manifest).toMatchObject({
    groupId: "weebcentral-series-id",
    id: publicationId,
    source: {remoteId: "CHAPTER-1"},
  });

  const legacyDirectory = resolve(root, "weebcentral-SERIES-ID-CHAPTER-1");
  await rename(publicationDirectory, legacyDirectory);
  await writeFile(
    resolve(legacyDirectory, "publication.json"),
    `${JSON.stringify(
      {
        ...manifest,
        groupId: "weebcentral-SERIES-ID",
        id: "weebcentral-SERIES-ID-CHAPTER-1",
      },
      null,
      2,
    )}\n`,
  );

  const repaired = await syncWeebCentralCatalog(syncOptions(root), {client});

  expect(repaired).toMatchObject({addedCount: 0, updatedCount: 1});
  await expect(stat(publicationDirectory)).resolves.toBeDefined();
  if (process.platform === "win32")
    expect(await readdir(root)).toContain(publicationId);
  else await expect(stat(legacyDirectory)).rejects.toThrow();
});

test("WeebCentral dry run does not fetch pages or write", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const outputDirectory = resolve(root, "catalog");
  const requests: string[] = [];
  const report = await syncWeebCentralCatalog(
    {...syncOptions(outputDirectory), write: false},
    {client: createClient({track: requests})},
  );

  expect(report.selectedPublicationIds).toEqual([
    "weebcentral-series-id-chapter-1",
  ]);
  expect(requests.some((url) => url.includes("/images"))).toBe(false);
  await expect(stat(outputDirectory)).rejects.toThrow();
});

test("WeebCentral sync deduplicates representative pages for short chapters", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  await syncWeebCentralCatalog(syncOptions(root), {
    client: createClient({pageCount: 2}),
  });
  const manifest = JSON.parse(
    await readFile(
      resolve(root, "weebcentral-series-id-chapter-1/publication.json"),
      "utf8",
    ),
  ) as {assets: {back: string; pages: string[]}; pageCount: number};

  expect(manifest.pageCount).toBe(2);
  expect(manifest.assets).toEqual({
    back: "pages/002.png",
    front: "pages/001.png",
    pages: ["pages/001.png", "pages/002.png"],
  });
});

test("WeebCentral sync filters blocked tags after parsing details", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const requests: string[] = [];
  const report = await syncWeebCentralCatalog(
    {...syncOptions(root), blockedTags: ["hentai"]},
    {client: createClient({tags: ["Hentai"], track: requests})},
  );

  expect(report.selectedPublicationIds).toEqual([]);
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({code: "blocked-tag"}),
  );
  expect(requests.some((url) => url.includes("full-chapter-list"))).toBe(false);
});

test("WeebCentral sync removes interrupted staging directories", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);

  await expect(
    syncWeebCentralCatalog(syncOptions(root), {
      client: createClient({imageFailure: true}),
    }),
  ).rejects.toThrow("Synthetic image failure");
  expect(
    (await readdir(root)).filter((entry) => entry.includes(".staging-")),
  ).toEqual([]);
});

const deferred = () => {
  let resolvePromise = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise};
};

const pipelineSeries = (id: string) => ({
  adult: false,
  authors: ["Test Author"],
  id,
  officialTranslation: true,
  path: `/series/${id}/Test-Manga`,
  slug: "Test-Manga",
  tags: ["Action"],
  title: `Test Manga ${id}`,
  type: "Manga",
  year: 2024,
});

const pipelineChapter = (seriesId: string) => ({
  id: `chapter-${seriesId}`,
  label: "Chapter 1",
  number: 1,
  path: `/chapters/chapter-${seriesId}`,
});

test("WeebCentral materialization overlaps continued paginated discovery", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const firstDownload = deferred();
  const secondSearch = deferred();
  let activeDownloads = 0;
  const references = ["series-a", "series-b"].map((id) => ({
    id,
    path: `/series/${id}/Test-Manga`,
    slug: "Test-Manga",
  }));
  const client = {
    origin: "https://weebcentral.test",
    async downloadPage(pageUrl: string) {
      activeDownloads += 1;
      if (pageUrl.includes("series-a")) await firstDownload.promise;
      activeDownloads -= 1;
      return new Uint8Array([1, 2, 3]);
    },
    async getChapterList(seriesId: string) {
      return [pipelineChapter(seriesId)];
    },
    async getPageList(chapterId: string) {
      return [`https://images.test/${chapterId}.png`];
    },
    async getSeriesDetails(reference: (typeof references)[number]) {
      return pipelineSeries(reference.id);
    },
    async searchSeries(_query: string, page: number) {
      if (page === 2) secondSearch.resolve();
      return {
        hasNextPage: page === 1,
        series: [references[page - 1]].filter(
          (reference): reference is (typeof references)[number] =>
            reference !== undefined,
        ),
      };
    },
  } as unknown as WeebCentralClient;

  const syncing = syncWeebCentralCatalog(
    {...syncOptions(root), limit: 2, maxSearchPages: 2},
    {client},
  );
  await secondSearch.promise;
  expect(activeDownloads).toBe(1);
  firstDownload.resolve();
  const report = await syncing;

  expect(report.selectedPublicationIds).toEqual([
    "weebcentral-series-a-chapter-series-a",
    "weebcentral-series-b-chapter-series-b",
  ]);
  expect(report.addedCount).toBe(2);
});

test("WeebCentral bounds concurrent chapter materializations", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-"));
  temporaryDirectories.push(root);
  const references = ["series-a", "series-b", "series-c"].map((id) => ({
    id,
    path: `/series/${id}/Test-Manga`,
    slug: "Test-Manga",
  }));
  const downloadGates = new Map(
    references.map(({id}) => [id, deferred()] as const),
  );
  const twoDownloadsStarted = deferred();
  const thirdDownloadStarted = deferred();
  let activeDownloads = 0;
  let maximumActiveDownloads = 0;
  let startedDownloads = 0;
  const client = {
    origin: "https://weebcentral.test",
    async downloadPage(pageUrl: string) {
      const seriesId = references.find(({id}) => pageUrl.includes(id))?.id;
      if (!seriesId) throw new Error(`Unexpected page URL ${pageUrl}`);
      activeDownloads += 1;
      startedDownloads += 1;
      maximumActiveDownloads = Math.max(
        maximumActiveDownloads,
        activeDownloads,
      );
      if (startedDownloads === 2) twoDownloadsStarted.resolve();
      if (startedDownloads === 3) thirdDownloadStarted.resolve();
      await downloadGates.get(seriesId)?.promise;
      activeDownloads -= 1;
      return new Uint8Array([1, 2, 3]);
    },
    async getChapterList(seriesId: string) {
      return [pipelineChapter(seriesId)];
    },
    async getPageList(chapterId: string) {
      return [`https://images.test/${chapterId}.png`];
    },
    async getSeriesDetails(reference: (typeof references)[number]) {
      return pipelineSeries(reference.id);
    },
    async searchSeries() {
      return {hasNextPage: false, series: references};
    },
  } as unknown as WeebCentralClient;

  const syncing = syncWeebCentralCatalog(
    {...syncOptions(root), limit: 3},
    {client},
  );
  await twoDownloadsStarted.promise;
  expect(startedDownloads).toBe(2);
  downloadGates.get("series-a")?.resolve();
  await thirdDownloadStarted.promise;
  expect(maximumActiveDownloads).toBe(2);
  downloadGates.get("series-b")?.resolve();
  downloadGates.get("series-c")?.resolve();
  const report = await syncing;

  expect(report.selectedPublicationIds).toEqual([
    "weebcentral-series-a-chapter-series-a",
    "weebcentral-series-b-chapter-series-b",
    "weebcentral-series-c-chapter-series-c",
  ]);
  expect(report.addedCount).toBe(3);
});
