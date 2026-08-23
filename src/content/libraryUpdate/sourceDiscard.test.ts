import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdir, mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {discardManagedPublicationSources} from "~/content/libraryUpdate/sourceDiscard";
import type {LocalPublicationDocument} from "~/content/schema";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const archiveDocument = (
  id: string,
  sourcePath: string,
): LocalPublicationDocument => ({
  assets: {front: "front.webp", pages: []},
  id,
  language: "english",
  pageCount: 20,
  schemaVersion: 1,
  source: {
    metadataHash: "archive-hash",
    provider: "afterleaf-cbz",
    remoteId: "book.cbz",
    retrievedAt: "2026-08-05T12:00:00.000Z",
    sourceUrl: pathToFileURL(sourcePath).href,
  },
  tags: ["english"],
  title: "Book",
});

describe("managed publication discard", () => {
  test("removes prepared content and its managed source archive", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-discard-"));
    temporaryDirectories.push(root);
    const archivePath = resolve(root, "afterleaf-data/content/comics/book.cbz");
    const publicationDirectory = resolve(
      root,
      "afterleaf-data/game/.cache/prepared/book",
    );
    await Promise.all([
      mkdir(resolve(archivePath, ".."), {recursive: true}),
      mkdir(publicationDirectory, {recursive: true}),
    ]);
    await Promise.all([
      writeFile(archivePath, "archive"),
      writeFile(
        resolve(publicationDirectory, "publication.json"),
        JSON.stringify(archiveDocument("book", archivePath)),
      ),
    ]);

    await expect(
      discardManagedPublicationSources(root, "book", () => {}),
    ).resolves.toEqual({managedSourceCount: 2, publicationId: "book"});
    await expect(access(archivePath)).rejects.toThrow();
    await expect(access(publicationDirectory)).rejects.toThrow();
    expect(
      await readdir(resolve(root, "afterleaf-data/providers/source-garbage")),
    ).toHaveLength(2);
  });

  test("removes only the app cache for an externally referenced archive", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-discard-"));
    const externalRoot = await mkdtemp(
      join(tmpdir(), "afterleaf-external-media-"),
    );
    temporaryDirectories.push(root, externalRoot);
    const archivePath = resolve(externalRoot, "book.cbz");
    const publicationDirectory = resolve(
      root,
      "afterleaf-data/game/.cache/prepared/book",
    );
    await mkdir(publicationDirectory, {recursive: true});
    await Promise.all([
      writeFile(archivePath, "archive"),
      writeFile(
        resolve(publicationDirectory, "publication.json"),
        JSON.stringify(archiveDocument("book", archivePath)),
      ),
      writeFile(
        resolve(root, "afterleaf.library.json"),
        JSON.stringify({mediaPaths: [archivePath]}),
      ),
    ]);

    await expect(
      discardManagedPublicationSources(root, "book", () => {}),
    ).resolves.toEqual({managedSourceCount: 1, publicationId: "book"});
    await access(archivePath);
    await expect(access(publicationDirectory)).rejects.toThrow();
  });

  test("does not touch an external image-folder publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-discard-"));
    const externalRoot = await mkdtemp(
      join(tmpdir(), "afterleaf-external-media-"),
    );
    temporaryDirectories.push(root, externalRoot);
    await writeFile(
      resolve(externalRoot, "publication.json"),
      JSON.stringify(
        archiveDocument("book", resolve(externalRoot, "book.cbz")),
      ),
    );

    await expect(
      discardManagedPublicationSources(root, "book", () => {}),
    ).resolves.toEqual({managedSourceCount: 0, publicationId: "book"});
    await access(resolve(externalRoot, "publication.json"));
  });

  test("deletes a configured image-folder publication stored inside Afterleaf", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-discard-"));
    temporaryDirectories.push(root);
    const publicationDirectory = resolve(root, "local-books/book");
    await mkdir(publicationDirectory, {recursive: true});
    await Promise.all([
      writeFile(
        resolve(publicationDirectory, "publication.json"),
        JSON.stringify(
          archiveDocument("book", resolve(publicationDirectory, "book.cbz")),
        ),
      ),
      writeFile(
        resolve(root, "afterleaf.library.json"),
        JSON.stringify({mediaPaths: ["local-books"]}),
      ),
    ]);

    await expect(
      discardManagedPublicationSources(root, "book", () => {}),
    ).resolves.toEqual({managedSourceCount: 1, publicationId: "book"});
    await expect(access(publicationDirectory)).rejects.toThrow();
  });
});
