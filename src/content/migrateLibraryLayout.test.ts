import {afterEach, describe, expect, test} from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  detectLegacyLayoutArtifacts,
  detectUnmigratedLegacyLayout,
  migrateLibraryLayout,
  MIGRATION_MARKER_FILE_NAME,
  planLibraryLayoutMigration,
  readLibraryLayoutMigrationMarker,
} from "~/content/migrateLibraryLayout";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {recursive: true, force: true})),
  );
});

/** Builds a miniature but faithful legacy layout inside a temp directory. */
const createLegacyLayout = async (root: string) => {
  const write = async (relativePath: string, content = relativePath) => {
    const filePath = resolve(root, relativePath);
    await mkdir(resolve(filePath, ".."), {recursive: true});
    await writeFile(filePath, content);
  };
  await Promise.all([
    write("content/books/comics/My Comic.cbz"),
    write("content/books/manga/My Manga.cbz"),
    write("content/channels/music/video.mp4"),
    write("content/posters/frame.png"),
    write("content/art-frames/piece.png"),
    write("content/models/chair.glb"),
    write("content/roms/nes/game.nes"),
    write("content/world-save.json", '{"revision":7}'),
    write(
      "content/world-state-backups/world-state.2026-08-01T00-00-00.000Z.json",
      "{}",
    ),
    write(
      "afterleaf.library.json",
      JSON.stringify({comicPaths: [], mangaPaths: [], romPaths: {}}),
    ),
    write("content-sources/catalog/Some Book/publication.json", "{}"),
    write("content-packs/library/index.json", "{}"),
    write("content-packs/library/assets/x.webp", "x"),
    write("content-sources/library-roots.json", "{}"),
    write("content-sources/scan-failures.log", ""),
    write("content-sources/nhentai/nhentai-1/pages/001.jpg", "jpg"),
    write("content-sources/mangadex/mangadex-a/page.webp", "webp"),
    write("content-sources/source-garbage/junk.bin", "junk"),
    write("content-packs/demo-v1/catalog.json", "{}"),
  ]);
};

