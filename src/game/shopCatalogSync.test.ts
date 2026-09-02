import {expect, test} from "bun:test";

import type {CatalogItem} from "~/catalog";
import type {BookCarryActions} from "~/game/bookCarryActions";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import {ShopCatalogSync, bookSignature, type ShopCatalogSyncHost} from "~/game/shopCatalogSync";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";

const createCatalogItem = (cover: string): CatalogItem =>
  ({
    accent: "#ffffff",
    back: "/books/example-back.webp?afterleaf=old",
    collection: "example",
    cover,
    detailCover: "/books/example-detail.webp?afterleaf=old",
    direction: "LTR",
    id: "example",
    issue: 1,
    language: "english",
    pages: [],
    spine: "/books/example-spine.webp?afterleaf=old",
    tags: [],
    thicknessMm: 10,
    title: "Example",
    titleJp: "例",
    trim: "example",
    added: "2026-01-01",
  }) as CatalogItem;

test("bookSignature ignores catalog cache-busting queries", () => {
  const oldCatalogItem = createCatalogItem("/books/example-cover.webp?afterleaf=old");
  const refreshedCatalogItem = createCatalogItem("/books/example-cover.webp?afterleaf=new");

  expect(bookSignature(refreshedCatalogItem)).toBe(bookSignature(oldCatalogItem));
});

test("ShopCatalogSync reports catalog changes without rescanning unchanged frames", () => {
  let items: readonly CatalogItem[] = [];
  let lifecycleSyncCount = 0;
  const host = {
    catalogAvailable: () => true,
    catalogItems: () => items,
    newPublicationIds: () => [],
    observedArrivalIds: new Set<string>(),
    selectedPublicationId: () => undefined,
    lastSelectedPublicationId: () => undefined,
    setLastSelectedPublicationId: () => {},
    booksById: () => new Map(),
    bookActions: () => ({discardedPublicationIds: new Set<string>()}) as unknown as BookCarryActions,
    bookLifecycle: () => ({syncBooks: () => lifecycleSyncCount++}) as unknown as ShopBookLifecycle,
    bookTextures: () => ({}) as unknown as BookTextureRuntime,
  } as unknown as ShopCatalogSyncHost;
  const catalogSync = new ShopCatalogSync(host);

  expect(catalogSync.sync()).toBe(true);
  expect(catalogSync.sync()).toBe(false);
  items = [createCatalogItem("/books/example-cover.webp?afterleaf=old")];
  expect(catalogSync.sync()).toBe(true);
  expect(lifecycleSyncCount).toBe(2);
});
