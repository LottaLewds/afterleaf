import {spawn} from "node:child_process";
import {mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, resolve} from "node:path";
import {createInterface} from "node:readline";
import type {
  LibraryProvider,
  LibraryProviderPluginContext,
  LibraryProviderPluginModule,
  LibraryProviderPasteImport,
  LibraryProviderSparsePageRequest,
  LibraryProviderSyncOptions,
  LibraryProviderSyncReport,
} from "./types";

const MAX_PROVIDER_PAGE_BYTES = 256 * 1_024 * 1_024;

export interface LibraryProviderModuleLocation {
  entryPath: string;
  projectDirectory: string;
}

interface ProviderRuntimeError {
  message: string;
  name: string;
  stack?: string;
}

type ProviderRuntimeMessage =
  | {kind: "error"; error: ProviderRuntimeError}
  | {completed: number; kind: "step"; total: number}
  | {kind: "progress"; message: string}
  | {kind: "result"; result: unknown};

interface ProviderRuntimeRequest {
  context: LibraryProviderPluginContext;
  value?: unknown;
}

interface ProviderRuntimeResult {
  payload: Buffer;
  result: unknown;
}

interface InspectedProvider {
  descriptor: unknown;
  materializesPages: boolean;
  resolvesPastedImports: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRuntimeMessage = (value: unknown): ProviderRuntimeMessage => {
  if (!isRecord(value) || typeof value.kind !== "string")
    throw new Error("Content provider runtime sent an invalid message");
  if (value.kind === "progress" && typeof value.message === "string") return {kind: "progress", message: value.message};
  if (
    value.kind === "step" &&
    typeof value.completed === "number" &&
    Number.isSafeInteger(value.completed) &&
    typeof value.total === "number" &&
    Number.isSafeInteger(value.total) &&
    value.completed >= 0 &&
    value.total > 0
  )
    return {completed: value.completed, kind: "step", total: value.total};
  if (value.kind === "result") return {kind: "result", result: value.result};
  if (value.kind === "error" && isRecord(value.error)) {
    const {error} = value;
    if (typeof error.message !== "string" || typeof error.name !== "string")
      throw new Error("Content provider runtime sent an invalid error");
    return {
      error: {
        message: error.message,
        name: error.name,
        ...(typeof error.stack === "string" ? {stack: error.stack} : {}),
      },
      kind: "error",
    };
  }
  throw new Error("Content provider runtime sent an unsupported message");
};

const runtimeError = (error: ProviderRuntimeError) => {
  const result = new Error(error.message);
  result.name = error.name;
  if (error.stack) result.stack = error.stack;
  return result;
};

const bunExecutable = () => {
  if (process.versions.bun) return process.execPath;
  return process.env.AFTERLEAF_BUN_EXECUTABLE?.trim() || "bun";
};

const runProviderRuntime = (
  runtimeHostPath: string,
  sdkEntryPath: string,
  location: LibraryProviderModuleLocation,
  operation: "inspect" | "materialize-page" | "resolve-pasted-import" | "sync",
  request: ProviderRuntimeRequest,
  onProgress?: (message: string) => void,
  onStep?: (completed: number, total: number) => void,
) => {
  const run = async () => {
    const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "afterleaf-provider-runtime-"));
    const requestPath = resolve(temporaryDirectory, "request.json");
    const payloadPath = resolve(temporaryDirectory, "payload.bin");
    await writeFile(requestPath, JSON.stringify(request), {mode: 0o600});
    try {
      return await new Promise<ProviderRuntimeResult>((resolveResult, rejectResult) => {
        const child = spawn(
          bunExecutable(),
          [
            "--preload",
            resolve(dirname(runtimeHostPath), "bunRuntimePreload.mjs"),
            runtimeHostPath,
            operation,
            location.entryPath,
            requestPath,
            payloadPath,
          ],
          {
            cwd: location.projectDirectory,
            env: {
              ...process.env,
              AFTERLEAF_PROVIDER_SDK_ENTRY_PATH: sdkEntryPath,
            },
            stdio: ["ignore", "pipe", "inherit"],
          },
        );
        const protocol = child.stdout ? createInterface({input: child.stdout}) : undefined;
        let response: Extract<ProviderRuntimeMessage, {kind: "error" | "result"}>;
        let processError: Error | undefined;
        let finished = false;

        const fail = (error: Error) => {
          if (finished) return;
          finished = true;
          child.kill();
          rejectResult(error);
        };

        protocol?.on("line", (line) => {
          let message: ProviderRuntimeMessage;
          try {
            message = parseRuntimeMessage(JSON.parse(line) as unknown);
          } catch (error) {
            fail(error instanceof Error ? error : new Error("Content provider runtime message failed"));
            return;
          }
          if (message.kind === "progress") {
            try {
              onProgress?.(message.message);
            } catch (error) {
              fail(error instanceof Error ? error : new Error("Content provider progress handler failed"));
            }
            return;
          }
          if (message.kind === "step") {
            try {
              onStep?.(message.completed, message.total);
            } catch (error) {
              fail(error instanceof Error ? error : new Error("Content provider step handler failed"));
            }
            return;
          }
          response = message;
        });
        child.once("error", (error) => {
          processError = error;
        });
        child.once("close", async (code, signal) => {
          if (finished) return;
          finished = true;
          if (processError) return rejectResult(processError);
          if (response?.kind === "error") return rejectResult(runtimeError(response.error));
          if (code !== 0 || response?.kind !== "result")
            return rejectResult(
              new Error(
                `Content provider runtime exited ${signal ? `with ${signal}` : `with code ${code ?? "unknown"}`}`,
              ),
            );
          let payload = Buffer.alloc(0);
          if (operation === "materialize-page") {
            try {
              const payloadBytes = (await stat(payloadPath)).size;
              if (payloadBytes > MAX_PROVIDER_PAGE_BYTES)
                return rejectResult(new Error(`Content provider page exceeded ${MAX_PROVIDER_PAGE_BYTES} bytes`));
              payload = await readFile(payloadPath);
            } catch (error) {
              return rejectResult(error instanceof Error ? error : new Error("Could not read content provider page"));
            }
          }
          resolveResult({payload, result: response.result});
        });
      });
    } finally {
      await rm(temporaryDirectory, {force: true, recursive: true});
    }
  };
  return run();
};

