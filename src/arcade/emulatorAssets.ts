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
import {copyFile, cp, mkdir, readFile, readdir} from "node:fs/promises";
import path from "node:path";

// Relative import: this module is also bundled into the Vite config
// middleware, whose loader cannot resolve the "~" alias at runtime.
import {ARCADE_SYSTEMS} from "./systems";

/** Same-origin mount point for the vendored EmulatorJS runtime. */
export const EMULATOR_DATA_URL_PATH = "/api/runtime/emulatorjs/data/";

/**
 * EmulatorJS resolves an `EJS_core` id onto a default libretro core
 * implementation (the first entry of its internal core map). Keyed by the
 * `EJS_core` values used by `ARCADE_SYSTEMS` so dev serving and the
 * production build vendor exactly the packages gameplay needs.
 */
const CORE_PACKAGE_BY_EJS_CORE: Record<string, string> = {
  nes: "fceumm",
  snes: "snes9x",
  arcade: "fbneo",
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

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

export const emulatorDataContentType = (filePath: string): string =>
  CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

/**
 * Resolved absolute file path for `relativePath` beneath
 * {@link EMULATOR_DATA_URL_PATH}, or undefined when no vendored file provides
 * it. Core requests (`cores/...`) are answered from the installed core
 * packages, whose on-disk layout already matches `data/cores/`; everything
 * else maps into the EmulatorJS data directory itself.
 */
const resolveWithinVendoredTree = (nodeModulesDirectory: string, relativePath: string): string | undefined => {
  if (relativePath.length === 0 || relativePath.includes("\0")) return undefined;
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
  const candidate = containedPath(emulatorDataRoot(nodeModulesDirectory), relativePath);
  return candidate && existsSync(candidate) ? candidate : undefined;
};

/**
 * Resolves like {@link resolveWithinVendoredTree}, but falls back to the
 * unminified sibling when a `.min.*` name misses: the npm package ships only
 * the unminified runtime, while loader.js asks for `emulator.min.css` and
 * friends in production mode. The one exception is `emulator.min.js`, which
 * has no single-file equivalent and is bundled by
 * {@link loadEmulatorDataAsset} instead.
 */
export const resolveEmulatorDataFile = (nodeModulesDirectory: string, relativePath: string): string | undefined =>
  resolveWithinVendoredTree(nodeModulesDirectory, relativePath) ??
  resolveWithinVendoredTree(nodeModulesDirectory, relativePath.replace(/\.min(?=\.[^./]+$)/u, ""));

/** Name loader.js uses for the production script bundle. */
export const EMULATOR_MIN_JS_NAME = "emulator.min.js";

/**
 * The sources loader.js concatenates into that bundle, in its own scripts
 * order; we mirror it so serving the unminified set stays boot-compatible.
 */
const MIN_JS_BUNDLE_SOURCES = [
  "emulator.js",
  "nipplejs.js",
  "shaders.js",
  "storage.js",
  "gamepad.js",
  "GameManager.js",
  "socket.io.min.js",
  "compression.js",
] as const;

const JS_CONTENT_TYPE = emulatorDataContentType("bundle.js");

export type EmulatorDataAsset =
  | {
      readonly kind: "file";
      readonly filePath: string;
      readonly contentType: string;
    }
  | {
      readonly kind: "bundle";
      readonly body: Buffer;
      readonly contentType: string;
    };

let minJsBundleCache: Buffer | undefined;

/**
 * Loads the vendored asset for `relativePath`: either the resolved file, or,
 * for {@link EMULATOR_MIN_JS_NAME}, an on-demand concatenation of the
 * unminified sources (cached for the server's lifetime). Undefined when the
 * runtime cannot provide the path.
 */
export const loadEmulatorDataAsset = async (
  nodeModulesDirectory: string,
  relativePath: string,
): Promise<EmulatorDataAsset | undefined> => {
  const filePath = resolveEmulatorDataFile(nodeModulesDirectory, relativePath);
  if (filePath)
    return {
      kind: "file",
      filePath,
      contentType: emulatorDataContentType(filePath),
    };
  if (relativePath !== EMULATOR_MIN_JS_NAME) return undefined;
  minJsBundleCache ??= await buildMinJsBundle(nodeModulesDirectory);
  return (
    minJsBundleCache && {
      kind: "bundle",
      body: minJsBundleCache,
      contentType: JS_CONTENT_TYPE,
    }
  );
};

const buildMinJsBundle = async (nodeModulesDirectory: string): Promise<Buffer | undefined> => {
  // A bare semicolon between files keeps a missing trailing semicolon in one
  // source from swallowing the next file's first statement.
  const separator = Buffer.from("\n;\n");
  const chunks: Buffer[] = [];
  for (const source of MIN_JS_BUNDLE_SOURCES) {
    const sourcePath = resolveEmulatorDataFile(nodeModulesDirectory, `src/${source}`);
    if (!sourcePath) return undefined;
    chunks.push(await readFile(sourcePath), separator);
  }
  return Buffer.concat(chunks);
};

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
        await copyFile(path.join(sourceRoot, entry.name), path.join(targetCoresDirectory, entry.name));
    }
    const reportsSource = path.join(sourceRoot, "reports");
    if (existsSync(reportsSource))
      await cp(reportsSource, path.join(targetCoresDirectory, "reports"), {
        recursive: true,
      });
  }
};
