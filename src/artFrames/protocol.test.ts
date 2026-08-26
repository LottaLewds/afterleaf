import {describe, expect, test} from "bun:test";

import {
  ART_FRAME_MEDIA_ENDPOINT_PREFIX,
  artFrameChannelId,
  artFrameMediaUrl,
  isSafeArtFrameChannelId,
  parseArtFrameCatalog,
  parseArtFrameImportResponse,
  parseArtFrameMediaRequest,
} from "~/artFrames/protocol";

const image = {
  aspectRatio: 1.5,
  id: "night-scenes/rain.jpg",
  label: "Rain",
  url: artFrameMediaUrl("night-scenes/rain.jpg"),
};

describe("art frame protocol", () => {
  test("parses channel catalogs and media URLs", () => {
    expect(
      parseArtFrameCatalog({
        channels: [{id: "night-scenes", images: [image], label: "Night Scenes"}],
      }),
    ).toEqual({
      channels: [{id: "night-scenes", images: [image], label: "Night Scenes"}],
    });
    expect(parseArtFrameMediaRequest(image.url)).toEqual({
      id: image.id,
      kind: "media",
    });
    expect(parseArtFrameImportResponse({image}, "night-scenes")).toEqual({
      image,
    });
    expect(artFrameChannelId("  Café After Hours!  ")).toBe("cafe-after-hours");
    expect(isSafeArtFrameChannelId("cafe-after-hours")).toBe(true);
    expect(isSafeArtFrameChannelId("../outside")).toBe(false);
  });

  test("rejects unsafe, misplaced, and duplicate entries", () => {
    expect(() =>
      parseArtFrameCatalog({
        channels: [
          {
            id: "night-scenes",
            images: [{...image, id: "other/rain.jpg"}],
            label: "Night",
          },
        ],
      }),
    ).toThrow("invalid");
    expect(() =>
      parseArtFrameCatalog({
        channels: [
          {id: "night-scenes", images: [image], label: "Night"},
          {id: "night-scenes", images: [image], label: "Again"},
        ],
      }),
    ).toThrow("duplicate channel IDs");
    expect(parseArtFrameMediaRequest(`${ART_FRAME_MEDIA_ENDPOINT_PREFIX}not-hex.webp`)).toEqual({kind: "invalid"});
  });
});
