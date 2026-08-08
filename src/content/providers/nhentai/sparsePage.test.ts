import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import type {PackedPublication} from "~/content/schema";
import {createNhentaiSparsePageMaterializer} from "~/content/providers/nhentai/sparsePage";
import {NHENTAI_SPARSE_METADATA_FILE} from "~/content/providers/nhentai/sparseMetadata";

test("nHentai sparse pages reuse persisted gallery metadata", async () => {
  const sourceDirectory = await mkdtemp(
    resolve(tmpdir(), "afterleaf-nhentai-sparse-"),
  );
  const metadataHash = "a".repeat(64);
  const publication = {
    pageCount: 2,
    source: {
      metadataHash,
      provider: "nhentai",
      remoteId: "42",
    },
  } as PackedPublication;
  await writeFile(
    resolve(sourceDirectory, NHENTAI_SPARSE_METADATA_FILE),
    JSON.stringify({
      galleryId: 42,
      mediaId: "9001",
      metadataHash,
      pages: [{type: "j"}, {type: "p"}],
      schemaVersion: 1,
    }),
  );
  let galleryRequestCount = 0;
  const materialize = createNhentaiSparsePageMaterializer({
    downloadPage: async (gallery, pageIndex) => {
      expect(gallery).toMatchObject({id: 42, mediaId: "9001"});
      return Buffer.from([pageIndex + 1]);
    },
    loadGallery: async () => {
      galleryRequestCount += 1;
      throw new Error("Gallery API should not be requested");
    },
  });

  try {
    await expect(
      materialize({
        metadataHash,
        pageCount: 2,
        pageNumber: 2,
        publication,
        sourceDirectory,
      }),
    ).resolves.toEqual(Buffer.from([2]));
    expect(galleryRequestCount).toBe(0);
  } finally {
    await rm(sourceDirectory, {force: true, recursive: true});
  }
});
