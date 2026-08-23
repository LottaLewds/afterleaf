import tailwindcss from "@tailwindcss/vite";
import {defineConfig, type Plugin} from "vite";
import solid from "vite-plugin-solid";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {mkdir, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import type {IncomingMessage, ServerResponse} from "node:http";
import path from "node:path";

import {
  LIBRARY_BLACKLIST_ENDPOINT,
  LIBRARY_CONFIG_ENDPOINT,
  LIBRARY_BROWSE_ENDPOINT,
  LIBRARY_FETCH_MORE_ENDPOINT,
  LIBRARY_PASTE_RESOLVE_ENDPOINT,
  LIBRARY_PROVIDERS_ENDPOINT,
  LIBRARY_ROMS_ENDPOINT,
  LIBRARY_ROM_FILE_ENDPOINT,
  LIBRARY_SCAN_ENDPOINT,
  LIBRARY_ROOT_ENROLL_ENDPOINT,
  LIBRARY_SOURCE_STATUS_ENDPOINT,
  LIBRARY_STATUS_ENDPOINT,
  MAX_LIBRARY_OPERATION_BODY_BYTES,
  libraryOperationFailure,
  parseLibraryBlacklistRequest,
  parseLibraryFetchMoreRequest,
  parseLibraryJobId,
  parseLibraryPasteResolveHttpResponse,
  parseLibraryPasteResolveRequest,
  parseLibraryScanRequest,
  summarizeLibraryBlacklistListResult,
  summarizeLibraryBlacklistResult,
  summarizeLibrarySnapshotResult,
  type LibraryOperationHttpResponse,
  type LibraryOperationStatusHttpSuccess,
  type LibraryPasteImportMatch,
} from "./src/content/libraryUpdate/httpProtocol";
import {
  arcadeSystemSupportsFileName,
  findArcadeSystem,
} from "./src/arcade/systems";
import {
  EMULATOR_DATA_URL_PATH,
  copyEmulatorDataInto,
  loadEmulatorDataAsset,
} from "./src/arcade/emulatorAssets";
import {
  parseActiveLibraryAssetRequest,
  resolveActiveLibraryAssetPath,
  resolveActiveLibraryStorage,
} from "./src/content/libraryUpdate/activeLibraryAssets";
import {parseSparseLibraryPageRequest} from "./src/content/libraryUpdate/activeLibraryRoutes";
import {createLibraryProviderRegistry} from "./src/content/providers/registry";
import {createReaderPageDerivative} from "./src/content/readerImage";
import {ARCHIVE_SOURCE_PROVIDER} from "./src/content/archiveReader";
import {materializeArchiveReaderPage} from "./src/content/archiveSparsePage";
import {
  defaultRomFolderPath,
  readAfterleafLibraryConfig,
  readAfterleafLibraryConfigSync,
  libraryRootContainsMedia,
  reenrollLibraryRootPath,
  writeAfterleafLibraryConfig,
  unavailableLibraryPaths,
} from "./src/content/libraryConfig";
import {
  artFramesDirectory as artFramesDirectoryFor,
  ensureDataRootStructure,
  libraryPackDirectory,
  libraryRootRegistryPath,
  resolveDataRoot,
  modelsDirectory as modelsDirectoryFor,
  postersDirectory as postersDirectoryFor,
  providersDirectory,
  tvChannelsDirectory as tvChannelsDirectoryFor,
  worldSaveBackupsDirectory as worldSaveBackupsDirectoryFor,
  worldSavePath as worldSavePathFor,
} from "./src/content/dataRoot";
import type {PackedPublication} from "./src/content/schema";
import {createCachedTvVideoAnalyzer} from "./src/tv/channelAnalysis";
import {
  discoverTvChannels,
  resolveTvVideoPath,
  tvVideoContentType,
} from "./src/tv/channelCatalog";
import {constrainByteRangeLength, parseByteRange} from "./src/tv/httpRange";
import {
  parseTvMediaRequest,
  parseTvVideoImportRequest,
  tvMediaUrl,
  TV_CHANNELS_ENDPOINT,
  TV_IMPORT_ENDPOINT,
} from "./src/tv/protocol";
import {
  importTvVideoToChannel,
  TvVideoImportInputError,
} from "./src/tv/videoImport";
import {
  discoverPosters,
  importPosterImage,
  renderPoster,
  resolvePosterPath,
} from "./src/posters/catalog";
import {createPosterImageDerivative} from "./src/posters/image";
import {
  parsePosterMediaRequest,
  posterMediaUrl,
  MAX_POSTER_IMPORT_BODY_BYTES,
  POSTER_CATALOG_ENDPOINT,
  POSTER_IMPORT_ENDPOINT,
} from "./src/posters/protocol";
import {
  discoverArtFrameChannels,
  importArtFrameImage,
  renderArtFrameImage,
  resolveArtFrameImagePath,
} from "./src/artFrames/catalog";
import {
  artFrameMediaUrl,
  ART_FRAME_CATALOG_ENDPOINT,
  ART_FRAME_IMPORT_ENDPOINT,
  isSafeArtFrameChannelId,
  MAX_ART_FRAME_IMPORT_BODY_BYTES,
  parseArtFrameMediaRequest,
} from "./src/artFrames/protocol";
import {createArtFrameImageDerivative} from "./src/artFrames/image";
import {parseWorldSave, type WorldSaveV1} from "./src/game/worldSave";
import {SHOP_MEDIA_CATALOG_ENDPOINT} from "./src/game/shopMediaCatalogHttp";
import {discoverModels, resolveModelPath} from "./src/models/catalog";
import {prepareModelForThree} from "./src/models/compatibility";
import {modelMediaUrl, parseModelMediaRequest} from "./src/models/protocol";
import {
  MAX_WORLD_SAVE_BODY_BYTES,
  WORLD_SAVE_ENDPOINT,
  WORLD_SAVE_SERVER_INSTANCE_HEADER,
} from "./src/game/worldSaveHttp";
import {
  loadWorldSaveFile,
  MISSING_WORLD_SAVE_REVISION,
  pruneWorldStateBackups,
  saveWorldSaveFile,
  saveWorldStateBackup,
  worldSaveRevision,
} from "./src/game/worldSaveServer";

const MAX_TV_MEDIA_RANGE_BYTES = 8 * 1024 * 1024;
/** Upper bound on entries returned by the ROM folder listing endpoint. */
const MAX_ROM_LISTING_ENTRIES = 2_000;
const libraryDirectory = libraryPackDirectory(import.meta.dirname);
const acquisitionDirectory = providersDirectory(import.meta.dirname);
// Everything under the unified data root is served through custom
// middleware or generated, so Vite never needs to watch it.
const generatedLibraryDirectories = [resolveDataRoot(import.meta.dirname)];
const ignoreGeneratedLibraryPath = (filePath: string) =>
  generatedLibraryDirectories.some((directory) => {
    const relativePath = path.relative(directory, path.resolve(filePath));
    return (
      relativePath === "" ||
      (relativePath !== ".." &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath))
    );
  });
const configuredLibraryPaths = readAfterleafLibraryConfigSync(
  import.meta.dirname,
);
const uniquePaths = (paths: readonly string[]) => [...new Set(paths)];
const availableWindowsDrives = () => {
  if (process.platform !== "win32") return [];
  return Array.from({length: 26}, (_, index) => {
    const name = `${String.fromCharCode(65 + index)}:`;
    return {name, path: `${name}\\`};
  }).filter((drive) => existsSync(drive.path));
};
const tvChannelsDirectory = tvChannelsDirectoryFor(import.meta.dirname);
const tvChannelsDirectories = async () =>
  uniquePaths([
    tvChannelsDirectory,
    ...(await readAfterleafLibraryConfig(import.meta.dirname)).tvChannelPaths,
  ]);
const tvVideoAnalyzer = createCachedTvVideoAnalyzer({
  cachePath: path.resolve(tvChannelsDirectory, ".afterleaf-tv-analysis.json"),
  onError: (filePath, error) =>
    console.warn(`[afterleaf] Could not analyze TV video ${filePath}`, error),
});
const postersDirectory = postersDirectoryFor(import.meta.dirname);
const posterDerivativeCacheDirectory = path.resolve(
  postersDirectory,
  ".afterleaf-cache",
);
const postersDirectories = async () =>
  uniquePaths([
    postersDirectory,
    ...(await readAfterleafLibraryConfig(import.meta.dirname)).posterPaths,
  ]);
const artFramesDirectory = artFramesDirectoryFor(import.meta.dirname);
const artFrameDerivativeCacheDirectory = path.resolve(
  artFramesDirectory,
  ".afterleaf-cache",
);
const artFramesDirectories = async () =>
  uniquePaths([
    artFramesDirectory,
    ...(await readAfterleafLibraryConfig(import.meta.dirname)).artFramePaths,
  ]);
const modelsDirectory = modelsDirectoryFor(import.meta.dirname);
const modelCompatibilityCacheDirectory = path.resolve(
  modelsDirectory,
  ".afterleaf-cache",
);
const worldSavePath = worldSavePathFor(import.meta.dirname);
const worldStateBackupDirectory = worldSaveBackupsDirectoryFor(
  import.meta.dirname,
);
const WORLD_STATE_BACKUP_INTERVAL_MS = 15 * 60 * 1_000;
const WORLD_STATE_BACKUP_RETENTION_COUNT = 96;
const worldSaveServerInstanceId = randomUUID();

const readBoundedWorldSaveBody = (request: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_WORLD_SAVE_BODY_BYTES
    ) {
      request.resume();
      reject(new Error("World save request body is empty or too large"));
      return;
    }
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      byteLength += chunk.byteLength;
      if (byteLength <= MAX_WORLD_SAVE_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      rejected = true;
      reject(new Error("World save request body is too large"));
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        reject(new Error("World save request body must be valid JSON"));
      }
    });
    request.on("error", () => {
      if (rejected) return;
      rejected = true;
      reject(new Error("World save request body could not be read"));
    });
  });

