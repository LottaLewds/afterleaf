import {afterEach, expect, test} from "bun:test";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {repairCachedProviderPublications} from "~/content/providerCacheRepair";
import {createLibraryProviderRegistry} from "~/content/providers/registry";
import type {
  LibraryProvider,
  LibraryProviderDescriptor,
} from "~/content/providers/types";
import type {LocalPublicationDocument} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const descriptor: LibraryProviderDescriptor = {
  contentKinds: ["commercial-volume"],
  defaultBlockedTags: [],
  defaultLanguages: ["english"],
  defaultQuery: "",
  id: "test-provider",
  name: "Test provider",
  queryHelp: "Test provider",
  queryLabel: "Search",
  queryPlaceholder: "Search",
  requiresLanguageTag: false,
  summary: "Test provider",
};

const createFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-provider-repair-"));
  temporaryDirectories.push(root);
  const publicationDirectory = resolve(root, "test-provider", "book");
  await mkdir(resolve(publicationDirectory, "pages"), {recursive: true});
  const document: LocalPublicationDocument = {
    assets: {
      back: "pages/010.png",
      front: "pages/001.png",
      pages: ["pages/001.png", "pages/002.png", "pages/003.png"],
    },
    id: "book",
    language: "english",
    pageCount: 10,
    schemaVersion: 1,
    source: {
      metadataHash: "metadata-hash",
      provider: descriptor.id,
      remoteId: "remote-book",
      retrievedAt: "2026-08-18T12:00:00.000Z",
      sourceUrl: "https://example.test/book",
    },
    tags: ["manga"],
    title: "Book",
  };
  const manifestPath = resolve(publicationDirectory, "publication.json");
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`),
    ...document.assets.pages.map((path) =>
      writeFile(resolve(publicationDirectory, path), "stale"),
    ),
    writeFile(resolve(publicationDirectory, document.assets.back), "stale"),
  ]);
  return {document, manifestPath, publicationDirectory, root};
};

const provider = (
  materializePage: NonNullable<LibraryProvider["materializePage"]>,
): LibraryProvider => ({
  descriptor,
  materializePage,
  sync: async () => {
    throw new Error("Deep repair must not search the provider");
  },
});

test("deep repair refreshes every cached provider publication without search", async () => {
  const fixture = await createFixture();
  const portrait = await sharp({
    create: {background: "white", channels: 3, height: 300, width: 180},
  })
    .png()
    .toBuffer();
  const requestedPages: number[] = [];
  const registry = createLibraryProviderRegistry({
    providers: [
      provider(async ({pageNumber, sourceDirectory}) => {
        expect(sourceDirectory).toBe(fixture.publicationDirectory);
        requestedPages.push(pageNumber);
        return portrait;
      }),
    ],
    rootDirectory: fixture.root,
  });

  const report = await repairCachedProviderPublications({
    providerRegistry: registry,
    sourceDirectory: fixture.root,
  });
  const document = parseLocalPublicationDocument(
    JSON.parse(await readFile(fixture.manifestPath, "utf8")) as unknown,
    fixture.manifestPath,
  );

  expect(report).toMatchObject({
    failedCount: 0,
    repairedCount: 1,
    requestedCount: 1,
  });
  expect(requestedPages.toSorted((left, right) => left - right)).toEqual([
    1, 2, 3, 5, 6, 10,
  ]);
  expect(document.aspectRatioInferenceVersion).toBe(
    BOOK_ASPECT_RATIO_INFERENCE_VERSION,
  );
  expect(document.physical?.aspectRatio).toBeCloseTo(0.6);
  for (const path of [
    ...document.assets.pages,
    document.assets.front,
    document.assets.back,
  ]) {
    if (!path) continue;
    expect(
      await sharp(resolve(fixture.publicationDirectory, path)).metadata(),
    ).toMatchObject({height: 300, width: 180});
  }
});

test("deep repair preserves cached files when a remote page fails", async () => {
  const fixture = await createFixture();
  const originalManifest = await readFile(fixture.manifestPath, "utf8");
  const registry = createLibraryProviderRegistry({
    providers: [
      provider(async ({pageNumber}) => {
        throw new Error(`page ${pageNumber} is offline`);
      }),
    ],
    rootDirectory: fixture.root,
  });

  const report = await repairCachedProviderPublications({
    providerRegistry: registry,
    sourceDirectory: fixture.root,
  });

  expect(report).toMatchObject({failedCount: 1, repairedCount: 0});
  expect(report.diagnostics[0]?.message).toContain("is offline");
  expect(await readFile(fixture.manifestPath, "utf8")).toBe(originalManifest);
  expect(
    await readFile(
      resolve(fixture.publicationDirectory, "pages/001.png"),
      "utf8",
    ),
  ).toBe("stale");
});
