import {afterEach, expect, test} from "bun:test";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {runLibrarySourceMigrations, type LibrarySourceMigration} from "~/content/librarySourceMigrations";
import type {LocalPublicationDocument} from "~/content/schema";
import {parseLocalPublicationDocument} from "~/content/validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {force: true, recursive: true})));
});

const createPublication = async (root: string) => {
  const publicationDirectory = resolve(root, "provider", "book");
  await mkdir(publicationDirectory, {recursive: true});
  const document: LocalPublicationDocument = {
    schemaVersion: 1,
    assets: {pages: ["page.webp"]},
    id: "book",
    language: "english",
    tags: ["manga"],
    title: "Original title",
  };
  const manifestPath = resolve(publicationDirectory, "publication.json");
  await writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
  return manifestPath;
};

const readPublication = async (manifestPath: string) =>
  parseLocalPublicationDocument(JSON.parse(await readFile(manifestPath, "utf8")) as unknown, manifestPath);

test("runs registered migrations in order and preserves earlier successes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-migrations-"));
  temporaryDirectories.push(root);
  const manifestPath = await createPublication(root);
  let failSecondMigration = true;
  const titleMigration: LibrarySourceMigration = {
    applies: ({document}) => document.title !== "Migrated title",
    id: "title-migration",
    label: "title migration",
    migrate: ({document}) => ({...document, title: "Migrated title"}),
  };
  const tagMigration: LibrarySourceMigration = {
    applies: ({document}) => !document.tags.includes("future-migration"),
    id: "tag-migration",
    label: "tag migration",
    migrate: ({document}) => {
      expect(document.title).toBe("Migrated title");
      if (failSecondMigration) throw new Error("temporary failure");
      return {...document, tags: [...document.tags, "future-migration"]};
    },
  };
  const progress: string[] = [];
  const options = {
    migrations: [titleMigration, tagMigration],
    onProgress: (message: string) => progress.push(message),
    sourceDirectory: root,
  };

  const failed = await runLibrarySourceMigrations(options);
  const partiallyMigrated = await readPublication(manifestPath);

  expect(failed).toMatchObject({
    failedCount: 1,
    migratedCount: 1,
    pendingCount: 2,
  });
  expect(failed.diagnostics).toContainEqual({
    message: "Could not run tag migration for provider/book: temporary failure",
    migrationId: "tag-migration",
    sourceId: "provider/book",
  });
  expect(partiallyMigrated.title).toBe("Migrated title");
  expect(partiallyMigrated.tags).toEqual(["manga"]);
  expect(progress.at(-1)).toBe(
    "Updating older cached publications: 2/2 complete (100%); failed tag migration for provider/book, will retry next scan (1 updated, 1 failed)",
  );

  failSecondMigration = false;
  const retried = await runLibrarySourceMigrations(options);
  const migrated = await readPublication(manifestPath);

  expect(retried).toMatchObject({
    failedCount: 0,
    migratedCount: 1,
    pendingCount: 1,
  });
  expect(migrated.title).toBe("Migrated title");
  expect(migrated.tags).toEqual(["manga", "future-migration"]);

  const progressCount = progress.length;
  const current = await runLibrarySourceMigrations(options);
  expect(current).toMatchObject({pendingCount: 0});
  expect(progress).toHaveLength(progressCount);
});

test("rejects identity-changing migration results without touching the manifest", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-migration-id-"));
  temporaryDirectories.push(root);
  const manifestPath = await createPublication(root);
  const original = await readFile(manifestPath, "utf8");

  const report = await runLibrarySourceMigrations({
    migrations: [
      {
        applies: () => true,
        id: "invalid-identity",
        label: "invalid identity migration",
        migrate: ({document}) => ({...document, id: "renamed-book"}),
      },
    ],
    sourceDirectory: root,
  });

  expect(report).toMatchObject({failedCount: 1, migratedCount: 0});
  expect(report.diagnostics[0]?.message).toContain("migrations cannot change publication IDs");
  expect(await readFile(manifestPath, "utf8")).toBe(original);
});
