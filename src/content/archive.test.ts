import {afterEach, describe, expect, test} from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {zipSync} from "fflate";
import sharp from "sharp";
import {
  ARCHIVE_SOURCE_PROVIDER,
  importContentArchives,
  inspectContentArchive,
  readContentArchiveImage,
} from "~/content/archive";
import {materializeArchiveReaderPage} from "~/content/archiveSparsePage";
import {parseArchiveImportCliOptions} from "~/content/archiveCli";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {seedContentPack} from "~/content/seed";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];
const RAR_IMAGE_ARCHIVE = Buffer.from(
  "UmFyIRoHAQAzkrXlCgEFBgAFAQGAgABPmU1fJQIDC98ABN8ApIMC/F8G9YAAAQcwMDEucG5nCgMTIdxwal4Cxy+JUE5HDQoaCgAAAA1JSERSAAAAAgAAAAIIAgAAAP3UmnMAAAAJcEhZcwAAA+gAAAPoAbV7UmsAAAARSURBVHicY3BQMHBQMGCAUAAQDgJBHnn98AAAAABJRU5ErkJggh13VlEDBQQA",
  "base64",
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

const createPng = (
  color: string,
  dimensions: {height: number; width: number} = {height: 96, width: 64},
) =>
  sharp({
    create: {...dimensions, channels: 3, background: color},
  })
    .png()
    .toBuffer();

const writeArchive = async (
  path: string,
  entries: Record<string, Uint8Array>,
) => {
  await mkdir(resolve(path, ".."), {recursive: true});
  await writeFile(path, zipSync(entries));
};

const markFirstEntryEncrypted = (archive: Uint8Array) => {
  const result = Buffer.from(archive);
  const localSignature = result.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralSignature = result.indexOf(
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
  );
  if (localSignature < 0 || centralSignature < 0)
    throw new Error("Test ZIP lacks required headers");
  result.writeUInt16LE(
    result.readUInt16LE(localSignature + 6) | 1,
    localSignature + 6,
  );
  result.writeUInt16LE(
    result.readUInt16LE(centralSignature + 8) | 1,
    centralSignature + 8,
  );
  return result;
};

describe("content archive inspection", () => {
  test("accepts bounded images while ignoring metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-"));
    temporaryDirectories.push(root);
    const archivePath = resolve(root, "valid.cbz");
    await writeArchive(archivePath, {
      "cover.png": await createPng("#401020"),
      "pages/2.png": await createPng("#204010"),
      "pages/10.png": await createPng("#102040"),
      "ComicInfo.xml": new TextEncoder().encode("<ComicInfo />"),
    });

    await expect(inspectContentArchive(archivePath)).resolves.toMatchObject({
      imageEntries: ["cover.png", "pages/2.png", "pages/10.png"],
      ignoredEntryCount: 1,
    });
  });

  test("rejects traversal, encryption, and compression bombs", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-"));
    temporaryDirectories.push(root);
    const image = await createPng("#301020");
    const traversalPath = resolve(root, "traversal.cbz");
    const encryptedPath = resolve(root, "encrypted.cbz");
    const bombPath = resolve(root, "bomb.cbz");
    await writeArchive(traversalPath, {"../escape.png": image});
    const plainArchive = zipSync({"001.png": image});
    await writeFile(encryptedPath, markFirstEntryEncrypted(plainArchive));
    await writeArchive(bombPath, {"001.png": new Uint8Array(1024 * 1024)});

    await expect(inspectContentArchive(traversalPath)).rejects.toThrow(
      /invalid relative path|escapes|contained/u,
    );
    await expect(inspectContentArchive(encryptedPath)).rejects.toThrow(
      "Encrypted archive entry",
    );
    await expect(inspectContentArchive(bombPath)).rejects.toThrow(
      "compression-ratio limit",
    );
  });

  test("reads stored ZIP entries without stalling", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-stored-"));
    temporaryDirectories.push(root);
    const archivePath = resolve(root, "stored.cbz");
    const first = await createPng("#301040");
    const last = await createPng("#403010");
    await writeFile(
      archivePath,
      zipSync({
        "Comic/001.png": [first, {level: 0}],
        "Comic/002.png": [last, {level: 0}],
      }),
    );

    const inspection = await inspectContentArchive(archivePath);

    expect(
      await readContentArchiveImage(archivePath, 0, inspection.metadataHash),
    ).toEqual(first);
    expect(
      await readContentArchiveImage(archivePath, 1, inspection.metadataHash),
    ).toEqual(last);
  });

  test("inspects and reads RAR5 images", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-rar-"));
    temporaryDirectories.push(root);
    const archivePath = resolve(root, "valid.rar");
    await writeFile(archivePath, RAR_IMAGE_ARCHIVE);

    const inspection = await inspectContentArchive(archivePath);

    expect(inspection).toMatchObject({
      imageEntries: ["001.png"],
      ignoredEntryCount: 0,
    });
    const image = await readContentArchiveImage(
      archivePath,
      0,
      inspection.metadataHash,
    );
    await expect(sharp(image).metadata()).resolves.toMatchObject({
      format: "png",
      height: 2,
      width: 2,
    });
  });
});

