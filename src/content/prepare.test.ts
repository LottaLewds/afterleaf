import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {
  detectPreparedPublicationLanguage,
  detectPreparedPublicationReadingDirection,
  inferPreparedPublicationIdentity,
  prepareLocalCatalog,
} from "~/content/prepare";
import {parseContentPrepareCliOptions} from "~/content/prepareCli";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const createImage = async (path: string, color: string) => {
  await mkdir(resolve(path, ".."), {recursive: true});
  await sharp({
    create: {width: 64, height: 96, channels: 3, background: color},
  })
    .png()
    .toFile(path);
};

describe("catalog preparation inference", () => {
  test("recognizes dated and numbered Comic magazine families", () => {
    expect(inferPreparedPublicationIdentity("Comic Kairakuten 2024-05 [English]", ["big breasts"])).toEqual({
      groupId: "comic-kairakuten",
      issue: {year: 2024, month: 5},
      kind: "magazine",
      title: "Comic Kairakuten 2024-05",
      tags: ["big-breasts", "magazine", "comic-kairakuten"],
    });
    expect(inferPreparedPublicationIdentity("COMIC ExE 40", [])).toMatchObject({
      groupId: "comic-exe",
      issue: {number: 40},
      kind: "magazine",
    });
    expect(
      inferPreparedPublicationIdentity("[Example Editor] COMIC Kairakuten 2025-08 [Digital] [English]", []),
    ).toMatchObject({
      groupId: "comic-kairakuten",
      issue: {year: 2025, month: 8},
      kind: "magazine",
      title: "[Example Editor] COMIC Kairakuten 2025-08 [Digital]",
    });
  });

  test("detects supported language hints and rejects Chinese", () => {
    expect(detectPreparedPublicationLanguage("Some Book [Japanese]", "english")).toEqual({language: "japanese"});
    expect(detectPreparedPublicationLanguage("Some Book [Chinese]", "english")).toEqual({unsupportedLabel: "Chinese"});
    expect(detectPreparedPublicationLanguage("Japanese Breakfast", "english")).toEqual({language: "english"});
    expect(detectPreparedPublicationReadingDirection("Some Book [English] [RTL]")).toBe("rtl");
    expect(detectPreparedPublicationReadingDirection("Some Book [Japanese]")).toBeUndefined();
  });

  test("parses preview options", () => {
    const options = parseContentPrepareCliOptions(
      ["--root", "raw", "--tags", "Big Breasts,Magazine"],
      "/workspace/afterleaf",
    );
    expect(options.prepareOptions).toMatchObject({
      rootDirectory: resolve("/workspace/afterleaf/raw"),
      tags: ["big-breasts", "magazine"],
      write: false,
    });
  });
});

test("prepareLocalCatalog writes natural page order and skips Chinese folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-"));
  temporaryDirectories.push(root);
  const englishDirectory = resolve(root, "Comic Kairakuten 2024-05 [English]");
  const japaneseDirectory = resolve(root, "Quiet Office [Japanese]");
  const chineseDirectory = resolve(root, "Skipped Book [Chinese]");
  await Promise.all([
    createImage(resolve(englishDirectory, "10.png"), "#101010"),
    createImage(resolve(englishDirectory, "2.png"), "#202020"),
    createImage(resolve(englishDirectory, "cover.png"), "#303030"),
    createImage(resolve(japaneseDirectory, "001.png"), "#404040"),
    createImage(resolve(chineseDirectory, "001.png"), "#505050"),
  ]);

  const report = await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    rootDirectory: root,
    tags: ["big-breasts"],
    write: true,
  });

  expect(report.preparedCount).toBe(2);
  expect(report.skippedCount).toBe(1);
  expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["inferred-magazine", "skipped-language"]);
  const englishManifest = parseLocalPublicationDocument(
    JSON.parse(await readFile(resolve(englishDirectory, "publication.json"), "utf8")) as unknown,
    "publication.json",
  );
  expect(englishManifest).toMatchObject({
    id: "comic-kairakuten-2024-05",
    groupId: "comic-kairakuten",
    issue: {year: 2024, month: 5},
    kind: "magazine",
    language: "english",
  });
  expect(englishManifest.assets).toEqual({
    pages: ["2.png", "10.png", "cover.png"],
    front: "cover.png",
  });
  expect(englishManifest.physical?.readingDirection).toBeUndefined();
  const japaneseManifest = parseLocalPublicationDocument(
    JSON.parse(await readFile(resolve(japaneseDirectory, "publication.json"), "utf8")) as unknown,
    "publication.json",
  );
  expect(japaneseManifest.physical?.readingDirection).toBeUndefined();
});

