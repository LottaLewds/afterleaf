import {describe, expect, test} from "bun:test";

import {selectShopRoster} from "~/game/shopRoster";

const catalogIds = Array.from({length: 30}, (_, index) => `catalog-${index}`);

describe("shop roster selection", () => {
  test("preserves the current scene on an unchanged catalog refresh", () => {
    const currentPublicationIds = catalogIds.slice(8, 28);

    expect(
      selectShopRoster({
        catalogPublicationIds: catalogIds,
        currentBatchHasLooseBooks: false,
        currentPublicationIds,
        initializeRoster: false,
        newPublicationIds: [],
        pendingArrivalIds: [],
      }),
    ).toEqual({
      pendingArrivalIds: [],
      promotedArrivalIds: [],
      publicationIds: currentPublicationIds,
    });
  });

  test("prioritizes compatible saved publications on cold start", () => {
    const selection = selectShopRoster({
      catalogPublicationIds: catalogIds,
      currentBatchHasLooseBooks: true,
      currentPublicationIds: [],
      initializeRoster: true,
      newPublicationIds: [],
      pendingArrivalIds: [],
      savedPublicationIds: ["missing", "catalog-24", "catalog-3"],
    });

    expect(selection.publicationIds).toHaveLength(20);
    expect(selection.publicationIds.slice(0, 2)).toEqual([
      "catalog-24",
      "catalog-3",
    ]);
    expect(new Set(selection.publicationIds).size).toBe(20);
  });

  test("queues actual arrivals while the current batch remains loose", () => {
    const currentPublicationIds = catalogIds.slice(0, 20);

    expect(
      selectShopRoster({
        catalogPublicationIds: [...catalogIds, "arrival-a", "arrival-b"],
        currentBatchHasLooseBooks: true,
        currentPublicationIds,
        initializeRoster: false,
        newPublicationIds: ["arrival-a", "arrival-b"],
        pendingArrivalIds: ["arrival-a"],
      }),
    ).toEqual({
      pendingArrivalIds: ["arrival-a", "arrival-b"],
      promotedArrivalIds: [],
      publicationIds: currentPublicationIds,
    });
  });

  test("injects arrivals into open live-scene slots while current books remain loose", () => {
    const currentPublicationIds = catalogIds.slice(0, 20);

    expect(
      selectShopRoster(
        {
          catalogPublicationIds: [...catalogIds, "arrival-a", "arrival-b"],
          currentBatchHasLooseBooks: true,
          currentPublicationIds,
          initializeRoster: false,
          newPublicationIds: ["arrival-a", "arrival-b"],
          pendingArrivalIds: [],
        },
        40,
      ),
    ).toEqual({
      pendingArrivalIds: [],
      promotedArrivalIds: ["arrival-a", "arrival-b"],
      publicationIds: [...currentPublicationIds, "arrival-a", "arrival-b"],
    });
  });

  test("promotes queued arrivals into slots from a completed batch", () => {
    const currentPublicationIds = catalogIds.slice(0, 20);
    const selection = selectShopRoster({
      catalogPublicationIds: [...catalogIds, "arrival-a", "arrival-b"],
      currentBatchHasLooseBooks: false,
      currentPublicationIds,
      initializeRoster: false,
      newPublicationIds: ["arrival-b"],
      pendingArrivalIds: ["arrival-a"],
    });

    expect(selection.promotedArrivalIds).toEqual(["arrival-a", "arrival-b"]);
    expect(selection.pendingArrivalIds).toEqual([]);
    expect(selection.publicationIds).toEqual([
      "arrival-a",
      "arrival-b",
      ...currentPublicationIds.slice(0, 18),
    ]);
  });

  test("keeps overflow arrivals queued for the next completed batch", () => {
    const arrivals = Array.from({length: 24}, (_, index) => `arrival-${index}`);
    const selection = selectShopRoster(
      {
        catalogPublicationIds: [...catalogIds, ...arrivals],
        currentBatchHasLooseBooks: false,
        currentPublicationIds: catalogIds.slice(0, 20),
        initializeRoster: false,
        newPublicationIds: arrivals,
        pendingArrivalIds: [],
      },
      20,
    );

    expect(selection.publicationIds).toEqual(arrivals.slice(0, 20));
    expect(selection.promotedArrivalIds).toEqual(arrivals.slice(0, 20));
    expect(selection.pendingArrivalIds).toEqual(arrivals.slice(20));
  });
});