test("archive import accepts CBR publications", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-cbr-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  await mkdir(archivesDirectory, {recursive: true});
  await writeFile(
    resolve(archivesDirectory, "RAR Comic [English].cbr"),
    RAR_IMAGE_ARCHIVE,
  );

  const report = await importContentArchives({
    archivesDirectory,
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });

  expect(report.preparedCount).toBe(1);
  const document = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(
        resolve(root, "catalog/RAR Comic [English]/publication.json"),
        "utf8",
      ),
    ) as unknown,
    "publication.json",
  );
  expect(document).toMatchObject({
    pageCount: 1,
    source: {
      provider: ARCHIVE_SOURCE_PROVIDER,
      remoteId: "RAR Comic [English].cbr",
    },
  });
});

test("archive import keeps same-named books from separate media paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-paths-"));
  temporaryDirectories.push(root);
  const firstDirectory = resolve(root, "first");
  const secondDirectory = resolve(root, "second");
  const page = await createPng("#203040");
  await Promise.all([
    writeArchive(resolve(firstDirectory, "Same Book.cbz"), {"001.png": page}),
    writeArchive(resolve(secondDirectory, "Same Book.zip"), {"001.png": page}),
  ]);

  const report = await importContentArchives({
    archivePaths: [firstDirectory, secondDirectory],
    archivesDirectory: firstDirectory,
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });

  expect(report.discoveredCount).toBe(2);
  expect(report.preparedCount).toBe(2);
  expect(report.diagnostics).toEqual([]);
  expect(
    new Set(report.publications.map(({document}) => document?.id)).size,
  ).toBe(2);
  expect(report.publications.map(({destination}) => destination)).toEqual([
    resolve(root, "catalog/Same Book"),
    expect.stringMatching(/Same Book--[0-9a-f]{10}$/u),
  ]);
  const catalogEntries = (await readdir(resolve(root, "catalog"))).toSorted();
  await rm(resolve(firstDirectory, "Same Book.cbz"));
  const repeated = await importContentArchives({
    archivePaths: [firstDirectory, secondDirectory],
    archivesDirectory: firstDirectory,
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });
  expect(repeated.discoveredCount).toBe(1);
  expect((await readdir(resolve(root, "catalog"))).toSorted()).toEqual(
    catalogEntries,
  );
});

test("archive processing failure removes only staging and preserves an existing import", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-staging-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const outputDirectory = resolve(root, "catalog");
  const archivePath = resolve(archivesDirectory, "Existing Book.cbz");
  await writeArchive(archivePath, {"001.png": await createPng("#203040")});
  const options = {
    archivesDirectory,
    defaultLanguage: "english" as const,
    force: false,
    outputDirectory,
    tags: [],
    write: true,
  };
  await importContentArchives(options);
  const existingDirectory = resolve(outputDirectory, "Existing Book");
  const originalManifest = await readFile(
    resolve(existingDirectory, "publication.json"),
  );
  const originalFront = await readFile(
    resolve(existingDirectory, "front.webp"),
  );
  await writeArchive(archivePath, {
    "001.jpg": Buffer.from("corrupt JPEG payload"),
  });

  const report = await importContentArchives({...options, force: true});

  expect(report.preparedCount).toBe(0);
  expect(report.diagnostics).toEqual([
    expect.objectContaining({
      archive: "Existing Book.cbz",
      code: "processing-failed",
    }),
  ]);
  expect(
    await readFile(resolve(existingDirectory, "publication.json")),
  ).toEqual(originalManifest);
  expect(await readFile(resolve(existingDirectory, "front.webp"))).toEqual(
    originalFront,
  );
  expect(await Bun.file(archivePath).exists()).toBe(true);
});

