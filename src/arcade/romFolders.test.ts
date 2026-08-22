import {describe, expect, test} from "bun:test";

import {arcadeFolderRomUrl, listArcadeFolderRoms} from "~/arcade/romFolders";

const jsonResponse = (body: unknown, status = 200) =>
  ({
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  }) as never;

describe("listArcadeFolderRoms", () => {
  test("parses a ready folder listing", async () => {
    let requestedUrl = "";
    const result = await listArcadeFolderRoms("nes", {
      fetcher: (input) => {
        requestedUrl = input;
        return Promise.resolve(
          jsonResponse({
            ok: true,
            path: "/games/roms/nes",
            roms: [
              {name: "Alter Ego.nes", sizeBytes: 262160},
              {malformed: true},
              {name: "LJ65.zip", sizeBytes: "big"},
            ],
          }),
        );
      },
    });

    expect(requestedUrl).toBe("/api/library/roms?system=nes");
    expect(result).toEqual({
      path: "/games/roms/nes",
      roms: [
        {name: "Alter Ego.nes", sizeBytes: 262160},
        {name: "LJ65.zip", sizeBytes: 0},
      ],
      state: "ready",
    });
  });

  test("maps the structured no-folder failure to unconfigured", async () => {
    const result = await listArcadeFolderRoms("snes", {
      fetcher: () =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "no_rom_folder",
                message: "No ROM folder is configured for SNES.",
              },
              ok: false,
            },
            422,
          ),
        ),
    });
    expect(result).toEqual({state: "unconfigured"});
  });

  test("surfaces the server's failure message", async () => {
    await expect(
      listArcadeFolderRoms("gb", {
        fetcher: () =>
          Promise.resolve(
            jsonResponse(
              {
                error: {code: "rom_list_failed", message: "folder vanished"},
                ok: false,
              },
              422,
            ),
          ),
      }),
    ).rejects.toThrow("folder vanished");
  });

  test("throws for unexpected statuses", async () => {
    await expect(
      listArcadeFolderRoms("gba", {
        fetcher: () => Promise.resolve(jsonResponse({ok: false}, 500)),
      }),
    ).rejects.toThrow("Listing the ROM folder failed (500).");
  });
});

describe("arcadeFolderRomUrl", () => {
  test("builds an absolute same-origin file URL with encoded parameters", () => {
    const previousOrigin = globalThis.location?.origin;
    // Emulate a browser origin; the helper must tolerate its absence too.
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {origin: "http://localhost:42069"},
    });
    try {
      expect(arcadeFolderRomUrl("nes", "Alter Ego.nes")).toBe(
        "http://localhost:42069/api/library/roms/file?system=nes&name=Alter%20Ego.nes",
      );
    } finally {
      if (previousOrigin === undefined)
        delete (globalThis as {location?: unknown}).location;
      else
        Object.defineProperty(globalThis, "location", {
          configurable: true,
          value: {origin: previousOrigin},
        });
    }
  });
});
