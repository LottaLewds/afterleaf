import {basename, posix} from "node:path";
import {fileURLToPath} from "node:url";
import {
  ARCHIVE_SOURCE_PROVIDER,
  isContentArchivePath,
  readContentArchiveImage,
} from "./archiveReader";
import {createReaderPageDerivative} from "./readerImage";

interface ArchiveBackedPublication {
  pageCount?: number;
  source?: {
    metadataHash: string;
    provider: string;
    remoteId: string;
    sourceUrl: string;
  };
}

const MAX_READER_CACHE_BYTES = 128 * 1024 * 1024;
const readerPageCache = new Map<string, Buffer>();
let readerPageCacheBytes = 0;

const cachedReaderPage = (key: string) => {
  const page = readerPageCache.get(key);
  if (!page) return undefined;
  readerPageCache.delete(key);
  readerPageCache.set(key, page);
  return page;
};

const cacheReaderPage = (key: string, page: Buffer) => {
  const existing = readerPageCache.get(key);
  if (existing) readerPageCacheBytes -= existing.byteLength;
  readerPageCache.delete(key);
  readerPageCache.set(key, page);
  readerPageCacheBytes += page.byteLength;
  while (readerPageCacheBytes > MAX_READER_CACHE_BYTES) {
    const oldest = readerPageCache.entries().next().value;
    if (!oldest) break;
    readerPageCache.delete(oldest[0]);
    readerPageCacheBytes -= oldest[1].byteLength;
  }
};

const archiveSourcePath = (publication: ArchiveBackedPublication) => {
  const source = publication.source;
  if (source?.provider !== ARCHIVE_SOURCE_PROVIDER)
    throw new Error("Publication is not backed by a content archive");
  if (!/^[a-f0-9]{64}$/u.test(source.metadataHash))
    throw new Error("Publication has an invalid archive fingerprint");
  let archivePath: string;
  try {
    const sourceUrl = new URL(source.sourceUrl);
    if (sourceUrl.protocol !== "file:")
      throw new Error("Archive source must use a local file URL");
    archivePath = fileURLToPath(sourceUrl);
  } catch (error) {
    throw new Error(
      `Publication has an invalid archive source URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const remoteIdSegments = source.remoteId.split("/");
  if (
    remoteIdSegments.some(
      (segment) => !segment || segment === "." || segment === "..",
    ) ||
    basename(archivePath) !== posix.basename(source.remoteId) ||
    !isContentArchivePath(archivePath)
  )
    throw new Error("Publication source identity does not match its archive");
  return {archivePath, metadataHash: source.metadataHash};
};

export const materializeArchiveReaderPage = async (
  publication: ArchiveBackedPublication,
  pageNumber: number,
) => {
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    publication.pageCount === undefined ||
    pageNumber > publication.pageCount
  )
    throw new Error("Publication does not expose that archive page");
  const {archivePath, metadataHash} = archiveSourcePath(publication);
  const cacheKey = `${metadataHash}:${pageNumber}`;
  const cached = cachedReaderPage(cacheKey);
  if (cached) return cached;

  const source = await readContentArchiveImage(
    archivePath,
    pageNumber - 1,
    metadataHash,
  );
  const page = await createReaderPageDerivative(source);
  cacheReaderPage(cacheKey, page);
  return page;
};