test("archive import scans overlapping roots only once", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-overlap-"));
  temporaryDirectories.push(root);
  const nested = resolve(root, "author");
  await writeArchive(resolve(nested, "Book.cbz"), {
    "001.png": await createPng("#203040"),
  });

  const report = await importContentArchives({
    archivePaths: [root, nested],
    archivesDirectory: root,
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });

  expect(report.discoveredCount).toBe(1);
  expect(report.preparedCount).toBe(1);
});

test("archive import creates sparse English/Japanese catalogs and skips Chinese", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-import-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const outputDirectory = resolve(root, "catalog");
  const englishArchive = resolve(
    archivesDirectory,
    "Comic Aurora 2026-07 [English].cbz",
  );
  const japaneseArchive = resolve(
    archivesDirectory,
    "Night Office 01 [Japanese].cbz",
  );
  const chineseArchive = resolve(
    archivesDirectory,
    "Skipped Issue [Chinese].cbz",
  );
  await Promise.all([
    writeArchive(englishArchive, {
      "cover.png": await createPng("#502030"),
      "pages/2.png": await createPng("#305020"),
      "pages/10.png": await createPng("#203050"),
    }),
    writeArchive(japaneseArchive, {
      "001.png": await createPng("#205050"),
    }),
    writeArchive(chineseArchive, {
      "001.png": await createPng("#505020"),
    }),
  ]);

  const options = {
    archivesDirectory,
    defaultLanguage: "english" as const,
    force: false,
    outputDirectory,
    tags: ["big-breasts"],
    write: true,
  };
  const report = await importContentArchives(options);
  expect(report.preparedCount).toBe(2);
  expect(report.skippedCount).toBe(1);
  expect(report.diagnostics).toEqual([
    {
      archive: "Skipped Issue [Chinese].cbz",
      code: "skipped-language",
      message:
        "Skipped Skipped Issue [Chinese].cbz because its name indicates Chinese",
    },
  ]);
  const englishDirectory = resolve(
    outputDirectory,
    "Comic Aurora 2026-07 [English]",
  );
  const englishDocument = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(resolve(englishDirectory, "publication.json"), "utf8"),
    ) as unknown,
    "publication.json",
  );
  expect(englishDocument).toMatchObject({
    id: "comic-aurora-2026-07",
    groupId: "comic-aurora",
    issue: {year: 2026, month: 7},
    kind: "magazine",
    language: "english",
    pageCount: 3,
    source: {
      provider: ARCHIVE_SOURCE_PROVIDER,
      remoteId: "Comic Aurora 2026-07 [English].cbz",
    },
  });
  expect(englishDocument.assets).toEqual({
    back: "back.webp",
    front: "front.webp",
    pages: [],
  });
  expect(englishDocument.physical?.readingDirection).toBeUndefined();
  expect((await readdir(englishDirectory)).toSorted()).toEqual([
    "back.webp",
    "front.webp",
    "publication.json",
  ]);

  const seeded = await seedContentPack(
    new LocalCatalogSource(outputDirectory),
    {
      tags: ["big-breasts"],
      excludedTags: [],
      languages: ["english", "japanese"],
      limit: 20,
      match: "all",
      seed: "archive-test",
      dryRun: false,
      outputDirectory: resolve(root, "revision"),
      packId: "archive-test",
      persistentAssetDirectory: root,
    },
  );
  expect(seeded.report.selectedPublicationIds).toEqual([
    "comic-aurora-2026-07",
    "night-office-01",
  ]);
  const englishPublication = seeded.catalog?.publications.find(
    (publication) => publication.id === "comic-aurora-2026-07",
  );
  expect(englishPublication?.pageCount).toBe(3);
  expect(englishPublication?.assets.pages).toHaveLength(0);
  if (!englishPublication) throw new Error("Seeded CBZ publication is missing");
  const sparsePage = await materializeArchiveReaderPage(englishPublication, 2);
  await expect(sharp(sparsePage).metadata()).resolves.toMatchObject({
    format: "webp",
    width: 64,
    height: 96,
  });
  expect(await materializeArchiveReaderPage(englishPublication, 2)).toBe(
    sparsePage,
  );
  expect((await readdir(englishDirectory)).toSorted()).toEqual([
    "back.webp",
    "front.webp",
    "publication.json",
  ]);
});

