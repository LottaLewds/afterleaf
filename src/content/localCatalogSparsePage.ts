import {readFile} from "node:fs/promises";
import {extname, isAbsolute, relative, resolve, sep} from "node:path";
// Relative imports: this module is also bundled into the Vite config
// middleware, whose loader cannot resolve the "~" alias at runtime.
import {comicsDirectory, mangaDirectory, preparedCatalogDirectory, providersDirectory} from "./dataRoot";
import {LOCAL_PUBLICATION_MANIFEST} from "./localMediaDiscovery";
import {cacheReaderPage, cachedReaderPage} from "./readerPageCache";
import {createReaderPageDerivative} from "./readerImage";
import type {PackedPublication} from "./schema";
import {parseLocalPublicationDocument, resolveContainedPath} from "./validation";

const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const MEDIA_ROOT_PATTERN = /^@media-([0-9]+)(?:\/(.*))?$/u;

export interface LocalCatalogSparsePageOptions {
  /** Extra catalog roots matching the scan-time `--media-path` additions. */
  additionalCatalogDirectories?: readonly string[];
  workingDirectory: string;
}

/**
 * Rebuilds the catalog root list that `LocalCatalogSource` saw during the
 * last scan so `localSourceId` prefixes stay stable at request time.
 */
export const localCatalogSourceRoots = async (options: LocalCatalogSparsePageOptions) => {
  const workingDirectory = resolve(options.workingDirectory);
  // Root 0 is the scan's primary catalog directory; every other root keeps
  // the import order of `LocalCatalogSource`: built-in media folders first,
  // then configured book paths.
  return [
    providersDirectory(workingDirectory),
    ...new Set([
      comicsDirectory(workingDirectory),
      mangaDirectory(workingDirectory),
      preparedCatalogDirectory(workingDirectory),
      ...(options.additionalCatalogDirectories ?? []).map((directory) => resolve(directory)),
    ]),
  ];
};

const resolvePublicationDirectory = (roots: readonly string[], localSourceId: string) => {
  let rootIndex = 0;
  let relativePath = localSourceId;
  const mediaMatch = MEDIA_ROOT_PATTERN.exec(localSourceId);
  if (mediaMatch) {
    rootIndex = Number(mediaMatch[1]);
    relativePath = mediaMatch[2] ?? "";
  }
  const root = roots[rootIndex];
  if (!root || isAbsolute(relativePath) || relativePath.includes("\\"))
    throw new Error("Publication has an invalid local source reference");
  const directory = resolve(root, relativePath);
  const containment = relative(resolve(root), directory);
  if (containment.startsWith(`..${sep}`) || isAbsolute(containment))
    throw new Error("Publication has an invalid local source reference");
  return directory;
};

/**
 * Materializes a reader page for a publication whose source images live in a
 * prepared image-folder manifest (`publication.json` beside loose images).
 */
export const materializeLocalCatalogReaderPage = async (
  publication: Pick<PackedPublication, "id" | "localSourceId" | "pageCount">,
  pageNumber: number,
  options: LocalCatalogSparsePageOptions,
) => {
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    publication.pageCount === undefined ||
    pageNumber > publication.pageCount
  )
    throw new Error("Publication does not expose that page");
  const localSourceId = publication.localSourceId;
  if (!localSourceId) throw new Error("Publication is not backed by a local catalog folder");

  const cacheKey = `local-catalog:${localSourceId}:${pageNumber}`;
  const cached = cachedReaderPage(cacheKey);
  if (cached) return cached;

  const roots = await localCatalogSourceRoots(options);
  const directory = resolvePublicationDirectory(roots, localSourceId);
  const document = parseLocalPublicationDocument(
    JSON.parse(await readFile(resolve(directory, LOCAL_PUBLICATION_MANIFEST), "utf8")) as unknown,
    LOCAL_PUBLICATION_MANIFEST,
  );
  if (document.id !== publication.id) throw new Error("Publication manifest does not match the active catalog entry");
  const pageAsset = document.assets.pages[pageNumber - 1];
  if (!pageAsset) throw new Error("Publication manifest lacks that page");
  const imagePath = resolveContainedPath(directory, pageAsset);
  if (!IMAGE_EXTENSIONS.has(extname(imagePath).toLowerCase()))
    throw new Error("Publication page asset is not a supported image");
  const derivative = await createReaderPageDerivative(await readFile(imagePath));
  cacheReaderPage(cacheKey, derivative);
  return derivative;
};
