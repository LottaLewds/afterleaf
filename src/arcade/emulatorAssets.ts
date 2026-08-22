/**
 * Locates the npm-vendored EmulatorJS runtime so the arcade never has to
 * contact cdn.emulatorjs.org.
 *
 * `@emulatorjs/emulatorjs` ships the loader and UI under its `data/`
 * directory, while each libretro core ships as its own
 * `@emulatorjs/core-<name>` package whose `*-wasm.data` builds and
 * `reports/<core>.json` must appear merged under `data/cores/`. EmulatorJS
 * fetches cores from `${EJS_pathtodata}cores/` first and only falls back to
 * its CDN when that misses, so serving this layout same-origin keeps gameplay
 * fully offline. Server-side only (dev middleware + build copy); the client
 * half of the contract is `EMULATORJS_DATA_URL` in `~/arcade/emulatorHost`.
 *
 * Versioning note: core packages depend on `@emulatorjs/emulatorjs: latest`
 * transitively, so package.json overrides pin the whole family to one
 * version; a UI/cores version skew breaks core loading.
 */
import {existsSync} from "node:fs";
import {copyFile, cp, mkdir, readdir} from "node:fs/promises";
import path from "node:path";

// Relative import: this module is also bundled into the Vite config
// middleware, whose loader cannot resolve the "~" alias at runtime.
import {ARCADE_SYSTEMS} from "./systems";

/** Same-origin mount point for the vendored EmulatorJS runtime. */
export const EMULATOR_DATA_URL_PATH = "/emulatorjs/data/";

/**
 * EmulatorJS resolves an `EJS_core` id onto a default libretro core
 * implementation (the first entry of its internal core map). Keyed by the
 * `EJS_core` values used by `ARCADE_SYSTEMS` so dev serving and the
 * production build vendor exactly the packages gameplay needs.
 */
const CORE_PACKAGE_BY_EJS_CORE: Record<string, string> = {
  nes: "fceumm",
  snes: "snes9x",
  mame2003: "mame2003_plus",
  gb: "gambatte",
  gba: "mgba",
  n64: "mupen64plus_next",
  vb: "beetle_vb",
  segaMS: "smsplus",
  segaMD: "genesis_plus_gx",
  segaGG: "genesis_plus_gx",
  pce: "mednafen_pce",
  atari2600: "stella2014",
};

/** Distinct `@emulatorjs/core-<name>` packages the systems registry needs. */
export const requiredEmulatorCorePackages = (): string[] => {
  const packageNames = new Set<string>();
  for (const system of ARCADE_SYSTEMS) {
    const corePackage = CORE_PACKAGE_BY_EJS_CORE[system.core];
    if (!corePackage)
      throw new Error(
        `Arcade system ${system.id} uses EmulatorJS core ${system.core}, which has no vendored package mapping`,
      );
    packageNames.add(corePackage);
  }
  return [...packageNames];
};

const emulatorDataRoot = (nodeModulesDirectory: string) =>
  path.join(nodeModulesDirectory, "@emulatorjs", "emulatorjs", "data");

const corePackageRoot = (nodeModulesDirectory: string, packageName: string) =>
  path.join(nodeModulesDirectory, "@emulatorjs", `core-${packageName}`);

/**
 * Absolute path contained in `root`, or undefined when `candidate` escapes it
 * (traversal, absolute paths, or a bare root request).
 */
const containedPath = (root: string, candidate: string): string | undefined => {
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(root + path.sep)) return undefined;
  return resolved;
};

/**
 * Resolved absolute file path for `relativePath` beneath
 * {@link EMULATOR_DATA_URL_PATH}, or undefined when no vendored file provides
 * it. Core requests (`cores/...`) are answered from the installed core
 * packages, whose on-disk layout already matches `data/cores/`; everything
 * else maps into the EmulatorJS data directory itself.
 */
export const resolveEmulatorDataFile = (
  nodeModulesDirectory: string,
  relativePath: string,
): string | undefined => {
  if (relativePath.length === 0 || relativePath.includes("\0"))
    return undefined;
  if (relativePath.startsWith("cores/")) {
    for (const packageName of requiredEmulatorCorePackages()) {
      const candidate = containedPath(
        corePackageRoot(nodeModulesDirectory, packageName),
        relativePath.slice("cores/".length),
      );
      if (candidate && existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  const candidate = containedPath(
    emulatorDataRoot(nodeModulesDirectory),
    relativePath,
  );
  return candidate && existsSync(candidate) ? candidate : undefined;
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

export const emulatorDataContentType = (filePath: string): string =>
  CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ??
  "application/octet-stream";

/**
 * Copies the vendored EmulatorJS runtime plus every core the systems registry
 * needs into `targetDataDirectory`, producing the same layout the middleware
 * serves so static deploys stay offline too.
 */
export const copyEmulatorDataInto = async (
  nodeModulesDirectory: string,
  targetDataDirectory: string,
): Promise<void> => {
  await cp(emulatorDataRoot(nodeModulesDirectory), targetDataDirectory, {
    recursive: true,
  });
  const targetCoresDirectory = path.join(targetDataDirectory, "cores");
  for (const packageName of requiredEmulatorCorePackages()) {
    const sourceRoot = corePackageRoot(nodeModulesDirectory, packageName);
    await mkdir(targetCoresDirectory, {recursive: true});
    for (const entry of await readdir(sourceRoot, {withFileTypes: true})) {
      if (entry.isFile() && entry.name.endsWith("-wasm.data"))
        await copyFile(
          path.join(sourceRoot, entry.name),
          path.join(targetCoresDirectory, entry.name),
        );
    }
    const reportsSource = path.join(sourceRoot, "reports");
    if (existsSync(reportsSource))
      await cp(reportsSource, path.join(targetCoresDirectory, "reports"), {
        recursive: true,
      });
  }
};