test("archive import infers aspect ratio from early and midpoint interior pages", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-aspect-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const outputDirectory = resolve(root, "catalog");
  const archivePath = resolve(archivesDirectory, "Wide Covers.cbz");
  const portrait = {height: 96, width: 64};
  const spread = {height: 96, width: 128};
  const wide = {height: 96, width: 160};
  await writeArchive(archivePath, {
    "001.png": await createPng("#502030", wide),
    "002.png": await createPng("#305020", spread),
    "003.png": await createPng("#203050", spread),
    "004.png": await createPng("#503020", portrait),
    "005.png": await createPng("#205030", portrait),
    "006.png": await createPng("#302050", portrait),
    "007.png": await createPng("#504020", wide),
    "008.png": await createPng("#405020", wide),
    "009.png": await createPng("#204050", wide),
  });
  const options = {
    archivesDirectory,
    defaultLanguage: "english" as const,
    force: false,
    outputDirectory,
    tags: [],
    write: true,
  };

  await importContentArchives(options);
  const manifestPath = resolve(outputDirectory, "Wide Covers/publication.json");
  const document = parseLocalPublicationDocument(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    "publication.json",
  );
  expect(document.physical?.aspectRatio).toBeCloseTo(2 / 3);
  expect(document.assets.pages).toEqual([]);

  const legacyPhysical = {...document.physical};
  delete legacyPhysical.aspectRatio;
  const legacyDocument = {...document, physical: legacyPhysical};
  delete legacyDocument.aspectRatioInferenceVersion;
  await writeFile(manifestPath, `${JSON.stringify(legacyDocument, null, 2)}\n`);
  const refreshed = await importContentArchives(options);
  expect(refreshed.preparedCount).toBe(1);
  expect(refreshed.diagnostics).toEqual([]);
  const upgradedDocument = parseLocalPublicationDocument(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    "publication.json",
  );
  expect(upgradedDocument.physical?.aspectRatio).toBeCloseTo(2 / 3);

  const seeded = await seedContentPack(
    new LocalCatalogSource(outputDirectory),
    {
      tags: [],
      excludedTags: [],
      languages: ["english"],
      limit: 1,
      match: "all",
      seed: "archive-aspect",
      dryRun: false,
      outputDirectory: resolve(root, "revision"),
      packId: "archive-aspect",
      persistentAssetDirectory: root,
    },
  );
  expect(seeded.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(
    2 / 3,
  );
});

test("archive CLI parses preview defaults", () => {
  const defaults = parseArchiveImportCliOptions([], "/workspace/afterleaf");
  expect(defaults.importOptions).toMatchObject({
    archivesDirectory: resolve("/workspace/afterleaf/content/books"),
    outputDirectory: resolve("/workspace/afterleaf/content-sources/catalog"),
    tags: [],
    write: false,
  });

  const options = parseArchiveImportCliOptions(
    ["--archives", "cbz", "--out", "catalog", "--tags", "Big Breasts"],
    "/workspace/afterleaf",
  );
  expect(options.importOptions).toMatchObject({
    archivesDirectory: resolve("/workspace/afterleaf/cbz"),
    outputDirectory: resolve("/workspace/afterleaf/catalog"),
    tags: ["big-breasts"],
    write: false,
  });
});

test("archive import leaves reading direction unspecified without an explicit direction hint", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-direction-"));
  temporaryDirectories.push(root);
  const archivePath = resolve(root, "archives", "Unhinted Book.cbz");
  await writeArchive(archivePath, {"001.png": await createPng("#403020")});

  await importContentArchives({
    archivesDirectory: resolve(root, "archives"),
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });

  const document = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(
        resolve(root, "catalog/Unhinted Book/publication.json"),
        "utf8",
      ),
    ) as unknown,
    "publication.json",
  );
  expect(document.language).toBe("english");
  expect(document.physical?.readingDirection).toBeUndefined();
});

