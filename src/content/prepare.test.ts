import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, readFile, rm} from "node:fs/promises";
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
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
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
    expect(
      inferPreparedPublicationIdentity("Comic Kairakuten 2024-05 [English]", [
        "big breasts",
      ]),
    ).toEqual({
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
      inferPreparedPublicationIdentity(
        "[Example Editor] COMIC Kairakuten 2025-08 [Digital] [English]",
        [],
      ),
    ).toMatchObject({
      groupId: "comic-kairakuten",
      issue: {year: 2025, month: 8},
      kind: "magazine",
      title: "[Example Editor] COMIC Kairakuten 2025-08 [Digital]",
    });
  });

  test("detects supported language hints and rejects Chinese", () => {
    expect(
      detectPreparedPublicationLanguage("Some Book [Japanese]", "english"),
    ).toEqual({language: "japanese"});
    expect(
      detectPreparedPublicationLanguage("Some Book [Chinese]", "english"),
    ).toEqual({unsupportedLabel: "Chinese"});
    expect(
      detectPreparedPublicationLanguage("Japanese Breakfast", "english"),
    ).toEqual({language: "english"});
    expect(
      detectPreparedPublicationReadingDirection("Some Book [English] [RTL]"),
    ).toBe("rtl");
    expect(
      detectPreparedPublicationReadingDirection("Some Book [Japanese]"),
    ).toBeUndefined();
  });

  test("parses preview options", () => {
    const options = parseContentPrepareCliOptions(
      ["--root", "raw", "--tags", "Big Breasts,Magazine"],
      "/workspace/afterleaf",
    );
    expect(options.prepareOptions).toMatchObject({
      rootDirectory: "/workspace/afterleaf/raw",
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
    createImage(resolve(englishDirectory, "pages/10.png"), "#101010"),
    createImage(resolve(englishDirectory, "pages/2.png"), "#202020"),
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
  expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "inferred-magazine",
    "skipped-language",
  ]);
  const englishManifest = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(resolve(englishDirectory, "publication.json"), "utf8"),
    ) as unknown,
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
    pages: ["cover.png", "pages/2.png", "pages/10.png"],
    front: "cover.png",
  });
  expect(englishManifest.physical?.readingDirection).toBeUndefined();
  const japaneseManifest = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(resolve(japaneseDirectory, "publication.json"), "utf8"),
    ) as unknown,
    "publication.json",
  );
  expect(japaneseManifest.physical?.readingDirection).toBeUndefined();
});
