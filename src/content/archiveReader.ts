import {createHash} from "node:crypto";
import {lstat, mkdtemp, readFile, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {extname, isAbsolute, join, posix, resolve} from "node:path";
import type {Readable} from "node:stream";
import {createExtractorFromFile, type FileHeader} from "node-unrar-js";
import yauzl, {type Entry, type ZipFile} from "yauzl";

const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const NATURAL_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_ARCHIVE_IMAGES = 1_000;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const MAX_ENTRY_PATH_LENGTH = 512;
const SUPPORTED_COMPRESSION_METHODS = new Set([0, 8]);
const MAX_CACHED_ARCHIVE_INSPECTIONS = 128;

export const ARCHIVE_SOURCE_PROVIDER = "afterleaf-cbz";
export const CONTENT_ARCHIVE_EXTENSIONS = new Set([
  ".cbr",
  ".cbz",
  ".rar",
  ".zip",
]);

const RAR_ARCHIVE_EXTENSIONS = new Set([".cbr", ".rar"]);

export const isContentArchivePath = (path: string) =>
  CONTENT_ARCHIVE_EXTENSIONS.has(extname(path).toLowerCase());

export interface ArchiveInspection {
  imageEntries: string[];
  ignoredEntryCount: number;
  metadataHash: string;
  modifiedAt: string;
  totalUncompressedBytes: number;
}

interface CachedArchiveInspection {
  changedAt: number;
  inspection: ArchiveInspection;
  modifiedAt: number;
  size: number;
}

interface ArchiveEntryFingerprint {
  compressedSize: number;
  compressionMethod: number | string;
  crc32: number;
  path: string;
  uncompressedSize: number;
}

const archiveInspectionCache = new Map<string, CachedArchiveInspection>();

const cachedInspection = async (archivePath: string) => {
  const resolvedArchivePath = resolve(archivePath);
  const archiveStat = await stat(resolvedArchivePath);
  if (!archiveStat.isFile()) throw new Error("Archive path is not a file");
  if (archiveStat.size > MAX_ARCHIVE_BYTES)
    throw new Error("Archive exceeds the 2 GiB compressed-size limit");
  const cached = archiveInspectionCache.get(resolvedArchivePath);
  if (
    cached?.size === archiveStat.size &&
    cached.modifiedAt === archiveStat.mtimeMs &&
    cached.changedAt === archiveStat.ctimeMs
  ) {
    archiveInspectionCache.delete(resolvedArchivePath);
    archiveInspectionCache.set(resolvedArchivePath, cached);
    return {archiveStat, cached: cached.inspection, resolvedArchivePath};
  }
  return {archiveStat, cached: undefined, resolvedArchivePath};
};

const cacheInspection = (
  resolvedArchivePath: string,
  archiveStat: Awaited<ReturnType<typeof stat>>,
  inspection: ArchiveInspection,
) => {
  archiveInspectionCache.delete(resolvedArchivePath);
  archiveInspectionCache.set(resolvedArchivePath, {
    changedAt: archiveStat.ctimeMs,
    inspection,
    modifiedAt: archiveStat.mtimeMs,
    size: archiveStat.size,
  });
  while (archiveInspectionCache.size > MAX_CACHED_ARCHIVE_INSPECTIONS) {
    const oldest = archiveInspectionCache.keys().next().value;
    if (!oldest) break;
    archiveInspectionCache.delete(oldest);
  }
  return inspection;
};

const openZip = (path: string) =>
  new Promise<ZipFile>((resolvePromise, reject) => {
    yauzl.open(
      path,
      {
        autoClose: true,
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zipFile) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(zipFile);
      },
    );
  });

const normalizeArchiveEntryPath = (fileName: string) => {
  const normalized = fileName.normalize("NFC");
  if (normalized.length === 0 || normalized.length > MAX_ENTRY_PATH_LENGTH)
    throw new Error(`Archive entry has an invalid path length: ${fileName}`);
  if (normalized.includes("\0") || normalized.includes("\\"))
    throw new Error(`Archive entry uses an unsafe path: ${fileName}`);
  const directory = normalized.endsWith("/");
  const path = directory ? normalized.slice(0, -1) : normalized;
  if (!path || posix.isAbsolute(path) || isAbsolute(path))
    throw new Error(
      `Archive entry must use a contained relative path: ${fileName}`,
    );
  const segments = path.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  )
    throw new Error(
      `Archive entry escapes or aliases its destination: ${fileName}`,
    );
  return {directory, path: segments.join("/")};
};

