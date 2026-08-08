export const WEEBCENTRAL_SPARSE_METADATA_FILE = ".afterleaf-sparse.json";

export interface WeebCentralSparseMetadata {
  chapterId: string;
  metadataHash: string;
  pageUrls: string[];
  schemaVersion: 1;
}

export const createWeebCentralSparseMetadata = (
  chapterId: string,
  metadataHash: string,
  pageUrls: readonly string[],
): WeebCentralSparseMetadata => ({
  chapterId,
  metadataHash,
  pageUrls: [...pageUrls],
  schemaVersion: 1,
});

export const parseWeebCentralSparseMetadata = (
  value: unknown,
): WeebCentralSparseMetadata => {
  if (typeof value !== "object" || value === null)
    throw new Error("WeebCentral sparse metadata must be an object");
  const metadata = value as Partial<WeebCentralSparseMetadata>;
  if (
    metadata.schemaVersion !== 1 ||
    typeof metadata.chapterId !== "string" ||
    !metadata.chapterId ||
    typeof metadata.metadataHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(metadata.metadataHash) ||
    !Array.isArray(metadata.pageUrls) ||
    !metadata.pageUrls.every(
      (pageUrl) => typeof pageUrl === "string" && /^https?:\/\//u.test(pageUrl),
    )
  )
    throw new Error("WeebCentral sparse metadata is invalid");
  return metadata as WeebCentralSparseMetadata;
};
