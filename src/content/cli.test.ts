import {describe, expect, test} from "bun:test";
import {resolve} from "node:path";
import {parseContentSeedCliOptions} from "~/content/cli";

describe("parseContentSeedCliOptions", () => {
  test("normalizes the requested local seed selection", () => {
    const options = parseContentSeedCliOptions(
      [
        "--catalog",
        "fixtures",
        "--tags",
        "Big Breasts, Comic Magazine",
        "--exclude-tags=Chinese",
        "--languages",
        "en,jp",
        "--match",
        "any",
        "--limit",
        "20",
        "--seed",
        "visual-v1",
        "--out",
        "packs/visual",
        "--dry-run",
      ],
      "/workspace/afterleaf",
    );

    expect(options.catalogDirectory).toBe(
      resolve("/workspace/afterleaf/fixtures"),
    );
    expect(options.seedOptions.tags).toEqual(["big-breasts", "comic-magazine"]);
    expect(options.seedOptions.excludedTags).toEqual(["chinese"]);
    expect(options.seedOptions.languages).toEqual(["english", "japanese"]);
    expect(options.seedOptions.match).toBe("any");
    expect(options.seedOptions.limit).toBe(20);
    expect(options.seedOptions.packId).toBe("visual");
    expect(options.seedOptions.dryRun).toBe(true);
  });

  test("rejects unsupported languages", () => {
    expect(() =>
      parseContentSeedCliOptions(["--languages", "english,chinese"]),
    ).toThrow("expected english or japanese");
  });
});
