import type {NhentaiGallery, NhentaiPage} from "./client";

export const NHENTAI_SPARSE_METADATA_FILE = ".afterleaf-sparse.json";

export interface NhentaiSparseMetadata {
  galleryId: number;
  mediaId: string;
  metadataHash: string;
  pages: NhentaiPage[];
  schemaVersion: 1;
}

export const createNhentaiSparseMetadata = (gallery: NhentaiGallery, metadataHash: string): NhentaiSparseMetadata => ({
  galleryId: gallery.id,
  mediaId: gallery.mediaId,
  metadataHash,
  pages: gallery.pages,
  schemaVersion: 1,
});

export const parseNhentaiSparseMetadata = (value: unknown): NhentaiSparseMetadata => {
  if (typeof value !== "object" || value === null) throw new Error("nHentai sparse metadata must be an object");
  const metadata = value as Partial<NhentaiSparseMetadata>;
  if (
    metadata.schemaVersion !== 1 ||
    !Number.isSafeInteger(metadata.galleryId) ||
    Number(metadata.galleryId) <= 0 ||
    typeof metadata.mediaId !== "string" ||
    !/^\d+$/u.test(metadata.mediaId) ||
    typeof metadata.metadataHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(metadata.metadataHash) ||
    !Array.isArray(metadata.pages)
  )
    throw new Error("nHentai sparse metadata is invalid");
  const pages = metadata.pages.map((page) => {
    if (
      typeof page !== "object" ||
      page === null ||
      (page.type !== "j" && page.type !== "p" && page.type !== "w") ||
      (page.path !== undefined && typeof page.path !== "string")
    )
      throw new Error("nHentai sparse page metadata is invalid");
    return {
      ...(page.path === undefined ? {} : {path: page.path}),
      type: page.type,
    };
  });
  return {
    galleryId: Number(metadata.galleryId),
    mediaId: metadata.mediaId,
    metadataHash: metadata.metadataHash,
    pages,
    schemaVersion: 1,
  };
};
