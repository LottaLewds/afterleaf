import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import sharp from "sharp";
import {read as readKtx2} from "ktx-parse";
import {BOOK_ASPECT_RATIO_INFERENCE_VERSION} from "~/content/bookAspectRatio";
import {LocalCatalogSource} from "~/content/localCatalogSource";
import {planShelfAtlasRanges, seedContentPack} from "~/content/seed";
import type {LocalPublicationDocument, SeedContentPackOptions} from "~/content/schema";

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
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
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
  const pagePaths = pageDimensions.map((_, index) => `pages/${String(index + 1).padStart(3, "0")}.${format}`);
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
  await writeFile(resolve(publicationDirectory, "publication.json"), JSON.stringify(document));
};

/**
 * Builds pool-mode seed options rooted at a temporary directory. The pool
 * and the revision directories are siblings under the root, mirroring the
 * library layout.
 */
const poolOptions = (
  root: string,
  overrides: Omit<Partial<SeedContentPackOptions>, "outputDirectory"> & {
    packId: string;
    outputDirectory: string;
  },
): SeedContentPackOptions => ({
  dryRun: false,
  excludedTags: [],
  languages: ["english"],
  limit: 10,
  match: "all",
  persistentAssetDirectory: root,
  seed: overrides.packId,
  tags: [],
  ...overrides,
});

/** Resolves a pooled asset path against its library root. */
const pooled = (root: string, assetPath: string) => resolve(root, assetPath);

