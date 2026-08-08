import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import type {PackedPublication} from "~/content/schema";
import {createMangaDexSparsePageMaterializer} from "~/content/providers/mangadex/sparsePage";
import {MANGADEX_SPARSE_METADATA_FILE} from "~/content/providers/mangadex/sparseMetadata";

test("MangaDex sparse pages reuse persisted at-home metadata", async () => {
  const sourceDirectory = await mkdtemp(
    resolve(tmpdir(), "afterleaf-mangadex-sparse-"),
  );
  const metadataHash = "c".repeat(64);
  const publication = {
    pageCount: 2,
    source: {
      metadataHash,
      provider: "mangadex",
      remoteId: "chapter-id",
    },
  } as PackedPublication;
  await writeFile(
    resolve(sourceDirectory, MANGADEX_SPARSE_METADATA_FILE),
    JSON.stringify({
      chapterId: "chapter-id",
      metadataHash,
      schemaVersion: 1,
      server: {
        baseUrl: "https://uploads.test",
        chapter: {
          data: ["page-1.webp", "page-2.webp"],
          dataSaver: ["page-1-small.webp", "page-2-small.webp"],
          hash: "chapter-hash",
        },
      },
    }),
  );
  let serverRequestCount = 0;
  const materialize = createMangaDexSparsePageMaterializer({
    downloadPage: async (_server, filename) =>
      Buffer.from(filename === "page-2.webp" ? [2] : [1]),
    getAtHomeServer: async () => {
      serverRequestCount += 1;
      throw new Error("At-home server should not be requested");
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
    expect(serverRequestCount).toBe(0);
  } finally {
    await rm(sourceDirectory, {force: true, recursive: true});
  }
});