const configuredBookPaths = [
  ...configuredLibraryPaths.comicPaths,
  ...configuredLibraryPaths.mangaPaths,
  ...(configuredLibraryPaths.mediaPaths ?? []),
];
const unavailableBookPathsAtStartup = await unavailableLibraryPaths(
  configuredBookPaths,
  libraryRootRegistryPath(import.meta.dirname),
);
if (unavailableBookPathsAtStartup.length > 0)
  console.warn(
    `\x1b[31m[afterleaf] ${unavailableBookPathsAtStartup.length} configured book ${unavailableBookPathsAtStartup.length === 1 ? "path is" : "paths are"} unavailable. Library scans are locked to protect the current catalog:\n${unavailableBookPathsAtStartup.join("\n")}\x1b[0m`,
  );

const libraryProviderRegistry = createLibraryProviderRegistry({
  rootDirectory: import.meta.dirname,
});

let cachedIndexModifiedAt = -1;
let cachedLibraryLocation:
  | {assetDirectory: string; catalogDirectory: string}
  | undefined;
let cachedSnapshotId: string | undefined;
let activeLibraryFailureKey: string | undefined;
let loggedActiveSnapshotId: string | undefined;

const reportActiveLibraryFailure = (
  key: string,
  message: string,
  error?: unknown,
) => {
  if (activeLibraryFailureKey === key) return;
  activeLibraryFailureKey = key;
  if (error === undefined) console.warn(`[afterleaf] ${message}`);
  else console.warn(`[afterleaf] ${message}`, error);
};

const reportActiveLibraryAvailable = (
  snapshotId: string,
  catalogPath: string,
  publicationCount: number,
) => {
  if (activeLibraryFailureKey !== undefined)
    console.info(
      `[afterleaf] Active library recovered with snapshot ${snapshotId}`,
    );
  activeLibraryFailureKey = undefined;
  if (loggedActiveSnapshotId === snapshotId) return;
  loggedActiveSnapshotId = snapshotId;
  console.info(
    `[afterleaf] Active library snapshot ${snapshotId}: ${publicationCount} catalogued books (${catalogPath})`,
  );
};

const activeLibraryLocation = () => {
  const indexPath = path.resolve(libraryDirectory, "index.json");
  try {
    const modifiedAt = statSync(indexPath).mtimeMs;
    if (modifiedAt === cachedIndexModifiedAt) return cachedLibraryLocation;
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as unknown;
    cachedIndexModifiedAt = modifiedAt;
    const location = resolveActiveLibraryStorage(libraryDirectory, index);
    if (!location) {
      cachedLibraryLocation = undefined;
      cachedSnapshotId = undefined;
      reportActiveLibraryFailure(
        "invalid-index",
        `Library index does not identify a valid active snapshot (${indexPath})`,
      );
      return undefined;
    }
    const catalogPath = path.resolve(location.catalogDirectory, "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      publications?: unknown;
    };
    if (!Array.isArray(catalog.publications)) {
      cachedLibraryLocation = undefined;
      cachedSnapshotId = undefined;
      reportActiveLibraryFailure(
        `invalid-catalog:${location.revisionId}`,
        `Active library catalog does not contain a publications array (${catalogPath})`,
      );
      return undefined;
    }
    cachedLibraryLocation = {
      assetDirectory: location.assetDirectory,
      catalogDirectory: location.catalogDirectory,
    };
    cachedSnapshotId = location.revisionId;
    reportActiveLibraryAvailable(
      location.revisionId,
      catalogPath,
      catalog.publications.length,
    );
    return cachedLibraryLocation;
  } catch (error) {
    cachedIndexModifiedAt = -1;
    cachedLibraryLocation = undefined;
    cachedSnapshotId = undefined;
    reportActiveLibraryFailure(
      "library-read-failed",
      `Could not read the active library index or catalog (${indexPath})`,
      error,
    );
    return undefined;
  }
};

const activeSnapshotDirectory = () => activeLibraryLocation()?.catalogDirectory;

const requestLibraryLocation = () =>
  explicitPublicDirectory
    ? {
        assetDirectory: explicitPublicDirectory,
        catalogDirectory: explicitPublicDirectory,
      }
    : activeLibraryLocation();

const requestedPack = process.env.AFTERLEAF_CONTENT_PACK;
const contentPackDirectory = requestedPack
  ? path.resolve(import.meta.dirname, requestedPack)
  : undefined;
const explicitPublicDirectory =
  contentPackDirectory &&
  existsSync(path.resolve(contentPackDirectory, "catalog.json"))
    ? contentPackDirectory
    : undefined;
const publicDirectoryForCommand = (command: "build" | "serve") =>
  explicitPublicDirectory ??
  (command === "serve" ? (activeSnapshotDirectory() ?? false) : false);

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

class LibraryUpdateBridgeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "LibraryUpdateBridgeError";
    this.code = code;
    this.status = status;
  }
}

const sendJson = (
  response: ServerResponse,
  status: number,
  body: LibraryOperationHttpResponse,
) => {
  if (!response.headersSent) {
    response.statusCode = status;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  response.end(JSON.stringify(body));
};

const libraryOperationLogLabel = (operation: LocalLibraryOperation) =>
  operation.kind === "fetch-more"
    ? `fetch-more (${operation.providerId ?? "nhentai"}; new books: ${operation.limit ?? 20}, search pages: ${operation.maxSearchPages ?? 10}, query: ${JSON.stringify(operation.query ?? "")}, blocked tags: ${operation.blockedTags?.length ?? 0})`
    : operation.kind;

const isLoopbackHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const matchingRequestOrigin = (request: IncomingMessage) => {
  if (request.headers["sec-fetch-site"] !== "same-origin") return false;
  const host = request.headers.host;
  const source =
    request.headers.origin ??
    (request.method === "GET" || request.method === "HEAD"
      ? request.headers.referer
      : undefined);
  if (!host || typeof source !== "string") return false;
  try {
    const originUrl = new URL(source);
    const encrypted = Boolean(
      (request.socket as typeof request.socket & {encrypted?: boolean})
        .encrypted,
    );
    if (
      originUrl.host.toLowerCase() !== host.toLowerCase() ||
      originUrl.protocol !== (encrypted ? "https:" : "http:")
    )
      return false;
    return originUrl;
  } catch {
    return false;
  }
};

const hasMatchingOrigin = (request: IncomingMessage) =>
  matchingRequestOrigin(request) !== false;

const hasSameOrigin = (request: IncomingMessage) => {
  const origin = matchingRequestOrigin(request);
  return origin !== false && isLoopbackHostname(origin.hostname);
};

const worldSaveCatalogLabel = (save: WorldSaveV1) => {
  const catalog = save.catalog;
  if (!catalog) return "catalog unknown";
  return `${catalog.packId}@${catalog.snapshotId ?? catalog.catalogContentHash}`;
};

const worldSaveBookDropWarning = (
  previousSave: WorldSaveV1 | undefined,
  nextSave: WorldSaveV1,
) => {
  if (!previousSave || nextSave.books.length >= previousSave.books.length)
    return;
  const removedCount = previousSave.books.length - nextSave.books.length;
  const droppedToEmpty = nextSave.books.length === 0;
  const largeDrop =
    removedCount >= 10 &&
    nextSave.books.length <= Math.floor(previousSave.books.length * 0.75);
  if (!droppedToEmpty && !largeDrop) return;
  return `[afterleaf] Suspicious world-save book drop: ${previousSave.books.length} -> ${nextSave.books.length} (${removedCount} removed); ${worldSaveCatalogLabel(previousSave)} -> ${worldSaveCatalogLabel(nextSave)}; savedAt ${previousSave.savedAt} -> ${nextSave.savedAt}`;
};

const serveWorldSave = (() => {
  let writeQueue = Promise.resolve();
  let lastBackupAt = 0;

  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
    } catch {
      return next();
    }
    if (pathname !== WORLD_SAVE_ENDPOINT) return next();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      WORLD_SAVE_SERVER_INSTANCE_HEADER,
      worldSaveServerInstanceId,
    );
    if (!hasMatchingOrigin(request)) {
      response.statusCode = 403;
      return response.end();
    }
    if (request.method === "GET") {
      try {
        const save = await loadWorldSaveFile(worldSavePath);
        if (!save) {
          response.statusCode = 404;
          response.setHeader("ETag", MISSING_WORLD_SAVE_REVISION);
          return response.end();
        }
        response.statusCode = 200;
        response.setHeader("ETag", worldSaveRevision(save));
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        return response.end(JSON.stringify(save));
      } catch (error) {
        console.error("[afterleaf] Could not read the world save", error);
        response.statusCode = 500;
        return response.end("The shared world save could not be read");
      }
    }
    if (request.method !== "PUT") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, PUT");
      return response.end();
    }
    const requestServerInstanceId =
      request.headers[WORLD_SAVE_SERVER_INSTANCE_HEADER.toLowerCase()];
    if (requestServerInstanceId !== worldSaveServerInstanceId) {
      console.warn(
        `[afterleaf] Rejected a stale world-save upload from an earlier server instance; expected ${worldSaveServerInstanceId}, received ${typeof requestServerInstanceId === "string" ? requestServerInstanceId : "none"}`,
      );
      response.statusCode = 409;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(
        "World save belongs to an earlier server instance; reload before saving",
      );
    }
    const requestRevision = request.headers["if-match"];
    if (typeof requestRevision !== "string") {
      console.warn(
        "[afterleaf] Rejected a world-save upload without an If-Match revision",
      );
      response.statusCode = 428;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(
        "World-save uploads require a revision; reload before saving",
      );
    }
    let save: WorldSaveV1;
    try {
      save = parseWorldSave(await readBoundedWorldSaveBody(request));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "World save upload failed";
      console.warn(`[afterleaf] Rejected a world-save upload: ${message}`);
      response.statusCode = message.includes("too large") ? 413 : 422;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(message);
    }
    try {
      const pendingWrite = writeQueue.then(async () => {
        const previousSave = await loadWorldSaveFile(worldSavePath);
        const previousRevision = worldSaveRevision(previousSave);
        if (requestRevision !== previousRevision)
          return {kind: "conflict" as const, revision: previousRevision};
        const dropWarning = worldSaveBookDropWarning(previousSave, save);
        const now = Date.now();
        if (
          previousSave &&
          (dropWarning || now - lastBackupAt >= WORLD_STATE_BACKUP_INTERVAL_MS)
        ) {
          const backupCreatedAt = new Date(Math.max(now, lastBackupAt + 1));
          const backupPath = await saveWorldStateBackup(
            worldStateBackupDirectory,
            previousSave,
            backupCreatedAt,
          );
          lastBackupAt = backupCreatedAt.valueOf();
          console.info(`[afterleaf] Backed up world state to ${backupPath}`);
          try {
            const prunedCount = await pruneWorldStateBackups(
              worldStateBackupDirectory,
              WORLD_STATE_BACKUP_RETENTION_COUNT,
            );
            if (prunedCount > 0)
              console.info(
                `[afterleaf] Pruned ${prunedCount} old world-state ${prunedCount === 1 ? "backup" : "backups"}`,
              );
          } catch (error) {
            console.warn(
              "[afterleaf] Could not prune old world-state backups",
              error,
            );
          }
        }
        await saveWorldSaveFile(worldSavePath, save);
        if (dropWarning) console.warn(dropWarning);
        return {kind: "saved" as const, revision: worldSaveRevision(save)};
      });
      writeQueue = pendingWrite.catch(() => {});
      const result = await pendingWrite;
      response.setHeader("ETag", result.revision);
      if (result.kind === "conflict") {
        console.warn(
          `[afterleaf] Rejected a stale world-save revision; expected ${result.revision}, received ${requestRevision}`,
        );
        response.statusCode = 412;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        return response.end(
          "World save changed after this tab loaded it; reload before saving",
        );
      }
      response.statusCode = 204;
      return response.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "World save write failed";
      console.error(`[afterleaf] Could not persist the world save: ${message}`);
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end("The shared world save could not be written");
    }
  };
})();

