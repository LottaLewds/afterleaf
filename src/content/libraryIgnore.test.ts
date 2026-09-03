import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {discoverLocalMedia} from "~/content/localMediaDiscovery";
import {
  createIgnoreDirectoryCache,
  isAbsolutePathIgnoredByRoot,
  LIBRARY_IGNORE_FILE_NAME,
  LibraryIgnoreFilter,
  parseLibraryIgnoreContent,
} from "~/content/libraryIgnore";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const createImage = async (path: string) => {
  await mkdir(resolve(path, ".."), {recursive: true});
  await sharp({create: {width: 32, height: 48, channels: 3, background: "#404040"}})
    .png()
    .toFile(path);
};

describe("library ignore patterns", () => {
  test("parses comments, negation, and directory-only markers", () => {
    const patterns = parseLibraryIgnoreContent("# comment\n\nBook One\n!Book One/keep.cbz\nunsorted/\n");
    expect(patterns.map((pattern) => ({dirOnly: pattern.dirOnly, negated: pattern.negated}))).toEqual([
      {dirOnly: false, negated: false},
      {dirOnly: false, negated: true},
      {dirOnly: true, negated: false},
    ]);
  });

  test("matches basenames at any depth and supports negation", () => {
    const filter = new LibraryIgnoreFilter("/root");
    filter.addScope("", parseLibraryIgnoreContent("*.cbz\n!keep.cbz\n"));
    expect(filter.isIgnored("Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("author/Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("author/keep.cbz", false)).toBe(false);
    expect(filter.isIgnored("author/Book", true)).toBe(false);
  });

  test("directory-only patterns ignore contents but not same-named files", () => {
    const filter = new LibraryIgnoreFilter("/root");
    filter.addScope("", parseLibraryIgnoreContent("unsorted/\n"));
    expect(filter.isIgnored("unsorted", true)).toBe(true);
    expect(filter.isIgnored("unsorted", false)).toBe(false);
    expect(filter.isIgnored("unsorted/Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("other/unsorted/nested.jpg", false)).toBe(true);
  });

  test("anchored patterns match relative paths from the ignore file", () => {
    const filter = new LibraryIgnoreFilter("/root");
    filter.addScope("", parseLibraryIgnoreContent("/top-only.cbz\nsub/*.cbz\n"));
    expect(filter.isIgnored("top-only.cbz", false)).toBe(true);
    expect(filter.isIgnored("nested/top-only.cbz", false)).toBe(false);
    expect(filter.isIgnored("sub/Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("sub/nested/Book.cbz", false)).toBe(true);
  });

  test("nested ignore files apply to their subtree", () => {
    const filter = new LibraryIgnoreFilter("/root");
    filter.addScope("", parseLibraryIgnoreContent("*.tmp\n"));
    filter.addScope("author", parseLibraryIgnoreContent("drafts/\n"));
    expect(filter.isIgnored("author/drafts/Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("other/drafts/Book.cbz", false)).toBe(false);
    expect(filter.isIgnored("author/notes.tmp", false)).toBe(true);
  });

  test("marker directories prune their entire subtree", () => {
    const filter = new LibraryIgnoreFilter("/root");
    filter.addMarker("unsorted");
    expect(filter.isIgnored("unsorted", true)).toBe(true);
    expect(filter.isIgnored("unsorted/Book.cbz", false)).toBe(true);
    expect(filter.isIgnored("other/Book.cbz", false)).toBe(false);
  });
});

describe("library discovery ignore", () => {
  test("discoverLocalMedia skips marker directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-ignore-marker-"));
    temporaryDirectories.push(root);
    await mkdir(resolve(root, "Skipped Archive"), {recursive: true});
    await Promise.all([
      createImage(resolve(root, "Kept Book/001.png")),
      createImage(resolve(root, "Skipped Book/001.png")),
      writeFile(resolve(root, "kept.cbz"), "archive"),
      writeFile(resolve(root, "Skipped Archive/book.cbz"), "archive"),
    ]);
    await writeFile(resolve(root, "Skipped Book", LIBRARY_IGNORE_FILE_NAME), "");
    await writeFile(resolve(root, "Skipped Archive", LIBRARY_IGNORE_FILE_NAME), "*\n");

    const discovery = await discoverLocalMedia(root);
    const rel = (path: string) =>
      path
        .slice(root.length + 1)
        .split("/")
        .join("/");
    expect(discovery.publicationDirectories.map(rel)).toEqual(["Kept Book"]);
    expect(discovery.archives.map(rel)).toEqual(["kept.cbz"]);
  });

  test("discoverLocalMedia respects root pattern files with negation", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-ignore-patterns-"));
    temporaryDirectories.push(root);
    await Promise.all([
      createImage(resolve(root, "Kept/001.png")),
      createImage(resolve(root, "Skipped/001.png")),
      writeFile(resolve(root, "keep.cbz"), "archive"),
      writeFile(resolve(root, "skip.cbz"), "archive"),
    ]);
    await writeFile(root + `/${LIBRARY_IGNORE_FILE_NAME}`, "Skipped/\nskip.cbz\n!keep.cbz\n");

    const discovery = await discoverLocalMedia(root);
    const rel = (path: string) =>
      path
        .slice(root.length + 1)
        .split("/")
        .join("/");
    expect(discovery.publicationDirectories.map(rel)).toEqual(["Kept"]);
    expect(discovery.archives.map(rel)).toEqual(["keep.cbz"]);
  });

  test("empty root marker ignores everything", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-ignore-root-"));
    temporaryDirectories.push(root);
    await createImage(resolve(root, "Book/001.png"));
    await writeFile(resolve(root, LIBRARY_IGNORE_FILE_NAME), "# just a marker\n");
    const discovery = await discoverLocalMedia(root);
    expect(discovery.publicationDirectories).toEqual([]);
    expect(discovery.archives).toEqual([]);
  });

  test("isAbsolutePathIgnoredByRoot checks ancestor markers and patterns", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-ignore-abs-"));
    temporaryDirectories.push(root);
    await mkdir(resolve(root, "a/b"), {recursive: true});
    await writeFile(resolve(root, "a", LIBRARY_IGNORE_FILE_NAME), "");
    await writeFile(resolve(root, LIBRARY_IGNORE_FILE_NAME), "skip.cbz\n");
    const cache = createIgnoreDirectoryCache();
    expect(await isAbsolutePathIgnoredByRoot(root, resolve(root, "a/b/book.cbz"), false, cache)).toBe(true);
    expect(await isAbsolutePathIgnoredByRoot(root, resolve(root, "skip.cbz"), false, cache)).toBe(true);
    expect(await isAbsolutePathIgnoredByRoot(root, resolve(root, "keep.cbz"), false, cache)).toBe(false);
    expect(await isAbsolutePathIgnoredByRoot(root, resolve(root, "other"), true, cache)).toBe(false);
  });
});
