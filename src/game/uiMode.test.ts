import {describe, expect, test} from "bun:test";

import {
  deriveUiMode,
  INTERACTION_ROW_MODES,
  type ViewportModeReport,
} from "~/game/uiMode";

const viewportReport = (
  overrides: Partial<ViewportModeReport> = {},
): ViewportModeReport => ({
  arcadeStatus: undefined,
  dialogOpen: false,
  error: false,
  inspectionSpread: false,
  ready: true,
  ...overrides,
});

describe("deriveUiMode", () => {
  test("a ready idle shop walks", () => {
    expect(deriveUiMode(viewportReport(), false)).toBe("walk");
  });

  test("boot holds until the world reports ready", () => {
    expect(deriveUiMode(viewportReport({ready: false}), true)).toBe("boot");
  });

  test("error outranks readiness and the menu", () => {
    expect(deriveUiMode(viewportReport({error: true}), true)).toBe("error");
  });

  test("arcade sessions split into picker and live ownership", () => {
    expect(
      deriveUiMode(viewportReport({arcadeStatus: "browsing"}), false),
    ).toBe("arcade-pick");
    expect(deriveUiMode(viewportReport({arcadeStatus: "playing"}), false)).toBe(
      "arcade-live",
    );
    expect(
      deriveUiMode(viewportReport({arcadeStatus: "downloading"}), true),
    ).toBe("arcade-live");
    expect(
      deriveUiMode(viewportReport({arcadeStatus: "launching"}), false),
    ).toBe("arcade-live");
  });

  test("dialogs outrank book reading and the menu", () => {
    expect(deriveUiMode(viewportReport({dialogOpen: true}), false)).toBe(
      "dialog",
    );
    expect(deriveUiMode(viewportReport({inspectionSpread: true}), false)).toBe(
      "book",
    );
    expect(deriveUiMode(viewportReport(), true)).toBe("menu");
  });

  test("only input-owned surfaces present interaction rows", () => {
    expect([...INTERACTION_ROW_MODES].sort()).toEqual(["arcade-live", "walk"]);
  });
});
