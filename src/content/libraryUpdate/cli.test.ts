import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {zipSync} from "fflate";
import sharp from "sharp";
import {
  parseLibraryUpdateCliOptions,
  runLibraryBlacklistCli,
  runLibraryScanCli,
} from "~/content/libraryUpdate/cli";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

test("library update CLI separates snapshot storage from the acquisition catalog", () => {
  const parsed = parseLibraryUpdateCliOptions(
    [
      "--library",
      "packs/library",
      "--catalog-root",
      "sources",
      "--limit",
      "20",
      "--write",
    ],
    "/workspace/afterleaf",
  );

  expect(parsed).toMatchObject({
    catalogDirectory: resolve("/workspace/afterleaf/sources"),
    libraryDirectory: resolve("/workspace/afterleaf/packs/library"),
    mediaPaths: [],
    providerId: "nhentai",
    sync: {
      limit: 20,
      write: true,
    },
  });
});

test("library update CLI accepts repeatable media paths", () => {
  const parsed = parseLibraryUpdateCliOptions(
    ["--media-path", "../comics", "--media-path=single-book.cbr", "--write"],
    "/workspace/afterleaf",
  );

  expect(parsed.mediaPaths).toEqual([
    resolve("/workspace/comics"),
    resolve("/workspace/afterleaf/single-book.cbr"),
  ]);
});

test("library scan imports new archives before activating the combined catalog", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-library-cli-"));
  temporaryDirectories.push(root);
  const archiveDirectory = resolve(root, "content/books");
  await mkdir(archiveDirectory, {recursive: true});
  await writeFile(
    resolve(root, "afterleaf.library.json"),
    `${JSON.stringify({mediaPaths: ["content/books"]}, null, 2)}
`,
  );
  const page = await sharp({
    create: {
      background: "#402030",
      channels: 3,
      height: 96,
      width: 64,
    },
  })
    .png()
    .toBuffer();
  const archivePath = resolve(
    archiveDirectory,
    "New Local Comic [English].cbz",
  );
  await writeFile(archivePath, zipSync({"001.png": page, "002.png": page}));

  const result = await runLibraryScanCli(["--write"], root);

  expect(result?.snapshot.publicationCount).toBe(1);
  expect(result?.diff.addedPublicationIds).toEqual(["new-local-comic"]);
  const publicationDirectory = resolve(
    root,
    "content-sources/catalog/New Local Comic [English]",
  );
  const manifest = parseLocalPublicationDocument(
    JSON.parse(
      await readFile(resolve(publicationDirectory, "publication.json"), "utf8"),
    ) as unknown,
    "publication.json",
  );
  expect(manifest).toMatchObject({
    id: "new-local-comic",
    pageCount: 2,
    assets: {pages: []},
  });

  await rm(archivePath);
  const removal = await runLibraryScanCli(["--write"], root);
  expect(removal?.snapshot.publicationCount).toBe(0);
  expect(removal?.diff.removedPublicationIds).toEqual(["new-local-comic"]);
  await expect(stat(publicationDirectory)).rejects.toThrow();
});

test("library scan preserves removed archives from configured media paths", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-library-cli-"));
  temporaryDirectories.push(root);
  const externalDirectory = resolve(root, "external-books");
  await mkdir(externalDirectory, {recursive: true});
  const page = await sharp({
    create: {
      background: "#302040",
      channels: 3,
      height: 96,
      width: 64,
    },
  })
    .png()
    .toBuffer();
  const removedArchive = resolve(
    externalDirectory,
    "External One [English].cbz",
  );
  await Promise.all([
    writeFile(removedArchive, zipSync({"001.png": page})),
    writeFile(
      resolve(externalDirectory, "External Two [English].cbz"),
      zipSync({"001.png": page}),
    ),
    writeFile(
      resolve(root, "afterleaf.library.json"),
      `${JSON.stringify({mediaPaths: ["external-books"]}, null, 2)}
`,
    ),
  ]);

  const first = await runLibraryScanCli(["--write"], root);
  expect(first?.snapshot.publicationCount).toBe(2);
  await rm(removedArchive);

  const second = await runLibraryScanCli(["--write"], root);
  expect(second?.snapshot.publicationCount).toBe(2);
  expect(second?.diff.removedPublicationIds).toEqual([]);
  expect(
    await stat(resolve(root, "content-sources/catalog/External One [English]")),
  ).toBeTruthy();
});

test("library scan prepares configured image folders without a separate command", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-library-cli-"));
  temporaryDirectories.push(root);
  const publicationDirectory = resolve(root, "external-media/Folder Comic");
  await mkdir(publicationDirectory, {recursive: true});
  await sharp({
    create: {
      background: "#204030",
      channels: 3,
      height: 96,
      width: 64,
    },
  })
    .png()
    .toFile(resolve(publicationDirectory, "001.png"));
  await writeFile(
    resolve(root, "afterleaf.library.json"),
    `${JSON.stringify({mediaPaths: ["external-media"]}, null, 2)}\n`,
  );

  const result = await runLibraryScanCli(["--write"], root);

  expect(result?.snapshot.publicationCount).toBe(1);
  expect(result?.diff.addedPublicationIds).toEqual(["folder-comic"]);
  expect(
    parseLocalPublicationDocument(
      JSON.parse(
        await readFile(
          resolve(publicationDirectory, "publication.json"),
          "utf8",
        ),
      ) as unknown,
      "publication.json",
    ),
  ).toMatchObject({
    id: "folder-comic",
    assets: {pages: ["001.png"]},
  });

  await sharp({
    create: {
      background: "#304020",
      channels: 3,
      height: 96,
      width: 64,
    },
  })
    .png()
    .toFile(resolve(publicationDirectory, "002.png"));
  await runLibraryScanCli(["--write"], root);
  expect(
    parseLocalPublicationDocument(
      JSON.parse(
        await readFile(
          resolve(publicationDirectory, "publication.json"),
          "utf8",
        ),
      ) as unknown,
      "publication.json",
    ).assets.pages,
  ).toEqual(["001.png", "002.png"]);
});

test("library blacklist CLI returns the stable mutation response without scanning", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-library-cli-"));
  temporaryDirectories.push(root);

  expect(
    await runLibraryBlacklistCli(
      ["--library", "packs/library", "--publication-id", "nhentai-123"],
      root,
    ),
  ).toEqual({
    added: true,
    blacklistedCount: 1,
    publicationId: "nhentai-123",
  });
  expect(
    await runLibraryBlacklistCli(
      ["--library", "packs/library", "--publication-id", "nhentai-123"],
      root,
    ),
  ).toEqual({
    added: false,
    blacklistedCount: 1,
    publicationId: "nhentai-123",
  });
  expect(
    await runLibraryBlacklistCli(
      ["--library", "packs/library", "--list"],
      root,
    ),
  ).toEqual({publicationIds: ["nhentai-123"]});
});