test("prepareLocalCatalog recursively discovers media leaves and keeps organizational folders inert", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-nested-"));
  temporaryDirectories.push(root);
  const firstBook = resolve(root, "authorA/series/Book One");
  const secondBook = resolve(root, "authorB/Book Two");
  const archiveContainer = resolve(root, "authorC");
  await mkdir(archiveContainer, {recursive: true});
  await Promise.all([
    createImage(resolve(root, "authorA/portrait.jpg"), "#101010"),
    createImage(resolve(firstBook, "001.jpg"), "#202020"),
    createImage(resolve(secondBook, "001.jpg"), "#303030"),
    createImage(resolve(archiveContainer, "random.jpg"), "#404040"),
    writeFile(resolve(archiveContainer, "Book Three.cbz"), "not inspected here"),
  ]);

  const report = await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    readingDirection: "rtl",
    rootDirectory: root,
    tags: [],
    write: true,
  });

  expect(report.publications.map(({directory}) => directory)).toEqual(["authorA/series/Book One", "authorB/Book Two"]);
  expect(report.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "ignored-container-images",
        directory: "authorA",
      }),
      expect.objectContaining({
        code: "ignored-container-images",
        directory: "authorC",
      }),
    ]),
  );
  await expect(Bun.file(resolve(root, "authorA/publication.json")).exists()).resolves.toBe(false);
  await expect(Bun.file(resolve(archiveContainer, "publication.json")).exists()).resolves.toBe(false);
  for (const directory of [firstBook, secondBook]) {
    const document = parseLocalPublicationDocument(
      JSON.parse(await readFile(resolve(directory, "publication.json"), "utf8")) as unknown,
      "publication.json",
    );
    expect(document.physical?.readingDirection).toBe("rtl");
  }
});

test("prepareLocalCatalog preserves nested publications when a configured root moves upward", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-root-move-"));
  temporaryDirectories.push(root);
  const libraryDirectory = resolve(root, "manga");
  const publicationDirectory = resolve(libraryDirectory, "author/Existing Book");
  await createImage(resolve(publicationDirectory, "001.jpg"), "#505050");
  const options = {
    defaultLanguage: "english" as const,
    force: false,
    readingDirection: "rtl" as const,
    tags: [],
    write: true,
  };

  await prepareLocalCatalog({...options, rootDirectory: libraryDirectory});
  const parentReport = await prepareLocalCatalog({
    ...options,
    refreshExisting: true,
    rootDirectory: root,
  });

  expect(parentReport.publications).toEqual([]);
  expect(parentReport.diagnostics.map(({code}) => code)).toContain("existing-manifest");
  await expect(Bun.file(resolve(libraryDirectory, "publication.json")).exists()).resolves.toBe(false);
  await expect(Bun.file(resolve(publicationDirectory, "publication.json")).exists()).resolves.toBe(true);
});

test("prepareLocalCatalog ignores an accidental outer manifest without deleting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-shadowed-"));
  temporaryDirectories.push(root);
  const child = resolve(root, "container/Book");
  await createImage(resolve(child, "001.jpg"), "#606060");
  await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    rootDirectory: root,
    tags: [],
    write: true,
  });
  const outerManifest = resolve(root, "container/publication.json");
  const outerContents = JSON.stringify({
    assets: {pages: ["Book/001.jpg"]},
    id: "accidental-container",
    language: "english",
    schemaVersion: 1,
    tags: ["unclassified"],
    title: "Accidental Container",
  });
  await writeFile(outerManifest, outerContents);

  const report = await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    refreshExisting: true,
    rootDirectory: root,
    tags: [],
    write: true,
  });

  expect(report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({code: "shadowed-manifest"})]));
  expect(await readFile(outerManifest, "utf8")).toBe(outerContents);
});

test("prepareLocalCatalog preserves malformed manifests and continues scanning", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-invalid-"));
  temporaryDirectories.push(root);
  const broken = resolve(root, "Broken Book");
  const healthy = resolve(root, "Healthy Book");
  await Promise.all([
    createImage(resolve(broken, "001.jpg"), "#707070"),
    createImage(resolve(healthy, "001.jpg"), "#808080"),
  ]);
  const manifestPath = resolve(broken, "publication.json");
  await writeFile(manifestPath, "{ definitely not valid JSON");

  const report = await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    refreshExisting: true,
    rootDirectory: root,
    tags: [],
    write: true,
  });

  expect(await readFile(manifestPath, "utf8")).toBe("{ definitely not valid JSON");
  expect(report.publications.map(({directory}) => directory)).toEqual(["Healthy Book"]);
  expect(report.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "processing-failed",
        directory: "Broken Book",
      }),
    ]),
  );
});

test("publication titles preserve Unicode and duplicate leaf names receive unique IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-unicode-"));
  temporaryDirectories.push(root);
  await Promise.all([
    createImage(resolve(root, "著者A/Café 東京/001.jpg"), "#909090"),
    createImage(resolve(root, "著者B/Café 東京/001.jpg"), "#a0a0a0"),
  ]);

  const report = await prepareLocalCatalog({
    defaultLanguage: "english",
    force: false,
    rootDirectory: root,
    tags: [],
    write: true,
  });
  const documents = report.publications.map(({document}) => document);

  expect(documents.map(({title}) => title)).toEqual(["Café 東京", "Café 東京"]);
  expect(new Set(documents.map(({id}) => id)).size).toBe(2);
});

test("prepareLocalCatalog removes a configured reading direction on refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "afterleaf-prepare-direction-"));
  temporaryDirectories.push(root);
  const publicationDirectory = resolve(root, "Book");
  await createImage(resolve(publicationDirectory, "001.png"), "#404040");
  const options = {
    defaultLanguage: "english" as const,
    force: false,
    refreshExisting: true,
    rootDirectory: root,
    tags: [],
    write: true,
  };

  await prepareLocalCatalog({...options, readingDirection: "rtl"});
  await prepareLocalCatalog(options);

  const document = parseLocalPublicationDocument(
    JSON.parse(await readFile(resolve(publicationDirectory, "publication.json"), "utf8")) as unknown,
    "publication.json",
  );
  expect(document.physical?.readingDirection).toBeUndefined();
});
