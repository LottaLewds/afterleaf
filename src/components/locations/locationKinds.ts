import type {ArcadeSystemId} from "~/arcade/systems";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";

export type ArrayLocationKind =
  | "mangaPaths"
  | "comicPaths"
  | "mediaPaths"
  | "posterPaths"
  | "tvChannelPaths"
  | "artFramePaths";

/**
 * Every slot the locations control can hold: plain path collections plus one
 * virtual "rom:<system>" kind per emulated cabinet system, stored in
 * `romPaths` as auxiliary folders alongside each system's built-in
 * `content/roms/<system id>` convention folder.
 */
export type AdditionalLocationKind = ArrayLocationKind | `rom:${ArcadeSystemId}`;

export const romSystemOfKind = (kind: AdditionalLocationKind): ArcadeSystemId | undefined =>
  kind.startsWith("rom:") ? (kind.slice(4) as ArcadeSystemId) : undefined;

/** Narrows a location kind to plain path collections, excluding `rom:` kinds. */
export const isBookLocationKind = (kind: AdditionalLocationKind): kind is ArrayLocationKind => !kind.startsWith("rom:");

/** Copies the config with a system's auxiliary ROM folders replaced. */
export const withRomFolders = (
  config: AfterleafLibraryConfig,
  systemId: ArcadeSystemId,
  folders: readonly string[],
): AfterleafLibraryConfig => {
  const nextRomPaths = {...(config.romPaths ?? {})};
  if (folders.length === 0) delete nextRomPaths[systemId];
  else nextRomPaths[systemId] = folders;
  return {...config, romPaths: nextRomPaths};
};

export const bookLocationKeys = ["comicPaths", "mangaPaths", "mediaPaths"] as const;
export const visualMediaLocationKeys = ["artFramePaths", "posterPaths", "tvChannelPaths"] as const;
const locationListsMatch = (left: readonly string[] | undefined, right: readonly string[] | undefined) =>
  (left?.length ?? 0) === (right?.length ?? 0) && (left ?? []).every((path, index) => path === right?.[index]);
export const configLocationsChanged = (
  previous: AfterleafLibraryConfig,
  next: AfterleafLibraryConfig,
  keys: readonly ArrayLocationKind[],
) => keys.some((key) => !locationListsMatch(previous[key], next[key]));