const inspectProvider = async (
  runtimeHostPath: string,
  sdkEntryPath: string,
  location: LibraryProviderModuleLocation,
  context: LibraryProviderPluginContext,
): Promise<InspectedProvider> => {
  const {result} = await runProviderRuntime(runtimeHostPath, sdkEntryPath, location, "inspect", {context});
  if (
    !isRecord(result) ||
    typeof result.materializesPages !== "boolean" ||
    typeof result.resolvesPastedImports !== "boolean" ||
    !("descriptor" in result)
  )
    throw new Error("Content provider runtime returned invalid capabilities");
  return {
    descriptor: result.descriptor,
    materializesPages: result.materializesPages,
    resolvesPastedImports: result.resolvesPastedImports,
  };
};

const createRuntimeProvider = async (
  runtimeHostPath: string,
  sdkEntryPath: string,
  location: LibraryProviderModuleLocation,
  context: LibraryProviderPluginContext,
): Promise<LibraryProvider> => {
  const inspected = await inspectProvider(runtimeHostPath, sdkEntryPath, location, context);
  const sync = async (options: LibraryProviderSyncOptions): Promise<LibraryProviderSyncReport> => {
    const {onProgress, onStep, ...serializableOptions} = options;
    const {result} = await runProviderRuntime(
      runtimeHostPath,
      sdkEntryPath,
      location,
      "sync",
      {context, value: serializableOptions},
      onProgress,
      onStep,
    );
    return result as LibraryProviderSyncReport;
  };
  const materializePage = async (request: LibraryProviderSparsePageRequest) => {
    const {payload} = await runProviderRuntime(runtimeHostPath, sdkEntryPath, location, "materialize-page", {
      context,
      value: request,
    });
    return payload;
  };
  const resolvePastedImport = async (text: string) => {
    const {result} = await runProviderRuntime(runtimeHostPath, sdkEntryPath, location, "resolve-pasted-import", {
      context,
      value: text,
    });
    return result as LibraryProviderPasteImport | undefined;
  };
  return {
    descriptor: inspected.descriptor as LibraryProvider["descriptor"],
    ...(inspected.materializesPages ? {materializePage} : {}),
    ...(inspected.resolvesPastedImports ? {resolvePastedImport} : {}),
    sync,
  };
};

export const createBunProviderModuleLoader =
  (runtimeHostPath: string, sdkEntryPath: string) =>
  async (location: LibraryProviderModuleLocation): Promise<LibraryProviderPluginModule> => ({
    createProvider: (context) => createRuntimeProvider(runtimeHostPath, sdkEntryPath, location, context),
  });
