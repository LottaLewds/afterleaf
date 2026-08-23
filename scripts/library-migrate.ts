import {migrateLibraryLayout} from "~/content/migrateLibraryLayout";

const arguments_ = process.argv.slice(2);
const write = arguments_.includes("--write");
const help = arguments_.includes("--help");

if (help) {
  console.log(`Migrate the legacy three-folder layout into the unified Afterleaf data folder.

Usage:
  bun run library:migrate [--write]

Without --write this prints the migration plan and changes nothing.
With --write every legacy folder is moved into afterleaf-data/:

  content/books/comics      -> afterleaf-data/content/comics
  content/books/manga       -> afterleaf-data/content/manga
  content/channels          -> afterleaf-data/content/tv
  content-sources/catalog   -> afterleaf-data/game/.cache/prepared
  content-packs/library     -> afterleaf-data/game/.cache/library
  content-sources/<provider> -> afterleaf-data/providers/<provider>
  world save + backups      -> afterleaf-data/game/
  afterleaf.library.json    -> afterleaf-data/afterleaf.library.json

The migration refuses to overwrite existing destinations and aborts
before touching anything if a conflict is found. The unused demo pack at
content-packs/demo-v1 is left in place; it is safe to delete.`);
} else {
  try {
    const result = await migrateLibraryLayout(process.cwd(), {write});
    if (result.moves.length === 0) {
      console.log("Nothing to migrate: no legacy-layout folders were found.");
    } else {
      for (const move of result.moves)
        console.log(
          `${write && result.performedMoves.includes(move) ? "moved" : "would move"}: ${move.from}\n       -> ${move.to}`,
        );
    }
    for (const note of result.notes) console.log(`note: ${note}`);
    if (result.conflicts.length > 0) {
      for (const conflict of result.conflicts) console.error(conflict.reason);
      console.error("Resolve the conflicts above and rerun.");
      process.exitCode = 1;
    } else if (write && result.moves.length > 0) {
      console.log(`Migration complete. Data root: ${result.dataRoot}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
