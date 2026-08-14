import {describe, expect, test} from "bun:test";

import {
  parseShopMediaCatalog,
  SHOP_MEDIA_CATALOG_ENDPOINT,
} from "~/game/shopMediaCatalog";

describe("shop media catalog protocol", () => {
  test("parses the three catalogs from one response", () => {
    expect(SHOP_MEDIA_CATALOG_ENDPOINT).toBe("/api/shop/media-catalog");
    expect(
      parseShopMediaCatalog({
        artFrames: {channels: []},
        posters: {posters: []},
        tv: {channels: []},
      }),
    ).toEqual({
      artFrames: {channels: []},
      posters: {posters: []},
      tv: {channels: []},
    });
  });

  test("rejects a partial response", () => {
    expect(() =>
      parseShopMediaCatalog({
        artFrames: {channels: []},
        posters: {posters: []},
      }),
    ).toThrow("TV channel manifest");
  });
});
