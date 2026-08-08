import {describe, expect, test} from "bun:test";
import {nhentaiGalleryIdFromText} from "~/content/providers/nhentai/url";

describe("nhentaiGalleryIdFromText", () => {
  test("extracts a gallery ID from pasted text", () => {
    expect(nhentaiGalleryIdFromText("https://nhentai.net/g/12345/")).toBe(
      12345,
    );
    expect(
      nhentaiGalleryIdFromText(
        "Read this: http://www.nhentai.net/g/42?ref=clipboard",
      ),
    ).toBe(42);
  });

  test("rejects lookalike and malformed gallery URLs", () => {
    expect(
      nhentaiGalleryIdFromText("https://evil.test/g/123/"),
    ).toBeUndefined();
    expect(
      nhentaiGalleryIdFromText("https://nhentai.net.evil.test/g/123/"),
    ).toBeUndefined();
    expect(
      nhentaiGalleryIdFromText("https://nhentai.net/g/0/"),
    ).toBeUndefined();
    expect(
      nhentaiGalleryIdFromText("https://nhentai.net/g/nope/"),
    ).toBeUndefined();
    expect(
      nhentaiGalleryIdFromText("https://nhentai.net/g/123/not-a-gallery"),
    ).toBeUndefined();
  });
});
