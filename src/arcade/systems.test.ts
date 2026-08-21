import {describe, expect, test} from "bun:test";

import {
  ARCADE_ROM_ACCEPT,
  ARCADE_SYSTEMS,
  arcadeFileNameExtension,
  arcadeGameId,
  arcadeSystemSupportsFileName,
  findArcadeSystem,
  guessArcadeSystemByFileName,
} from "~/arcade/systems";

describe("ARCADE_SYSTEMS", () => {
  test("has unique ids and non-empty extension lists", () => {
    const ids = ARCADE_SYSTEMS.map((system) => system.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const system of ARCADE_SYSTEMS) {
      expect(system.extensions.length).toBeGreaterThan(0);
      expect(system.core.length).toBeGreaterThan(0);
    }
  });

  test("every catalog-backed system maps to a libretro content folder", () => {
    for (const system of ARCADE_SYSTEMS)
      if (system.id === "nes" || system.id === "snes" || system.id === "arcade")
        expect(system.contentPath).toBeDefined();
  });
});

describe("findArcadeSystem", () => {
  test("resolves known systems and rejects unknown ones", () => {
    expect(findArcadeSystem("nes")?.shortLabel).toBe("NES");
    expect(findArcadeSystem("segaMD")?.core).toBe("segaMD");
    expect(findArcadeSystem("dreamcast")).toBeUndefined();
  });
});

describe("guessArcadeSystemByFileName", () => {
  test("matches by extension case-insensitively", () => {
    expect(guessArcadeSystemByFileName("Alter Ego.NES")?.id).toBe("nes");
    expect(guessArcadeSystemByFileName("alienar.ZIP")?.id).toBe("arcade");
    expect(guessArcadeSystemByFileName("game.SFC")?.id).toBe("snes");
  });

  test("returns undefined for unknown or missing extensions", () => {
    expect(guessArcadeSystemByFileName("readme.txt")).toBeUndefined();
    expect(guessArcadeSystemByFileName("noextension")).toBeUndefined();
  });
});

describe("arcadeSystemSupportsFileName", () => {
  test("checks the file against one system", () => {
    const nes = findArcadeSystem("nes");
    if (!nes) throw new Error("missing nes system");
    expect(arcadeSystemSupportsFileName(nes, "homebrew.nes")).toBe(true);
    expect(arcadeSystemSupportsFileName(nes, "homebrew.sfc")).toBe(false);
  });

  test("accepts emulator-decompressed archives on every system", () => {
    const gba = findArcadeSystem("gba");
    if (!gba) throw new Error("missing gba system");
    expect(
      arcadeSystemSupportsFileName(gba, "Celeste Classic (v1.0).zip"),
    ).toBe(true);
    expect(arcadeSystemSupportsFileName(gba, "rom.7z")).toBe(true);
    expect(arcadeSystemSupportsFileName(gba, "backup.rar")).toBe(false);
  });
});

describe("arcadeGameId", () => {
  test("is stable for identical inputs", () => {
    expect(arcadeGameId("nes", "Alter Ego.nes")).toBe(
      arcadeGameId("nes", "Alter Ego.nes"),
    );
  });

  test("differs across systems and roms while staying a safe int32", () => {
    const sameDifferentSystem = arcadeGameId("snes", "Alter Ego.nes");
    const differentRom = arcadeGameId("nes", "Spacegulls.nes");
    const base = arcadeGameId("nes", "Alter Ego.nes");
    expect(sameDifferentSystem).not.toBe(base);
    expect(differentRom).not.toBe(base);
    for (const id of [base, sameDifferentSystem, differentRom]) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(2147483647);
    }
  });
});

describe("arcadeFileNameExtension", () => {
  test("extracts lowercase extensions without dots", () => {
    expect(arcadeFileNameExtension("ROM.GB")).toBe("gb");
    expect(arcadeFileNameExtension("archive.tar.gz")).toBe("gz");
    expect(arcadeFileNameExtension("noext")).toBe("");
  });
});

describe("ARCADE_ROM_ACCEPT", () => {
  test("lists every extension as a dotted accept token", () => {
    expect(ARCADE_ROM_ACCEPT.split(",")).toContain(".nes");
    expect(ARCADE_ROM_ACCEPT.split(",")).toContain(".zip");
  });
});
