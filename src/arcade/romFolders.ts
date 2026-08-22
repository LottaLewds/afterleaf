import type {ArcadeSystemId} from "~/arcade/systems";
import {
  LIBRARY_ROM_FILE_ENDPOINT,
  LIBRARY_ROMS_ENDPOINT,
} from "~/content/libraryUpdate/httpProtocol";

/** A ROM file discovered inside a system's configured ROM folder. */
export type ArcadeFolderRom = {
  name: string;
  sizeBytes: number;
};

/**
 * Result of listing a system's ROM folders. The unconfigured state is
 * expected and surfaces as an Options-menu hint instead of an error.
 */
export type ArcadeFolderRomsResult =
  | {roms: readonly ArcadeFolderRom[]; paths: readonly string[]; state: "ready"}
  | {state: "unconfigured"};

/**
 * Absolute same-origin URL EmulatorJS can stream the ROM from. The emulator
 * iframe inherits the app origin, so no proxying or CORS handling is needed.
 */
export const arcadeFolderRomUrl = (systemId: string, name: string): string => {
  const origin = globalThis.location?.origin ?? "";
  return `${origin}${LIBRARY_ROM_FILE_ENDPOINT}?system=${encodeURIComponent(systemId)}&name=${encodeURIComponent(name)}`;
};

const parseRomsPayload = (
  value: unknown,
): {paths: readonly string[]; roms: ArcadeFolderRom[]} => {
  if (!value || typeof value !== "object" || !("paths" in value))
    throw new Error("The ROM folder response is malformed");
  const payload = value as {
    ok?: unknown;
    paths?: unknown;
    roms?: unknown;
  };
  if (!Array.isArray(payload.paths) || !Array.isArray(payload.roms))
    throw new Error("The ROM folder response is malformed");
  const paths = payload.paths.filter(
    (path): path is string => typeof path === "string",
  );
  const roms: ArcadeFolderRom[] = [];
  for (const entry of payload.roms) {
    if (!entry || typeof entry !== "object") continue;
    const rom = entry as {name?: unknown; sizeBytes?: unknown};
    if (typeof rom.name !== "string" || rom.name.length === 0) continue;
    roms.push({
      name: rom.name,
      sizeBytes: typeof rom.sizeBytes === "number" ? rom.sizeBytes : 0,
    });
  }
  return {paths, roms};
};

/**
 * Lists the ROM files across a system's built-in and registered folders.
 * Resolves to the unconfigured state when no folder is available yet;
 * throws for server or filesystem failures.
 */
export const listArcadeFolderRoms = async (
  systemId: ArcadeSystemId,
  options: {
    fetcher?: (
      input: string,
      init?: {signal?: AbortSignal},
    ) => Promise<Pick<Response, "json" | "ok" | "status">>;
    signal?: AbortSignal;
  } = {},
): Promise<ArcadeFolderRomsResult> => {
  const {fetcher = fetch, signal} = options;
  const response = await fetcher(
    `${LIBRARY_ROMS_ENDPOINT}?system=${encodeURIComponent(systemId)}`,
    // Only forward the init object when a signal is present so the optional
    // property never carries an explicit undefined under exactOptionalPropertyTypes.
    ...(signal ? [{signal}] : []),
  );
  if (response.ok)
    return {...parseRomsPayload(await response.json()), state: "ready"};
  if (response.status === 422) {
    // The middleware reports a missing configuration as a structured failure.
    try {
      const payload = (await response.json()) as {
        error?: {code?: unknown; message?: unknown};
        ok?: unknown;
      };
      if (payload?.ok === false && payload.error?.code === "no_rom_folder")
        return {state: "unconfigured"};
      if (typeof payload.error?.message === "string")
        throw new Error(payload.error.message);
    } catch (cause) {
      if (cause instanceof Error && cause.message) throw cause;
    }
  }
  throw new Error(`Listing the ROM folder failed (${response.status}).`);
};
