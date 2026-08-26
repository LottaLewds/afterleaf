import {expect, test} from "bun:test";
import {MangaDexClient} from "~/content/providers/mangadex/client";
import {stubFetch} from "~/test/fetchStub";

const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: {"Content-Type": "application/json"},
    status: 200,
  });

const manga = {
  attributes: {
    altTitles: [{ja: "テスト"}],
    contentRating: "safe",
    description: {en: "A test manga"},
    originalLanguage: "ja",
    tags: [
      {
        attributes: {name: {en: "Action"}},
        id: "action-tag",
      },
    ],
    title: {en: "Test Manga", ja: "テスト"},
    year: 2026,
  },
  id: "manga-id",
  relationships: [
    {
      attributes: {fileName: "cover.jpg"},
      id: "cover-id",
      type: "cover_art",
    },
  ],
};

test("MangaDex client resolves API metadata and At Home pages", async () => {
  const requestedUrls: string[] = [];
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/manga/tag"))
        return response({
          data: [{attributes: {name: {en: "Pornographic"}}, id: "blocked-tag"}],
        });
      if (url.includes("/at-home/server/chapter-id"))
        return response({
          baseUrl: "https://uploads.mangadex.test",
          chapter: {
            data: ["page-1.jpg"],
            dataSaver: ["page-1.jpg"],
            hash: "hash",
          },
        });
      if (url.includes("/manga/manga-id/feed"))
        return response({
          data: [
            {
              attributes: {
                chapter: "1",
                pages: 1,
                translatedLanguage: "en",
              },
              id: "chapter-id",
              relationships: [{id: "manga-id", type: "manga"}],
            },
          ],
        });
      if (url.includes("/manga?")) return response({data: [manga]});
      if (url.includes("/data/hash/page-1.jpg"))
        return new Response(new Uint8Array([1, 2, 3]), {status: 200});
      throw new Error(`Unexpected URL ${url}`);
    }),
    retryCount: 0,
  });

  const results = await client.searchManga(
    "Test",
    1,
    ["english"],
    ["pornographic"],
  );
  const chapters = await client.getChapterFeed("manga-id", ["english"], 1);
  const server = await client.getAtHomeServer("chapter-id");
  const page = await client.downloadPage(server, "page-1.jpg");

  expect(results[0]).toMatchObject({
    contentRating: "safe",
    id: "manga-id",
    title: {en: "Test Manga"},
  });
  expect(chapters[0]).toMatchObject({id: "chapter-id", mangaId: "manga-id"});
  expect(page).toEqual(Buffer.from([1, 2, 3]));
  expect(
    requestedUrls.some((url) => url.includes("excludedTags%5B%5D=blocked-tag")),
  ).toBe(true);
  expect(
    requestedUrls.some((url) => url.includes("contentRating%5B%5D=suggestive")),
  ).toBe(true);
  expect(
    requestedUrls.some((url) => url.includes("order%5Brelevance%5D=desc")),
  ).toBe(true);
  expect(
    requestedUrls.every((url) => !url.includes("order%5BupdatedAt%5D=desc")),
  ).toBe(true);
});

test("MangaDex client sorts discovery searches by recent updates", async () => {
  let requestedUrl = "";
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      requestedUrl = String(input);
      return response({data: [manga]});
    }),
    retryCount: 0,
  });

  await client.searchManga("", 1, ["english"], []);

  expect(requestedUrl).toContain("order%5BupdatedAt%5D=desc");
  expect(requestedUrl).not.toContain("order%5Brelevance%5D=desc");
});

test("MangaDex client exposes chapter-feed pagination", async () => {
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async (input) => {
      const url = String(input);
      expect(url).toContain("offset=100");
      return response({
        data: [
          {
            attributes: {
              chapter: "101",
              pages: 12,
              translatedLanguage: "en",
            },
            id: "chapter-101",
            relationships: [{id: "manga-id", type: "manga"}],
          },
        ],
        limit: 100,
        offset: 100,
        total: 101,
      });
    }),
    retryCount: 0,
  });

  const page = await client.getChapterFeedPage("manga-id", ["english"], 2);

  expect(page).toMatchObject({
    chapters: [{chapter: "101", id: "chapter-101"}],
    limit: 100,
    offset: 100,
    total: 101,
  });
});

test("MangaDex client excludes external chapter placeholders", async () => {
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async () =>
      response({
        data: [
          {
            attributes: {
              chapter: "235",
              externalUrl: "https://mangaplus.example/chapter-235",
              pages: 1,
              translatedLanguage: "en",
            },
            id: "external-chapter",
            relationships: [{id: "manga-id", type: "manga"}],
          },
          {
            attributes: {
              chapter: "234",
              pages: 18,
              translatedLanguage: "en",
            },
            id: "hosted-chapter",
            relationships: [{id: "manga-id", type: "manga"}],
          },
        ],
        limit: 100,
        offset: 0,
        total: 2,
      }),
    ),
    retryCount: 0,
  });

  const page = await client.getChapterFeedPage("manga-id", ["english"], 1);

  expect(page.chapters).toEqual([
    expect.objectContaining({id: "hosted-chapter", pages: 18}),
  ]);
  expect(page.total).toBe(2);
});

test("MangaDex client times out stalled requests", async () => {
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          );
        }),
    ),
    requestTimeoutMilliseconds: 5,
    retryCount: 0,
  });

  await expect(client.getAtHomeServer("chapter-id")).rejects.toThrow();
});

test("MangaDex client retries rate limits but not ordinary client errors", async () => {
  let requests = 0;
  const client = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async () => {
      requests += 1;
      if (requests === 1) return new Response("busy", {status: 429});
      return response({
        data: [],
        limit: 100,
        offset: 0,
        total: 0,
      });
    }),
    retryCount: 1,
    sleep: async () => {},
  });

  await expect(
    client.getChapterFeedPage("manga-id", ["english"], 1),
  ).resolves.toMatchObject({
    chapters: [],
    total: 0,
  });
  expect(requests).toBe(2);

  requests = 0;
  const ordinaryClientError = new MangaDexClient({
    apiOrigin: "https://mangadex.test",
    fetcher: stubFetch(async () => {
      requests += 1;
      return new Response("missing", {status: 404});
    }),
    retryCount: 1,
    sleep: async () => {},
  });
  await expect(
    ordinaryClientError.getChapterFeedPage("manga-id", ["english"], 1),
  ).rejects.toThrow("HTTP 404");
  expect(requests).toBe(1);
});