test("archive import applies comics and manga directory directives recursively", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-direction-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const page = await createPng("#302040");
  await Promise.all([
    writeArchive(resolve(archivesDirectory, "comics/English Book.cbz"), {
      "001.png": page,
    }),
    writeArchive(resolve(archivesDirectory, "manga/nested/Manga Book.cbz"), {
      "001.png": page,
    }),
    writeArchive(
      resolve(archivesDirectory, "manga/Conflicting Book [LTR].cbz"),
      {
        "001.png": page,
      },
    ),
    writeArchive(resolve(archivesDirectory, "ignored/Ignored Book.cbz"), {
      "001.png": page,
    }),
  ]);

  const report = await importContentArchives({
    archivesDirectory,
    defaultLanguage: "english",
    force: false,
    outputDirectory: resolve(root, "catalog"),
    tags: [],
    write: true,
  });

  expect(report.discoveredCount).toBe(4);
  expect(report.preparedCount).toBe(3);
  expect(report.diagnostics).toEqual([
    {
      archive: "manga/Conflicting Book [LTR].cbz",
      code: "invalid-archive",
      message:
        "Skipped manga/Conflicting Book [LTR].cbz because its directory and filename reading-direction directives conflict",
    },
  ]);
  const readDirection = async (directory: string) => {
    const document = parseLocalPublicationDocument(
      JSON.parse(
        await readFile(
          resolve(root, "catalog", directory, "publication.json"),
          "utf8",
        ),
      ) as unknown,
      "publication.json",
    );
    return {
      direction: document.physical?.readingDirection,
      remoteId: document.source?.remoteId,
    };
  };
  await expect(readDirection("English Book")).resolves.toEqual({
    direction: "ltr",
    remoteId: "comics/English Book.cbz",
  });
  await expect(readDirection("Manga Book")).resolves.toEqual({
    direction: "rtl",
    remoteId: "manga/nested/Manga Book.cbz",
  });
  await expect(readDirection("Ignored Book")).resolves.toEqual({
    direction: undefined,
    remoteId: "ignored/Ignored Book.cbz",
  });
  const nestedDocument = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(
        resolve(root, "catalog/Manga Book/publication.json"),
        "utf8",
      ),
    ) as unknown,
    "publication.json",
  );
  await expect(
    sharp(await materializeArchiveReaderPage(nestedDocument, 1)).metadata(),
  ).resolves.toMatchObject({format: "webp", height: 96, width: 64});
});

test("archive import refreshes an existing publication after a directive move", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-direction-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const outputDirectory = resolve(root, "catalog");
  const originalArchivePath = resolve(archivesDirectory, "Existing Book.cbz");
  await writeArchive(originalArchivePath, {
    "001.png": await createPng("#503020"),
  });
  const options = {
    archivesDirectory,
    defaultLanguage: "english" as const,
    force: false,
    outputDirectory,
    tags: [],
    write: true,
  };
  await importContentArchives(options);
  const publicationPath = resolve(
    outputDirectory,
    "Existing Book/publication.json",
  );
  const originalDocument = parseLocalPublicationDocument(
    JSON.parse(await readFile(publicationPath, "utf8")) as unknown,
    "publication.json",
  );
  await writeFile(
    publicationPath,
    `${JSON.stringify({...originalDocument, title: "Custom title", tags: ["custom-tag"]}, null, 2)}\n`,
  );
  const directedArchivePath = resolve(
    archivesDirectory,
    "manga/Existing Book.cbz",
  );
  await mkdir(resolve(archivesDirectory, "manga"), {recursive: true});
  await rename(originalArchivePath, directedArchivePath);

  const report = await importContentArchives(options);

  expect(report.preparedCount).toBe(1);
  expect(report.diagnostics).toEqual([]);
  const refreshedDocument = parseLocalPublicationDocument(
    JSON.parse(await readFile(publicationPath, "utf8")) as unknown,
    "publication.json",
  );
  expect(refreshedDocument).toMatchObject({
    title: "Custom title",
    tags: ["custom-tag"],
    physical: {readingDirection: "rtl"},
    source: {
      remoteId: "manga/Existing Book.cbz",
      sourceUrl: pathToFileURL(directedArchivePath).href,
    },
  });
});

test("archive import refreshes replaced archive content while preserving metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-archive-refresh-"));
  temporaryDirectories.push(root);
  const archivesDirectory = resolve(root, "archives");
  const archivePath = resolve(archivesDirectory, "Changing Book.cbz");
  const outputDirectory = resolve(root, "catalog");
  await writeArchive(archivePath, {
    "001.png": await createPng("#302010"),
  });
  const options = {
    archivesDirectory,
    defaultLanguage: "english" as const,
    force: false,
    outputDirectory,
    tags: [],
    write: true,
  };
  await importContentArchives(options);
  const manifestPath = resolve(
    outputDirectory,
    "Changing Book/publication.json",
  );
  const original = parseLocalPublicationDocument(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    "publication.json",
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify({...original, title: "Edited title"}, null, 2)}\n`,
  );
  await writeArchive(archivePath, {
    "001.png": await createPng("#302010"),
    "002.png": await createPng("#102030"),
  });

  const report = await importContentArchives(options);

  expect(report.preparedCount).toBe(1);
  expect(
    parseLocalPublicationDocument(
      JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
      "publication.json",
    ),
  ).toMatchObject({
    pageCount: 2,
    title: "Edited title",
    assets: {pages: [], front: "front.webp", back: "back.webp"},
  });
});
