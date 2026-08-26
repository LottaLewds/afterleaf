import {describe, expect, test} from "bun:test";

import {createReaderPagePreloadPlan} from "~/reader/pagePreloadPlan";

const sparsePageUrl = (pageIndex: number) =>
  `/api/media/library/pages/nhentai-42/${pageIndex + 1}`;

describe("reader page preload planning", () => {
  test("HTTP preloads six pages in each direction without GPU prefetching them", () => {
    const plan = createReaderPagePreloadPlan({
      pageCount: 12,
      pageIndex: 5,
      pageUrl: sparsePageUrl,
      requestedUrls: new Set([sparsePageUrl(5), sparsePageUrl(6)]),
      widePageIndices: new Set(),
    });

    expect(plan.httpUrls).toEqual([
      sparsePageUrl(7),
      sparsePageUrl(8),
      sparsePageUrl(9),
      sparsePageUrl(10),
      sparsePageUrl(11),
      sparsePageUrl(0),
      sparsePageUrl(1),
      sparsePageUrl(2),
      sparsePageUrl(3),
      sparsePageUrl(4),
    ]);
    expect(plan.textureUrls).toEqual([]);
  });

  test("HTTP preloads pages 4-9 when showing the 2+3 spread", () => {
    const plan = createReaderPagePreloadPlan({
      pageCount: 12,
      pageIndex: 1,
      pageUrl: sparsePageUrl,
      requestedUrls: new Set([sparsePageUrl(1), sparsePageUrl(2)]),
      widePageIndices: new Set(),
    });

    expect(plan.httpUrls).toEqual([
      sparsePageUrl(3),
      sparsePageUrl(4),
      sparsePageUrl(5),
      sparsePageUrl(6),
      sparsePageUrl(7),
      sparsePageUrl(8),
      sparsePageUrl(0),
    ]);
    expect(plan.textureUrls).toEqual([]);
  });

  test("keeps the wider local-page GPU preload window", () => {
    const localPageUrl = (pageIndex: number) =>
      `/api/media/library/publications/local-cbz/pages/${pageIndex + 1}.webp`;
    const plan = createReaderPagePreloadPlan({
      pageCount: 12,
      pageIndex: 5,
      pageUrl: localPageUrl,
      requestedUrls: new Set([localPageUrl(5), localPageUrl(6)]),
      widePageIndices: new Set(),
    });

    expect(plan.httpUrls).toEqual([
      localPageUrl(1),
      localPageUrl(2),
      localPageUrl(3),
      localPageUrl(4),
      localPageUrl(7),
      localPageUrl(8),
      localPageUrl(9),
      localPageUrl(10),
    ]);
    expect(plan.textureUrls).toEqual(plan.httpUrls);
  });
});
