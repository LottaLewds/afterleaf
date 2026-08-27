import {describe, expect, test} from "bun:test";

import {ART_FRAME_CROSSFADE_SECONDS, artFrameCrossfadeOpacity} from "~/artFrames/transition";

describe("digital art frame transition", () => {
  test("smoothly blends between images within the duration", () => {
    expect(artFrameCrossfadeOpacity(-1)).toBe(0);
    expect(artFrameCrossfadeOpacity(ART_FRAME_CROSSFADE_SECONDS / 2)).toBe(0.5);
    expect(artFrameCrossfadeOpacity(ART_FRAME_CROSSFADE_SECONDS)).toBe(1);
    expect(artFrameCrossfadeOpacity(10)).toBe(1);
  });
});