describe("library layout migration", () => {
  test("dry run reports the full plan without touching the filesystem", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-plan-"));
    temporaryDirectories.push(root);
    await createLegacyLayout(root);

    const result = await migrateLibraryLayout(root);

    const destinations = result.moves.map(({to}) => to);
    for (const expected of [
      "afterleaf-data/content/comics",
      "afterleaf-data/content/manga",
      "afterleaf-data/content/tv",
      "afterleaf-data/content/posters",
      "afterleaf-data/content/art-frames",
      "afterleaf-data/content/models",
      "afterleaf-data/content/roms",
      "afterleaf-data/game/world-save.json",
      "afterleaf-data/game/world-save-backups",
      "afterleaf-data/afterleaf.library.json",
      "afterleaf-data/game/.cache/prepared",
      "afterleaf-data/game/.cache/library",
      "afterleaf-data/game/.cache/library-roots.json",
      "afterleaf-data/game/.cache/scan-failures.log",
      "afterleaf-data/providers/nhentai",
      "afterleaf-data/providers/mangadex",
      "afterleaf-data/providers/source-garbage",
    ]) {
      expect(destinations).toContain(resolve(root, ...expected.split("/")));
    }
    // Nothing moved and nothing created.
    await expect(readdir(resolve(root, "afterleaf-data"))).rejects.toThrow();
    expect(result.conflicts).toEqual([]);
    expect(result.notes.join("\n")).toContain("demo-v1");
  });

  test("--write moves every legacy folder into place with contents intact", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-write-"));
    temporaryDirectories.push(root);
    await createLegacyLayout(root);

    const result = await migrateLibraryLayout(root, {write: true});

    expect(result.performedMoves).toHaveLength(result.moves.length);
    expect(result.conflicts).toEqual([]);
    // User media landed under content/ with direction folders preserved.
    expect(
      await readFile(
        resolve(root, "afterleaf-data/content/comics/My Comic.cbz"),
      ),
    ).toBeDefined();
    expect(
      await readFile(
        resolve(root, "afterleaf-data/content/manga/My Manga.cbz"),
      ),
    ).toBeDefined();
    expect(
      await readFile(
        resolve(root, "afterleaf-data/content/tv/music/video.mp4"),
      ),
    ).toBeDefined();
    // Durable state sits at game/ level.
    expect(
      await readFile(
        resolve(root, "afterleaf-data/game/world-save.json"),
        "utf8",
      ),
    ).toBe('{"revision":7}');
    expect(
      await readFile(
        resolve(
          root,
          "afterleaf-data/game/world-save-backups/world-state.2026-08-01T00-00-00.000Z.json",
        ),
      ),
    ).toBeDefined();
    // Regenerable caches live in game/.cache/.
    expect(
      await readFile(
        resolve(
          root,
          "afterleaf-data/game/.cache/prepared/Some Book/publication.json",
        ),
      ),
    ).toBeDefined();
    expect(
      await readFile(
        resolve(root, "afterleaf-data/game/.cache/library/index.json"),
      ),
    ).toBeDefined();
    // Provider caches were relocated wholesale.
    expect(
      await readFile(
        resolve(
          root,
          "afterleaf-data/providers/nhentai/nhentai-1/pages/001.jpg",
        ),
      ),
    ).toBeDefined();
    expect(
      await readFile(
        resolve(root, "afterleaf-data/providers/mangadex/mangadex-a/page.webp"),
      ),
    ).toBeDefined();
    // Config was relocated.
    expect(
      await readFile(
        resolve(root, "afterleaf-data/afterleaf.library.json"),
        "utf8",
      ),
    ).toContain("comicPaths");
    // README.txt explains the layout; legacy sources are gone.
    expect(
      await readFile(resolve(root, "afterleaf-data/README.txt"), "utf8"),
    ).toContain("Afterleaf data folder");
    await expect(
      readFile(resolve(root, "afterleaf.library.json")),
    ).rejects.toThrow();
    await expect(readdir(resolve(root, "content-sources"))).rejects.toThrow();
    await expect(
      readdir(resolve(root, "content-packs/library")),
    ).rejects.toThrow();
    // The unused demo pack is reported but never touched by migration.
    expect(
      await readFile(resolve(root, "content-packs/demo-v1/catalog.json")),
    ).toBeDefined();
  });

  test("a conflicting destination aborts before anything is moved", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-blocked-"));
    temporaryDirectories.push(root);
    await createLegacyLayout(root);
    await mkdir(resolve(root, "afterleaf-data/game"), {recursive: true});
    await writeFile(
      resolve(root, "afterleaf-data/game/world-save.json"),
      '{"revision":999}',
    );

    const plan = await planLibraryLayoutMigration(root);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.reason).toContain("world-save.json");

    await expect(migrateLibraryLayout(root, {write: true})).rejects.toThrow(
      /blocking conflict/,
    );
    // The pre-existing destination was never overwritten and no legacy
    // folder was removed.
    expect(
      await readFile(
        resolve(root, "afterleaf-data/game/world-save.json"),
        "utf8",
      ),
    ).toBe('{"revision":999}');
    expect(
      await readFile(resolve(root, "content/world-save.json"), "utf8"),
    ).toBe('{"revision":7}');
    expect(
      await readFile(resolve(root, "content/books/comics/My Comic.cbz")),
    ).toBeDefined();
  });

  test("an empty destination directory does not block the move", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-empty-"));
    temporaryDirectories.push(root);
    await createLegacyLayout(root);
    await mkdir(resolve(root, "afterleaf-data/content/comics"), {
      recursive: true,
    });

    const result = await migrateLibraryLayout(root, {write: true});

    expect(result.conflicts).toEqual([]);
    expect(
      await readFile(
        resolve(root, "afterleaf-data/content/comics/My Comic.cbz"),
      ),
    ).toBeDefined();
  });

  test("rerunning after a successful migration finds nothing to do", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-rerun-"));
    temporaryDirectories.push(root);
    await createLegacyLayout(root);
    await migrateLibraryLayout(root, {write: true});

    const second = await migrateLibraryLayout(root, {write: true});

    expect(second.moves).toEqual([]);
    expect(second.performedMoves).toEqual([]);
    expect(
      await readFile(
        resolve(root, "afterleaf-data/game/world-save.json"),
        "utf8",
      ),
    ).toBe('{"revision":7}');
  });

  test("a completed migration writes a marker that silences the legacy-layout warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-marker-"));
    temporaryDirectories.push(root);

    // A fresh install: nothing to warn about.
    expect(await detectLegacyLayoutArtifacts(root)).toEqual([]);
    await mkdir(resolve(root, "afterleaf-data"), {recursive: true});
    expect(await readLibraryLayoutMigrationMarker(root)).toBeUndefined();

    // A pre-migration install: artifacts present, no marker yet.
    await createLegacyLayout(root);
    const artifacts = await detectLegacyLayoutArtifacts(root);
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts).toContain(resolve(root, "content", "world-save.json"));

    await migrateLibraryLayout(root, {write: true});

    const marker = await readLibraryLayoutMigrationMarker(root);
    expect(marker?.schemaVersion).toBe(1);
    expect(marker?.movedCount).toBeGreaterThan(0);
    expect(marker?.migratedAt).toBeTruthy();
    expect(
      await readFile(
        resolve(root, "afterleaf-data", MIGRATION_MARKER_FILE_NAME),
        "utf8",
      ),
    ).toContain('"schemaVersion": 1');
    // After the move, no meaningful artifacts remain (only dotfiles such
    // as .gitkeep would be ignored).
    expect(await detectLegacyLayoutArtifacts(root)).toEqual([]);
  });

  test("gitkeep-only legacy folders do not trigger detection", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-empty-"));
    temporaryDirectories.push(root);
    await mkdir(resolve(root, "content/books/comics"), {recursive: true});
    await writeFile(resolve(root, "content/books/comics/.gitkeep"), "");

    expect(await detectLegacyLayoutArtifacts(root)).toEqual([]);
  });

  test("the synchronous boot check blocks only before a completed migration", async () => {
    const root = await mkdtemp(join(tmpdir(), "afterleaf-migrate-boot-"));
    temporaryDirectories.push(root);

    // Fresh install: no legacy data, no marker — the server may start.
    expect(detectUnmigratedLegacyLayout(root)).toEqual([]);

    await createLegacyLayout(root);
    expect(detectUnmigratedLegacyLayout(root).length).toBeGreaterThan(0);

    await migrateLibraryLayout(root, {write: true});
    // The marker records the completed migration; leftovers such as the
    // unused demo pack no longer block startup.
    expect(detectUnmigratedLegacyLayout(root)).toEqual([]);
  });
});