const devServerUrlFile = path.resolve(
  import.meta.dirname,
  ".afterleaf-dev-url",
);

const devServerDiscoveryPlugin = (): Plugin => ({
  name: "afterleaf-dev-server-discovery",
  configureServer(server) {
    const httpServer = server.httpServer;
    if (!httpServer) return;
    httpServer.once("listening", () => {
      const address = httpServer.address();
      if (!address || typeof address === "string") return;
      const url = `http://localhost:${address.port}`;
      void writeFile(
        devServerUrlFile,
        `${url}
`,
      ).catch((error: unknown) =>
        console.warn(
          "[afterleaf] Could not publish the development URL",
          error,
        ),
      );
    });
    httpServer.once("close", () => {
      void rm(devServerUrlFile, {force: true}).catch((error: unknown) =>
        console.warn("[afterleaf] Could not remove the development URL", error),
      );
    });
  },
});

const worldSavePlugin = (): Plugin => ({
  name: "afterleaf-world-save",
  configureServer(server) {
    server.middlewares.use(serveWorldSave);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveWorldSave);
  },
});

const readBoundedJsonBody = (request: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_LIBRARY_OPERATION_BODY_BYTES
    ) {
      request.resume();
      reject(
        new LibraryUpdateBridgeError(
          "Library update request body is too large",
          "request_too_large",
          413,
        ),
      );
      return;
    }

    const chunks: Buffer[] = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      byteLength += chunk.byteLength;
      if (byteLength <= MAX_LIBRARY_OPERATION_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      rejected = true;
      reject(
        new LibraryUpdateBridgeError(
          "Library update request body is too large",
          "request_too_large",
          413,
        ),
      );
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        reject(
          new LibraryUpdateBridgeError(
            "Library update request body must be valid JSON",
            "invalid_request",
            400,
          ),
        );
      }
    });
    request.on("error", () => {
      if (rejected) return;
      rejected = true;
      reject(
        new LibraryUpdateBridgeError(
          "Library update request could not be read",
          "invalid_request",
          400,
        ),
      );
    });
  });

type LocalLibraryOperation =
  | {kind: "blacklist"; publicationId: string}
  | {kind: "blacklist-list"}
  | {
      blockedTags?: readonly string[];
      kind: "fetch-more";
      limit?: number;
      maxSearchPages?: number;
      providerId?: string;
      query?: string;
    }
  | {
      kind: "scan";
      redownloadProviderAssets?: boolean;
      repair?: boolean;
      repairProviderMetadata?: boolean;
    };

const libraryOperationArguments = (operation: LocalLibraryOperation) => {
  if (operation.kind === "scan")
    return [
      "run",
      "library:scan",
      "--write",
      ...(operation.redownloadProviderAssets
        ? ["--redownload-provider-assets"]
        : []),
      ...(operation.repair ? ["--repair"] : []),
      ...(operation.repairProviderMetadata
        ? ["--repair-provider-metadata"]
        : []),
    ];
  if (operation.kind === "blacklist-list")
    return ["run", "library:blacklist", "--list"];
  if (operation.kind === "blacklist")
    return [
      "run",
      "library:blacklist",
      "--publication-id",
      operation.publicationId,
      "--discard-managed-sources",
    ];

  const arguments_ = ["run", "library:fetch-more", "--write"];
  if (operation.providerId) arguments_.push("--provider", operation.providerId);
  if (operation.limit !== undefined)
    arguments_.push("--limit", String(operation.limit));
  if (operation.maxSearchPages !== undefined)
    arguments_.push("--max-search-pages", String(operation.maxSearchPages));
  if (operation.query) arguments_.push("--query", operation.query);
  if (operation.blockedTags?.length)
    arguments_.push(
      "--blocked-tags-json",
      JSON.stringify(operation.blockedTags),
    );
  return arguments_;
};

type LibraryCommandProgress = {
  completedSteps: number;
  message: string;
  totalSteps: number;
};

