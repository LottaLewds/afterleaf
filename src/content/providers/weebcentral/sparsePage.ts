import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

import type {LibraryProviderSparsePageRequest} from "@afterleaf/provider-sdk";
import {WeebCentralClient} from "./client";
import {
  WEEBCENTRAL_SPARSE_METADATA_FILE,
  createWeebCentralSparseMetadata,
  parseWeebCentralSparseMetadata,
} from "./sparseMetadata";

type WeebCentralSparsePageClient = Pick<WeebCentralClient, "downloadPage" | "getPageList">;

export const createWeebCentralSparsePageMaterializer = (client: WeebCentralSparsePageClient) => {
  const pageLists = new Map<string, Promise<string[]>>();
  return async ({
    metadataHash,
    pageCount,
    pageNumber,
    publication,
    sourceDirectory,
  }: LibraryProviderSparsePageRequest) => {
    const remoteId = publication.source?.remoteId;
    if (!remoteId) throw new Error("WeebCentral publication has no chapter ID");
    if (!publication.source?.metadataHash || publication.source.metadataHash !== metadataHash)
      throw new Error("WeebCentral publication metadata is stale");
    if (pageNumber < 1 || pageNumber > pageCount) throw new Error("WeebCentral page is outside the publication");
    const metadataPath = resolve(sourceDirectory, WEEBCENTRAL_SPARSE_METADATA_FILE);
    const key = `${remoteId}:${metadataHash}`;
    let loadedFromDisk = false;
    let pagesPromise = pageLists.get(key);
    if (!pagesPromise) {
      pagesPromise = (async () => {
        try {
          const metadata = parseWeebCentralSparseMetadata(JSON.parse(await readFile(metadataPath, "utf8")) as unknown);
          if (
            metadata.chapterId !== remoteId ||
            metadata.metadataHash !== metadataHash ||
            metadata.pageUrls.length !== pageCount
          )
            throw new Error("Cached WeebCentral metadata is stale");
          loadedFromDisk = true;
          return metadata.pageUrls;
        } catch {
          const pageUrls = await client.getPageList(remoteId);
          if (pageUrls.length !== pageCount)
            throw new Error("Remote WeebCentral metadata changed; fetch the book again");
          await writeFile(
            metadataPath,
            `${JSON.stringify(createWeebCentralSparseMetadata(remoteId, metadataHash, pageUrls), null, 2)}\n`,
          );
          return pageUrls;
        }
      })();
      pageLists.set(key, pagesPromise);
    }
    let pageUrls = await pagesPromise;
    if (pageUrls.length !== pageCount) throw new Error("Remote WeebCentral metadata changed; fetch the book again");
    let pageUrl = pageUrls[pageNumber - 1];
    if (!pageUrl) throw new Error("Remote WeebCentral page metadata is incomplete");
    try {
      return await client.downloadPage(pageUrl);
    } catch (error) {
      if (!loadedFromDisk) throw error;
      pageUrls = await client.getPageList(remoteId);
      if (pageUrls.length !== pageCount)
        throw new Error("Remote WeebCentral metadata changed; fetch the book again", {cause: error});
      pageUrl = pageUrls[pageNumber - 1];
      if (!pageUrl) throw new Error("Remote WeebCentral page metadata is incomplete", {cause: error});
      await writeFile(
        metadataPath,
        `${JSON.stringify(createWeebCentralSparseMetadata(remoteId, metadataHash, pageUrls), null, 2)}\n`,
      );
      pageLists.set(key, Promise.resolve(pageUrls));
      return client.downloadPage(pageUrl);
    }
  };
};
