import {afterEach, describe, expect, test} from "bun:test";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {promoteLibraryAssetSet} from "~/content/libraryUpdate/libraryAssetPool";
import {planShelfAtlasRanges, seedContentPack} from "~/content/seed";
import type {LocalPublicationDocument} from "~/content/schema";

const temporaryDirectories: string[] = [];

interface PublicationFixtureOptions {
  format?: "png" | "webp";
  height?: number;
  pageDimensions?: readonly {height: number; width: number}[];
  provenance?: boolean;
  tags?: string[];
  title?: string;
  width?: number;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

const createPublication = async (
  catalogDirectory: string,
  id: string,
  language: string,
  color: string,
  options: PublicationFixtureOptions = {},
) => {
  const publicationDirectory = resolve(catalogDirectory, id);
  const pagesDirectory = resolve(publicationDirectory, "pages");
  await mkdir(pagesDirectory, {recursive: true});
  const format = options.format ?? "png";
  const width = options.width ?? 120;
  const height = options.height ?? 180;
  const pageDimensions = options.pageDimensions ?? [
    {height, width},
    {height, width},
  ];
  const pagePaths = pageDimensions.map(
    (_, index) => `pages/${String(index + 1).padStart(3, "0")}.${format}`,
  );
  await Promise.all(
    pageDimensions.map(({height: pageHeight, width: pageWidth}, index) => {
      const page = sharp({
        create: {
          width: pageWidth,
          height: pageHeight,
          channels: 3,
          background: index === 0 ? color : "#eee8dd",
        },
      });
      return (format === "webp" ? page.webp({quality: 82}) : page.png()).toFile(
        resolve(publicationDirectory, pagePaths[index] ?? "missing"),
      );
    }),
  );
  const document: LocalPublicationDocument = {
    schemaVersion: 1,
    id,
    title: options.title ?? `Publication ${id}`,
    language,
    tags: options.tags ?? ["Big Breasts", "Magazine"],
    assets: {pages: pagePaths},
    ...(options.provenance
      ? {
          source: {
            provider: "test-catalog",
            remoteId: id,
            sourceUrl: `https://example.invalid/${id}`,
            retrievedAt: "2026-07-30T12:00:00.000Z",
            metadataHash: `source-${id}-v1`,
          },
        }
      : {}),
  };
  await writeFile(
    resolve(publicationDirectory, "publication.json"),
    JSON.stringify(document),
  );
};

describe("seedContentPack", () => {
  test("packs alternate page zero and preserves per-edition tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-alternates-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    await Promise.all([
      createPublication(
        catalogDirectory,
        "nhentai-666192",
        "english",
        "#702040",
        {
          tags: ["big-breasts", "group"],
          title:
            "[Horori] Z.Z.Z Gravure #6: EVELYN & ASTRA (Zenless Zone Zero) [English] [Digital]",
        },
      ),
      createPublication(
        catalogDirectory,
        "nhentai-666822",
        "english",
        "#204070",
        {
          tags: ["big-breasts", "uncensored", "mind-control"],
          title:
            "[Horori] Z.Z.Z Gravure #06: Evelyn & Astra (Zenless Zone Zero) [ENG] [Uncensored]",
        },
      ),
    ]);

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        dryRun: false,
        excludedTags: [],
        force: false,
        languages: ["english"],
        limit: 2,
        match: "all",
        outputDirectory,
        packId: "alternate-test",
        seed: "alternate-test",
        tags: [],
      },
    );

    const publication = result.catalog?.publications[0];
    expect(result.catalog?.publications).toHaveLength(1);
    expect(publication).toMatchObject({
      id: "nhentai-666822",
      originalTags: ["big-breasts", "uncensored", "mind-control"],
      tags: ["big-breasts", "uncensored", "mind-control", "group"],
      alternates: [
        {
          id: "nhentai-666192",
          originalTags: ["big-breasts", "group"],
          title:
            "[Horori] Z.Z.Z Gravure #6: EVELYN & ASTRA (Zenless Zone Zero) [English] [Digital]",
        },
      ],
    });
    const alternatePage0 = publication?.alternates[0]?.page0;
    expect(alternatePage0).toBe(
      "publications/nhentai-666822/alternates/nhentai-666192/page-000.webp",
    );
    if (!alternatePage0)
      throw new Error("Expected a packed alternate page zero");
    expect(
      await sharp(resolve(outputDirectory, alternatePage0)).metadata(),
    ).toMatchObject({format: "webp", height: 180, width: 120});
  });

  test("prefers English, allows Japanese, skips other languages, and writes deterministic derivatives", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    await Promise.all([
      createPublication(catalogDirectory, "english-book", "english", "#b03052"),
      createPublication(
        catalogDirectory,
        "japanese-book",
        "japanese",
        "#3052b0",
      ),
      createPublication(catalogDirectory, "chinese-book", "chinese", "#52b030"),
      createPublication(catalogDirectory, "invalid-book", "english", "#303030"),
    ]);
    await rm(resolve(catalogDirectory, "invalid-book/pages/001.png"));
    const options = {
      tags: ["big-breasts"],
      excludedTags: [],
      languages: ["english", "japanese"] as const,
      limit: 2,
      match: "all" as const,
      seed: "seed-0",
      dryRun: false,
      force: false,
      outputDirectory,
      packId: "visual-v1",
    };

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {...options, languages: [...options.languages]},
    );
    const catalog = result.catalog;
    expect(catalog).toBeDefined();
    if (!catalog) return;
    expect(catalog.publications.map((publication) => publication.id)).toEqual([
      "english-book",
      "japanese-book",
    ]);
    expect(catalog.publications[0]?.physical.readingDirection).toBeUndefined();
    expect(catalog.publications[1]?.physical.readingDirection).toBeUndefined();
    expect(
      result.report.diagnostics.map((diagnostic) => diagnostic.code),
    ).toEqual(["unsupported-language", "invalid-assets"]);
    expect(
      await sharp(
        resolve(outputDirectory, "atlases/front-001.webp"),
      ).metadata(),
    ).toMatchObject({width: 768, height: 576});
    expect(catalog.atlases.front).toEqual([
      expect.objectContaining({
        firstPublicationIndex: 0,
        path: "atlases/front-001.webp",
        publicationCount: 2,
      }),
    ]);
    expect(
      await sharp(
        resolve(outputDirectory, "publications/english-book/front.webp"),
      ).metadata(),
    ).toMatchObject({width: 256, height: 384});
    const writtenCatalog = JSON.parse(
      await readFile(resolve(outputDirectory, "catalog.json"), "utf8"),
    ) as {contentHash?: string};
    expect(writtenCatalog.contentHash).toBe(catalog.contentHash);
    const preview = await readFile(
      resolve(outputDirectory, "preview.html"),
      "utf8",
    );
    expect(preview).toContain("visual-v1");
    expect(preview).toContain("Publication english-book");
    expect(preview).toContain("publications/english-book/front.webp");

    const repeated = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        languages: [...options.languages],
        force: true,
      },
    );
    expect(repeated.catalog?.contentHash).toBe(catalog.contentHash);
  });

  test("preserves suitable WebP reader pages and renders title-based spine textures", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const firstOutputDirectory = resolve(root, "pack-first");
    const secondOutputDirectory = resolve(root, "pack-second");
    await createPublication(
      catalogDirectory,
      "webp-book",
      "english",
      "#7c3f58",
      {format: "webp", height: 1800, width: 1280},
    );
    const sourcePage = await readFile(
      resolve(catalogDirectory, "webp-book/pages/001.webp"),
    );
    const options = {
      tags: ["big-breasts"],
      excludedTags: [],
      languages: ["english"] as const,
      limit: 1,
      match: "all" as const,
      seed: "webp-passthrough",
      dryRun: false,
      force: false,
      packId: "webp-passthrough",
    };

    await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      ...options,
      languages: [...options.languages],
      outputDirectory: firstOutputDirectory,
    });
    expect(
      await readFile(
        resolve(firstOutputDirectory, "publications/webp-book/pages/001.webp"),
      ),
    ).toEqual(sourcePage);
    const firstSpinePath = resolve(
      firstOutputDirectory,
      "publications/webp-book/spine.webp",
    );
    expect(await sharp(firstSpinePath).metadata()).toMatchObject({
      format: "webp",
      height: 1024,
      width: 32,
    });

    const manifestPath = resolve(
      catalogDirectory,
      "webp-book/publication.json",
    );
    const document = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as LocalPublicationDocument;
    document.title = "[XBOY] 엄마와 이세계 모험";
    document.physical = {readingDirection: "ltr", thicknessMm: 24};
    await writeFile(manifestPath, JSON.stringify(document));
    await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      ...options,
      languages: [...options.languages],
      outputDirectory: secondOutputDirectory,
    });
    const secondSpinePath = resolve(
      secondOutputDirectory,
      "publications/webp-book/spine.webp",
    );
    expect(await sharp(secondSpinePath).metadata()).toMatchObject({
      format: "webp",
      height: 1024,
      width: 96,
    });
    const renderedSpine = await sharp(secondSpinePath)
      .raw()
      .toBuffer({resolveWithObject: true});
    let minTitleX = Number.POSITIVE_INFINITY;
    let maxTitleX = Number.NEGATIVE_INFINITY;
    let minTitleY = Number.POSITIVE_INFINITY;
    let maxTitleY = Number.NEGATIVE_INFINITY;
    for (let y = 123; y < 932; y += 1) {
      for (let x = 0; x < renderedSpine.info.width; x += 1) {
        const offset =
          (y * renderedSpine.info.width + x) * renderedSpine.info.channels;
        const red = renderedSpine.data[offset] ?? 0;
        const green = renderedSpine.data[offset + 1] ?? 0;
        const blue = renderedSpine.data[offset + 2] ?? 0;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        if (luminance < 180) continue;
        minTitleX = Math.min(minTitleX, x);
        maxTitleX = Math.max(maxTitleX, x);
        minTitleY = Math.min(minTitleY, y);
        maxTitleY = Math.max(maxTitleY, y);
      }
    }
    expect(Number.isFinite(minTitleX)).toBe(true);
    expect(
      Math.abs(
        (minTitleX + maxTitleX) / 2 - (renderedSpine.info.width - 1) / 2,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((minTitleY + maxTitleY) / 2 - (395 * 1024) / 768),
    ).toBeLessThanOrEqual(2);
    expect(await readFile(secondSpinePath)).not.toEqual(
      await readFile(firstSpinePath),
    );
  });

  test("reuses unchanged assets while upgrading legacy shelf atlases and rebuilding membership", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-reuse-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const firstOutput = resolve(root, "pack-first");
    const secondOutput = resolve(root, "pack-second");
    const thirdOutput = resolve(root, "pack-third");
    await Promise.all([
      createPublication(catalogDirectory, "book-a", "english", "#703050", {
        provenance: true,
      }),
      createPublication(catalogDirectory, "book-b", "english", "#305070", {
        provenance: true,
      }),
    ]);
    const options = {
      dryRun: false,
      excludedTags: [],
      force: false,
      languages: ["english"] as const,
      limit: 10,
      match: "all" as const,
      packId: "reuse-test",
      seed: "reuse-test",
      tags: [],
    };
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        languages: [...options.languages],
        outputDirectory: firstOutput,
      },
    );
    if (!first.catalog) throw new Error("First reuse catalog is missing");
    const legacyCatalog = structuredClone(first.catalog);
    for (const atlas of legacyCatalog.atlases.front) delete atlas.formatVersion;
    for (const atlas of legacyCatalog.atlases.back) delete atlas.formatVersion;
    for (const atlas of legacyCatalog.atlases.spine) delete atlas.formatVersion;
    for (const publication of legacyCatalog.publications) {
      delete publication.assets.backDetail;
      delete publication.backFormatVersion;
      delete publication.spineFormatVersion;
    }

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        languages: [...options.languages],
        outputDirectory: secondOutput,
        reuse: {catalog: legacyCatalog, directory: firstOutput},
      },
    );
    if (!second.catalog) throw new Error("Second reuse catalog is missing");
    const firstBookA = resolve(firstOutput, "publications/book-a/front.webp");
    const secondBookA = resolve(secondOutput, "publications/book-a/front.webp");
    const firstBookASpine = resolve(
      firstOutput,
      "publications/book-a/spine.webp",
    );
    const secondBookASpine = resolve(
      secondOutput,
      "publications/book-a/spine.webp",
    );
    const firstAtlas = resolve(firstOutput, "atlases/front-001.webp");
    const secondAtlas = resolve(secondOutput, "atlases/front-001.webp");
    const firstBackAtlas = resolve(firstOutput, "atlases/back-001.webp");
    const secondBackAtlas = resolve(secondOutput, "atlases/back-001.webp");
    const firstSpineAtlas = resolve(firstOutput, "atlases/spine-001.webp");
    const secondSpineAtlas = resolve(secondOutput, "atlases/spine-001.webp");
    expect((await stat(secondBookA)).ino).toBe((await stat(firstBookA)).ino);
    expect((await stat(secondBookASpine)).ino).not.toBe(
      (await stat(firstBookASpine)).ino,
    );
    expect((await stat(secondAtlas)).ino).not.toBe(
      (await stat(firstAtlas)).ino,
    );
    expect((await stat(secondBackAtlas)).ino).not.toBe(
      (await stat(firstBackAtlas)).ino,
    );
    expect((await stat(secondSpineAtlas)).ino).not.toBe(
      (await stat(firstSpineAtlas)).ino,
    );
    const upgradedSpineAtlas = second.catalog.atlases.spine[0];
    expect(second.catalog.atlases.front[0]?.formatVersion).toBe(4);
    expect(second.catalog.atlases.back[0]?.formatVersion).toBe(1);
    expect(second.catalog.atlases.back[0]?.height).toBe(576);
    const upgradedBookA = second.catalog.publications.find(
      ({id}) => id === "book-a",
    );
    expect(upgradedBookA?.assets.backDetail).toBe(
      "publications/book-a/back-detail.webp",
    );
    expect(upgradedBookA?.backFormatVersion).toBe(1);
    expect(upgradedSpineAtlas?.formatVersion).toBe(4);
    expect(second.catalog.publications[0]?.spineFormatVersion).toBe(4);
    expect(upgradedSpineAtlas?.height).toBe(1024);
    expect(upgradedSpineAtlas?.regions).toHaveLength(2);
    expect(upgradedSpineAtlas?.width).toBe(
      upgradedSpineAtlas?.regions?.reduce(
        (total, region) => total + region.width,
        0,
      ),
    );

    await rm(resolve(catalogDirectory, "book-b"), {
      force: true,
      recursive: true,
    });
    const third = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        languages: [...options.languages],
        outputDirectory: thirdOutput,
        reuse: {catalog: second.catalog, directory: secondOutput},
      },
    );
    expect(third.catalog?.publications.map(({id}) => id)).toEqual(["book-a"]);
    expect(
      (await stat(resolve(thirdOutput, "publications/book-a/front.webp"))).ino,
    ).toBe((await stat(secondBookA)).ino);
    expect(
      (await stat(resolve(thirdOutput, "atlases/front-001.webp"))).ino,
    ).not.toBe((await stat(secondAtlas)).ino);
  });

  test("rebuilds a legacy inferred aspect ratio once, then reuses the versioned result", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-aspect-version-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const firstOutput = resolve(root, "pack-first");
    const secondOutput = resolve(root, "pack-second");
    const thirdOutput = resolve(root, "pack-third");
    await createPublication(
      catalogDirectory,
      "versioned-aspect",
      "english",
      "#703050",
      {
        pageDimensions: [
          {height: 600, width: 1_200},
          {height: 1_200, width: 800},
          {height: 1_200, width: 800},
          {height: 600, width: 1_200},
        ],
        provenance: true,
      },
    );
    const options = {
      dryRun: false,
      excludedTags: [],
      force: false,
      languages: ["english"],
      limit: 1,
      match: "all" as const,
      packId: "aspect-version-test",
      seed: "aspect-version-test",
      tags: [],
    };
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {...options, outputDirectory: firstOutput},
    );
    if (!first.catalog) throw new Error("First aspect catalog is missing");
    const legacyCatalog = structuredClone(first.catalog);
    const legacyPublication = legacyCatalog.publications[0];
    if (!legacyPublication) throw new Error("Legacy publication is missing");
    legacyPublication.physical.aspectRatio = 1.5;
    delete legacyPublication.aspectRatioInferenceVersion;

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        outputDirectory: secondOutput,
        reuse: {catalog: legacyCatalog, directory: firstOutput},
      },
    );
    if (!second.catalog) throw new Error("Second aspect catalog is missing");
    const firstFront = resolve(
      firstOutput,
      "publications/versioned-aspect/front.webp",
    );
    const secondFront = resolve(
      secondOutput,
      "publications/versioned-aspect/front.webp",
    );
    expect((await stat(secondFront)).ino).not.toBe(
      (await stat(firstFront)).ino,
    );
    expect(second.catalog.publications[0]?.physical.aspectRatio).toBeCloseTo(
      2 / 3,
    );
    expect(second.catalog.publications[0]?.aspectRatioInferenceVersion).toBe(
      BOOK_ASPECT_RATIO_INFERENCE_VERSION,
    );

    await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      ...options,
      outputDirectory: thirdOutput,
      reuse: {catalog: second.catalog, directory: secondOutput},
    });
    expect(
      (
        await stat(
          resolve(thirdOutput, "publications/versioned-aspect/front.webp"),
        )
      ).ino,
    ).toBe((await stat(secondFront)).ino);
  });

  test("keeps unchanged publications in a persistent asset pool across catalog revisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-pool-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const libraryDirectory = resolve(root, "library");
    const legacyDirectory = resolve(root, "legacy");
    await Promise.all([
      createPublication(catalogDirectory, "book-a", "english", "#703050", {
        provenance: true,
      }),
      createPublication(catalogDirectory, "book-b", "english", "#305070", {
        provenance: true,
      }),
    ]);
    const options = {
      dryRun: false,
      excludedTags: [],
      force: false,
      languages: ["english"],
      limit: 10,
      match: "all" as const,
      packId: "pool-test",
      seed: "pool-test",
      tags: [],
    };
    const legacy = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {...options, outputDirectory: legacyDirectory},
    );
    if (!legacy.catalog) throw new Error("Legacy catalog is missing");

    const firstRevisionDirectory = resolve(
      libraryDirectory,
      "revisions/revision-1",
    );
    const firstRevision = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        assetPathPrefix: "assets/revision-1",
        outputDirectory: firstRevisionDirectory,
        persistentAssetDirectory: libraryDirectory,
        reuse: {catalog: legacy.catalog, directory: legacyDirectory},
      },
    );
    if (!firstRevision.catalog)
      throw new Error("First pooled catalog is missing");
    await promoteLibraryAssetSet(
      libraryDirectory,
      firstRevisionDirectory,
      "revision-1",
    );

    await createPublication(catalogDirectory, "book-c", "english", "#507030", {
      provenance: true,
    });
    const secondRevisionDirectory = resolve(
      libraryDirectory,
      "revisions/revision-2",
    );
    const secondRevision = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        assetPathPrefix: "assets/revision-2",
        outputDirectory: secondRevisionDirectory,
        persistentAssetDirectory: libraryDirectory,
        reuse: {
          catalog: firstRevision.catalog,
          directory: firstRevisionDirectory,
        },
      },
    );
    if (!secondRevision.catalog)
      throw new Error("Second pooled catalog is missing");
    const firstIds = firstRevision.catalog.publications.map(({id}) => id);
    expect(
      secondRevision.catalog.publications
        .slice(0, firstIds.length)
        .map(({id}) => id),
    ).toEqual(firstIds);
    for (const previousPublication of firstRevision.catalog.publications) {
      const nextPublication = secondRevision.catalog.publications.find(
        ({id}) => id === previousPublication.id,
      );
      expect(nextPublication?.assets).toEqual(previousPublication.assets);
    }
    const addedPublication = secondRevision.catalog.publications.find(
      ({id}) => id === "book-c",
    );
    expect(addedPublication?.assets.front).toStartWith(
      "assets/revision-2/publications/book-c/",
    );
    await expect(
      access(
        resolve(
          secondRevisionDirectory,
          "assets/revision-2/publications/book-a",
        ),
      ),
    ).rejects.toThrow();
    await access(
      resolve(
        libraryDirectory,
        firstRevision.catalog.publications[0]?.assets.front ?? "missing",
      ),
    );
  });

  test("quick scans reuse stat-identical local books and rebuild changed local assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-local-reuse-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const libraryDirectory = resolve(root, "library");
    await createPublication(
      catalogDirectory,
      "local-book",
      "english",
      "#703050",
    );
    const options = {
      assetPathPrefix: "assets/revision-1",
      dryRun: false,
      excludedTags: [],
      force: false,
      languages: ["english"],
      limit: 10,
      match: "all" as const,
      outputDirectory: resolve(libraryDirectory, "revisions/revision-1"),
      packId: "local-reuse",
      persistentAssetDirectory: libraryDirectory,
      seed: "local-reuse",
      tags: [],
    };
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      options,
    );
    if (!first.catalog) throw new Error("First local catalog is missing");
    await promoteLibraryAssetSet(
      libraryDirectory,
      options.outputDirectory,
      "revision-1",
    );

    const secondDirectory = resolve(libraryDirectory, "revisions/revision-2");
    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        assetPathPrefix: "assets/revision-2",
        outputDirectory: secondDirectory,
        reuse: {catalog: first.catalog, directory: options.outputDirectory},
      },
    );
    if (!second.catalog) throw new Error("Second local catalog is missing");
    expect(second.catalog.publications[0]?.assets).toEqual(
      first.catalog.publications[0]?.assets,
    );
    await expect(
      access(resolve(secondDirectory, "assets/revision-2/publications")),
    ).rejects.toThrow();

    const changedPage = resolve(catalogDirectory, "local-book/pages/001.png");
    await sharp({
      create: {
        width: 120,
        height: 180,
        channels: 3,
        background: "#205070",
      },
    })
      .png()
      .toFile(changedPage);
    const changedTime = new Date(Date.now() + 2_000);
    await utimes(changedPage, changedTime, changedTime);
    const thirdDirectory = resolve(libraryDirectory, "revisions/revision-3");
    const third = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        assetPathPrefix: "assets/revision-3",
        outputDirectory: thirdDirectory,
        reuse: {catalog: second.catalog, directory: secondDirectory},
      },
    );
    if (!third.catalog) throw new Error("Third local catalog is missing");
    expect(third.catalog.publications[0]?.assets.front).toStartWith(
      "assets/revision-3/",
    );
    expect(third.catalog.publications[0]?.materialFingerprint).not.toBe(
      second.catalog.publications[0]?.materialFingerprint,
    );

    const repaired = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...options,
        assetPathPrefix: "assets/revision-4",
        forceRebuild: true,
        outputDirectory: resolve(libraryDirectory, "revisions/revision-4"),
        reuse: {catalog: third.catalog, directory: thirdDirectory},
      },
    );
    expect(repaired.catalog?.publications[0]?.assets.front).toStartWith(
      "assets/revision-4/",
    );
    expect(repaired.catalog?.publications[0]?.contentHash).toBe(
      third.catalog.publications[0]?.contentHash,
    );
  });

  test("keeps the previous local publication when changed source assets are corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-corrupt-local-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const libraryDirectory = resolve(root, "library");
    const firstDirectory = resolve(libraryDirectory, "revisions/revision-1");
    await createPublication(
      catalogDirectory,
      "local-book",
      "english",
      "#703050",
    );
    const baseOptions = {
      assetPathPrefix: "assets/revision-1",
      dryRun: false,
      excludedTags: [],
      force: false,
      languages: ["english"],
      limit: 10,
      match: "all" as const,
      outputDirectory: firstDirectory,
      packId: "corrupt-local",
      persistentAssetDirectory: libraryDirectory,
      seed: "corrupt-local",
      tags: [],
    };
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      baseOptions,
    );
    if (!first.catalog) throw new Error("First local catalog is missing");
    await promoteLibraryAssetSet(
      libraryDirectory,
      firstDirectory,
      "revision-1",
    );
    await writeFile(
      resolve(catalogDirectory, "local-book/pages/001.png"),
      "corrupt image",
    );

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        ...baseOptions,
        assetPathPrefix: "assets/revision-2",
        forceRebuild: true,
        outputDirectory: resolve(libraryDirectory, "revisions/revision-2"),
        reuse: {catalog: first.catalog, directory: firstDirectory},
      },
    );

    expect(second.catalog?.publications).toHaveLength(1);
    expect(second.catalog?.publications[0]?.assets).toEqual(
      first.catalog.publications[0]?.assets,
    );
    expect(second.report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: "invalid-assets"}),
      ]),
    );
  });

  test("resizes WebP reader pages that exceed the runtime dimension limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    await createPublication(
      catalogDirectory,
      "oversized-webp-book",
      "english",
      "#34485c",
      {format: "webp", height: 2200, width: 2200},
    );
    const sourcePage = await readFile(
      resolve(catalogDirectory, "oversized-webp-book/pages/001.webp"),
    );
    await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      tags: ["big-breasts"],
      excludedTags: [],
      languages: ["english"],
      limit: 1,
      match: "all",
      seed: "webp-resize",
      dryRun: false,
      force: false,
      outputDirectory,
      packId: "webp-resize",
    });
    const readerPath = resolve(
      outputDirectory,
      "publications/oversized-webp-book/pages/001.webp",
    );
    expect(await readFile(readerPath)).not.toEqual(sourcePage);
    expect(await sharp(readerPath).metadata()).toMatchObject({
      format: "webp",
      height: 2048,
      width: 2048,
    });
  });

  test("preserves a publication's inferred non-standard page aspect ratio", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    await createPublication(
      catalogDirectory,
      "gravure-book",
      "english",
      "#7c285d",
      {height: 1766, width: 1280},
    );

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        tags: ["big-breasts"],
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        seed: "non-standard-aspect",
        dryRun: false,
        force: false,
        outputDirectory,
        packId: "non-standard-aspect",
      },
    );

    expect(result.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(
      1280 / 1766,
    );
    expect(
      await sharp(
        resolve(outputDirectory, "publications/gravure-book/front.webp"),
      ).metadata(),
    ).toMatchObject({height: 384, width: 278});
    expect(
      await sharp(
        resolve(outputDirectory, "publications/gravure-book/front-detail.webp"),
      ).metadata(),
    ).toMatchObject({height: 1536, width: 1113});
    expect(
      await sharp(
        resolve(outputDirectory, "atlases/front-001.webp"),
      ).metadata(),
    ).toMatchObject({height: 576, width: 384});
  });

  test("infers a landscape book from interior pages despite wide covers and early spreads", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    await createPublication(
      catalogDirectory,
      "wide-cover-book",
      "english",
      "#415f79",
      {
        pageDimensions: [
          {height: 100, width: 280},
          {height: 100, width: 240},
          {height: 100, width: 240},
          {height: 100, width: 120},
          {height: 100, width: 120},
          {height: 100, width: 120},
          {height: 100, width: 260},
          {height: 100, width: 270},
          {height: 100, width: 280},
        ],
      },
    );

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        tags: [],
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        seed: "wide-cover-aspect",
        dryRun: false,
        force: false,
        outputDirectory,
        packId: "wide-cover-aspect",
      },
    );

    expect(result.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(
      1.2,
    );
  });

  test("infers a sparse preview from its interior pages instead of its wide endpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const outputDirectory = resolve(root, "pack");
    const publicationId = "sparse-wide-cover-book";
    await createPublication(
      catalogDirectory,
      publicationId,
      "english",
      "#4f6f52",
      {
        pageDimensions: [
          {height: 100, width: 280},
          {height: 100, width: 240},
          {height: 100, width: 120},
          {height: 100, width: 270},
        ],
      },
    );
    const manifestPath = resolve(
      catalogDirectory,
      publicationId,
      "publication.json",
    );
    const document = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as LocalPublicationDocument;
    document.pageCount = 4;
    document.assets = {
      front: "pages/001.png",
      pages: ["pages/001.png", "pages/002.png", "pages/003.png"],
      back: "pages/004.png",
    };
    await writeFile(manifestPath, JSON.stringify(document));

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      {
        tags: [],
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        seed: "sparse-wide-cover-aspect",
        dryRun: false,
        force: false,
        outputDirectory,
        packId: "sparse-wide-cover-aspect",
      },
    );

    expect(result.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(
      1.2,
    );
  });

  test("extracts front, back, and spine panels from an obvious wraparound scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const publicationDirectory = resolve(catalogDirectory, "wrapped-book");
    const pagesDirectory = resolve(publicationDirectory, "pages");
    const outputDirectory = resolve(root, "pack");
    await mkdir(pagesDirectory, {recursive: true});
    const barcode = Buffer.from(
      `<svg width="170" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="170" height="100" fill="white"/>
        ${Array.from({length: 28}, (_, index) => `<rect x="${index * 6}" width="${index % 3 === 0 ? 4 : 2}" height="100" fill="black"/>`).join("")}
      </svg>`,
    );
    await Promise.all([
      sharp({
        create: {
          width: 1_400,
          height: 600,
          channels: 3,
          background: "#777777",
        },
      })
        .composite([
          {
            input: {
              create: {
                width: 400,
                height: 600,
                channels: 3,
                background: "#d52424",
              },
            },
            left: 280,
            top: 0,
          },
          {
            input: {
              create: {
                width: 40,
                height: 600,
                channels: 3,
                background: "#e4c52d",
              },
            },
            left: 680,
            top: 0,
          },
          {
            input: {
              create: {
                width: 400,
                height: 600,
                channels: 3,
                background: "#264fd1",
              },
            },
            left: 720,
            top: 0,
          },
          {input: barcode, left: 750, top: 35},
        ])
        .png()
        .toFile(resolve(pagesDirectory, "001.png")),
      sharp({
        create: {
          width: 400,
          height: 600,
          channels: 3,
          background: "#eeeeee",
        },
      })
        .png()
        .toFile(resolve(pagesDirectory, "002.png")),
    ]);
    const document: LocalPublicationDocument = {
      schemaVersion: 1,
      id: "wrapped-book",
      title: "Wrapped Book",
      language: "english",
      tags: ["big-breasts"],
      assets: {
        front: "pages/001.png",
        pages: ["pages/001.png", "pages/002.png"],
      },
      physical: {readingDirection: "ltr"},
    };
    await writeFile(
      resolve(publicationDirectory, "publication.json"),
      JSON.stringify(document),
    );

    await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      tags: ["big-breasts"],
      excludedTags: [],
      languages: ["english"],
      limit: 1,
      match: "all",
      seed: "wraparound",
      dryRun: false,
      force: false,
      outputDirectory,
      packId: "wraparound",
    });
    const frontStats = await sharp(
      resolve(outputDirectory, "publications/wrapped-book/front.webp"),
    ).stats();
    const backStats = await sharp(
      resolve(outputDirectory, "publications/wrapped-book/back.webp"),
    ).stats();
    expect(
      await sharp(
        resolve(outputDirectory, "publications/wrapped-book/front-detail.webp"),
      ).metadata(),
    ).toMatchObject({height: 600, width: 400});
    expect(frontStats.channels[0]?.mean).toBeGreaterThan(
      (frontStats.channels[2]?.mean ?? 0) * 2,
    );
    expect(backStats.channels[2]?.mean).toBeGreaterThan(
      (backStats.channels[0]?.mean ?? 0) * 1.5,
    );
  });

  test("rejects a path that escapes its publication directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const publicationDirectory = resolve(catalogDirectory, "unsafe-book");
    await mkdir(publicationDirectory, {recursive: true});
    await writeFile(
      resolve(publicationDirectory, "publication.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "unsafe-book",
        title: "Unsafe Book",
        language: "english",
        tags: ["big-breasts"],
        assets: {pages: ["../outside.png"]},
      }),
    );

    await expect(
      seedContentPack(new LocalCatalogSource(catalogDirectory), {
        tags: ["big-breasts"],
        excludedTags: [],
        languages: ["english"],
        limit: 1,
        match: "all",
        seed: "visual-v1",
        dryRun: true,
        force: false,
        outputDirectory: resolve(root, "pack"),
        packId: "visual-v1",
      }),
    ).rejects.toThrow("No valid publications matched");
  });
});

describe("planShelfAtlasRanges", () => {
  test("shards large catalogs without exceeding atlas capacity", () => {
    expect(planShelfAtlasRanges(200, 80)).toEqual([
      {firstPublicationIndex: 0, publicationCount: 80},
      {firstPublicationIndex: 80, publicationCount: 80},
      {firstPublicationIndex: 160, publicationCount: 40},
    ]);
  });
});