const runLibraryOperationCommand = (
  operation: LocalLibraryOperation,
  onProgress?: (progress: LibraryCommandProgress) => void,
) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("bun", libraryOperationArguments(operation), {
      cwd: import.meta.dirname,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputExceeded = false;
    let progressBuffer = "";

    const capture = (target: Buffer[], chunk: Buffer, currentBytes: number) => {
      const nextBytes = currentBytes + chunk.byteLength;
      if (nextBytes > MAX_COMMAND_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGTERM");
        return nextBytes;
      }
      target.push(chunk);
      return nextBytes;
    };

    const captureErrorLine = (line: string) => {
      stderrBytes = capture(
        stderr,
        Buffer.from(`${line}\n`, "utf8"),
        stderrBytes,
      );
    };

    const readProgressLines = (flush = false) => {
      const lines = progressBuffer.split("\n");
      progressBuffer = flush ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const match = line.trim().match(/^\[(\d+)\/(\d+)\]\s+(.+)$/u);
        if (!match) {
          captureErrorLine(line);
          continue;
        }
        const completedSteps = Number(match[1]);
        const totalSteps = Number(match[2]);
        const message = match[3];
        if (
          !message ||
          !Number.isSafeInteger(completedSteps) ||
          !Number.isSafeInteger(totalSteps) ||
          completedSteps < 0 ||
          totalSteps <= 0 ||
          completedSteps > totalSteps
        ) {
          captureErrorLine(line);
          continue;
        }
        onProgress?.({completedSteps, message, totalSteps});
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes = capture(stdout, chunk, stdoutBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      progressBuffer += chunk.toString("utf8");
      if (Buffer.byteLength(progressBuffer) > MAX_COMMAND_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      readProgressLines();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code, signal) => {
      if (progressBuffer) {
        progressBuffer += "\n";
        readProgressLines(true);
      }
      if (outputExceeded) {
        reject(
          new LibraryUpdateBridgeError(
            "Library operation command produced too much output",
            "command_output_limit",
            500,
          ),
        );
        return;
      }
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new LibraryUpdateBridgeError(
            detail ||
              `Library operation command stopped${signal ? ` with ${signal}` : ""}`,
            "operation_failed",
            500,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

const summarizeCommandResult = (
  value: unknown,
  operation: LocalLibraryOperation,
) => {
  if (operation.kind === "scan" || operation.kind === "fetch-more")
    return summarizeLibrarySnapshotResult(value, operation.kind);
  if (operation.kind === "blacklist")
    return summarizeLibraryBlacklistResult(value);
  return summarizeLibraryBlacklistListResult(value);
};

const localLibraryOperationsPlugin = (): Plugin => ({
  name: "afterleaf-local-library-update",
  configureServer(server) {
    let operationRunning = false;
    const operationJobs = new Map<string, LibraryOperationStatusHttpSuccess>();
    server.middlewares.use(async (request, response, next) => {
      let requestUrl: URL;
      try {
        requestUrl = new URL(request.url ?? "/", "http://afterleaf.local");
      } catch {
        return next();
      }
      const {pathname} = requestUrl;
      if (
        pathname !== LIBRARY_SCAN_ENDPOINT &&
        pathname !== LIBRARY_FETCH_MORE_ENDPOINT &&
        pathname !== LIBRARY_PASTE_RESOLVE_ENDPOINT &&
        pathname !== LIBRARY_PROVIDERS_ENDPOINT &&
        pathname !== LIBRARY_BLACKLIST_ENDPOINT &&
        pathname !== LIBRARY_SOURCE_STATUS_ENDPOINT &&
        pathname !== LIBRARY_ROOT_ENROLL_ENDPOINT &&
        pathname !== LIBRARY_CONFIG_ENDPOINT &&
        pathname !== LIBRARY_BROWSE_ENDPOINT &&
        pathname !== LIBRARY_ROMS_ENDPOINT &&
        pathname !== LIBRARY_ROM_FILE_ENDPOINT &&
        pathname !== LIBRARY_STATUS_ENDPOINT
      )
        return next();
      if (pathname === LIBRARY_ROOT_ENROLL_ENDPOINT) {
        if (request.method !== "POST" || !hasSameOrigin(request)) {
          sendJson(
            response,
            request.method === "POST" ? 403 : 405,
            libraryOperationFailure(
              request.method === "POST"
                ? "forbidden_origin"
                : "method_not_allowed",
              "Library root enrollment requires a same-origin POST request",
            ),
          );
          return;
        }
        try {
          const body = await readBoundedJsonBody(request);
          const requestedPath =
            body &&
            typeof body === "object" &&
            !Array.isArray(body) &&
            "path" in body &&
            typeof body.path === "string"
              ? path.resolve(body.path)
              : undefined;
          if (!requestedPath)
            throw new Error("Library root enrollment requires a path");
          const config = await readAfterleafLibraryConfig(import.meta.dirname);
          const configuredBookPaths = new Set([
            ...config.comicPaths,
            ...config.mangaPaths,
            ...(config.mediaPaths ?? []),
          ]);
          if (!configuredBookPaths.has(requestedPath))
            throw new Error("Only a configured book root can be re-enrolled");
          await reenrollLibraryRootPath(
            requestedPath,
            libraryRootRegistryPath(import.meta.dirname),
          );
          sendJson(response, 200, {ok: true});
        } catch (error) {
          sendJson(
            response,
            422,
            libraryOperationFailure(
              "invalid_config",
              error instanceof Error
                ? error.message
                : "Could not re-enroll library root",
            ),
          );
        }
        return;
      }
      if (pathname === LIBRARY_CONFIG_ENDPOINT) {
        if (!hasSameOrigin(request)) {
          sendJson(
            response,
            403,
            libraryOperationFailure(
              "forbidden_origin",
              "Library configuration requires a same-origin loopback request",
            ),
          );
          return;
        }
        if (request.method === "GET") {
          sendJson(response, 200, {
            ok: true,
            config: await readAfterleafLibraryConfig(import.meta.dirname),
          });
          return;
        }
        if (request.method !== "PUT") {
          response.setHeader("Allow", "GET, PUT");
          sendJson(
            response,
            405,
            libraryOperationFailure(
              "method_not_allowed",
              "Use GET or PUT for library configuration",
            ),
          );
          return;
        }
        try {
          const body = await readBoundedJsonBody(request);
          if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            !("config" in body)
          )
            throw new Error(
              "Library configuration request must contain config",
            );
          const config = await writeAfterleafLibraryConfig(
            import.meta.dirname,
            (body as {config: unknown}).config as Parameters<
              typeof writeAfterleafLibraryConfig
            >[1],
          );
          sendJson(response, 200, {ok: true, config});
        } catch (error) {
          sendJson(
            response,
            422,
            libraryOperationFailure(
              "invalid_config",
              error instanceof Error
                ? error.message
                : "Invalid library configuration",
            ),
          );
        }
        return;
      }
      if (pathname === LIBRARY_BROWSE_ENDPOINT) {
        if (request.method !== "GET" || !hasSameOrigin(request)) {
          response.statusCode = 403;
          return response.end();
        }
        try {
          const requestedPath = requestUrl.searchParams.get("path");
          const directory = requestedPath
            ? path.resolve(requestedPath)
            : import.meta.dirname;
          const entries = (await readdir(directory, {withFileTypes: true}))
            .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
            .sort((left, right) =>
              left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            )
            .slice(0, 500)
            .map((entry) => ({
              name: entry.name,
              path: path.resolve(directory, entry.name),
            }));
          sendJson(response, 200, {
            ok: true,
            path: directory,
            drives: availableWindowsDrives(),
            parent:
              path.dirname(directory) === directory
                ? undefined
                : path.dirname(directory),
            entries,
          });
        } catch (error) {
          sendJson(
            response,
            422,
            libraryOperationFailure(
              "browse_failed",
              error instanceof Error
                ? error.message
                : "Could not read that folder",
            ),
          );
        }
        return;
      }

      // Lists the ROM files for one emulated cabinet system, merging the
      // built-in content/roms/<system> convention folder with any extra
      // folders registered in Options. With neither present the response is a
      // structured failure the picker renders as an Options-menu hint.
      if (pathname === LIBRARY_ROMS_ENDPOINT) {
        if (request.method !== "GET" || !hasSameOrigin(request)) {
          sendJson(
            response,
            request.method === "GET" ? 403 : 405,
            libraryOperationFailure(
              request.method === "GET"
                ? "forbidden_origin"
                : "method_not_allowed",
              "ROM folder listing requires a same-origin GET request",
            ),
          );
          return;
        }
        try {
          const system = findArcadeSystem(
            requestUrl.searchParams.get("system") ?? "",
          );
          if (!system) throw new Error("Unknown emulated system");
          const config = await readAfterleafLibraryConfig(import.meta.dirname);
          const configuredFolders = config.romPaths[system.id] ?? [];
          const defaultFolder = defaultRomFolderPath(
            import.meta.dirname,
            system.id,
          );
          const hasDefaultFolder = existsSync(defaultFolder);
          if (configuredFolders.length === 0 && !hasDefaultFolder) {
            sendJson(
              response,
              422,
              libraryOperationFailure(
                "no_rom_folder",
                `No ROM folder is available for ${system.label}.`,
              ),
            );
            return;
          }
          // The convention folder is optional; registered folders must exist
          // or their readdir failure surfaces as a listing error.
          const foldersToScan = [
            ...(hasDefaultFolder ? [defaultFolder] : []),
            ...configuredFolders,
          ];
          const romByName = new Map<
            string,
            {name: string; sizeBytes: number}
          >();
          const scannedPaths: string[] = [];
          for (const folder of foldersToScan) {
            scannedPaths.push(folder);
            const dirents = await readdir(folder, {withFileTypes: true});
            await Promise.all(
              dirents
                .filter(
                  (entry) =>
                    entry.isFile() &&
                    !entry.isSymbolicLink() &&
                    !entry.name.startsWith(".") &&
                    arcadeSystemSupportsFileName(system, entry.name) &&
                    // Earlier folders win on duplicate file names.
                    !romByName.has(entry.name),
                )
                .map(async (entry) => {
                  try {
                    const romStat = await stat(
                      path.resolve(folder, entry.name),
                    );
                    romByName.set(entry.name, {
                      name: entry.name,
                      sizeBytes: romStat.size,
                    });
                  } catch {
                    return;
                  }
                }),
            );
          }
          const roms = [...romByName.values()]
            .sort((left, right) =>
              left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            )
            .slice(0, MAX_ROM_LISTING_ENTRIES);
          sendJson(response, 200, {ok: true, paths: scannedPaths, roms});
        } catch (error) {
          sendJson(
            response,
            422,
            libraryOperationFailure(
              "rom_list_failed",
              error instanceof Error
                ? error.message
                : "Could not read that ROM folder",
            ),
          );
        }
        return;
      }

      // Streams one ROM file from a system's ROM folders straight into the
      // same-origin emulator iframe. Names are plain file names resolved
      // against each candidate folder in listing order; containment is
      // re-checked after resolving so traversal attempts can never escape.
      // HEAD must succeed alongside GET because EmulatorJS probes every
      // game URL that way before deciding whether to download it.
      if (pathname === LIBRARY_ROM_FILE_ENDPOINT) {
        if (
          (request.method !== "GET" && request.method !== "HEAD") ||
          !hasSameOrigin(request)
        ) {
          sendJson(
            response,
            request.method === "GET" || request.method === "HEAD" ? 403 : 405,
            libraryOperationFailure(
              request.method === "GET" || request.method === "HEAD"
                ? "forbidden_origin"
                : "method_not_allowed",
              "ROM files are served to same-origin GET and HEAD requests only",
            ),
          );
          return;
        }
        try {
          const system = findArcadeSystem(
            requestUrl.searchParams.get("system") ?? "",
          );
          const requestedName = requestUrl.searchParams.get("name") ?? "";
          if (
            !system ||
            requestedName.length === 0 ||
            requestedName.includes("/") ||
            requestedName.includes("\\") ||
            requestedName.includes("\0")
          )
            throw new Error("That ROM could not be identified");
          if (!arcadeSystemSupportsFileName(system, requestedName))
            throw new Error("That file cannot run on this system");
          const config = await readAfterleafLibraryConfig(import.meta.dirname);
          const candidateFolders = [
            defaultRomFolderPath(import.meta.dirname, system.id),
            ...(config.romPaths[system.id] ?? []),
          ];
          let romPath: string | undefined;
          let romSizeBytes = 0;
          for (const folder of candidateFolders) {
            const candidate = path.resolve(folder, requestedName);
            if (
              candidate !== folder &&
              !candidate.startsWith(folder + path.sep)
            )
              throw new Error("That ROM is outside its configured folder");
            try {
              const candidateStat = await stat(candidate);
              if (!candidateStat.isFile()) continue;
              romPath = candidate;
              romSizeBytes = candidateStat.size;
              break;
            } catch (error) {
              // Not in this folder; try the next candidate.
              if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
              throw error;
            }
          }
          if (!romPath) throw new Error("That ROM could not be found");
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Content-Length", String(romSizeBytes));
          response.setHeader("Cache-Control", "no-store");
          // The HEAD probe answers with metadata only; EmulatorJS reads the
          // declared content-length for its cache check and re-requests with
          // GET when it actually needs the bytes.
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          const romStream = createReadStream(romPath);
          romStream.on("error", () => {
            response.destroy();
          });
          romStream.pipe(response);
        } catch (error) {
          sendJson(
            response,
            422,
            libraryOperationFailure(
              "rom_file_failed",
              error instanceof Error
                ? error.message
                : "Could not read that ROM",
            ),
          );
        }
        return;
      }

      if (pathname === LIBRARY_SOURCE_STATUS_ENDPOINT) {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          sendJson(
            response,
            405,
            libraryOperationFailure(
              "method_not_allowed",
              "Use GET for library source status",
            ),
          );
          return;
        }
        if (!hasSameOrigin(request)) {
          sendJson(
            response,
            403,
            libraryOperationFailure(
              "forbidden_origin",
              "Library source status requires a same-origin loopback request",
            ),
          );
          return;
        }
        const currentLibraryPaths = await readAfterleafLibraryConfig(
          import.meta.dirname,
        );
        const currentBookPaths = [
          ...currentLibraryPaths.comicPaths,
          ...currentLibraryPaths.mangaPaths,
          ...(currentLibraryPaths.mediaPaths ?? []),
        ];
        const unavailableBookPaths = await unavailableLibraryPaths(
          currentBookPaths,
          libraryRootRegistryPath(import.meta.dirname),
        );
        const reenrollableBookPaths = (
          await Promise.all(
            unavailableBookPaths.map(async (bookPath) =>
              (await libraryRootContainsMedia(bookPath)) ? bookPath : undefined,
            ),
          )
        ).filter((bookPath) => bookPath !== undefined);
        sendJson(response, 200, {
          ok: true,
          reenrollableBookPaths,
          unavailableBookPathCount: unavailableBookPaths.length,
        });
        return;
      }
      if (pathname === LIBRARY_PROVIDERS_ENDPOINT) {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          sendJson(
            response,
            405,
            libraryOperationFailure(
              "method_not_allowed",
              "Use GET for library providers",
            ),
          );
          return;
        }
        if (!hasSameOrigin(request)) {
          sendJson(
            response,
            403,
            libraryOperationFailure(
              "forbidden_origin",
              "Library provider discovery requires a same-origin loopback request",
            ),
          );
          return;
        }
        sendJson(response, 200, {
          ok: true,
          providers: libraryProviderRegistry.descriptors(),
        });
        return;
      }
      if (pathname === LIBRARY_PASTE_RESOLVE_ENDPOINT) {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          sendJson(
            response,
            405,
            libraryOperationFailure(
              "method_not_allowed",
              "Use POST to resolve pasted library imports",
            ),
          );
          return;
        }
        if (!hasSameOrigin(request)) {
          sendJson(
            response,
            403,
            libraryOperationFailure(
              "forbidden_origin",
              "Paste resolution requires a same-origin loopback request",
            ),
          );
          return;
        }
        try {
          const mediaType = request.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          if (mediaType !== "application/json")
            throw new LibraryUpdateBridgeError(
              "Paste resolution requires application/json",
              "unsupported_media_type",
              415,
            );
          const {text} = parseLibraryPasteResolveRequest(
            await readBoundedJsonBody(request),
          );
          const matches: LibraryPasteImportMatch[] = [];
          for (const descriptor of libraryProviderRegistry.descriptors()) {
            const provider = await libraryProviderRegistry.load(descriptor.id);
            const match = await provider.resolvePastedImport?.(text);
            if (!match) continue;
            const result = parseLibraryPasteResolveHttpResponse({
              match: {
                providerId: descriptor.id,
                ...match,
              },
              ok: true,
            });
            if (result.ok && result.match) matches.push(result.match);
          }
          if (matches.length > 1)
            throw new LibraryUpdateBridgeError(
              "Multiple library providers matched the pasted text",
              "ambiguous_paste",
              409,
            );
          sendJson(
            response,
            200,
            matches[0] ? {match: matches[0], ok: true} : {ok: true},
          );
        } catch (error) {
          const bridgeError =
            error instanceof LibraryUpdateBridgeError
              ? error
              : new LibraryUpdateBridgeError(
                  error instanceof Error
                    ? error.message
                    : "Could not resolve pasted text",
                  "paste_resolution_failed",
                  500,
                );
          sendJson(
            response,
            bridgeError.status,
            libraryOperationFailure(bridgeError.code, bridgeError.message),
          );
        }
        return;
      }
      const statusRequest = pathname === LIBRARY_STATUS_ENDPOINT;
      if (statusRequest) {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          sendJson(
            response,
            405,
            libraryOperationFailure(
              "method_not_allowed",
              "Use GET for library operation status",
            ),
          );
          return;
        }
        if (!hasSameOrigin(request)) {
          sendJson(
            response,
            403,
            libraryOperationFailure(
              "forbidden_origin",
              "Library operations require a same-origin loopback request",
            ),
          );
          return;
        }
        let jobId: string;
        try {
          const jobIds = requestUrl.searchParams.getAll("jobId");
          if (
            jobIds.length !== 1 ||
            [...requestUrl.searchParams.keys()].some((key) => key !== "jobId")
          )
            throw new Error("Library operation status requires one jobId");
          jobId = parseLibraryJobId(jobIds[0]);
        } catch (error) {
          sendJson(
            response,
            400,
            libraryOperationFailure(
              "invalid_request",
              error instanceof Error ? error.message : "Invalid jobId",
            ),
          );
          return;
        }
        const job = operationJobs.get(jobId);
        if (!job) {
          sendJson(
            response,
            404,
            libraryOperationFailure(
              "job_not_found",
              "The library job is unavailable or expired",
            ),
          );
          return;
        }
        sendJson(response, 200, job);
        return;
      }
      const blacklistListRequest =
        pathname === LIBRARY_BLACKLIST_ENDPOINT && request.method === "GET";
      const postRequest = request.method === "POST";
      if (!postRequest && !blacklistListRequest) {
        response.setHeader(
          "Allow",
          pathname === LIBRARY_BLACKLIST_ENDPOINT ? "GET, POST" : "POST",
        );
        sendJson(
          response,
          405,
          libraryOperationFailure(
            "method_not_allowed",
            pathname === LIBRARY_BLACKLIST_ENDPOINT
              ? "Use GET or POST for the blacklist"
              : "Use POST for this library operation",
          ),
        );
        return;
      }
      if (!hasSameOrigin(request)) {
        sendJson(
          response,
          403,
          libraryOperationFailure(
            "forbidden_origin",
            "Library operations require a same-origin loopback request",
          ),
        );
        return;
      }

      let operation: LocalLibraryOperation;
      if (blacklistListRequest) operation = {kind: "blacklist-list"};
      else {
        const mediaType = request.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        if (mediaType !== "application/json") {
          sendJson(
            response,
            415,
            libraryOperationFailure(
              "unsupported_media_type",
              "Library operations require application/json",
            ),
          );
          return;
        }
        try {
          const body = await readBoundedJsonBody(request);
          if (pathname === LIBRARY_SCAN_ENDPOINT) {
            const scanRequest = parseLibraryScanRequest(body);
            operation = {
              kind: "scan",
              ...(scanRequest.redownloadProviderAssets === undefined
                ? {}
                : {
                    redownloadProviderAssets:
                      scanRequest.redownloadProviderAssets,
                  }),
              ...(scanRequest.repair === undefined
                ? {}
                : {repair: scanRequest.repair}),
              ...(scanRequest.repairProviderMetadata === undefined
                ? {}
                : {
                    repairProviderMetadata: scanRequest.repairProviderMetadata,
                  }),
            };
          } else if (pathname === LIBRARY_FETCH_MORE_ENDPOINT) {
            const fetchMoreRequest = parseLibraryFetchMoreRequest(body);
            operation = {
              ...(fetchMoreRequest.blockedTags === undefined
                ? {}
                : {blockedTags: fetchMoreRequest.blockedTags}),
              kind: "fetch-more",
              ...(fetchMoreRequest.limit === undefined
                ? {}
                : {limit: fetchMoreRequest.limit}),
              ...(fetchMoreRequest.maxSearchPages === undefined
                ? {}
                : {maxSearchPages: fetchMoreRequest.maxSearchPages}),
              ...(fetchMoreRequest.providerId === undefined
                ? {}
                : {providerId: fetchMoreRequest.providerId}),
              ...(fetchMoreRequest.query === undefined
                ? {}
                : {query: fetchMoreRequest.query}),
            };
          } else {
            const blacklistRequest = parseLibraryBlacklistRequest(body);
            operation = {
              kind: "blacklist",
              publicationId: blacklistRequest.publicationId,
            };
          }
        } catch (error) {
          const bridgeError =
            error instanceof LibraryUpdateBridgeError
              ? error
              : new LibraryUpdateBridgeError(
                  error instanceof Error ? error.message : "Invalid request",
                  "invalid_request",
                  400,
                );
          sendJson(
            response,
            bridgeError.status,
            libraryOperationFailure(bridgeError.code, bridgeError.message),
          );
          return;
        }
      }

      if (operationRunning) {
        sendJson(
          response,
          409,
          libraryOperationFailure(
            "operation_in_progress",
            "A library operation is already in progress",
          ),
        );
        return;
      }
      operationRunning = true;
      const operationStartedAt = Date.now();
      const operationLogLabel = libraryOperationLogLabel(operation);
      console.info(`[afterleaf] Starting library ${operationLogLabel}`);
      const snapshotOperation =
        operation.kind === "scan" || operation.kind === "fetch-more"
          ? operation.kind
          : undefined;
      if (snapshotOperation) {
        const jobId = randomUUID();
        const initialStatus: LibraryOperationStatusHttpSuccess = {
          completedSteps: 0,
          jobId,
          message:
            snapshotOperation === "fetch-more"
              ? "Starting provider sync"
              : "Importing archives and image folders, then scanning local sources",
          ok: true,
          operation: snapshotOperation,
          state: "running",
          totalSteps: 3,
        };
        operationJobs.set(jobId, initialStatus);
        while (operationJobs.size > 8) {
          const oldestJobId = operationJobs.keys().next().value;
          if (oldestJobId === undefined) break;
          operationJobs.delete(oldestJobId);
        }
        sendJson(response, 202, {
          jobId,
          ok: true,
          operation: snapshotOperation,
          state: "running",
        });
        void (async () => {
          try {
            const stdout = await runLibraryOperationCommand(
              operation,
              (progress) => {
                operationJobs.set(jobId, {
                  ...progress,
                  jobId,
                  ok: true,
                  operation: snapshotOperation,
                  state: "running",
                });
                console.info(
                  `[afterleaf] Library ${snapshotOperation} [${progress.completedSteps}/${progress.totalSteps}] ${progress.message} (${Math.round((Date.now() - operationStartedAt) / 1_000)}s)`,
                );
              },
            );
            const commandResult = JSON.parse(stdout) as unknown;
            const result = summarizeLibrarySnapshotResult(
              commandResult,
              snapshotOperation,
            );
            operationJobs.set(jobId, {
              completedSteps: 3,
              jobId,
              message: "Library job complete",
              ok: true,
              operation: snapshotOperation,
              result,
              state: "succeeded",
              totalSteps: 3,
            });
            console.info(
              `[afterleaf] Completed library ${operationLogLabel} in ${Math.round((Date.now() - operationStartedAt) / 1_000)}s: ${result.changes.addedCount} added, ${result.changes.updatedCount} updated, ${result.changes.removedCount} removed, ${result.snapshot.publicationCount} catalogued`,
            );
          } catch (error) {
            const bridgeError =
              error instanceof LibraryUpdateBridgeError
                ? error
                : new LibraryUpdateBridgeError(
                    error instanceof Error
                      ? error.message
                      : "Library operation failed",
                    "operation_failed",
                    500,
                  );
            const currentStatus = operationJobs.get(jobId) ?? initialStatus;
            operationJobs.set(jobId, {
              completedSteps: currentStatus.completedSteps,
              error: libraryOperationFailure(
                bridgeError.code,
                bridgeError.message,
              ).error,
              jobId,
              message: bridgeError.message,
              ok: true,
              operation: snapshotOperation,
              state: "failed",
              totalSteps: currentStatus.totalSteps,
            });
            console.error(
              `[afterleaf] Failed library ${operationLogLabel} after ${Math.round((Date.now() - operationStartedAt) / 1_000)}s: ${bridgeError.message}`,
            );
          } finally {
            operationRunning = false;
          }
        })();
        return;
      }
      try {
        const stdout = await runLibraryOperationCommand(operation);
        const commandResult = JSON.parse(stdout) as unknown;
        const result = summarizeCommandResult(commandResult, operation);
        console.info(
          `[afterleaf] Completed library ${operationLogLabel} in ${Math.round((Date.now() - operationStartedAt) / 1_000)}s`,
        );
        sendJson(response, 200, result);
      } catch (error) {
        const bridgeError =
          error instanceof LibraryUpdateBridgeError
            ? error
            : new LibraryUpdateBridgeError(
                error instanceof Error
                  ? error.message
                  : "Library operation failed",
                "operation_failed",
                500,
              );
        console.error(
          `[afterleaf] Failed library ${operationLogLabel} after ${Math.round((Date.now() - operationStartedAt) / 1_000)}s: ${bridgeError.message}`,
        );
        sendJson(
          response,
          bridgeError.status,
          libraryOperationFailure(bridgeError.code, bridgeError.message),
        );
      } finally {
        operationRunning = false;
      }
    });
  },
});

const sparsePageContentType = (extension: string) =>
  contentTypes[`.${extension}`] ?? "application/octet-stream";

const findCachedSparsePage = async (
  pagesDirectory: string,
  pageNumber: number,
) => {
  try {
    const entry = (await readdir(pagesDirectory)).find((name) => {
      const match = name.match(/^([0-9]+)\.(?:jpe?g|png|webp)$/u);
      return match ? Number(match[1]) === pageNumber : false;
    });
    return entry ? path.resolve(pagesDirectory, entry) : undefined;
  } catch {
    return undefined;
  }
};

const sparsePageRequests = new Map<string, Promise<Buffer | string>>();

// Materialization runs fully in parallel; the reader only prefetches a few
// pages per spread turn, so simultaneous downloads stay naturally bounded.
const queueSparsePageMaterialization = (
  publicationId: string,
  pageNumber: number,
  queuedAt: number,
) =>
  materializeSparsePage(
    publicationId,
    pageNumber,
    performance.now() - queuedAt,
  );

const activeSparsePublication = (publicationId: string) => {
  const location = requestLibraryLocation();
  if (!location) throw new Error("No active library snapshot is available");
  const catalog = JSON.parse(
    readFileSync(
      path.resolve(location.catalogDirectory, "catalog.json"),
      "utf8",
    ),
  ) as {publications?: PackedPublication[]};
  const publication = catalog.publications?.find(
    (candidate) => candidate.id === publicationId,
  );
  if (!publication) throw new Error("Publication is not in the active library");
  return publication;
};

const materializeSparsePage = async (
  publicationId: string,
  pageNumber: number,
  queueMilliseconds: number,
) => {
  const materializationStartedAt = performance.now();
  const activePublication = activeSparsePublication(publicationId);
  if (activePublication.source?.provider === ARCHIVE_SOURCE_PROVIDER)
    return materializeArchiveReaderPage(activePublication, pageNumber);
  const publicationDirectory = path.resolve(
    acquisitionDirectory,
    activePublication.source?.provider ?? "unknown",
    publicationId,
  );
  const pagesDirectory = path.resolve(publicationDirectory, "pages");
  const cachedPage = await findCachedSparsePage(pagesDirectory, pageNumber);
  if (cachedPage) return cachedPage;

  const manifest = JSON.parse(
    readFileSync(
      path.resolve(publicationDirectory, "publication.json"),
      "utf8",
    ),
  ) as {
    id?: unknown;
    pageCount?: unknown;
    source?: {
      metadataHash?: unknown;
      provider?: unknown;
      remoteId?: unknown;
    };
  };
  if (
    manifest.id !== publicationId ||
    typeof manifest.source?.provider !== "string" ||
    typeof manifest.source.remoteId !== "string" ||
    typeof manifest.source.metadataHash !== "string" ||
    manifest.source.metadataHash.length === 0 ||
    !Number.isSafeInteger(manifest.pageCount) ||
    pageNumber > Number(manifest.pageCount)
  )
    throw new Error("Publication does not expose that sparse page");

  const provider = await libraryProviderRegistry.load(manifest.source.provider);
  if (!provider.materializePage)
    throw new Error(
      `Library provider ${manifest.source.provider} does not support sparse pages`,
    );
  const providerStartedAt = performance.now();
  const source = await provider.materializePage({
    metadataHash: manifest.source.metadataHash,
    pageCount: Number(manifest.pageCount),
    pageNumber,
    publication: activePublication,
    sourceDirectory: publicationDirectory,
  });
  const providerMilliseconds = performance.now() - providerStartedAt;
  const targetPath = path.resolve(
    pagesDirectory,
    `${String(pageNumber).padStart(Math.max(3, String(manifest.pageCount).length), "0")}.webp`,
  );
  const temporaryPath = `${targetPath}.staging-${process.pid}-${Date.now()}`;
  await mkdir(pagesDirectory, {recursive: true});
  try {
    const conversionStartedAt = performance.now();
    const derivative = await createReaderPageDerivative(source);
    const conversionMilliseconds = performance.now() - conversionStartedAt;
    const persistenceStartedAt = performance.now();
    await writeFile(temporaryPath, derivative);
    await rename(temporaryPath, targetPath);
    const persistenceMilliseconds = performance.now() - persistenceStartedAt;
    const materializationMilliseconds =
      performance.now() - materializationStartedAt;
    console.info(
      `[afterleaf] Streamed ${publicationId} page ${pageNumber}: queue ${queueMilliseconds.toFixed(0)} ms, download/provider ${providerMilliseconds.toFixed(0)} ms (${(source.byteLength / 1_024).toFixed(0)} KiB), Sharp ${conversionMilliseconds.toFixed(0)} ms (${(derivative.byteLength / 1_024).toFixed(0)} KiB), disk ${persistenceMilliseconds.toFixed(0)} ms, materialize ${materializationMilliseconds.toFixed(0)} ms, request ${(
        queueMilliseconds + materializationMilliseconds
      ).toFixed(0)} ms`,
    );
  } catch (error) {
    await rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }
  return targetPath;
};

const sparseLibraryPagesPlugin = (): Plugin => ({
  name: "afterleaf-sparse-library-pages",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pageRequest = parseSparseLibraryPageRequest(request.url ?? "/");
      if (pageRequest.kind === "unscoped") return next();
      if (pageRequest.kind === "invalid" || request.method !== "GET") {
        response.statusCode = 404;
        response.setHeader("Cache-Control", "no-store");
        return response.end();
      }
      if (!hasSameOrigin(request)) {
        response.statusCode = 403;
        response.setHeader("Cache-Control", "no-store");
        return response.end();
      }
      const key = `${pageRequest.publicationId}:${pageRequest.pageNumber}`;
      const requestStartedAt = performance.now();
      const existingRequest = sparsePageRequests.get(key);
      const pending =
        existingRequest ??
        queueSparsePageMaterialization(
          pageRequest.publicationId,
          pageRequest.pageNumber,
          requestStartedAt,
        );
      sparsePageRequests.set(key, pending);
      try {
        const page = await pending;
        response.statusCode = 200;
        if (Buffer.isBuffer(page)) {
          response.setHeader("Content-Type", "image/webp");
          response.setHeader("Cache-Control", "private, max-age=3600");
          response.end(page);
        } else {
          response.setHeader(
            "Content-Type",
            sparsePageContentType(path.extname(page).slice(1)),
          );
          response.setHeader("Cache-Control", "private, max-age=3600");
          createReadStream(page).pipe(response);
        }
      } catch (error) {
        console.error(
          `[afterleaf] Failed to stream ${pageRequest.publicationId} page ${pageRequest.pageNumber}`,
          error,
        );
        response.statusCode = 502;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(
          error instanceof Error ? error.message : "Sparse page fetch failed",
        );
      } finally {
        if (sparsePageRequests.get(key) === pending)
          sparsePageRequests.delete(key);
      }
    });
  },
});

