import {describe, expect, test} from "bun:test";
import {
  emptyLibrary,
  isRuntimeLibraryAvailable,
  loadRuntimeCatalog,
  loadRuntimeLibraryWithFetcher,
} from "~/catalog";
import {ACTIVE_LIBRARY_CATALOG_ENDPOINT} from "~/content/libraryUpdate/activeLibraryRoutes";

const catalogResponse = (publications: unknown[]) =>
  Response.json({
    contentHash: "catalog-hash-42",
    id: "runtime-pack",
    publications,
  });

describe("loadRuntimeCatalog", () => {
  test("maps a generated content pack into the application catalog", async () => {
    // Structural CatalogFetcher mocks avoid coupling to the global fetch type.
    const fetcher = async (input: string) => {
      expect(
        String(input).startsWith(
          `${ACTIVE_LIBRARY_CATALOG_ENDPOINT}?afterleaf=`,
        ),
      ).toBe(true);
      return catalogResponse([
        {
          id: "nhentai-42",
          groupId: "comic-night",
          issue: {number: 7},
          kind: "magazine",
          title: "Comic Night 07",
          language: "japanese",
          tags: ["big breasts", "magazine"],
          originalTags: ["big breasts"],
          alternates: [
            {
              id: "nhentai-41",
              originalTags: ["magazine"],
              page0:
                "publications/nhentai-42/alternates/nhentai-41/page-000.webp",
              title: "Comic Night #7",
            },
          ],
          physical: {
            aspectRatio: 0.72,
            readingDirection: "ltr",
            thicknessMm: 12.4,
            trim: "A5",
          },
          source: {retrievedAt: "2026-07-29T10:00:00.000Z"},
          assets: {
            front: "publications/nhentai-42/front.webp",
            frontDetail: "publications/nhentai-42/front-detail.webp",
            back: "publications/nhentai-42/back.webp",
            spine: "publications/nhentai-42/spine.webp",
            pages: [
              "publications/nhentai-42/pages/001.webp",
              "publications/nhentai-42/pages/002.webp",
            ],
          },
        },
      ]);
    };

    await expect(loadRuntimeCatalog(fetcher)).resolves.toEqual([
      expect.objectContaining({
        id: "nhentai-42",
        collection: "comic-night",
        issue: 7,
        language: "japanese",
        originalTags: ["big breasts"],
        alternates: [
          {
            id: "nhentai-41",
            originalTags: ["magazine"],
            page0:
              "/api/media/library/publications/nhentai-42/alternates/nhentai-41/page-000.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
            title: "Comic Night #7",
          },
        ],
        cover:
          "/api/media/library/publications/nhentai-42/front.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
        detailCover:
          "/api/media/library/publications/nhentai-42/front-detail.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
        back: "/api/media/library/publications/nhentai-42/back.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
        spine:
          "/api/media/library/publications/nhentai-42/spine.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
        pages: [
          "/api/media/library/publications/nhentai-42/pages/001.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
          "/api/media/library/publications/nhentai-42/pages/002.webp?afterleaf=runtime-pack%3Acatalog-hash-42",
        ],
        trim: "A5",
        thicknessMm: 12.4,
        aspectRatio: 0.72,
        direction: "LTR",
      }),
    ]);
  });

  test("uses an empty library when a pack is absent or unsafe", async () => {
    const missingFetcher = async () => new Response("missing", {status: 404});
    const unsafeFetcher = async () =>
      catalogResponse([
        {
          id: "unsafe",
          title: "Unsafe",
          language: "english",
          tags: ["magazine"],
          physical: {readingDirection: "ltr"},
          assets: {front: "../private.webp", pages: ["../private.webp"]},
        },
      ]);

    expect(await loadRuntimeCatalog(missingFetcher)).toEqual([]);
    expect(await loadRuntimeCatalog(unsafeFetcher)).toEqual([]);
    expect(await loadRuntimeLibraryWithFetcher(unsafeFetcher)).toBe(
      emptyLibrary,
    );
  });

  test("distinguishes an unavailable catalog from a valid empty catalog", async () => {
    const unavailable = await loadRuntimeLibraryWithFetcher(
      async () => new Response("unavailable", {status: 503}),
    );
    const empty = await loadRuntimeLibraryWithFetcher(async () =>
      catalogResponse([]),
    );

    expect(isRuntimeLibraryAvailable(unavailable)).toBe(false);
    expect(isRuntimeLibraryAvailable(empty)).toBe(true);
    expect(empty.publications).toEqual([]);
  });

  test("rejects the whole catalog when any publication is not migrated", async () => {
    const runtime = await loadRuntimeLibraryWithFetcher(async () =>
      catalogResponse([
        {
          id: "current",
          title: "Current",
          language: "english",
          tags: [],
          physical: {},
          assets: {
            front: "publications/current/front.webp",
            pages: ["publications/current/pages/001.webp"],
          },
        },
        {
          id: "legacy",
          title: "Legacy",
          language: "english",
          tags: [],
          assets: {
            front: "publications/legacy/front.webp",
            pages: ["publications/legacy/pages/001.webp"],
          },
        },
      ]),
    );

    expect(runtime).toBe(emptyLibrary);
  });

  test("fills sparse previews with on-demand page URLs", async () => {
    const publications = await loadRuntimeCatalog(async () =>
      catalogResponse([
        {
          id: "nhentai-99",
          title: "Sparse Shelf",
          language: "english",
          pageCount: 5,
          tags: ["office"],
          physical: {readingDirection: "ltr"},
          assets: {
            front: "publications/nhentai-99/front.webp",
            pages: [
              "publications/nhentai-99/pages/001.webp",
              "publications/nhentai-99/pages/002.webp",
              "publications/nhentai-99/pages/003.webp",
            ],
          },
        },
      ]),
    );

    expect(publications[0]?.pages).toHaveLength(5);
    expect(publications[0]?.pages[2]).toContain("/pages/003.webp");
    expect(publications[0]?.pages[3]).toBe(
      "/api/media/library/pages/nhentai-99/4?afterleaf=runtime-pack%3Acatalog-hash-42",
    );
    expect(publications[0]?.pages[4]).toContain(
      "/api/media/library/pages/nhentai-99/5",
    );
  });

  test("maps every CBZ reader page to the sparse endpoint", async () => {
    const publications = await loadRuntimeCatalog(async () =>
      catalogResponse([
        {
          id: "local-cbz",
          title: "Local CBZ",
          language: "english",
          pageCount: 2,
          tags: ["unclassified"],
          physical: {aspectRatio: 0.7},
          assets: {
            front: "publications/local-cbz/front.webp",
            pages: [],
          },
        },
      ]),
    );

    expect(publications[0]?.pages).toEqual([
      "/api/media/library/pages/local-cbz/1?afterleaf=runtime-pack%3Acatalog-hash-42",
      "/api/media/library/pages/local-cbz/2?afterleaf=runtime-pack%3Acatalog-hash-42",
    ]);
    expect(publications[0]).toMatchObject({
      direction: "LTR",
      readingDirectionUnspecified: true,
    });
  });

  test("exposes immutable pack identity with the mapped publications", async () => {
    const runtime = await loadRuntimeLibraryWithFetcher(async () => {
      const response = catalogResponse([
        {
          id: "nhentai-84",
          title: "Night Shelf",
          language: "english",
          tags: ["big breasts"],
          physical: {readingDirection: "ltr"},
          assets: {
            front: "publications/nhentai-84/front.webp",
            pages: ["publications/nhentai-84/pages/001.webp"],
          },
        },
      ]);
      response.headers.set("X-Afterleaf-Snapshot-Id", "snapshot-2026-07-29");
      return response;
    });

    expect(runtime.identity).toEqual({
      catalogContentHash: "catalog-hash-42",
      packId: "runtime-pack",
      snapshotId: "snapshot-2026-07-29",
    });
    expect(runtime.publications[0]?.id).toBe("nhentai-84");
    expect(runtime.publications[0]?.cover).toBe(
      "/api/media/library/publications/nhentai-84/front.webp?afterleaf=snapshot-2026-07-29",
    );
    expect(runtime.publications[0]?.pages).toEqual([
      "/api/media/library/publications/nhentai-84/pages/001.webp?afterleaf=snapshot-2026-07-29",
    ]);

    const missingIdentity = await loadRuntimeLibraryWithFetcher(async () =>
      Response.json({publications: []}),
    );
    expect(missingIdentity).toBe(emptyLibrary);
  });

  test("maps generated shelf atlases and publication cells", async () => {
    const runtime = await loadRuntimeLibraryWithFetcher(async () =>
      Response.json({
        atlases: {
          back: [
            {
              cellHeight: 384,
              cellWidth: 256,
              columns: 8,
              firstPublicationIndex: 0,
              height: 384,
              path: "atlases/back-001.webp",
              publicationCount: 2,
              rows: 1,
              width: 2048,
            },
          ],
          front: [
            {
              cellHeight: 384,
              cellWidth: 256,
              columns: 8,
              firstPublicationIndex: 0,
              height: 384,
              path: "atlases/front-001.webp",
              publicationCount: 2,
              rows: 1,
              width: 2048,
            },
          ],
          spine: [
            {
              cellHeight: 384,
              cellWidth: 48,
              columns: 8,
              firstPublicationIndex: 0,
              height: 768,
              path: "atlases/spine-001.webp",
              publicationCount: 2,
              regions: [
                {height: 768, width: 24, x: 0, y: 0},
                {height: 768, width: 30, x: 24, y: 0},
              ],
              rows: 1,
              width: 54,
            },
          ],
        },
        contentHash: "atlas-catalog-hash",
        id: "atlas-pack",
        publications: [
          {
            assets: {front: "front-a.webp", pages: ["page-a.webp"]},
            id: "atlas-a",
            language: "english",
            physical: {},
            shelfAtlasIndex: 0,
            tags: [],
            title: "Atlas A",
          },
          {
            assets: {front: "front-b.webp", pages: ["page-b.webp"]},
            id: "atlas-b",
            language: "english",
            physical: {},
            shelfAtlasIndex: 1,
            tags: [],
            title: "Atlas B",
          },
        ],
      }),
    );

    expect(runtime.atlases.front[0]).toEqual({
      cellHeight: 384,
      cellWidth: 256,
      columns: 8,
      firstPublicationIndex: 0,
      height: 384,
      publicationCount: 2,
      rows: 1,
      url: "/api/media/library/atlases/front-001.webp?afterleaf=atlas-pack%3Aatlas-catalog-hash",
      width: 2048,
    });
    expect(
      runtime.publications.map((publication) => publication.shelfAtlas),
    ).toEqual([
      {cellIndex: 0, index: 0},
      {cellIndex: 1, index: 0},
    ]);
  });
});
