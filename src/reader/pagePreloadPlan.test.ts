import {describe, expect, test} from "bun:test";

import {createReaderPagePreloadPlan} from "~/reader/pagePreloadPlan";

const sparsePageUrl = (pageIndex: number) =>
  `/api/library/publications/nhentai-42/pages/${pageIndex + 1}`;

describe("reader page preload planning", () => {
  test("HTTP preloads the previous and next sparse spreads without GPU prefetching them", () => {
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
      sparsePageUrl(3),
      sparsePageUrl(4),
    ]);
    expect(plan.textureUrls).toEqual([]);
  });

  test("keeps the wider local-page GPU preload window", () => {
    const localPageUrl = (pageIndex: number) =>
      `/__afterleaf/active-library/pages/${pageIndex + 1}.webp`;
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