const tvChannelCatalogDocument = async () =>
  discoverTvChannels(
    await tvChannelsDirectories(),
    tvMediaUrl,
    tvVideoAnalyzer,
  );

const serveTvContent = async (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
  } catch {
    return next();
  }

  if (pathname === TV_IMPORT_ENDPOINT) {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.setHeader("Allow", "POST");
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (!hasSameOrigin(request)) {
      response.statusCode = 403;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    try {
      const requestBody = await readBoundedJsonBody(request);
      let importRequest;
      try {
        importRequest = parseTvVideoImportRequest(requestBody);
      } catch (error) {
        throw new TvVideoImportInputError(
          error instanceof Error
            ? error.message
            : "TV video import request is invalid",
        );
      }
      const video = await importTvVideoToChannel({
        channelId: importRequest.channelId,
        channelsDirectory: tvChannelsDirectory,
        url: importRequest.url,
      });
      response.statusCode = 201;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      return response.end(JSON.stringify({video}));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "TV video import failed";
      let statusCode = 502;
      if (error instanceof LibraryUpdateBridgeError) statusCode = error.status;
      else if (error instanceof TvVideoImportInputError) statusCode = 422;
      response.statusCode = statusCode;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(message);
    }
  }

  if (pathname === TV_CHANNELS_ENDPOINT) {
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET");
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (!hasSameOrigin(request)) {
      response.statusCode = 403;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    try {
      const manifest = await tvChannelCatalogDocument();
      response.statusCode = 200;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      return response.end(JSON.stringify(manifest));
    } catch (error) {
      console.error("[afterleaf] Failed to discover TV channels", error);
      response.statusCode = 500;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
  }

  const mediaRequest = parseTvMediaRequest(request.url ?? "/");
  if (mediaRequest.kind === "unscoped") return next();
  if (
    mediaRequest.kind === "invalid" ||
    (request.method !== "GET" && request.method !== "HEAD")
  ) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (!hasSameOrigin(request)) {
    response.statusCode = 403;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }

  const resolved = await resolveTvVideoPath(
    await tvChannelsDirectories(),
    mediaRequest.channelId,
    mediaRequest.videoId,
  );
  if (!resolved) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }

  const range = parseByteRange(request.headers.range, resolved.size);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", "private, max-age=3600");
  response.setHeader(
    "Content-Type",
    tvVideoContentType(mediaRequest.videoId) ?? "application/octet-stream",
  );
  if (range === "invalid") {
    response.statusCode = 416;
    response.setHeader("Content-Range", `bytes */${resolved.size}`);
    return response.end();
  }

  const responseRange =
    range === undefined
      ? undefined
      : constrainByteRangeLength(range, MAX_TV_MEDIA_RANGE_BYTES);
  const start = responseRange?.start ?? 0;
  const end = responseRange?.end ?? resolved.size - 1;
  response.statusCode = responseRange ? 206 : 200;
  response.setHeader("Content-Length", end - start + 1);
  if (responseRange)
    response.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${resolved.size}`,
    );
  if (request.method === "HEAD") return response.end();
  createReadStream(resolved.filePath, {end, start}).pipe(response);
};

const tvContentPlugin = (): Plugin => ({
  name: "afterleaf-tv-content",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(serveTvContent);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveTvContent);
  },
});

const posterRenderCache = new Map<string, Promise<Buffer>>();

const renderedPoster = (filePath: string) => {
  const modifiedAt = statSync(filePath).mtimeMs;
  const key = `${filePath}\u0000${modifiedAt}`;
  const cached = posterRenderCache.get(key);
  if (cached) return cached;
  for (const cachedKey of posterRenderCache.keys())
    if (cachedKey.startsWith(`${filePath}\u0000`))
      posterRenderCache.delete(cachedKey);
  const pending = renderPoster(
    filePath,
    createPosterImageDerivative,
    posterDerivativeCacheDirectory,
  );
  posterRenderCache.set(key, pending);
  void pending.catch(() => posterRenderCache.delete(key));
  return pending;
};

const posterCatalogDocument = async () => ({
  posters: (
    await discoverPosters(await postersDirectories(), posterMediaUrl)
  ).map((poster) => ({
    aspectRatio: poster.aspectRatio,
    hasAlpha: poster.hasAlpha,
    id: poster.id,
    label: poster.label,
    url: poster.url,
  })),
});

const readBoundedPosterBody = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_POSTER_IMPORT_BODY_BYTES
    ) {
      request.resume();
      reject(new Error("Pasted poster image is empty or too large"));
      return;
    }
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      byteLength += chunk.byteLength;
      if (byteLength <= MAX_POSTER_IMPORT_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      rejected = true;
      reject(new Error("Pasted poster image is too large"));
    });
    request.on("end", () => {
      if (rejected) return;
      const body = Buffer.concat(chunks);
      if (body.byteLength > 0) resolve(body);
      else reject(new Error("Pasted poster image is empty"));
    });
    request.on("error", () => {
      if (rejected) return;
      rejected = true;
      reject(new Error("Pasted poster image could not be read"));
    });
  });

const readBoundedArtFrameBody = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_ART_FRAME_IMPORT_BODY_BYTES
    ) {
      request.resume();
      reject(new Error("Pasted art frame image is empty or too large"));
      return;
    }
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      byteLength += chunk.byteLength;
      if (byteLength <= MAX_ART_FRAME_IMPORT_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      rejected = true;
      reject(new Error("Pasted art frame image is too large"));
    });
    request.on("end", () => {
      if (rejected) return;
      const body = Buffer.concat(chunks);
      if (body.byteLength > 0) resolve(body);
      else reject(new Error("Pasted art frame image is empty"));
    });
    request.on("error", () => {
      if (rejected) return;
      rejected = true;
      reject(new Error("Pasted art frame image could not be read"));
    });
  });

const servePosterContent = async (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
  } catch {
    return next();
  }
  const catalogRequest = pathname === POSTER_CATALOG_ENDPOINT;
  const importRequest = pathname === POSTER_IMPORT_ENDPOINT;
  const mediaRequest = parsePosterMediaRequest(request.url ?? "/");
  if (!catalogRequest && !importRequest && mediaRequest.kind === "unscoped")
    return next();
  if (importRequest) {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.setHeader("Allow", "POST");
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (!hasSameOrigin(request)) {
      response.statusCode = 403;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    try {
      const importedPoster = await importPosterImage(
        postersDirectory,
        await readBoundedPosterBody(request),
        createPosterImageDerivative,
        posterMediaUrl,
      );
      const poster = {
        aspectRatio: importedPoster.aspectRatio,
        hasAlpha: importedPoster.hasAlpha,
        id: importedPoster.id,
        label: importedPoster.label,
        url: importedPoster.url,
      };
      response.statusCode = 201;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      return response.end(JSON.stringify({poster}));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Poster import failed";
      response.statusCode = message.includes("too large") ? 413 : 422;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(message);
    }
  }
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    mediaRequest.kind === "invalid"
  ) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (!hasSameOrigin(request)) {
    response.statusCode = 403;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (catalogRequest) {
    try {
      const catalog = await posterCatalogDocument();
      response.statusCode = 200;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      if (request.method === "HEAD") return response.end();
      return response.end(JSON.stringify(catalog));
    } catch (error) {
      console.error("[afterleaf] Failed to discover posters", error);
      response.statusCode = 500;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
  }
  if (mediaRequest.kind !== "media") return next();
  const posterPath = await resolvePosterPath(
    await postersDirectories(),
    mediaRequest.id,
  );
  if (!posterPath) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  try {
    response.statusCode = 200;
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("Content-Type", "image/webp");
    if (request.method === "HEAD") return response.end();
    return response.end(await renderedPoster(posterPath));
  } catch (error) {
    console.error(
      `[afterleaf] Failed to render poster ${mediaRequest.id}`,
      error,
    );
    response.statusCode = 422;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
};

const posterContentPlugin = (): Plugin => ({
  name: "afterleaf-poster-content",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(servePosterContent);
  },
  configurePreviewServer(server) {
    server.middlewares.use(servePosterContent);
  },
});

const artFrameRenderCache = new Map<string, Promise<Buffer>>();

const renderedArtFrameImage = (filePath: string) => {
  const modifiedAt = statSync(filePath).mtimeMs;
  const key = `${filePath}\u0000${modifiedAt}`;
  const cached = artFrameRenderCache.get(key);
  if (cached) return cached;
  for (const cachedKey of artFrameRenderCache.keys())
    if (cachedKey.startsWith(`${filePath}\u0000`))
      artFrameRenderCache.delete(cachedKey);
  const pending = renderArtFrameImage(
    filePath,
    createArtFrameImageDerivative,
    artFrameDerivativeCacheDirectory,
  );
  artFrameRenderCache.set(key, pending);
  void pending.catch(() => artFrameRenderCache.delete(key));
  return pending;
};

const artFrameCatalogDocument = async () => ({
  channels: (
    await discoverArtFrameChannels(
      await artFramesDirectories(),
      artFrameMediaUrl,
    )
  ).map((channel) => ({
    id: channel.id,
    images: channel.images.map(({aspectRatio, id, label, url}) => ({
      aspectRatio,
      id,
      label,
      url,
    })),
    label: channel.label,
  })),
});

const serveArtFrameContent = async (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
  } catch {
    return next();
  }
  const catalogRequest = pathname === ART_FRAME_CATALOG_ENDPOINT;
  const importRequest = pathname === ART_FRAME_IMPORT_ENDPOINT;
  const mediaRequest = parseArtFrameMediaRequest(request.url ?? "/");
  if (!catalogRequest && !importRequest && mediaRequest.kind === "unscoped")
    return next();
  if (importRequest) {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.setHeader("Allow", "POST");
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    if (!hasSameOrigin(request)) {
      response.statusCode = 403;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    const channelHeader = request.headers["x-afterleaf-art-frame-channel"];
    const channelId = Array.isArray(channelHeader)
      ? channelHeader[0]
      : channelHeader;
    if (!channelId || !isSafeArtFrameChannelId(channelId)) {
      response.statusCode = 422;
      response.setHeader("Cache-Control", "no-store");
      return response.end("Art frame channel name is invalid");
    }
    try {
      const imported = await importArtFrameImage(
        artFramesDirectory,
        channelId,
        await readBoundedArtFrameBody(request),
        createArtFrameImageDerivative,
        artFrameMediaUrl,
      );
      const importedImage = imported.image;
      const modifiedAt = statSync(importedImage.filePath).mtimeMs;
      artFrameRenderCache.set(
        `${importedImage.filePath}\u0000${modifiedAt}`,
        Promise.resolve(imported.derivative),
      );
      const image = {
        aspectRatio: importedImage.aspectRatio,
        id: importedImage.id,
        label: importedImage.label,
        url: importedImage.url,
      };
      response.statusCode = 201;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      return response.end(JSON.stringify({image}));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Art frame import failed";
      response.statusCode = message.includes("too large") ? 413 : 422;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(message);
    }
  }
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    mediaRequest.kind === "invalid"
  ) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (!hasSameOrigin(request)) {
    response.statusCode = 403;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (catalogRequest) {
    try {
      response.statusCode = 200;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      if (request.method === "HEAD") return response.end();
      return response.end(JSON.stringify(await artFrameCatalogDocument()));
    } catch (error) {
      console.error("[afterleaf] Failed to discover art frame channels", error);
      response.statusCode = 500;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
  }
  if (mediaRequest.kind !== "media") return next();
  const imagePath = await resolveArtFrameImagePath(
    await artFramesDirectories(),
    mediaRequest.id,
  );
  if (!imagePath) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  try {
    const imageStat = statSync(imagePath);
    const etag = `W/"${imageStat.size.toString(16)}-${Math.floor(
      imageStat.mtimeMs,
    ).toString(16)}"`;
    response.statusCode = 200;
    response.setHeader("Cache-Control", "private, no-cache");
    response.setHeader("ETag", etag);
    if (request.headers["if-none-match"] === etag) {
      response.statusCode = 304;
      return response.end();
    }
    response.setHeader("Content-Type", "image/webp");
    if (request.method === "HEAD") return response.end();
    return response.end(await renderedArtFrameImage(imagePath));
  } catch (error) {
    console.error(
      `[afterleaf] Failed to render art frame image ${mediaRequest.id}`,
      error,
    );
    response.statusCode = 422;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
};

