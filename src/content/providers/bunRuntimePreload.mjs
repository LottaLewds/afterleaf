import {plugin} from "bun";
import {pathToFileURL} from "node:url";

const sdkEntryPath = process.env.AFTERLEAF_PROVIDER_SDK_ENTRY_PATH;

if (!sdkEntryPath) throw new Error("Content provider SDK entry path is missing");

plugin({
  name: "afterleaf-provider-sdk",
  setup(build) {
    build.module("@afterleaf/provider-sdk", async () => ({
      exports: await import(pathToFileURL(sdkEntryPath).href),
      loader: "object",
    }));
  },
});
