import type {NhentaiClient, NhentaiGallery} from "./client";
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import type {LibraryProviderSparsePageRequest} from "@afterleaf/provider-sdk";
import {NHENTAI_SPARSE_METADATA_FILE, createNhentaiSparseMetadata, parseNhentaiSparseMetadata} from "./sparseMetadata";

type NhentaiSparsePageClient = Pick<NhentaiClient, "downloadPage" | "loadGallery">;

/** Gallery fields required to validate and download sparse pages. */
type NhentaiSparseGalleryMetadata = Pick<NhentaiGallery, "id" | "mediaId" | "numPages" | "pages">;

export const createNhentaiSparsePageMaterializer = (client: NhentaiSparsePageClient) => {
  const galleries = new Map<string, Promise<NhentaiSparseGalleryMetadata>>();
  return async ({
    metadataHash,
    pageCount,
    pageNumber,
    publication,
    sourceDirectory,
  }: LibraryProviderSparsePageRequest) => {
    const remoteId = publication.source?.remoteId;
    if (!remoteId || !/^\d+$/u.test(remoteId)) throw new Error("nHentai publication has an invalid remote ID");
    if (!publication.source?.metadataHash || publication.source.metadataHash !== metadataHash)
      throw new Error("nHentai publication metadata is stale");
    if (pageNumber < 1 || pageNumber > pageCount) throw new Error("nHentai page is outside the publication");
    const key = `${remoteId}:${metadataHash}`;
    let galleryPromise = galleries.get(key);
    if (!galleryPromise) {
      galleryPromise = (async () => {
        const metadataPath = resolve(sourceDirectory, NHENTAI_SPARSE_METADATA_FILE);
        try {
          const metadata = parseNhentaiSparseMetadata(JSON.parse(await readFile(metadataPath, "utf8")) as unknown);
          if (
            metadata.galleryId !== Number(remoteId) ||
            metadata.metadataHash !== metadataHash ||
            metadata.pages.length !== pageCount
          )
            throw new Error("Cached nHentai metadata is stale");
          return {
            id: metadata.galleryId,
            mediaId: metadata.mediaId,
            numPages: metadata.pages.length,
            pages: metadata.pages,
          };
        } catch {
          const gallery = await client.loadGallery(Number(remoteId));
          await writeFile(
            metadataPath,
            `${JSON.stringify(createNhentaiSparseMetadata(gallery, metadataHash), null, 2)}\n`,
          );
          return gallery;
        }
      })();
      galleries.set(key, galleryPromise);
    }
    const gallery = await galleryPromise;
    if (gallery.id !== Number(remoteId) || gallery.numPages !== pageCount)
      throw new Error("Remote nHentai metadata changed; fetch the book again");
    const bytes = await client.downloadPage(gallery, pageNumber - 1);
    return Buffer.from(bytes);
  };
};