const artFrameContentPlugin = (): Plugin => ({
  name: "afterleaf-art-frame-content",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(serveArtFrameContent);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveArtFrameContent);
  },
});

const serveShopMediaCatalog = async (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
  } catch {
    return next();
  }
  if (pathname !== SHOP_MEDIA_CATALOG_ENDPOINT) return next();
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET");
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  if (!hasSameOrigin(request)) {
    response.statusCode = 403;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  try {
    const [artFrames, models, posters, tv] = await Promise.all([
      artFrameCatalogDocument(),
      discoverModels([modelsDirectory], modelMediaUrl).then((models) => ({
        models: models.map(({id, label, url}) => ({id, label, url})),
      })),
      posterCatalogDocument(),
      tvChannelCatalogDocument(),
    ]);
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    return response.end(JSON.stringify({artFrames, models, posters, tv}));
  } catch (error) {
    console.error("[afterleaf] Failed to discover shop media catalogs", error);
    response.statusCode = 500;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
};

const shopMediaCatalogPlugin = (): Plugin => ({
  name: "afterleaf-shop-media-catalog",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(serveShopMediaCatalog);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveShopMediaCatalog);
  },
});

const serveModelContent = async (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const modelRequest = parseModelMediaRequest(request.url ?? "/");
  if (modelRequest.kind === "unscoped") return next();
  if (modelRequest.kind === "invalid" || !hasSameOrigin(request)) {
    response.statusCode = modelRequest.kind === "invalid" ? 404 : 403;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  const modelPath = await resolveModelPath([modelsDirectory], modelRequest.id);
  if (!modelPath) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  try {
    const preparedModel = await prepareModelForThree(
      modelPath,
      modelCompatibilityCacheDirectory,
    );
    response.setHeader("Cache-Control", "private, no-cache");
    response.setHeader("ETag", preparedModel.etag);
    if (request.headers["if-none-match"] === preparedModel.etag) {
      response.statusCode = 304;
      return response.end();
    }
    response.statusCode = 200;
    response.setHeader("Content-Length", preparedModel.byteLength);
    response.setHeader("Content-Type", "model/gltf-binary");
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(preparedModel.filePath);
    stream.on("error", (error) => response.destroy(error));
    return stream.pipe(response);
  } catch (error) {
    console.error(
      `[afterleaf] Failed to serve model ${modelRequest.id}`,
      error,
    );
    response.statusCode = 500;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
};

const modelContentPlugin = (): Plugin => ({
  name: "afterleaf-model-content",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(serveModelContent);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveModelContent);
  },
});

