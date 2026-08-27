import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {runLibrarySourceMigrations} from "~/content/librarySourceMigrations";
import {createProviderAspectRatioMigration} from "~/content/providerAspectRatioMigrations";
import type {LibraryProvider, LibraryProviderDescriptor} from "~/content/providers/types";
import type {LocalPublicationDocument} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
});

const descriptor: LibraryProviderDescriptor = {
  contentKinds: ["commercial-volume"],
  defaultBlockedTags: [],
  defaultLanguages: ["english"],
  defaultQuery: "",
  id: "test-provider",
  name: "Test Provider",
  queryHelp: "Test provider",
  queryLabel: "Search",
  queryPlaceholder: "Search",
  requiresLanguageTag: false,
  summary: "Test provider",
};

const image = (width: number, height: number, color: string) =>
  sharp({
    create: {background: color, channels: 3, height, width},
  })
    .png()
    .toBuffer();

const createPublication = async (
  root: string,
  options: {
    aspectRatio?: number;
    aspectRatioInferenceVersion?: number;
    id?: string;
  } = {},
) => {
  const id = options.id ?? "book";
  const publicationDirectory = resolve(root, descriptor.id, id);
  const pagesDirectory = resolve(publicationDirectory, "pages");
  await mkdir(pagesDirectory, {recursive: true});
  const [wide, spread] = await Promise.all([image(1_600, 1_000, "#333333"), image(1_400, 1_000, "#777777")]);
  await Promise.all([
    writeFile(resolve(pagesDirectory, "001.png"), wide),
    writeFile(resolve(pagesDirectory, "002.png"), spread),
    writeFile(resolve(pagesDirectory, "003.png"), spread),
  ]);
  const document: LocalPublicationDocument = {
    schemaVersion: 1,
    ...(options.aspectRatioInferenceVersion === undefined
      ? {}
      : {
          aspectRatioInferenceVersion: options.aspectRatioInferenceVersion,
        }),
    assets: {
      back: "pages/010.png",
      front: "pages/001.png",
      pages: ["pages/001.png", "pages/002.png", "pages/003.png"],
    },
    id,
    language: "english",
    pageCount: 10,
    physical: {
      ...(options.aspectRatio === undefined ? {} : {aspectRatio: options.aspectRatio}),
      readingDirection: "rtl",
    },
    source: {
      metadataHash: `${id}-metadata`,
      provider: descriptor.id,
      remoteId: `${id}-remote`,
      retrievedAt: "2026-08-09T12:00:00.000Z",
      sourceUrl: `https://example.invalid/${id}`,
    },
    tags: ["manga", "english"],
    title: id,
  };
  const manifestPath = resolve(publicationDirectory, "publication.json");
  await writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
  return {manifestPath, publicationDirectory};
};

const provider = (materializePage: NonNullable<LibraryProvider["materializePage"]>): LibraryProvider => ({
  descriptor,
  materializePage,
  sync: async () => {
    throw new Error("Host migrations must not invoke provider search");
  },
});

const aspectRatioMigration = (loadProvider: () => Promise<LibraryProvider>) =>
  createProviderAspectRatioMigration({
    loadProvider,
    providerIds: new Set([descriptor.id]),
  });

test("host migration samples exact remote pages and marks the manifest once", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-provider-migrate-"));
  temporaryDirectories.push(root);
  const {manifestPath} = await createPublication(root);
  await createPublication(root, {
    aspectRatio: 0.72,
    id: "manual-aspect",
  });
  const portrait = await image(800, 1_200, "#eeeeee");
  const requestedPages: number[] = [];
  const loadedProvider = provider(async ({pageNumber}) => {
    requestedPages.push(pageNumber);
    return portrait;
  });
  const progress: string[] = [];
  const options = {
    migrations: [aspectRatioMigration(async () => loadedProvider)],
    onProgress: (message: string) => progress.push(message),
    sourceDirectory: root,
  };

  const first = await runLibrarySourceMigrations(options);
  const document = parseLocalPublicationDocument(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    manifestPath,
  );

  expect(first).toMatchObject({
    failedCount: 0,
    migratedCount: 1,
    pendingCount: 1,
  });
  expect(requestedPages).toEqual([5, 6]);
  expect(document.physical?.aspectRatio).toBeCloseTo(2 / 3);
  expect(document.aspectRatioInferenceVersion).toBe(BOOK_ASPECT_RATIO_INFERENCE_VERSION);
  expect(progress).toEqual([
    "Updating older cached publications: 0/1 complete (0%); 0 updated, 0 failed",
    "Updating older cached publications: 0/1 complete (0%); running aspect-ratio inference for test-provider/book",
    "Updating older cached publications: 1/1 complete (100%); updated test-provider/book with aspect-ratio inference (1 updated, 0 failed)",
  ]);

  const progressCount = progress.length;
  const second = await runLibrarySourceMigrations(options);
  expect(second).toMatchObject({migratedCount: 0, pendingCount: 0});
  expect(requestedPages).toEqual([5, 6]);
  expect(progress).toHaveLength(progressCount);
});

test("failed host migration preserves stale metadata and retries later", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-provider-retry-"));
  temporaryDirectories.push(root);
  const {manifestPath} = await createPublication(root, {
    aspectRatio: 1.5,
    aspectRatioInferenceVersion: 1,
  });
  const originalManifest = await readFile(manifestPath, "utf8");
  const requestedPages: number[] = [];
  const progress: string[] = [];
  const failed = await runLibrarySourceMigrations({
    migrations: [
      aspectRatioMigration(async () =>
        provider(async ({pageNumber}) => {
          requestedPages.push(pageNumber);
          return Buffer.from([1, 2, 3]);
        }),
      ),
    ],
    onProgress: (message) => progress.push(message),
    sourceDirectory: root,
  });

  expect(failed).toMatchObject({
    failedCount: 1,
    migratedCount: 0,
    pendingCount: 1,
  });
  expect(failed.diagnostics[0]).toMatchObject({
    sourceId: "test-provider/book",
  });
  expect(await readFile(manifestPath, "utf8")).toBe(originalManifest);
  expect(requestedPages).toEqual([5]);
  expect(progress.at(-1)).toBe(
    "Updating older cached publications: 1/1 complete (100%); failed aspect-ratio inference for test-provider/book, will retry next scan (0 updated, 1 failed)",
  );

  const portrait = await image(800, 1_200, "#eeeeee");
  const retried = await runLibrarySourceMigrations({
    migrations: [aspectRatioMigration(async () => provider(async () => portrait))],
    sourceDirectory: root,
  });
  const migrated = parseLocalPublicationDocument(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    manifestPath,
  );
  expect(retried).toMatchObject({failedCount: 0, migratedCount: 1});
  expect(migrated.aspectRatioInferenceVersion).toBe(BOOK_ASPECT_RATIO_INFERENCE_VERSION);
  expect(migrated.physical?.aspectRatio).toBeCloseTo(2 / 3);
});