const isSymlinkEntry = (entry: Entry) => {
  const hostSystem = entry.versionMadeBy >>> 8;
  if (hostSystem !== 3) return false;
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0xf000) === 0xa000;
};

const validateArchiveEntrySizes = (entry: Entry) => {
  if (
    !Number.isSafeInteger(entry.compressedSize) ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.compressedSize < 0 ||
    entry.uncompressedSize < 0
  )
    throw new Error(`Archive entry has invalid sizes: ${entry.fileName}`);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES)
    throw new Error(
      `Archive entry exceeds the 128 MiB limit: ${entry.fileName}`,
    );
  if (entry.uncompressedSize === 0) return;
  if (entry.compressedSize === 0)
    throw new Error(
      `Archive entry has an infinite compression ratio: ${entry.fileName}`,
    );
  if (entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO)
    throw new Error(
      `Archive entry exceeds the ${MAX_COMPRESSION_RATIO}:1 compression-ratio limit: ${entry.fileName}`,
    );
};

const validateArchiveEntry = (entry: Entry, normalizedPaths: Set<string>) => {
  if (entry.isEncrypted())
    throw new Error(
      `Encrypted archive entry is not allowed: ${entry.fileName}`,
    );
  if (isSymlinkEntry(entry))
    throw new Error(
      `Symbolic-link archive entry is not allowed: ${entry.fileName}`,
    );
  if (!SUPPORTED_COMPRESSION_METHODS.has(entry.compressionMethod))
    throw new Error(
      `Unsupported ZIP compression method ${entry.compressionMethod}: ${entry.fileName}`,
    );
  validateArchiveEntrySizes(entry);
  const normalized = normalizeArchiveEntryPath(entry.fileName);
  const collisionKey = normalized.path.toLocaleLowerCase("en-US");
  if (normalizedPaths.has(collisionKey))
    throw new Error(
      `Archive contains a duplicate or case-colliding path: ${entry.fileName}`,
    );
  normalizedPaths.add(collisionKey);
  return normalized;
};

