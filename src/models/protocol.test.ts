import {describe, expect, test} from "bun:test";

import {
  modelMediaUrl,
  parseModelCatalog,
  parseModelMediaRequest,
} from "~/models/protocol";

describe("model protocol", () => {
  test("round-trips nested unicode model IDs", () => {
    const id = "figures/蜘蛛/model.glb";
    expect(parseModelMediaRequest(modelMediaUrl(id))).toEqual({
      id,
      kind: "media",
    });
  });

  test("rejects unsafe model IDs and mismatched URLs", () => {
    expect(parseModelMediaRequest("/api/media/models/not-hex.glb")).toEqual({
      kind: "invalid",
    });
    expect(() =>
      parseModelCatalog({
        models: [
          {id: "../bad.glb", label: "Bad", url: modelMediaUrl("bad.glb")},
        ],
      }),
    ).toThrow();
    expect(() =>
      parseModelCatalog({
        models: [{id: "good.glb", label: "Good", url: "/wrong.glb"}],
      }),
    ).toThrow();
  });
});
