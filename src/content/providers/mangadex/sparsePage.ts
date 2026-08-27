import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

import type {LibraryProviderSparsePageRequest} from "@afterleaf/provider-sdk";
import {MangaDexClient, type MangaDexAtHomeServer} from "./client";
import {
  MANGADEX_SPARSE_METADATA_FILE,
  createMangaDexSparseMetadata,
  parseMangaDexSparseMetadata,
} from "./sparseMetadata";

type MangaDexSparsePageClient = Pick<MangaDexClient, "downloadPage" | "getAtHomeServer">;

export const createMangaDexSparsePageMaterializer = (client: MangaDexSparsePageClient) => {
  const servers = new Map<string, Promise<MangaDexAtHomeServer>>();
  return async ({
    metadataHash,
    pageCount,
    pageNumber,
    publication,
    sourceDirectory,
  }: LibraryProviderSparsePageRequest) => {
    const remoteId = publication.source?.remoteId;
    if (!remoteId) throw new Error("MangaDex publication has no chapter ID");
    if (!publication.source?.metadataHash || publication.source.metadataHash !== metadataHash)
      throw new Error("MangaDex publication metadata is stale");
    if (pageNumber < 1 || pageNumber > pageCount) throw new Error("MangaDex page is outside the publication");
    const metadataPath = resolve(sourceDirectory, MANGADEX_SPARSE_METADATA_FILE);
    const key = `${remoteId}:${metadataHash}`;
    let loadedFromDisk = false;
    let serverPromise = servers.get(key);
    if (!serverPromise) {
      serverPromise = (async () => {
        try {
          const metadata = parseMangaDexSparseMetadata(JSON.parse(await readFile(metadataPath, "utf8")) as unknown);
          if (
            metadata.chapterId !== remoteId ||
            metadata.metadataHash !== metadataHash ||
            metadata.server.chapter.data.length !== pageCount
          )
            throw new Error("Cached MangaDex metadata is stale");
          loadedFromDisk = true;
          return metadata.server;
        } catch {
          const server = await client.getAtHomeServer(remoteId);
          if (server.chapter.data.length !== pageCount)
            throw new Error("Remote MangaDex metadata changed; fetch the book again");
          await writeFile(
            metadataPath,
            `${JSON.stringify(createMangaDexSparseMetadata(remoteId, metadataHash, server), null, 2)}\n`,
          );
          return server;
        }
      })();
      servers.set(key, serverPromise);
    }
    let server = await serverPromise;
    if (server.chapter.data.length !== pageCount)
      throw new Error("Remote MangaDex metadata changed; fetch the book again");
    let filename = server.chapter.data[pageNumber - 1];
    if (!filename) throw new Error("Remote MangaDex page metadata is incomplete");
    try {
      return await client.downloadPage(server, filename);
    } catch (error) {
      if (!loadedFromDisk) throw error;
      server = await client.getAtHomeServer(remoteId);
      if (server.chapter.data.length !== pageCount)
        throw new Error("Remote MangaDex metadata changed; fetch the book again", {cause: error});
      filename = server.chapter.data[pageNumber - 1];
      if (!filename) throw new Error("Remote MangaDex page metadata is incomplete", {cause: error});
      await writeFile(
        metadataPath,
        `${JSON.stringify(createMangaDexSparseMetadata(remoteId, metadataHash, server), null, 2)}\n`,
      );
      servers.set(key, Promise.resolve(server));
      return client.downloadPage(server, filename);
    }
  };
};
