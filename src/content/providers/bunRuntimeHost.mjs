import {readFileSync, writeFileSync} from "node:fs";
import {format} from "node:util";
import {pathToFileURL} from "node:url";

const [operation, entryPath, requestPath] = process.argv.slice(2);

const writePluginLog = (level, values) =>
  process.stderr.write(`[provider:${level}] ${format(...values)}\n`);

console.debug = (...values) => writePluginLog("debug", values);
console.error = (...values) => writePluginLog("error", values);
console.info = (...values) => writePluginLog("info", values);
console.log = (...values) => writePluginLog("log", values);
console.warn = (...values) => writePluginLog("warn", values);

const send = (message) => writeFileSync(1, `${JSON.stringify(message)}\n`);

const shutdown = (code) => {
  process.exit(code);
};

const serializedError = (error) => {
  if (error instanceof Error)
    return {
      message: error.message,
      name: error.name,
      ...(error.stack ? {stack: error.stack} : {}),
    };
  return {message: String(error), name: "Error"};
};

const loadProvider = async (context) => {
  if (!entryPath)
    throw new Error("Content provider runtime entry path is missing");
  const imported = await import(pathToFileURL(entryPath).href);
  if (typeof imported.createProvider !== "function")
    throw new Error("entry module must export createProvider(context)");
  const provider = await imported.createProvider(context);
  if (typeof provider !== "object" || provider === null)
    throw new Error("createProvider() must return an object");
  return provider;
};

const run = async (request) => {
  try {
    if (typeof request !== "object" || request === null)
      throw new Error("Content provider runtime request is invalid");
    const provider = await loadProvider(request.context);
    if (operation === "inspect") {
      send({
        kind: "result",
        result: {
          descriptor: provider.descriptor,
          materializesPages: typeof provider.materializePage === "function",
          resolvesPastedImports:
            typeof provider.resolvePastedImport === "function",
        },
      });
      shutdown(0);
      return;
    }
    if (operation === "sync") {
      if (typeof provider.sync !== "function")
        throw new Error("createProvider() must return a sync function");
      const result = await provider.sync({
        ...request.value,
        onProgress: (message) => {
          if (typeof message === "string") send({kind: "progress", message});
        },
      });
      send({kind: "result", result});
      shutdown(0);
      return;
    }
    if (operation === "resolve-pasted-import") {
      if (typeof provider.resolvePastedImport !== "function")
        throw new Error("Content provider does not resolve pasted imports");
      const result = await provider.resolvePastedImport(request.value);
      send({kind: "result", result});
      shutdown(0);
      return;
    }
    if (operation === "materialize-page") {
      if (typeof provider.materializePage !== "function")
        throw new Error("Content provider does not support sparse pages");
      const result = await provider.materializePage(request.value);
      if (!(result instanceof Uint8Array))
        throw new Error("materializePage() must return a Buffer");
      writeFileSync(3, result);
      send({kind: "result", result: null});
      shutdown(0);
      return;
    }
    throw new Error(`Unsupported content provider operation: ${operation}`);
  } catch (error) {
    try {
      send({error: serializedError(error), kind: "error"});
    } catch {}
    shutdown(1);
  }
};

let request;
try {
  if (!requestPath)
    throw new Error("Content provider runtime request path is missing");
  request = JSON.parse(readFileSync(requestPath, "utf8"));
} catch (error) {
  send({error: serializedError(error), kind: "error"});
  shutdown(1);
}
void run(request);
