import {afterEach, describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {zipSync} from "fflate";
import sharp from "sharp";

import {
  readAfterleafLibraryConfig,
  readAfterleafLibraryConfigSync,
  unavailableLibraryPaths,
} from "~/content/libraryConfig";
import {
  importLocalMedia,
  UnavailableLibraryMediaPathsError,
} from "~/content/libraryMedia";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const createRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-library-config-"));
  temporaryDirectories.push(root);
  return root;
};

describe("Afterleaf library config", () => {
  test("defaults every path collection to an empty array", async () => {
    const root = await createRoot();

    expect(await readAfterleafLibraryConfig(root)).toEqual({
      artFramePaths: [],
      comicPaths: [],
      mangaPaths: [],
      posterPaths: [],
      tvChannelPaths: [],
    });
  });

  test("resolves every configured content path from the Afterleaf directory", async () => {
    const root = await createRoot();
    await writeFile(
      resolve(root, "afterleaf.library.json"),
      JSON.stringify({
        artFramePaths: ["external/art"],
        comicPaths: ["external/comics"],
        mangaPaths: ["external/manga"],
        posterPaths: ["external/posters"],
        tvChannelPaths: ["external/tv"],
      }),
    );

    const expected = {
      artFramePaths: [resolve(root, "external/art")],
      comicPaths: [resolve(root, "external/comics")],
      mangaPaths: [resolve(root, "external/manga")],
      posterPaths: [resolve(root, "external/posters")],
      tvChannelPaths: [resolve(root, "external/tv")],
    };
    expect(await readAfterleafLibraryConfig(root)).toEqual(expected);
    expect(readAfterleafLibraryConfigSync(root)).toEqual(expected);
  });

  test("rejects unknown properties and non-array path values", async () => {
    const root = await createRoot();
    const configPath = resolve(root, "afterleaf.library.json");
    await writeFile(configPath, JSON.stringify({unknownPaths: []}));
    await expect(readAfterleafLibraryConfig(root)).rejects.toThrow(
      "unknown property",
    );

    await writeFile(configPath, JSON.stringify({posterPaths: "posters"}));
    await expect(readAfterleafLibraryConfig(root)).rejects.toThrow(
      "posterPaths must be an array of paths",
    );
  });

  test("rejects paths configured as both comics and manga", async () => {
    const root = await createRoot();
    await writeFile(
      resolve(root, "afterleaf.library.json"),
      JSON.stringify({
        comicPaths: ["external/books"],
        mangaPaths: ["external/other/../books"],
      }),
    );

    await expect(readAfterleafLibraryConfig(root)).rejects.toThrow(
      "cannot be configured as both a comic and manga path",
    );
  });

  test("rejects nested book roots with conflicting reading directions", async () => {
    const root = await createRoot();
    await writeFile(
      resolve(root, "afterleaf.library.json"),
      JSON.stringify({
        comicPaths: ["external"],
        mangaPaths: ["external/manga"],
      }),
    );

    await expect(
      importLocalMedia(root, resolve(root, "content-sources/catalog")),
    ).rejects.toThrow("conflicting reading directions");
  });

  test("applies the configured manga direction to archive books", async () => {
    const root = await createRoot();
    const mangaPath = resolve(root, "manga");
    await writeFile(
      resolve(root, "afterleaf.library.json"),
      JSON.stringify({mangaPaths: ["manga"]}),
    );
    await mkdir(mangaPath, {recursive: true});
    const page = await sharp({
      create: {background: "#446688", channels: 3, height: 96, width: 64},
    })
      .png()
      .toBuffer();
    await writeFile(resolve(mangaPath, "Book.cbz"), zipSync({"001.png": page}));

    await importLocalMedia(root, resolve(root, "content-sources/catalog"));

    const document = JSON.parse(
      await readFile(
        resolve(root, "content-sources/catalog/Book/publication.json"),
        "utf8",
      ),
    ) as {physical?: {readingDirection?: string}};
    expect(document.physical?.readingDirection).toBe("rtl");
  });

  test("locks a scan while a configured book path is unavailable", async () => {
    const root = await createRoot();
    const bookPath = resolve(root, "mounted-later");
    await writeFile(
      resolve(root, "afterleaf.library.json"),
      JSON.stringify({mediaPaths: [bookPath]}),
    );

    expect(await unavailableLibraryPaths([bookPath])).toEqual([bookPath]);
    await expect(
      importLocalMedia(root, resolve(root, "content-sources/catalog")),
    ).rejects.toBeInstanceOf(UnavailableLibraryMediaPathsError);

    await mkdir(bookPath);
    expect(await unavailableLibraryPaths([bookPath])).toEqual([bookPath]);
    await sharp({
      create: {background: "#446688", channels: 3, height: 96, width: 64},
    })
      .png()
      .toFile(resolve(bookPath, "001.png"));
    expect(await unavailableLibraryPaths([bookPath])).toEqual([]);
    await expect(
      importLocalMedia(root, resolve(root, "content-sources/catalog")),
    ).resolves.toMatchObject({mediaPaths: expect.arrayContaining([bookPath])});
  });
});
