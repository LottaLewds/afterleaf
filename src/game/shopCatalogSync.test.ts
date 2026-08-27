import {expect, test} from "bun:test";

import type {CatalogItem} from "~/catalog";
import {bookSignature} from "~/game/shopCatalogSync";

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
