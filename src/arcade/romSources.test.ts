import {describe, expect, test} from "bun:test";

import {SEED_ROMS, parseLibretroContentListing} from "~/arcade/romSources";

const githubPayload = [
  {
    name: "Alter Ego.nes",
    path: "Nintendo - Nintendo Entertainment System/Alter Ego.nes",
    size: 40976,
    type: "file",
    download_url:
      "https://raw.githubusercontent.com/libretro/libretro-content/master/Nintendo%20-%20Nintendo%20Entertainment%20System/Alter%20Ego.nes",
  },
  {
    name: "NTSC Chroma Luma Crosstalk Test.nes",
    size: 24592,
    type: "file",
    download_url: "https://example.com/test.nes",
  },
  {
    name: "Nested Folder",
    type: "dir",
  },
  {
    name: "broken-entry",
    size: 12,
    type: "file",
  },
] as unknown;

describe("parseLibretroContentListing", () => {
  test("keeps only files with supported extensions", () => {
    const listings = parseLibretroContentListing("nes", githubPayload);
    expect(listings.map((listing) => listing.name)).toEqual([
      "Alter Ego.nes",
      "NTSC Chroma Luma Crosstalk Test.nes",
    ]);
  });

  test("builds stable ids and raw download urls", () => {
    const [listing] = parseLibretroContentListing("nes", githubPayload);
    if (!listing) throw new Error("expected a listing");
    expect(listing.id).toBe(
      "libretro-content:nes:Nintendo - Nintendo Entertainment System/Alter Ego.nes",
    );
    expect(listing.sizeBytes).toBe(40976);
    expect(listing.downloadUrl).toContain("raw.githubusercontent.com");
  });

  test("sorts listings by name", () => {
    const listings = parseLibretroContentListing("nes", githubPayload);
    const names = listings.map((listing) => listing.name);
    expect(names).toEqual([
      "Alter Ego.nes",
      "NTSC Chroma Luma Crosstalk Test.nes",
    ]);
    expect(names[0]?.localeCompare(names[1] ?? "")).toBeLessThan(0);
  });

  test("tolerates malformed payloads", () => {
    expect(parseLibretroContentListing("nes", null)).toEqual([]);
    expect(parseLibretroContentListing("nes", {})).toEqual([]);
    expect(parseLibretroContentListing("nes", [null, 3, "x"])).toEqual([]);
  });
});

describe("SEED_ROMS", () => {
  test("covers the launch systems and points at raw downloads", () => {
    const systemIds = new Set(SEED_ROMS.map((rom) => rom.systemId));
    for (const id of ["nes", "snes", "arcade"] as const)
      expect(systemIds.has(id)).toBe(true);
    for (const rom of SEED_ROMS) {
      expect(rom.id.startsWith(`libretro-content:${rom.systemId}:`)).toBe(true);
      expect(rom.downloadUrl).toContain("raw.githubusercontent.com");
    }
  });
});