const serveActiveLibraryAsset = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const assetRequest = parseActiveLibraryAssetRequest(request.url ?? "/");
  if (assetRequest.kind === "unscoped") return next();
  const location = requestLibraryLocation();
  if (!location) return next();
  if (assetRequest.kind === "invalid") {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  const {pathname} = assetRequest;
  const assetResolution = resolveActiveLibraryAssetPath(
    pathname === "/catalog.json"
      ? location.catalogDirectory
      : location.assetDirectory,
    pathname,
  );
  if (assetResolution.kind === "invalid") {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  const {assetPath} = assetResolution;
  try {
    if (!statSync(assetPath).isFile()) {
      response.statusCode = 404;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
  } catch (error) {
    if (pathname === "/catalog.json")
      console.warn(
        `[afterleaf] Active library catalog disappeared before it could be served (${assetPath})`,
        error,
      );
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    contentTypes[path.extname(assetPath).toLowerCase()] ??
      "application/octet-stream",
  );
  response.setHeader(
    "Cache-Control",
    pathname === "/catalog.json"
      ? "no-store"
      : !explicitPublicDirectory && cachedSnapshotId
        ? "private, max-age=31536000, immutable"
        : "private, max-age=3600",
  );
  if (
    pathname === "/catalog.json" &&
    !explicitPublicDirectory &&
    cachedSnapshotId
  )
    response.setHeader("X-Afterleaf-Snapshot-Id", cachedSnapshotId);
  if (request.method === "HEAD") return response.end();
  const stream = createReadStream(assetPath);
  stream.on("error", (error) => {
    console.error(
      `[afterleaf] Failed to stream active library asset ${pathname} (${assetPath})`,
      error,
    );
    if (response.headersSent) response.destroy(error);
    else {
      response.statusCode = 500;
      response.setHeader("Cache-Control", "no-store");
      response.end();
    }
  });
  stream.pipe(response);
};

const emulatorDataPlugin = (): Plugin => {
  const nodeModulesDirectory = path.join(import.meta.dirname, "node_modules");
  let buildOutDir = "";

  // Serves the npm-vendored EmulatorJS runtime (loader, UI, cores) at
  // EMULATOR_DATA_URL_PATH so emulator boots never touch cdn.emulatorjs.org.
  // Core packages mirror the data/cores layout, so requests are resolved by
  // resolveEmulatorDataFile and streamed like any other static asset.
  const serveEmulatorData = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
    } catch {
      return next();
    }
    if (!pathname.startsWith(EMULATOR_DATA_URL_PATH)) return next();
    let relativePath: string;
    try {
      relativePath = decodeURIComponent(
        pathname.slice(EMULATOR_DATA_URL_PATH.length),
      );
    } catch {
      relativePath = "";
    }
    const asset = await loadEmulatorDataAsset(
      nodeModulesDirectory,
      relativePath,
    );
    if (!asset) {
      response.statusCode = 404;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
    try {
      response.statusCode = 200;
      response.setHeader("Content-Type", asset.contentType);
      // Version-pinned npm packages: stable across a session, cheap to refetch.
      response.setHeader("Cache-Control", "public, max-age=3600");
      if (asset.kind === "bundle") {
        response.setHeader("Content-Length", String(asset.body.byteLength));
        if (request.method === "HEAD") return response.end();
        return response.end(asset.body);
      }
      // Containment was checked during resolution; statSync just rejects
      // directories that slipped through existsSync.
      const fileStat = statSync(asset.filePath);
      if (!fileStat.isFile()) throw new Error("not a regular file");
      response.setHeader("Content-Length", String(fileStat.size));
      if (request.method === "HEAD") return response.end();
      const stream = createReadStream(asset.filePath);
      stream.on("error", () => response.destroy());
      return stream.pipe(response);
    } catch {
      response.statusCode = 404;
      response.setHeader("Cache-Control", "no-store");
      return response.end();
    }
  };

  return {
    name: "afterleaf-emulator-data",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(serveEmulatorData);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveEmulatorData);
    },
    configResolved(config) {
      buildOutDir = path.isAbsolute(config.build.outDir)
        ? config.build.outDir
        : path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!buildOutDir) return;
      const targetDataDirectory = path.join(
        buildOutDir,
        EMULATOR_DATA_URL_PATH.slice(1, -1),
      );
      await copyEmulatorDataInto(nodeModulesDirectory, targetDataDirectory);
      console.log(
        `[afterleaf] Vendored the EmulatorJS runtime into ${path.relative(import.meta.dirname, targetDataDirectory)}`,
      );
    },
  };
};