const inspectZipArchive = async (
  resolvedArchivePath: string,
  archiveStat: Awaited<ReturnType<typeof stat>>,
): Promise<ArchiveInspection> => {
  const zipFile = await openZip(resolvedArchivePath);
  if (zipFile.entryCount > MAX_ARCHIVE_ENTRIES) {
    zipFile.close();
    throw new Error(`Archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry limit`);
  }

  return new Promise<ArchiveInspection>((resolvePromise, reject) => {
    const entryFingerprints: ArchiveEntryFingerprint[] = [];
    const imageEntries: string[] = [];
    const normalizedPaths = new Set<string>();
    let ignoredEntryCount = 0;
    let totalUncompressedBytes = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    zipFile.on("error", fail);
    zipFile.on("entry", (entry: Entry) => {
      try {
        const normalized = validateArchiveEntry(entry, normalizedPaths);
        entryFingerprints.push({
          compressedSize: entry.compressedSize,
          compressionMethod: entry.compressionMethod,
          crc32: entry.crc32,
          path: normalized.path,
          uncompressedSize: entry.uncompressedSize,
        });
        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
          throw new Error("Archive exceeds the 2 GiB uncompressed-size limit");
        if (!normalized.directory) {
          if (
            IMAGE_EXTENSIONS.has(posix.extname(normalized.path).toLowerCase())
          )
            imageEntries.push(normalized.path);
          else ignoredEntryCount += 1;
        }
        if (imageEntries.length > MAX_ARCHIVE_IMAGES)
          throw new Error(
            `Archive exceeds the ${MAX_ARCHIVE_IMAGES}-image limit`,
          );
        zipFile.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zipFile.on("end", () => {
      if (settled) return;
      settled = true;
      if (imageEntries.length === 0) {
        reject(new Error("Archive contains no supported images"));
        return;
      }
      imageEntries.sort((left, right) => NATURAL_COLLATOR.compare(left, right));
      entryFingerprints.sort((left, right) =>
        left.path.localeCompare(right.path),
      );
      const metadataHash = createHash("sha256")
        .update(
          JSON.stringify({
            archiveSize: archiveStat.size,
            entries: entryFingerprints,
          }),
        )
        .digest("hex");
      const inspection = {
        imageEntries,
        ignoredEntryCount,
        metadataHash,
        modifiedAt: archiveStat.mtime.toISOString(),
        totalUncompressedBytes,
      };
      resolvePromise(
        cacheInspection(resolvedArchivePath, archiveStat, inspection),
      );
    });
    zipFile.readEntry();
  });
};

const validateRarEntry = (entry: FileHeader, normalizedPaths: Set<string>) => {
  if (entry.flags.encrypted)
    throw new Error(`Encrypted archive entry is not allowed: ${entry.name}`);
  if (
    !Number.isSafeInteger(entry.packSize) ||
    !Number.isSafeInteger(entry.unpSize) ||
    entry.packSize < 0 ||
    entry.unpSize < 0
  )
    throw new Error(`Archive entry has invalid sizes: ${entry.name}`);
  if (entry.unpSize > MAX_ENTRY_BYTES)
    throw new Error(`Archive entry exceeds the 128 MiB limit: ${entry.name}`);
  if (entry.unpSize > 0 && entry.packSize === 0)
    throw new Error(
      `Archive entry has an infinite compression ratio: ${entry.name}`,
    );
  if (
    entry.unpSize > 0 &&
    entry.unpSize / entry.packSize > MAX_COMPRESSION_RATIO
  )
    throw new Error(
      `Archive entry exceeds the ${MAX_COMPRESSION_RATIO}:1 compression-ratio limit: ${entry.name}`,
    );
  const normalized = normalizeArchiveEntryPath(
    entry.flags.directory && !entry.name.endsWith("/")
      ? `${entry.name}/`
      : entry.name,
  );
  const collisionKey = normalized.path.toLocaleLowerCase("en-US");
  if (normalizedPaths.has(collisionKey))
    throw new Error(
      `Archive contains a duplicate or case-colliding path: ${entry.name}`,
    );
  normalizedPaths.add(collisionKey);
  return normalized;
};

const inspectRarArchive = async (
  resolvedArchivePath: string,
  archiveStat: Awaited<ReturnType<typeof stat>>,
): Promise<ArchiveInspection> => {
  const extractor = await createExtractorFromFile({
    filepath: resolvedArchivePath,
  });
  const list = extractor.getFileList();
  if (list.arcHeader.flags.headerEncrypted)
    throw new Error("Encrypted archive headers are not allowed");
  if (list.arcHeader.flags.volume)
    throw new Error("Multi-volume RAR archives are not supported");
  const entries = [...list.fileHeaders];
  if (entries.length > MAX_ARCHIVE_ENTRIES)
    throw new Error(`Archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry limit`);

  const entryFingerprints: ArchiveEntryFingerprint[] = [];
  const imageEntries: string[] = [];
  const normalizedPaths = new Set<string>();
  let ignoredEntryCount = 0;
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    const normalized = validateRarEntry(entry, normalizedPaths);
    entryFingerprints.push({
      compressedSize: entry.packSize,
      compressionMethod: entry.method,
      crc32: entry.crc,
      path: normalized.path,
      uncompressedSize: entry.unpSize,
    });
    totalUncompressedBytes += entry.unpSize;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
      throw new Error("Archive exceeds the 2 GiB uncompressed-size limit");
    if (normalized.directory) continue;
    if (IMAGE_EXTENSIONS.has(posix.extname(normalized.path).toLowerCase()))
      imageEntries.push(normalized.path);
    else ignoredEntryCount += 1;
    if (imageEntries.length > MAX_ARCHIVE_IMAGES)
      throw new Error(`Archive exceeds the ${MAX_ARCHIVE_IMAGES}-image limit`);
  }
  if (imageEntries.length === 0)
    throw new Error("Archive contains no supported images");
  imageEntries.sort((left, right) => NATURAL_COLLATOR.compare(left, right));
  entryFingerprints.sort((left, right) => left.path.localeCompare(right.path));
  const metadataHash = createHash("sha256")
    .update(
      JSON.stringify({
        archiveSize: archiveStat.size,
        archiveType: "rar",
        entries: entryFingerprints,
      }),
    )
    .digest("hex");
  return cacheInspection(resolvedArchivePath, archiveStat, {
    imageEntries,
    ignoredEntryCount,
    metadataHash,
    modifiedAt: archiveStat.mtime.toISOString(),
    totalUncompressedBytes,
  });
};

export const inspectContentArchive = async (
  archivePath: string,
): Promise<ArchiveInspection> => {
  const {archiveStat, cached, resolvedArchivePath} =
    await cachedInspection(archivePath);
  if (cached) return cached;
  if (RAR_ARCHIVE_EXTENSIONS.has(extname(resolvedArchivePath).toLowerCase()))
    return inspectRarArchive(resolvedArchivePath, archiveStat);
  return inspectZipArchive(resolvedArchivePath, archiveStat);
};

const openEntryStream = (zipFile: ZipFile, entry: Entry) =>
  new Promise<Readable>((resolvePromise, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise(stream);
    });
  });

