import {expect, test} from "bun:test";
import {
  parseWeebCentralChapterListHtml,
  parseWeebCentralPageListHtml,
  parseWeebCentralSearchHtml,
  parseWeebCentralSeriesHtml,
  WeebCentralClient,
} from "~/content/providers/weebcentral/client";
import {stubFetch} from "~/test/fetchStub";

const reference = {
  id: "series-id",
  path: "/series/series-id/Test-Manga",
  slug: "Test-Manga",
};

test("WeebCentral parsers normalize HTML fragments", async () => {
  const search = await parseWeebCentralSearchHtml(
    `<article>
      <a href="https://weebcentral.test/series/series-id/Test-Manga">mobile</a>
      <a href="/series/series-id/Test-Manga">Test Manga</a>
    </article><button>More</button>`,
    "https://weebcentral.test",
  );
  const series = await parseWeebCentralSeriesHtml(
    `<main>
      <h1>Test Manga</h1>
      <a href="/search?author=Test+Author">Test Author</a>
      <a href="/search?included_tag=Action">Action</a>
      <a href="/search?included_tag=Sci-fi">Sci-fi</a>
      <p class="whitespace-pre-wrap">A synthetic description.</p>
      <a href="/search?included_status=Ongoing">Ongoing</a>
      <a href="/search?included_type=Manga">Manga</a>
      <strong>Released: </strong><span>2024</span>
      <a href="/search?official=True">Yes</a>
      <a href="/search?adult=False">No</a>
      <img alt="Test Manga cover" src="https://covers.test/series-id.jpg">
    </main>`,
    reference,
    "https://weebcentral.test",
  );
  const chapters = await parseWeebCentralChapterListHtml(
    `<div><a href="/chapters/chapter-2"><span>Chapter 2</span><time datetime="2026-01-02T00:00:00.000Z"></time></a></div>
     <div><a href="/chapters/chapter-1-5"><span>Chapter 1.5</span><time datetime="2026-01-01T00:00:00.000Z"></time></a></div>`,
    "https://weebcentral.test",
  );
  const pages = await parseWeebCentralPageListHtml(
    `<section><img alt="Page 1" src="https://images.test/001.png"><img alt="Page 2" src="/002.webp"></section>`,
    "https://weebcentral.test",
  );

  expect(search).toEqual({hasNextPage: true, series: [reference]});
  expect(series).toMatchObject({
    adult: false,
    authors: ["Test Author"],
    officialTranslation: true,
    tags: ["Action", "Sci-fi"],
    title: "Test Manga",
    type: "Manga",
    year: 2024,
  });
  expect(chapters).toEqual([
    {
      id: "chapter-2",
      label: "Chapter 2",
      number: 2,
      path: "/chapters/chapter-2",
      publishedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "chapter-1-5",
      label: "Chapter 1.5",
      number: 1.5,
      path: "/chapters/chapter-1-5",
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  expect(pages).toEqual([
    "https://images.test/001.png",
    "https://weebcentral.test/002.webp",
  ]);
});

test("WeebCentral client sends safe search filters and retries Cloudflare failures", async () => {
  const requests: Array<{headers: Headers; url: URL}> = [];
  const sleeps: number[] = [];
  let responseCount = 0;
  const client = new WeebCentralClient({
    fetcher: stubFetch(async (input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        url: new URL(String(input)),
      });
      responseCount += 1;
      if (responseCount === 1) return new Response("blocked", {status: 403});
      return new Response(
        `<a href="/series/series-id/Test-Manga">Test Manga</a>`,
        {headers: {"content-type": "text/html"}},
      );
    }),
    origin: "https://weebcentral.test",
    requestIntervalMilliseconds: 0,
    retryCount: 1,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  const result = await client.searchSeries(
    " Test Manga ",
    2,
    ["english"],
    ["horror", "unknown-tag"],
  );

  expect(result.series).toEqual([reference]);
  expect(requests).toHaveLength(2);
  expect(requests[0]?.url.searchParams.get("adult")).toBe("False");
  expect(requests[0]?.url.searchParams.get("text")).toBe("Test Manga");
  expect(requests[0]?.url.searchParams.get("offset")).toBe("32");
  expect(requests[0]?.url.searchParams.getAll("excluded_tag")).toEqual([
    "Horror",
  ]);
  expect(requests[0]?.headers.get("user-agent")).toContain("Afterleaf");
  expect(sleeps).toEqual([1_000]);
});

test("WeebCentral parsers reject incomplete remote markup", async () => {
  await expect(
    parseWeebCentralSeriesHtml("<h1>Missing safety marker</h1>", reference),
  ).rejects.toThrow("adult-content marker");
  await expect(
    parseWeebCentralChapterListHtml(
      '<a href="/chapters/chapter-id">No chapter label</a>',
    ),
  ).rejects.toThrow("has no number");
  await expect(
    parseWeebCentralPageListHtml("<section></section>"),
  ).rejects.toThrow("returned no pages");
});

test("WeebCentral client rejects non-image page responses", async () => {
  const client = new WeebCentralClient({
    fetcher: stubFetch(
      async () =>
        new Response("not an image", {
          headers: {"content-type": "text/html"},
        }),
    ),
    origin: "https://weebcentral.test",
    requestIntervalMilliseconds: 0,
    retryCount: 0,
  });

  await expect(
    client.downloadPage("https://images.test/001.png"),
  ).rejects.toThrow("was not an image");
});
