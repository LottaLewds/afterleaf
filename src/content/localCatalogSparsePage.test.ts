import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "../media/sharpRuntime";
import {
  localCatalogSourceRoots,
  materializeLocalCatalogReaderPage,
} from "~/content/localCatalogSparsePage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const createPng = (color: string) =>
  sharp({
    create: {channels: 3, background: color, height: 96, width: 64},
  })
    .png()
    .toBuffer();

const writeImageFolderPublication = async (rootDirectory: string) => {
  const publicationDirectory = resolve(rootDirectory, "media", "folder-comic");
  await mkdir(resolve(publicationDirectory, "pages"), {recursive: true});
  await Promise.all(
    [1, 2, 3].map(async (page) => {
      await writeFile(
        resolve(publicationDirectory, "pages", `${page}.png`),
        await createPng(page === 1 ? "#102030" : "#305020"),
      );
    }),
  );
  await writeFile(
    resolve(publicationDirectory, "publication.json"),
    JSON.stringify({
      assets: {
        pages: ["pages/1.png", "pages/2.png", "pages/3.png"],
      },
      id: "folder-comic",
      language: "english",
      schemaVersion: 1,
      tags: ["unclassified"],
      title: "Folder Comic",
    }),
  );
  return publicationDirectory;
};

test("local catalog source roots order matches scan-time root indexing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-sparse-roots-"));
  temporaryDirectories.push(root);
  const mediaRoot = resolve(root, "custom-media");
  const roots = await localCatalogSourceRoots({
    additionalCatalogDirectories: [mediaRoot],
    workingDirectory: root,
  });

  expect(roots[4]).toBe(mediaRoot);
});

const mediaRootIndex = async (root: string, mediaRoot: string) => {
  const roots = await localCatalogSourceRoots({
    additionalCatalogDirectories: [mediaRoot],
    workingDirectory: root,
  });
  return roots.indexOf(mediaRoot);
};

test("materializes an interior page from an image-folder publication", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-sparse-page-"));
  temporaryDirectories.push(root);
  await writeImageFolderPublication(root);
  const mediaRoot = resolve(root, "media");
  const index = await mediaRootIndex(root, mediaRoot);

  const page = await materializeLocalCatalogReaderPage(
    {
      id: "folder-comic",
      localSourceId: `@media-${index}/folder-comic`,
      pageCount: 3,
    },
    2,
    {additionalCatalogDirectories: [mediaRoot], workingDirectory: root},
  );

  expect(page.byteLength).toBeGreaterThan(0);
  const metadata = await sharp(page).metadata();
  expect(metadata.format).toBe("webp");
});

test("resolves a primary-root local source id without the @media prefix", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-sparse-primary-"));
  temporaryDirectories.push(root);
  const providersDirectory = resolve(
    root,
    "afterleaf-data",
    "providers",
    "primary-comic",
  );
  await mkdir(providersDirectory, {recursive: true});
  await writeFile(
    resolve(providersDirectory, "page.png"),
    await createPng("#405060"),
  );
  await writeFile(
    resolve(providersDirectory, "publication.json"),
    JSON.stringify({
      assets: {pages: ["page.png"]},
      id: "primary-comic",
      language: "japanese",
      schemaVersion: 1,
      tags: ["unclassified"],
      title: "Primary Comic",
    }),
  );

  const page = await materializeLocalCatalogReaderPage(
    {
      id: "primary-comic",
      localSourceId: "primary-comic",
      pageCount: 1,
    },
    1,
    {workingDirectory: root},
  );

  expect(page.byteLength).toBeGreaterThan(0);
});

test("rejects out-of-range pages and mismatched manifests", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-sparse-invalid-"));
  temporaryDirectories.push(root);
  await writeImageFolderPublication(root);
  const options = {
    additionalCatalogDirectories: [resolve(root, "media")],
    workingDirectory: root,
  };
  const index = await mediaRootIndex(root, resolve(root, "media"));
  const publication = {
    id: "folder-comic",
    localSourceId: `@media-${index}/folder-comic`,
    pageCount: 3,
  };

  expect(
    materializeLocalCatalogReaderPage(publication, 4, options),
  ).rejects.toThrow("does not expose that page");
  expect(
    materializeLocalCatalogReaderPage(
      {...publication, id: "another-comic"},
      1,
      options,
    ),
  ).rejects.toThrow("does not match the active catalog entry");
  expect(
    materializeLocalCatalogReaderPage(
      {...publication, localSourceId: "@media-999/folder-comic"},
      1,
      options,
    ),
  ).rejects.toThrow("invalid local source reference");
  expect(
    materializeLocalCatalogReaderPage(
      {...publication, localSourceId: `@media-${index}/../../escape`},
      1,
      options,
    ),
  ).rejects.toThrow("invalid local source reference");
});
