import {describe, expect, test} from "bun:test";
import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import path from "node:path";

import {
  copyEmulatorDataInto,
  emulatorDataContentType,
  requiredEmulatorCorePackages,
  resolveEmulatorDataFile,
} from "~/arcade/emulatorAssets";

const nodeModulesDirectory = path.resolve(
  import.meta.dir,
  "../../node_modules",
);

describe("requiredEmulatorCorePackages", () => {
  test("maps each arcade system onto distinct installed core packages", () => {
    const packageNames = requiredEmulatorCorePackages();
    // segaMD and segaGG share genesis_plus_gx; everything else is one-to-one.
    expect(packageNames.length).toBe(11);
    expect(packageNames).toContain("snes9x");
    expect(packageNames).toContain("genesis_plus_gx");
    for (const packageName of packageNames)
      expect(
        existsSync(
          path.join(nodeModulesDirectory, "@emulatorjs", `core-${packageName}`),
        ),
      ).toBe(true);
  });
});

describe("resolveEmulatorDataFile", () => {
  test("serves the loader and UI from the EmulatorJS data directory", () => {
    const filePath = resolveEmulatorDataFile(nodeModulesDirectory, "loader.js");
    expect(
      filePath?.endsWith(
        path.join("@emulatorjs", "emulatorjs", "data", "loader.js"),
      ),
    ).toBe(true);
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "src/emulator.js"),
    )?.toBeTruthy();
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "version.json"),
    )?.toBeTruthy();
  });

  test("merges core builds and reports from the core packages", () => {
    expect(
      resolveEmulatorDataFile(
        nodeModulesDirectory,
        "cores/snes9x-wasm.data",
      )?.includes(path.join("core-snes9x", "snes9x-wasm.data")),
    ).toBe(true);
    expect(
      resolveEmulatorDataFile(
        nodeModulesDirectory,
        "cores/reports/snes9x.json",
      )?.endsWith(path.join("reports", "snes9x.json")),
    ).toBe(true);
  });

  test("rejects traversal and unknown files", () => {
    expect(resolveEmulatorDataFile(nodeModulesDirectory, "")).toBeUndefined();
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "../package.json"),
    ).toBeUndefined();
    expect(
      resolveEmulatorDataFile(
        nodeModulesDirectory,
        "cores/../../afterleaf/package.json",
      ),
    ).toBeUndefined();
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "cores/not-a-core.data"),
    ).toBeUndefined();
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "missing.js"),
    ).toBeUndefined();
    expect(
      resolveEmulatorDataFile(nodeModulesDirectory, "no\0byte.js"),
    ).toBeUndefined();
  });
});

describe("emulatorDataContentType", () => {
  test("types the formats EmulatorJS loads", () => {
    expect(emulatorDataContentType("/x/loader.js")).toContain("javascript");
    expect(emulatorDataContentType("/x/emulator.css")).toContain("css");
    expect(emulatorDataContentType("/x/version.json")).toContain("json");
    // Core builds are opaque blobs fetched as array buffers.
    expect(emulatorDataContentType("/x/snes9x-wasm.data")).toBe(
      "application/octet-stream",
    );
  });
});

describe("copyEmulatorDataInto", () => {
  test("produces the served layout with merged cores", async () => {
    const target = path.resolve(
      import.meta.dir,
      "../../../.tmp-emulator-copy-test/data",
    );
    try {
      await copyEmulatorDataInto(nodeModulesDirectory, target);
      for (const relativePath of [
        "loader.js",
        "src/emulator.js",
        "cores/snes9x-wasm.data",
        "cores/mgba-wasm.data",
        "cores/reports/snes9x.json",
      ])
        expect(existsSync(path.join(target, relativePath))).toBe(true);
      // Only the cores the registry needs get vendored.
      expect(existsSync(path.join(target, "cores/ppsspp-wasm.data"))).toBe(
        false,
      );
    } finally {
      await rm(path.dirname(target), {recursive: true, force: true});
    }
  }, 60_000);
});
