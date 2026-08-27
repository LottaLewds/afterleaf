import type {MangaDexAtHomeServer} from "./client";

export const MANGADEX_SPARSE_METADATA_FILE = ".afterleaf-sparse.json";

export interface MangaDexSparseMetadata {
  chapterId: string;
  metadataHash: string;
  schemaVersion: 1;
  server: MangaDexAtHomeServer;
}

export const createMangaDexSparseMetadata = (
  chapterId: string,
  metadataHash: string,
  server: MangaDexAtHomeServer,
): MangaDexSparseMetadata => ({
  chapterId,
  metadataHash,
  schemaVersion: 1,
  server,
});

export const parseMangaDexSparseMetadata = (value: unknown): MangaDexSparseMetadata => {
  if (typeof value !== "object" || value === null) throw new Error("MangaDex sparse metadata must be an object");
  const metadata = value as Partial<MangaDexSparseMetadata>;
  const server = metadata.server;
  if (
    metadata.schemaVersion !== 1 ||
    typeof metadata.chapterId !== "string" ||
    !metadata.chapterId ||
    typeof metadata.metadataHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(metadata.metadataHash) ||
    typeof server !== "object" ||
    server === null ||
    typeof server.baseUrl !== "string" ||
    !/^https?:\/\//u.test(server.baseUrl) ||
    typeof server.chapter !== "object" ||
    server.chapter === null ||
    typeof server.chapter.hash !== "string" ||
    !server.chapter.hash ||
    !Array.isArray(server.chapter.data) ||
    !server.chapter.data.every((page) => typeof page === "string") ||
    !Array.isArray(server.chapter.dataSaver) ||
    !server.chapter.dataSaver.every((page) => typeof page === "string")
  )
    throw new Error("MangaDex sparse metadata is invalid");
  return metadata as MangaDexSparseMetadata;
};
