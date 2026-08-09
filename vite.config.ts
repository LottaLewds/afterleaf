import tailwindcss from "@tailwindcss/vite";
import {defineConfig, type Plugin} from "vite";
import solid from "vite-plugin-solid";
import {execFile, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {mkdir, readdir, rename, rm, writeFile} from "node:fs/promises";
import type {IncomingMessage, ServerResponse} from "node:http";
import path from "node:path";

import {
  LIBRARY_BLACKLIST_ENDPOINT,
  LIBRARY_CONFIG_ENDPOINT,
  LIBRARY_BROWSE_ENDPOINT,
  LIBRARY_FETCH_MORE_ENDPOINT,
  LIBRARY_PASTE_RESOLVE_ENDPOINT,
  LIBRARY_PROVIDERS_ENDPOINT,
  LIBRARY_SCAN_ENDPOINT,
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
  readAfterleafLibraryConfig,
  readAfterleafLibraryConfigSync,
  writeAfterleafLibraryConfig,
  unavailableLibraryPaths,
} from "./src/content/libraryConfig";
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
import {parseWorldSave} from "./src/game/worldSave";
import {
  MAX_WORLD_SAVE_BODY_BYTES,
  WORLD_SAVE_ENDPOINT,
} from "./src/game/worldSaveHttp";
import {loadWorldSaveFile, saveWorldSaveFile} from "./src/game/worldSaveServer";

const MAX_TV_MEDIA_RANGE_BYTES = 8 * 1024 * 1024;
const libraryDirectory = path.resolve(
  import.meta.dirname,
  "content-packs/library",
);
const acquisitionDirectory = path.resolve(
  import.meta.dirname,
  "content-sources",
);
const configuredLibraryPaths = readAfterleafLibraryConfigSync(
  import.meta.dirname,
);
const uniquePaths = (paths: readonly string[]) => [...new Set(paths)];
const tvChannelsDirectory = path.resolve(
  import.meta.dirname,
  "content/channels",
);
const tvChannelsDirectories = uniquePaths([
  tvChannelsDirectory,
  ...configuredLibraryPaths.tvChannelPaths,
]);
const tvVideoAnalyzer = createCachedTvVideoAnalyzer({
  cachePath: path.resolve(tvChannelsDirectory, ".afterleaf-tv-analysis.json"),
  onError: (filePath, error) =>
    console.warn(`[afterleaf] Could not analyze TV video ${filePath}`, error),
});
const postersDirectory = path.resolve(import.meta.dirname, "content/posters");
const postersDirectories = uniquePaths([
  postersDirectory,
  ...configuredLibraryPaths.posterPaths,
]);
const artFramesDirectory = path.resolve(
  import.meta.dirname,
  "content/art-frames",
);
const artFramesDirectories = uniquePaths([
  artFramesDirectory,
  ...configuredLibraryPaths.artFramePaths,
]);
const worldSavePath = path.resolve(
  import.meta.dirname,
  "content/world-save.json",
);

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

const unavailableBookPathsAtStartup = await unavailableLibraryPaths(
  configuredLibraryPaths.mediaPaths,
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
      return undefined;
    }
    cachedLibraryLocation = existsSync(
      path.resolve(location.catalogDirectory, "catalog.json"),
    )
      ? {
          assetDirectory: location.assetDirectory,
          catalogDirectory: location.catalogDirectory,
        }
      : undefined;
    cachedSnapshotId = cachedLibraryLocation ? location.revisionId : undefined;
    return cachedLibraryLocation;
  } catch {
    cachedIndexModifiedAt = -1;
    cachedLibraryLocation = undefined;
    cachedSnapshotId = undefined;
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

const serveWorldSave = (() => {
  let writeQueue = Promise.resolve();

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
    if (!hasMatchingOrigin(request)) {
      response.statusCode = 403;
      return response.end();
    }
    if (request.method === "GET") {
      try {
        const save = await loadWorldSaveFile(worldSavePath);
        if (!save) {
          response.statusCode = 404;
          return response.end();
        }
        response.statusCode = 200;
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
    try {
      const save = parseWorldSave(await readBoundedWorldSaveBody(request));
      const pendingWrite = writeQueue.then(() =>
        saveWorldSaveFile(worldSavePath, save),
      );
      writeQueue = pendingWrite.catch(() => {});
      await pendingWrite;
      response.statusCode = 204;
      return response.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "World save upload failed";
      response.statusCode = message.includes("too large") ? 413 : 422;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      return response.end(message);
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
  | {kind: "scan"};

const libraryOperationArguments = (operation: LocalLibraryOperation) => {
  if (operation.kind === "scan") return ["run", "library:scan", "--write"];
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
        pathname !== LIBRARY_CONFIG_ENDPOINT &&
        pathname !== LIBRARY_BROWSE_ENDPOINT &&
        pathname !== LIBRARY_STATUS_ENDPOINT
      )
        return next();
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
        const command =
          process.platform === "win32"
            ? [
                "powershell.exe",
                [
                  "-NoProfile",
                  "-Command",
                  "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.SelectedPath)}",
                ],
              ]
            : process.platform === "darwin"
              ? [
                  "osascript",
                  [
                    "-e",
                    'POSIX path of (choose folder with prompt "Choose an Afterleaf content folder")',
                  ],
                ]
              : [
                  "zenity",
                  [
                    "--file-selection",
                    "--directory",
                    "--title=Choose an Afterleaf content folder",
                  ],
                ];
        execFile(
          command[0],
          command[1],
          {encoding: "utf8"},
          (error, stdout) => {
            if (error || !stdout.trim()) {
              sendJson(response, 200, {ok: true});
              return;
            }
            sendJson(response, 200, {ok: true, path: stdout.trim()});
          },
        );
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
        sendJson(response, 200, {
          ok: true,
          unavailableBookPathCount: (
            await unavailableLibraryPaths(currentLibraryPaths.mediaPaths)
          ).length,
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
            parseLibraryScanRequest(body);
            operation = {kind: "scan"};
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
const sparsePublicationRequestTails = new Map<string, Promise<void>>();

const queueSparsePageMaterialization = (
  publicationId: string,
  pageNumber: number,
  queuedAt: number,
) => {
  const previous = sparsePublicationRequestTails.get(publicationId);
  const pending = (previous ?? Promise.resolve())
    .catch(() => {})
    .then(() =>
      materializeSparsePage(
        publicationId,
        pageNumber,
        performance.now() - queuedAt,
      ),
    );
  const tail = pending.then(
    () => {},
    () => {},
  );
  sparsePublicationRequestTails.set(publicationId, tail);
  void tail.finally(() => {
    if (sparsePublicationRequestTails.get(publicationId) === tail)
      sparsePublicationRequestTails.delete(publicationId);
  });
  return pending;
};

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
      const manifest = await discoverTvChannels(
        tvChannelsDirectories,
        tvMediaUrl,
        tvVideoAnalyzer,
      );
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
    tvChannelsDirectories,
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
  const pending = renderPoster(filePath, createPosterImageDerivative);
  posterRenderCache.set(key, pending);
  void pending.catch(() => posterRenderCache.delete(key));
  return pending;
};

const posterCatalogDocument = async () => ({
  posters: (await discoverPosters(postersDirectories, posterMediaUrl)).map(
    (poster) => ({
      aspectRatio: poster.aspectRatio,
      id: poster.id,
      label: poster.label,
      url: poster.url,
    }),
  ),
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
    postersDirectories,
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
  async generateBundle() {
    const posters = await discoverPosters(postersDirectories, posterMediaUrl);
    for (const poster of posters)
      this.emitFile({
        fileName: poster.url.slice(1),
        source: await renderedPoster(poster.filePath),
        type: "asset",
      });
    this.emitFile({
      fileName: POSTER_CATALOG_ENDPOINT.slice(1),
      source: JSON.stringify({
        posters: posters.map(({aspectRatio, id, label, url}) => ({
          aspectRatio,
          id,
          label,
          url,
        })),
      }),
      type: "asset",
    });
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
  const pending = renderArtFrameImage(filePath, createArtFrameImageDerivative);
  artFrameRenderCache.set(key, pending);
  void pending.catch(() => artFrameRenderCache.delete(key));
  return pending;
};

const artFrameCatalogDocument = async () => ({
  channels: (
    await discoverArtFrameChannels(artFramesDirectories, artFrameMediaUrl)
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
    artFramesDirectories,
    mediaRequest.id,
  );
  if (!imagePath) {
    response.statusCode = 404;
    response.setHeader("Cache-Control", "no-store");
    return response.end();
  }
  try {
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store");
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
  async generateBundle() {
    const channels = await discoverArtFrameChannels(
      artFramesDirectories,
      artFrameMediaUrl,
    );
    for (const channel of channels)
      for (const image of channel.images)
        this.emitFile({
          fileName: image.url.slice(1),
          source: await renderedArtFrameImage(image.filePath),
          type: "asset",
        });
    this.emitFile({
      fileName: ART_FRAME_CATALOG_ENDPOINT.slice(1),
      source: JSON.stringify({
        channels: channels.map((channel) => ({
          id: channel.id,
          images: channel.images.map(({aspectRatio, id, label, url}) => ({
            aspectRatio,
            id,
            label,
            url,
          })),
          label: channel.label,
        })),
      }),
      type: "asset",
    });
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
  } catch {
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
    pathname === "/catalog.json" ? "no-store" : "private, max-age=3600",
  );
  if (
    pathname === "/catalog.json" &&
    !explicitPublicDirectory &&
    cachedSnapshotId
  )
    response.setHeader("X-Afterleaf-Snapshot-Id", cachedSnapshotId);
  if (request.method === "HEAD") return response.end();
  createReadStream(assetPath).pipe(response);
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

export default defineConfig(({command}) => ({
  plugins: [
    devServerDiscoveryPlugin(),
    worldSavePlugin(),
    localLibraryOperationsPlugin(),
    sparseLibraryPagesPlugin(),
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
  },
}));
