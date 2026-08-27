import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

/**
 * Single root for every non-code Afterleaf file. Copying this one folder is
 * a complete backup/export of a user's library, world, and configuration.
 */
export const DATA_ROOT_DIRECTORY_NAME = "afterleaf-data";

/** User-facing media. Users may freely add, remove, and copy these files. */
export const USER_CONTENT_DIRECTORY_NAME = "content";

/** Machine-managed provider download caches (nhentai, mangadex, ...). */
export const PROVIDERS_DIRECTORY_NAME = "providers";

/**
 * Application-owned state. Users normally never need to open this folder;
 * everything inside `.cache` is regenerable and safe to delete.
 */
export const GAME_DIRECTORY_NAME = "game";
export const GAME_CACHE_DIRECTORY_NAME = ".cache";

const COMICS_DIRECTORY_NAME = "comics";
const MANGA_DIRECTORY_NAME = "manga";
const TV_DIRECTORY_NAME = "tv";
const POSTERS_DIRECTORY_NAME = "posters";
const ART_FRAMES_DIRECTORY_NAME = "art-frames";
const MODELS_DIRECTORY_NAME = "models";
const ROMS_DIRECTORY_NAME = "roms";

const PREPARED_DIRECTORY_NAME = "prepared";
const LIBRARY_DIRECTORY_NAME = "library";
const WORLD_SAVE_BACKUPS_DIRECTORY_NAME = "world-save-backups";

export const WORLD_SAVE_FILE_NAME = "world-save.json";
export const PUBLICATION_BLACKLIST_FILE_NAME = "publication-blacklist.json";

/** Optional override for the location of the unified data root. */
export const DATA_ROOT_ENVIRONMENT_VARIABLE = "AFTERLEAF_DATA_ROOT";

export const resolveDataRoot = (workingDirectory: string) => {
  const override = process.env[DATA_ROOT_ENVIRONMENT_VARIABLE]?.trim();
  return override ? resolve(override) : resolve(workingDirectory, DATA_ROOT_DIRECTORY_NAME);
};

const dataRootChild =
  (...segments: string[]) =>
  (workingDirectory: string) =>
    resolve(resolveDataRoot(workingDirectory), ...segments);

/**
 * The user-facing media root, holding comics/, manga/, tv/, posters/,
 * art-frames/, models/, and roms/ convention folders.
 */
export const userContentDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME);

/** User-facing book roots. Dropping archives here is the primary workflow. */
export const comicsDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, COMICS_DIRECTORY_NAME);
export const mangaDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, MANGA_DIRECTORY_NAME);

/** User-facing media folders (same names as the historic content folder). */
export const tvChannelsDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, TV_DIRECTORY_NAME);
export const postersDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, POSTERS_DIRECTORY_NAME);
export const artFramesDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, ART_FRAMES_DIRECTORY_NAME);
export const modelsDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, MODELS_DIRECTORY_NAME);
export const romsDirectory = dataRootChild(USER_CONTENT_DIRECTORY_NAME, ROMS_DIRECTORY_NAME);

/** Machine-managed provider download caches. */
export const providersDirectory = dataRootChild(PROVIDERS_DIRECTORY_NAME);

/** Generated per-book manifests and cover derivatives. Safe to delete. */
export const preparedCatalogDirectory = dataRootChild(
  GAME_DIRECTORY_NAME,
  GAME_CACHE_DIRECTORY_NAME,
  PREPARED_DIRECTORY_NAME,
);

/** Derived, optimized library assets and the active catalog pointer. */
export const libraryPackDirectory = dataRootChild(
  GAME_DIRECTORY_NAME,
  GAME_CACHE_DIRECTORY_NAME,
  LIBRARY_DIRECTORY_NAME,
);

/** Durable application state (never regenerable). */
export const worldSavePath = dataRootChild(GAME_DIRECTORY_NAME, WORLD_SAVE_FILE_NAME);
export const worldSaveBackupsDirectory = dataRootChild(GAME_DIRECTORY_NAME, WORLD_SAVE_BACKUPS_DIRECTORY_NAME);
export const publicationBlacklistPath = dataRootChild(GAME_DIRECTORY_NAME, PUBLICATION_BLACKLIST_FILE_NAME);

/** Internal registries and diagnostics. */
export const libraryRootRegistryPath = dataRootChild(
  GAME_DIRECTORY_NAME,
  GAME_CACHE_DIRECTORY_NAME,
  "library-roots.json",
);
export const scanFailuresLogPath = dataRootChild(GAME_DIRECTORY_NAME, GAME_CACHE_DIRECTORY_NAME, "scan-failures.log");

/**
 * Descriptor of the library operation that may currently be running, so a
 * reloaded page (or a different browser) can reattach to its progress.
 * Present only while a job is live; removed when the job settles.
 */
export const activeLibraryOperationPath = dataRootChild(
  GAME_DIRECTORY_NAME,
  GAME_CACHE_DIRECTORY_NAME,
  "active-library-operation.json",
);

const DATA_ROOT_README = `Afterleaf data folder
=====================

Everything Afterleaf saves lives in this one folder. Copying this entire
folder is a complete backup: books, progress, settings, everything.

content/        YOUR media. Drop comic archives (CBZ/CBR) into comics/ or
                manga/ - the folder chooses reading direction (comics is
                left-to-right, manga is right-to-left). TV videos, posters,
                art frames, 3D models, and emulator ROMs live here too.
                Add, remove, and copy files freely.

providers/      Download caches for online sources (nhentai, mangadex, ...).
                Managed automatically; deleting an entry only forces a
                re-download.

game/           App state. Normally you never need to open this folder.
  world-save.json         Your world and shelf layout. Back this up!
  world-save-backups/     Automatic periodic backups of the world save.
  publication-blacklist.json  Books you told Afterleaf to discard.
  .cache/                 Fully regenerable optimized files. Safe to delete
                          to reclaim disk space (a rescan rebuilds it):
    prepared/   Import manifests and cover thumbnails for your books.
    library/    Optimized textures and the active library catalog.

afterleaf.library.json    Extra media folder locations, if you configure any.

Questions? See CONFIGURING_YOUR_LIBRARY.md in the Afterleaf distribution.
`;

/**
 * Creates the data-root structure and its README the first time Afterleaf
 * runs against a fresh folder. Existing files are never touched.
 */
export const ensureDataRootStructure = async (workingDirectory: string) => {
  const dataRoot = resolveDataRoot(workingDirectory);
  await Promise.all([
    mkdir(dataRoot, {recursive: true}),
    mkdir(comicsDirectory(workingDirectory), {recursive: true}),
    mkdir(mangaDirectory(workingDirectory), {recursive: true}),
    mkdir(tvChannelsDirectory(workingDirectory), {recursive: true}),
    mkdir(worldSaveBackupsDirectory(workingDirectory), {recursive: true}),
    mkdir(preparedCatalogDirectory(workingDirectory), {recursive: true}),
    mkdir(libraryPackDirectory(workingDirectory), {recursive: true}),
  ]);
  const readmePath = resolve(dataRoot, "README.txt");
  await writeFile(readmePath, DATA_ROOT_README, {
    flag: "wx",
  }).catch(() => {});
  return dataRoot;
};
