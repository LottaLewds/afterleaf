import {afterEach, describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
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
      mediaPaths: [],
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
        mediaPaths: ["external/books"],
        posterPaths: ["external/posters"],
        tvChannelPaths: ["external/tv"],
      }),
    );

    const expected = {
      artFramePaths: [resolve(root, "external/art")],
      mediaPaths: [resolve(root, "external/books")],
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