const activeLibraryPlugin = (): Plugin => ({
  name: "afterleaf-active-library",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use(serveActiveLibraryAsset);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveActiveLibraryAsset);
  },
});

const cacheableStaticAssetPath =
  /^\/(?:src\/assets|assets)\/.+\.(?:avif|gif|jpe?g|mp3|mp4|ogg|png|webm|webp|glb|woff2?)$/u;

const dataRootBootstrapperPlugin = (): Plugin => ({
  name: "afterleaf-data-root-bootstrapper",
  configureServer() {
    void ensureDataRootStructure(import.meta.dirname).catch((error: unknown) =>
      console.warn(
        "[afterleaf] Could not prepare the Afterleaf data folder",
        error,
      ),
    );
  },
});

const staticAssetCachePlugin = (): Plugin => {
  const setStaticAssetCacheHeaders = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://afterleaf.local").pathname;
    } catch {
      return next();
    }
    if (!cacheableStaticAssetPath.test(pathname)) return next();
    response.setHeader(
      "Cache-Control",
      pathname.startsWith("/src/assets/")
        ? "private, max-age=3600"
        : "public, max-age=31536000, immutable",
    );
    return next();
  };

  return {
    name: "afterleaf-static-asset-cache",
    configureServer(server) {
      server.middlewares.use(setStaticAssetCacheHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(setStaticAssetCacheHeaders);
    },
  };
};

export default defineConfig(({command}) => ({
  plugins: [
    dataRootBootstrapperPlugin(),
    staticAssetCachePlugin(),
    emulatorDataPlugin(),
    devServerDiscoveryPlugin(),
    worldSavePlugin(),
    localLibraryOperationsPlugin(),
    sparseLibraryPagesPlugin(),
    shopMediaCatalogPlugin(),
    modelContentPlugin(),
    tvContentPlugin(),
    posterContentPlugin(),
    artFrameContentPlugin(),
    activeLibraryPlugin(),
    solid(),
    tailwindcss(),
  ],
  publicDir: publicDirectoryForCommand(command),
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    hmr: false,
    // Library commands atomically rename freshly generated directories. Vite
    // serves these paths through custom middleware and does not need to watch
    // them; on Windows, watcher handles can otherwise make rename() fail.
    watch: {ignored: ignoreGeneratedLibraryPath},
  },
}));
