import {describe, expect, test} from "bun:test";

import {
  parsePosterCatalog,
  parsePosterImportResponse,
  parsePosterMediaRequest,
  posterMediaUrl,
} from "~/posters/protocol";

describe("poster protocol", () => {
  test("round-trips nested and escaped poster IDs", () => {
    const id = "seasonal/夏 poster #1.png";
    const url = posterMediaUrl(id);
    expect(parsePosterMediaRequest(url)).toEqual({id, kind: "media"});
    expect(
      parsePosterCatalog({
        posters: [{aspectRatio: 1.5, id, label: "Summer", url}],
      }).posters,
    ).toEqual([{aspectRatio: 1.5, id, label: "Summer", url}]);
    expect(
      parsePosterImportResponse({
        poster: {aspectRatio: 1.5, id, label: "Summer", url},
      }).poster,
    ).toEqual({aspectRatio: 1.5, id, label: "Summer", url});
  });

  test("rejects traversal and catalog URL mismatches", () => {
    expect(parsePosterMediaRequest("/posters/media/not-hex.webp")).toEqual({
      kind: "invalid",
    });
    expect(() =>
      parsePosterCatalog({
        posters: [
          {
            aspectRatio: 1,
            id: "poster.png",
            label: "Poster",
            url: "/wrong",
          },
        ],
      }),
    ).toThrow("invalid");
  });
});
