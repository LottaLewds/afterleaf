import {pruneSnapshotGarbage} from "~/content/libraryUpdate/snapshotGarbageCollector";

const [garbageDirectory, ...unexpectedArguments] = process.argv.slice(2);
if (!garbageDirectory || unexpectedArguments.length > 0) {
  console.error("Usage: library-prune-snapshots <snapshot-garbage-directory>");
  process.exit(1);
}

try {
  pruneSnapshotGarbage(garbageDirectory);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
