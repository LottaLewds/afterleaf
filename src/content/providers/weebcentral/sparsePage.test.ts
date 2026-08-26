import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import type {PackedPublication} from "~/content/schema";
import {WeebCentralClient} from "~/content/providers/weebcentral/client";
import {createWeebCentralSparsePageMaterializer} from "~/content/providers/weebcentral/sparsePage";
import {WEEBCENTRAL_SPARSE_METADATA_FILE} from "~/content/providers/weebcentral/sparseMetadata";
import {stubFetch} from "~/test/fetchStub";

const publication = {
  pageCount: 2,
  source: {
    metadataHash: "metadata-hash",
    provider: "weebcentral",
    remoteId: "chapter-id",
  },
} as PackedPublication;

test("WeebCentral sparse pages validate metadata and page count", async () => {
  const sourceDirectory = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-sparse-"));
  const requests: string[] = [];
  const client = new WeebCentralClient({
    fetcher: stubFetch(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/images?"))
        return new Response(
          '<img alt="Page 1" src="https://images.test/1.png"><img alt="Page 2" src="https://images.test/2.png">',
          {headers: {"content-type": "text/html"}},
        );
      return new Response(new Uint8Array([2]), {
        headers: {"content-type": "image/png"},
      });
    }),
    origin: "https://weebcentral.test",
    requestIntervalMilliseconds: 0,
    retryCount: 0,
  });
  const materialize = createWeebCentralSparsePageMaterializer(client);

  try {
    expect(
      await materialize({
        metadataHash: "metadata-hash",
        pageCount: 2,
        pageNumber: 2,
        publication,
        sourceDirectory,
      }),
    ).toEqual(Buffer.from([2]));
    await expect(
      materialize({
        metadataHash: "stale",
        pageCount: 2,
        pageNumber: 1,
        publication,
        sourceDirectory,
      }),
    ).rejects.toThrow("metadata is stale");
    expect(requests.filter((url) => url.includes("/images?"))).toHaveLength(1);
  } finally {
    await rm(sourceDirectory, {force: true, recursive: true});
  }
});

test("WeebCentral sparse pages reject changed remote page counts", async () => {
  const client = new WeebCentralClient({
    fetcher: stubFetch(
      async () =>
        new Response('<img alt="Page 1" src="https://images.test/1.png">', {
          headers: {"content-type": "text/html"},
        }),
    ),
    origin: "https://weebcentral.test",
    requestIntervalMilliseconds: 0,
    retryCount: 0,
  });

  await expect(
    createWeebCentralSparsePageMaterializer(client)({
      metadataHash: "metadata-hash",
      pageCount: 2,
      pageNumber: 1,
      publication,
      sourceDirectory: "/unused",
    }),
  ).rejects.toThrow("metadata changed");
});

test("WeebCentral sparse pages reuse persisted page URLs", async () => {
  const sourceDirectory = await mkdtemp(resolve(tmpdir(), "afterleaf-weebcentral-sparse-"));
  const metadataHash = "b".repeat(64);
  const cachedPublication = {
    pageCount: 2,
    source: {metadataHash, provider: "weebcentral", remoteId: "chapter-id"},
  } as PackedPublication;
  await writeFile(
    resolve(sourceDirectory, WEEBCENTRAL_SPARSE_METADATA_FILE),
    JSON.stringify({
      chapterId: "chapter-id",
      metadataHash,
      pageUrls: ["https://images.test/1.webp", "https://images.test/2.webp"],
      schemaVersion: 1,
    }),
  );
  let pageListRequestCount = 0;
  const materialize = createWeebCentralSparsePageMaterializer({
    downloadPage: async (pageUrl) => Buffer.from(pageUrl.endsWith("2.webp") ? [2] : [1]),
    getPageList: async () => {
      pageListRequestCount += 1;
      throw new Error("Page list should not be requested");
    },
  });

  try {
    await expect(
      materialize({
        metadataHash,
        pageCount: 2,
        pageNumber: 2,
        publication: cachedPublication,
        sourceDirectory,
      }),
    ).resolves.toEqual(Buffer.from([2]));
    expect(pageListRequestCount).toBe(0);
  } finally {
    await rm(sourceDirectory, {force: true, recursive: true});
  }
});