describe("seedContentPack", () => {
  test("packs alternate page zero and preserves per-edition tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-alternates-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await Promise.all([
      createPublication(catalogDirectory, "nhentai-666192", "english", "#702040", {
        tags: ["big-breasts", "group"],
        title: "[Horori] Z.Z.Z Gravure #6: EVELYN & ASTRA (Zenless Zone Zero) [English] [Digital]",
      }),
      createPublication(catalogDirectory, "nhentai-666822", "english", "#204070", {
        tags: ["big-breasts", "uncensored", "mind-control"],
        title: "[Horori] Z.Z.Z Gravure #06: Evelyn & Astra (Zenless Zone Zero) [ENG] [Uncensored]",
      }),
    ]);

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "alternate-test",
        limit: 2,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
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
          title: "[Horori] Z.Z.Z Gravure #6: EVELYN & ASTRA (Zenless Zone Zero) [English] [Digital]",
        },
      ],
    });
    const alternatePage0 = publication?.alternates[0]?.page0;
    expect(alternatePage0).toMatch(
      /^assets\/publications\/nhentai-666822\/alternates\/nhentai-666192\/page-000-[0-9a-f]{16}\.webp$/u,
    );
    if (!alternatePage0) throw new Error("Expected a packed alternate page zero");
    expect(await sharp(pooled(root, alternatePage0)).metadata()).toMatchObject({
      format: "webp",
      height: 180,
      width: 120,
    });
  });

  test("prefers English, allows Japanese, skips other languages, and writes deterministic derivatives", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const revisionDirectory = resolve(root, "revisions/rev-1");
    await Promise.all([
      createPublication(catalogDirectory, "english-book", "english", "#b03052"),
      createPublication(catalogDirectory, "japanese-book", "japanese", "#3052b0"),
      createPublication(catalogDirectory, "chinese-book", "chinese", "#52b030"),
      createPublication(catalogDirectory, "invalid-book", "english", "#303030"),
    ]);
    await rm(resolve(catalogDirectory, "invalid-book/pages/001.png"));
    const options = poolOptions(root, {
      packId: "visual-v1",
      languages: ["english", "japanese"],
      limit: 2,
      outputDirectory: revisionDirectory,
      seed: "seed-0",
      tags: ["big-breasts"],
    });

    const result = await seedContentPack(new LocalCatalogSource(catalogDirectory), options);
    const catalog = result.catalog;
    expect(catalog).toBeDefined();
    if (!catalog) return;
    expect(catalog.publications.map((publication) => publication.id)).toEqual(["english-book", "japanese-book"]);
    expect(catalog.publications[0]?.physical.readingDirection).toBeUndefined();
    expect(catalog.publications[1]?.physical.readingDirection).toBeUndefined();
    expect(result.report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-language",
      "invalid-assets",
    ]);
    const frontAtlas = catalog.atlases.front[0];
    expect(frontAtlas).toMatchObject({
      firstPublicationIndex: 0,
      publicationCount: 2,
      width: 768,
      height: 576,
    });
    if (!frontAtlas) throw new Error("Expected a front shelf atlas");
    expect(frontAtlas.path).toStartWith("assets/atlases/front-");
    const frontAtlasContainer = readKtx2(await readFile(pooled(root, frontAtlas.path)));
    expect(frontAtlasContainer.pixelWidth).toBe(768);
    expect(frontAtlasContainer.pixelHeight).toBe(576);
    const englishFront = catalog.publications[0]?.assets.front;
    if (!englishFront) throw new Error("Expected an english front cover");
    expect(englishFront).toStartWith("assets/publications/english-book/");
    expect(await sharp(pooled(root, englishFront)).metadata()).toMatchObject({
      width: 256,
      height: 384,
    });
    const writtenCatalog = JSON.parse(await readFile(resolve(revisionDirectory, "catalog.json"), "utf8")) as {
      contentHash?: string;
    };
    expect(writtenCatalog.contentHash).toBe(catalog.contentHash);
    const preview = await readFile(resolve(revisionDirectory, "preview.html"), "utf8");
    expect(preview).toContain("visual-v1");
    expect(preview).toContain("Publication english-book");
    expect(preview).toContain(encodeURI(englishFront));

    const repeated = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "visual-v1",
        languages: ["english", "japanese"],
        limit: 2,
        outputDirectory: resolve(root, "revisions/rev-2"),
        seed: "seed-0",
        tags: ["big-breasts"],
      }),
    );
    expect(repeated.catalog?.contentHash).toBe(catalog.contentHash);
  });

  test("streams interior pages instead of pooling them and renders title-based spine textures", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "webp-book", "english", "#7c3f58", {
      format: "webp",
      height: 1800,
      width: 1280,
    });

    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "webp-passthrough",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
    );
    if (!first.catalog) throw new Error("First catalog is missing");
    const firstPublication = first.catalog.publications[0];
    if (!firstPublication) throw new Error("First publication is missing");
    // Interior pages are streamed from their source at read time; only the
    // shelf/inspect surface derivatives live in the pool.
    expect(firstPublication.assets.pages).toEqual([]);
    expect(firstPublication.pageCount).toBe(2);
    await expect(access(resolve(root, "assets/publications/webp-book/pages"))).rejects.toThrow();
    const firstSpinePath = firstPublication.assets.spine;
    if (!firstSpinePath) throw new Error("First spine is missing");
    expect(await sharp(pooled(root, firstSpinePath)).metadata()).toMatchObject({
      format: "webp",
      height: 1024,
      width: 32,
    });

    const manifestPath = resolve(catalogDirectory, "webp-book/publication.json");
    const document = JSON.parse(await readFile(manifestPath, "utf8")) as LocalPublicationDocument;
    document.title = "[XBOY] 엄마와 이세계 모험";
    document.physical = {readingDirection: "ltr", thicknessMm: 24};
    await writeFile(manifestPath, JSON.stringify(document));
    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "webp-passthrough",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-2"),
      }),
    );
    if (!second.catalog) throw new Error("Second catalog is missing");
    const secondSpinePath = second.catalog.publications[0]?.assets.spine;
    if (!secondSpinePath) throw new Error("Second spine is missing");
    expect(secondSpinePath).not.toBe(firstSpinePath);
    expect(await sharp(pooled(root, secondSpinePath)).metadata()).toMatchObject({
      format: "webp",
      height: 1024,
      width: 96,
    });
    const renderedSpine = await sharp(pooled(root, secondSpinePath)).raw().toBuffer({resolveWithObject: true});
    let minTitleX = Number.POSITIVE_INFINITY;
    let maxTitleX = Number.NEGATIVE_INFINITY;
    let minTitleY = Number.POSITIVE_INFINITY;
    let maxTitleY = Number.NEGATIVE_INFINITY;
    for (let y = 123; y < 932; y += 1) {
      for (let x = 0; x < renderedSpine.info.width; x += 1) {
        const offset = (y * renderedSpine.info.width + x) * renderedSpine.info.channels;
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
    expect(Math.abs((minTitleX + maxTitleX) / 2 - (renderedSpine.info.width - 1) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((minTitleY + maxTitleY) / 2 - (395 * 1024) / 768)).toBeLessThanOrEqual(2);
    // The old spine keeps its content-keyed name; both spines coexist in
    // the pool until garbage collection retires the unreferenced one.
    expect(await readFile(pooled(root, firstSpinePath))).toBeDefined();
    expect(await readFile(pooled(root, secondSpinePath))).not.toEqual(await readFile(pooled(root, firstSpinePath)));
  });

  test("regenerates superseded derivative formats while keeping stable pooled assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-reuse-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await Promise.all([
      createPublication(catalogDirectory, "book-a", "english", "#703050", {
        provenance: true,
      }),
      createPublication(catalogDirectory, "book-b", "english", "#305070", {
        provenance: true,
      }),
    ]);
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "reuse-test",
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
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
      poolOptions(root, {
        packId: "reuse-test",
        outputDirectory: resolve(root, "revisions/rev-2"),
        reuse: {catalog: legacyCatalog},
      }),
    );
    if (!second.catalog) throw new Error("Second reuse catalog is missing");
    const upgradedBookA = second.catalog.publications.find(({id}) => id === "book-a");
    const previousBookA = first.catalog.publications.find(({id}) => id === "book-a");
    if (!upgradedBookA || !previousBookA) throw new Error("Expected book-a in both catalogs");
    // Stable derivatives keep their content-keyed pool paths. Regenerating
    // a superseded format is deterministic, so even migrated derivatives
    // land on their original content-keyed names.
    expect(upgradedBookA.assets.front).toBe(previousBookA.assets.front);
    expect(upgradedBookA.assets.back).toBe(previousBookA.assets.back);
    expect(upgradedBookA.assets.spine).toBe(previousBookA.assets.spine);
    expect(upgradedBookA.assets.backDetail).toBeUndefined();
    expect(upgradedBookA.assets.pages).toEqual([]);
    await access(pooled(root, upgradedBookA.assets.back));
    await access(pooled(root, upgradedBookA.assets.spine));
    expect(upgradedBookA.backFormatVersion).toBe(2);
    expect(second.catalog.publications[0]?.spineFormatVersion).toBe(4);

    const upgradedSpineAtlas = second.catalog.atlases.spine[0];
    expect(second.catalog.atlases.front[0]?.formatVersion).toBe(5);
    expect(second.catalog.atlases.back[0]?.formatVersion).toBe(2);
    expect(second.catalog.atlases.back[0]?.height).toBe(576);
    expect(upgradedSpineAtlas?.formatVersion).toBe(6);
    expect(upgradedSpineAtlas?.height).toBe(1024);
    expect(upgradedSpineAtlas?.regions).toHaveLength(2);
    expect(upgradedSpineAtlas?.width).toBe(
      upgradedSpineAtlas?.regions?.reduce((total, region) => total + region.width, 0),
    );

    await rm(resolve(catalogDirectory, "book-b"), {
      force: true,
      recursive: true,
    });
    const third = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "reuse-test",
        outputDirectory: resolve(root, "revisions/rev-3"),
        reuse: {catalog: second.catalog},
      }),
    );
    expect(third.catalog?.publications.map(({id}) => id)).toEqual(["book-a"]);
    const thirdBookA = third.catalog?.publications[0];
    expect(thirdBookA?.assets).toEqual(upgradedBookA.assets);
    // The front atlas membership changed, so it re-keys to a new file even
    // though book-a itself was reused untouched.
    expect(third.catalog?.atlases.front[0]?.path).not.toBe(second.catalog.atlases.front[0]?.path);
  });

  test("rekeys revision-scoped pooled assets into the content-keyed pool on reuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-rekey-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "legacy-book", "english", "#703050", {provenance: true});
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "rekey-test",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
    );
    if (!first.catalog) throw new Error("First rekey catalog is missing");
    const keyedPublication = first.catalog.publications[0];
    if (!keyedPublication) throw new Error("Keyed publication is missing");

    // Rewind the pool to the pre-pool layout: every asset scoped under its
    // revision directory, reader pages pooled, and a back detail cover.
    const legacyScope = "assets/20260801t000000-000z-legacy/publications/legacy-book";
    const scoped = (catalogPath: string) => catalogPath.replace("assets/publications/legacy-book/", `${legacyScope}/`);
    const moves = [
      keyedPublication.assets.front,
      keyedPublication.assets.frontDetail,
      keyedPublication.assets.back,
      keyedPublication.assets.spine,
    ].map((catalogPath) => [catalogPath, scoped(catalogPath)] as const);
    await Promise.all(
      moves.map(async ([from, to]) => {
        await mkdir(dirname(pooled(root, to)), {recursive: true});
        await rename(pooled(root, from), pooled(root, to));
      }),
    );
    const legacyCatalog = structuredClone(first.catalog);
    const legacyPublication = legacyCatalog.publications[0];
    if (!legacyPublication) throw new Error("Legacy publication clone is missing");
    legacyPublication.assets = {
      front: scoped(keyedPublication.assets.front),
      frontDetail: scoped(keyedPublication.assets.frontDetail),
      back: scoped(keyedPublication.assets.back),
      backDetail: scoped(keyedPublication.assets.back),
      spine: scoped(keyedPublication.assets.spine),
      // Two pooled preview pages matching the source material count keeps
      // the reuse-metadata comparison satisfied.
      pages: [`${legacyScope}/pages/001.webp`, `${legacyScope}/pages/002.webp`],
    };
    // Pre-pageCount catalogs omitted it; the reuse path must synthesize one
    // because empty pooled pages require an explicit count.
    delete legacyPublication.pageCount;
    legacyPublication.backFormatVersion = 1;

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "rekey-test",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-2"),
        reuse: {catalog: legacyCatalog},
      }),
    );
    if (!second.catalog) throw new Error("Second rekey catalog is missing");
    const migrated = second.catalog.publications[0];
    if (!migrated) throw new Error("Migrated publication is missing");
    // Every surface derivative landed on its original content-keyed name,
    // because the renamed bytes hash to the same keyed filename.
    expect(migrated.assets.front).toBe(keyedPublication.assets.front);
    expect(migrated.assets.frontDetail).toBe(keyedPublication.assets.frontDetail);
    expect(migrated.assets.back).toBe(keyedPublication.assets.back);
    expect(migrated.assets.spine).toBe(keyedPublication.assets.spine);
    expect(migrated.assets.pages).toEqual([]);
    expect(migrated.assets.backDetail).toBeUndefined();
    expect(migrated.pageCount).toBe(2);
    expect(migrated.backFormatVersion).toBe(2);
    // Internal migration bookkeeping must never leak into packed entries.
    expect("migrated" in migrated).toBe(false);
    for (const [from, to] of moves) {
      // The file lives again at its content-keyed location...
      await access(pooled(root, from));
      // ...and the revision-scoped copy is gone.
      await expect(access(pooled(root, to))).rejects.toThrow();
    }
  });

  test("rebuilds a legacy inferred aspect ratio once, then reuses the versioned result", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-aspect-version-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "versioned-aspect", "english", "#703050", {
      pageDimensions: [
        {height: 600, width: 1_200},
        {height: 1_200, width: 800},
        {height: 1_200, width: 800},
        {height: 600, width: 1_200},
      ],
      provenance: true,
    });
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "aspect-version-test",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
    );
    if (!first.catalog) throw new Error("First aspect catalog is missing");
    const legacyCatalog = structuredClone(first.catalog);
    const legacyPublication = legacyCatalog.publications[0];
    if (!legacyPublication) throw new Error("Legacy publication is missing");
    legacyPublication.physical.aspectRatio = 1.5;
    delete legacyPublication.aspectRatioInferenceVersion;

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "aspect-version-test",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-2"),
        reuse: {catalog: legacyCatalog},
      }),
    );
    if (!second.catalog) throw new Error("Second aspect catalog is missing");
    const rebuilt = second.catalog.publications[0];
    expect(rebuilt?.physical.aspectRatio).toBeCloseTo(first.catalog.publications[0]?.physical.aspectRatio ?? 0);
    expect(rebuilt?.aspectRatioInferenceVersion).toBe(BOOK_ASPECT_RATIO_INFERENCE_VERSION);

    const third = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "aspect-version-test",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-3"),
        reuse: {catalog: second.catalog},
      }),
    );
    // The versioned inference result is reusable again, and because pool
    // paths are content-keyed the rebuild landed on identical paths.
    expect(third.catalog?.publications[0]?.assets).toEqual(rebuilt?.assets);
    expect(third.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(2 / 3);
  });

  test("keeps unchanged publications stable across revisions without linking or copying", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-pool-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await Promise.all([
      createPublication(catalogDirectory, "book-a", "english", "#703050", {
        provenance: true,
      }),
      createPublication(catalogDirectory, "book-b", "english", "#305070", {
        provenance: true,
      }),
    ]);
    const firstRevision = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "pool-test",
        outputDirectory: resolve(root, "revisions/revision-1"),
      }),
    );
    if (!firstRevision.catalog) throw new Error("First pooled catalog is missing");

    await createPublication(catalogDirectory, "book-c", "english", "#507030", {
      provenance: true,
    });
    const secondRevision = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "pool-test",
        outputDirectory: resolve(root, "revisions/revision-2"),
        reuse: {catalog: firstRevision.catalog},
      }),
    );
    if (!secondRevision.catalog) throw new Error("Second pooled catalog is missing");
    const firstIds = firstRevision.catalog.publications.map(({id}) => id);
    expect(secondRevision.catalog.publications.slice(0, firstIds.length).map(({id}) => id)).toEqual(firstIds);
    for (const previousPublication of firstRevision.catalog.publications) {
      const nextPublication = secondRevision.catalog.publications.find(({id}) => id === previousPublication.id);
      expect(nextPublication?.assets).toEqual(previousPublication.assets);
    }
    const addedPublication = secondRevision.catalog.publications.find(({id}) => id === "book-c");
    expect(addedPublication?.assets.front).toStartWith("assets/publications/book-c/");
    // Revision directories hold only JSON; assets live solely in the pool.
    await expect(access(resolve(root, "revisions/revision-2/assets"))).rejects.toThrow();
    await access(pooled(root, firstRevision.catalog.publications[0]?.assets.front ?? "missing"));
    // Reused files were never hard-linked into a per-revision tree, so
    // their link count stayed at one.
    const reusedFront = await stat(pooled(root, firstRevision.catalog.publications[0]?.assets.front ?? "missing"));
    expect(reusedFront.nlink).toBe(1);
  });

  test("quick scans reuse stat-identical local books and rebuild changed local assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-local-reuse-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "local-book", "english", "#703050");
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "local-reuse",
        outputDirectory: resolve(root, "revisions/revision-1"),
      }),
    );
    if (!first.catalog) throw new Error("First local catalog is missing");

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "local-reuse",
        outputDirectory: resolve(root, "revisions/revision-2"),
        reuse: {catalog: first.catalog},
      }),
    );
    if (!second.catalog) throw new Error("Second local catalog is missing");
    expect(second.catalog.publications[0]?.assets).toEqual(first.catalog.publications[0]?.assets);

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
    const third = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "local-reuse",
        outputDirectory: resolve(root, "revisions/revision-3"),
        reuse: {catalog: second.catalog},
      }),
    );
    if (!third.catalog) throw new Error("Third local catalog is missing");
    expect(third.catalog.publications[0]?.assets.front).not.toBe(second.catalog.publications[0]?.assets.front);
    expect(third.catalog.publications[0]?.materialFingerprint).not.toBe(
      second.catalog.publications[0]?.materialFingerprint,
    );

    const repaired = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "local-reuse",
        forceRebuild: true,
        outputDirectory: resolve(root, "revisions/revision-4"),
        reuse: {catalog: third.catalog},
      }),
    );
    // A forced rebuild is deterministic, so it reproduces byte-identical
    // derivatives that land on the very same content-keyed pool paths.
    expect(repaired.catalog?.publications[0]?.assets).toEqual(third.catalog.publications[0]?.assets);
    expect(repaired.catalog?.publications[0]?.contentHash).toBe(third.catalog.publications[0]?.contentHash);
  });

  test("keeps the previous local publication when changed source assets are corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-corrupt-local-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "local-book", "english", "#703050");
    const first = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "corrupt-local",
        outputDirectory: resolve(root, "revisions/revision-1"),
      }),
    );
    if (!first.catalog) throw new Error("First local catalog is missing");
    await writeFile(resolve(catalogDirectory, "local-book/pages/001.png"), "corrupt image");

    const second = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "corrupt-local",
        forceRebuild: true,
        outputDirectory: resolve(root, "revisions/revision-2"),
        reuse: {catalog: first.catalog},
      }),
    );

    expect(second.catalog?.publications).toHaveLength(1);
    expect(second.catalog?.publications[0]?.assets).toEqual(first.catalog.publications[0]?.assets);
    expect(second.report.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({code: "invalid-assets"})]),
    );
  });

  test("leaves oversized source pages on disk for on-demand streaming", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "oversized-webp-book", "english", "#34485c", {
      format: "webp",
      height: 2200,
      width: 2200,
    });
    const result = await seedContentPack(new LocalCatalogSource(catalogDirectory), {
      ...poolOptions(root, {
        packId: "webp-resize",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
      tags: ["big-breasts"],
    });
    const publication = result.catalog?.publications[0];
    if (!publication) throw new Error("Expected a seeded publication");
    expect(publication.assets.pages).toEqual([]);
    expect(publication.pageCount).toBe(2);
    // The oversized source page is never re-encoded into the pool; the
    // sparse page route resizes it on demand instead.
    await expect(access(resolve(root, "assets/publications/oversized-webp-book/pages"))).rejects.toThrow();
  });

  test("preserves a publication's inferred non-standard page aspect ratio", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "gravure-book", "english", "#7c285d", {height: 1766, width: 1280});

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "non-standard-aspect",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
        tags: ["big-breasts"],
      }),
    );

    const publication = result.catalog?.publications[0];
    expect(publication?.physical.aspectRatio).toBeCloseTo(1280 / 1766);
    if (!publication) throw new Error("Seeded publication is missing");
    expect(await sharp(pooled(root, publication.assets.front)).metadata()).toMatchObject({height: 384, width: 278});
    expect(await sharp(pooled(root, publication.assets.frontDetail)).metadata()).toMatchObject({
      height: 1536,
      width: 1113,
    });
    const frontAtlas = result.catalog?.atlases.front[0];
    if (!frontAtlas) throw new Error("Expected a front shelf atlas");
    const atlasContainer = readKtx2(await readFile(pooled(root, frontAtlas.path)));
    expect(atlasContainer.pixelWidth).toBe(384);
    expect(atlasContainer.pixelHeight).toBe(576);
  });

  test("infers a landscape book from interior pages despite wide covers and early spreads", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    await createPublication(catalogDirectory, "wide-cover-book", "english", "#415f79", {
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
    });

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "wide-cover-aspect",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
    );

    expect(result.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(1.2);
  });

  test("infers a sparse preview from its interior pages instead of its wide endpoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const publicationId = "sparse-wide-cover-book";
    await createPublication(catalogDirectory, publicationId, "english", "#4f6f52", {
      pageDimensions: [
        {height: 100, width: 280},
        {height: 100, width: 240},
        {height: 100, width: 120},
        {height: 100, width: 270},
      ],
    });
    const manifestPath = resolve(catalogDirectory, publicationId, "publication.json");
    const document = JSON.parse(await readFile(manifestPath, "utf8")) as LocalPublicationDocument;
    document.pageCount = 4;
    document.assets = {
      front: "pages/001.png",
      pages: ["pages/001.png", "pages/002.png", "pages/003.png"],
      back: "pages/004.png",
    };
    await writeFile(manifestPath, JSON.stringify(document));

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "sparse-wide-cover-aspect",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
      }),
    );

    expect(result.catalog?.publications[0]?.physical.aspectRatio).toBeCloseTo(1.2);
  });

  test("extracts front, back, and spine panels from an obvious wraparound scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-seed-"));
    temporaryDirectories.push(root);
    const catalogDirectory = resolve(root, "catalog");
    const publicationDirectory = resolve(catalogDirectory, "wrapped-book");
    const pagesDirectory = resolve(publicationDirectory, "pages");
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
    await writeFile(resolve(publicationDirectory, "publication.json"), JSON.stringify(document));

    const result = await seedContentPack(
      new LocalCatalogSource(catalogDirectory),
      poolOptions(root, {
        packId: "wraparound",
        limit: 1,
        outputDirectory: resolve(root, "revisions/rev-1"),
        tags: ["big-breasts"],
      }),
    );
    const publication = result.catalog?.publications[0];
    if (!publication) throw new Error("Wrapped publication is missing");
    const frontStats = await sharp(pooled(root, publication.assets.front)).stats();
    const backStats = await sharp(pooled(root, publication.assets.back)).stats();
    expect(await sharp(pooled(root, publication.assets.frontDetail)).metadata()).toMatchObject({
      height: 600,
      width: 400,
    });
    expect(frontStats.channels[0]?.mean).toBeGreaterThan((frontStats.channels[2]?.mean ?? 0) * 2);
    expect(backStats.channels[2]?.mean).toBeGreaterThan((backStats.channels[0]?.mean ?? 0) * 1.5);
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
        ...poolOptions(root, {
          packId: "visual-v1",
          dryRun: true,
          limit: 1,
          outputDirectory: resolve(root, "revisions/rev-1"),
        }),
        tags: ["big-breasts"],
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
