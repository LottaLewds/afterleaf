import {describe, expect, test} from "bun:test";

import {
  parseTvVideoImportRequest,
  parseTvVideoImportResponse,
  parseTvChannelManifest,
  parseTvMediaRequest,
  tvChannelId,
  tvMediaUrl,
  tvVideoImportUrl,
} from "~/tv/protocol";

describe("TV protocol", () => {
  test("creates stable folder IDs from channel names", () => {
    expect(tvChannelId("  Café After Hours!  ")).toBe("cafe-after-hours");
    expect(tvChannelId("---")).toBe("");
  });

  test("round-trips encoded channel media paths", () => {
    const url = tvMediaUrl("after leaf", "少女A.webm");
    expect(parseTvMediaRequest(url)).toEqual({
      channelId: "after leaf",
      kind: "media",
      videoId: "少女A.webm",
    });
  });

  test("rejects traversal and malformed media paths", () => {
    expect(
      parseTvMediaRequest("/__afterleaf/tv/channels/afterleaf/..%2Fsecret.mp4"),
    ).toEqual({kind: "invalid"});
    expect(
      parseTvMediaRequest("/__afterleaf/tv/channels/afterleaf/nested/file.mp4"),
    ).toEqual({kind: "invalid"});
    expect(parseTvMediaRequest("/unrelated")).toEqual({kind: "unscoped"});
  });

  test("validates channel manifests", () => {
    expect(
      parseTvChannelManifest({
        channels: [
          {
            id: "afterleaf",
            label: "Afterleaf",
            videos: [
              {
                id: "sample.mp4",
                url: "/__afterleaf/tv/channels/afterleaf/sample.mp4",
              },
            ],
          },
        ],
      }).channels[0]?.videos[0]?.id,
    ).toBe("sample.mp4");
    expect(() => parseTvChannelManifest({channels: [{id: "../bad"}]})).toThrow(
      "TV channel 0 is invalid",
    );
  });

  test("validates video URL import messages", () => {
    expect(tvVideoImportUrl(" https://example.com/watch?v=42 ")).toBe(
      "https://example.com/watch?v=42",
    );
    expect(tvVideoImportUrl("file:///tmp/video.mp4")).toBeUndefined();
    expect(
      parseTvVideoImportRequest({
        channelId: "afterleaf",
        url: "https://example.com/watch?v=42",
      }),
    ).toEqual({
      channelId: "afterleaf",
      url: "https://example.com/watch?v=42",
    });
    expect(() =>
      parseTvVideoImportRequest({
        channelId: "../outside",
        url: "https://example.com/video",
      }),
    ).toThrow("invalid");

    const video = {
      id: "sample.mp4",
      url: tvMediaUrl("afterleaf", "sample.mp4"),
    };
    expect(parseTvVideoImportResponse({video}, "afterleaf")).toEqual({video});
  });

  test("validates precomputed active-picture metadata", () => {
    const manifest = {
      channels: [
        {
          id: "afterleaf",
          label: "Afterleaf",
          videos: [
            {
              activePicture: {height: 1, width: 0.75, x: 0.125, y: 0},
              id: "sample.mp4",
              url: "/__afterleaf/tv/channels/afterleaf/sample.mp4",
            },
          ],
        },
      ],
    };
    expect(
      parseTvChannelManifest(manifest).channels[0]?.videos[0]?.activePicture,
    ).toEqual({height: 1, width: 0.75, x: 0.125, y: 0});

    expect(() =>
      parseTvChannelManifest({
        channels: [
          {
            id: "afterleaf",
            label: "Afterleaf",
            videos: [
              {
                activePicture: {height: 1, width: 1.1, x: 0, y: 0},
                id: "sample.mp4",
                url: "/__afterleaf/tv/channels/afterleaf/sample.mp4",
              },
            ],
          },
        ],
      }),
    ).toThrow("active picture is invalid");
  });
});
