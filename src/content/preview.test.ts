import {describe, expect, test} from "bun:test";
import {generateContentPackPreview} from "~/content/preview";
import type {ContentPackCatalog} from "~/content/schema";

const catalog: ContentPackCatalog = {
  schemaVersion: 1,
  id: "preview-test",
  selection: {
    excludedTags: [],
    languages: ["english", "japanese"],
    limit: 20,
    match: "all",
    seed: "visual-v1",
    source: "test",
    tags: ["big-breasts"],
  },
  atlases: {
    front: [
      {
        path: "atlases/front.webp",
        cellWidth: 256,
        cellHeight: 384,
        columns: 1,
        rows: 1,
        width: 256,
        height: 384,
        contentHash: "front-hash",
        firstPublicationIndex: 0,
        publicationCount: 1,
      },
    ],
    back: [
      {
        path: "atlases/back.webp",
        cellWidth: 256,
        cellHeight: 384,
        columns: 1,
        rows: 1,
        width: 256,
        height: 384,
        contentHash: "back-hash",
        firstPublicationIndex: 0,
        publicationCount: 1,
      },
    ],
    spine: [
      {
        path: "atlases/spine.webp",
        cellWidth: 48,
        cellHeight: 384,
        columns: 1,
        rows: 1,
        width: 48,
        height: 384,
        contentHash: "spine-hash",
        firstPublicationIndex: 0,
        publicationCount: 1,
      },
    ],
  },
  publications: [
    {
      alternates: [],
      id: "comic-test-2026-07",
      groupId: "comic-test",
      issue: {year: 2026, month: 7},
      kind: "magazine",
      title: 'Comic <Test> "2026-07"',
      language: "english",
      tags: ["big-breasts", "magazine"],
      originalTags: ["big-breasts", "magazine"],
      physical: {
        aspectRatio: 2 / 3,
        readingDirection: "ltr",
        trim: "B5",
        thicknessMm: 12,
      },
      assets: {
        front: "publications/comic test/front.webp",
        frontDetail: "publications/comic test/front-detail.webp",
        back: "publications/comic test/back.webp",
        spine: "publications/comic test/spine.webp",
        pages: ["publications/comic test/pages/001.webp"],
      },
      shelfAtlasIndex: 0,
      contentHash: "publication-hash",
    },
  ],
  contentHash: "catalog-hash",
};

describe("generateContentPackPreview", () => {
  test("renders escaped metadata, encoded assets, issue data, and atlases", () => {
    const html = generateContentPackPreview(catalog);
    expect(html).toContain("Comic &lt;Test&gt; &quot;2026-07&quot;");
    expect(html).toContain("2026-07");
    expect(html).toContain("publications/comic%20test/front.webp");
    expect(html).toContain("atlases/front.webp");
    expect(html).not.toContain("Comic <Test>");
  });

  test("rejects an asset path that could escape the pack", () => {
    const publication = catalog.publications[0];
    if (!publication) throw new Error("Preview test catalog has no publication");
    const unsafeCatalog: ContentPackCatalog = {
      ...catalog,
      publications: [
        {
          ...publication,
          assets: {
            ...publication.assets,
            front: "../outside.webp",
          },
        },
      ],
    };
    expect(() => generateContentPackPreview(unsafeCatalog)).toThrow("contained relative path");
  });
});