const collectArchiveEntry = (stream: Readable, entryPath: string) =>
  new Promise<Buffer>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    stream.on("data", (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.byteLength;
      if (bytesRead <= MAX_ENTRY_BYTES) {
        chunks.push(buffer);
        return;
      }
      stream.destroy(
        new Error(`Archive entry exceeds the 128 MiB limit: ${entryPath}`),
      );
    });
    stream.once("error", reject);
    stream.once("end", () => resolvePromise(Buffer.concat(chunks, bytesRead)));
  });

const readArchiveEntry = async (archivePath: string, entryPath: string) => {
  const zipFile = await openZip(archivePath);
  const normalizedPaths = new Set<string>();
  return new Promise<Buffer>((resolvePromise, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    zipFile.on("error", fail);
    zipFile.on("entry", (entry: Entry) => {
      void (async () => {
        const normalized = validateArchiveEntry(entry, normalizedPaths);
        if (normalized.directory || normalized.path !== entryPath) {
          zipFile.readEntry();
          return;
        }
        const stream = await openEntryStream(zipFile, entry);
        const content = await collectArchiveEntry(stream, entryPath);
        if (content.byteLength !== entry.uncompressedSize)
          throw new Error(
            `Archive entry size changed while reading: ${entryPath}`,
          );
        settled = true;
        zipFile.close();
        resolvePromise(content);
      })().catch(fail);
    });
    zipFile.on("end", () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Archive entry was not found: ${entryPath}`));
    });
    zipFile.readEntry();
  });
};

const readRarEntry = async (archivePath: string, entryPath: string) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "afterleaf-rar-page-"),
  );
  const outputPath = join(temporaryDirectory, "page");
  try {
    const extractor = await createExtractorFromFile({
      filenameTransform: () => "page",
      filepath: archivePath,
      targetPath: temporaryDirectory,
    });
    const extractedFiles = [...extractor.extract({files: [entryPath]}).files];
    if (
      extractedFiles.length !== 1 ||
      extractedFiles[0]?.fileHeader.name !== entryPath
    )
      throw new Error(`Archive entry was not found: ${entryPath}`);
    const outputStat = await lstat(outputPath);
    if (!outputStat.isFile() || outputStat.isSymbolicLink())
      throw new Error(`Archive entry is not a regular file: ${entryPath}`);
    if (outputStat.size > MAX_ENTRY_BYTES)
      throw new Error(`Archive entry exceeds the 128 MiB limit: ${entryPath}`);
    return await readFile(outputPath);
  } finally {
    await rm(temporaryDirectory, {force: true, recursive: true});
  }
};

export const readContentArchiveImage = async (
  archivePath: string,
  pageIndex: number,
  expectedMetadataHash?: string,
) => {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0)
    throw new Error("Archive page index must be a non-negative integer");
  const inspection = await inspectContentArchive(archivePath);
  if (
    expectedMetadataHash !== undefined &&
    inspection.metadataHash !== expectedMetadataHash
  )
    throw new Error(
      "Archive contents changed after the library snapshot was built",
    );
  const entryPath = inspection.imageEntries[pageIndex];
  if (!entryPath) throw new Error("Archive does not contain that page");
  if (RAR_ARCHIVE_EXTENSIONS.has(extname(archivePath).toLowerCase()))
    return readRarEntry(archivePath, entryPath);
  return readArchiveEntry(archivePath, entryPath);
};
