import {spawn} from "node:child_process";
import {readdirSync, rmSync, type Dirent} from "node:fs";
import {basename, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const SNAPSHOT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const GARBAGE_DIRECTORIES = new Set([
  "asset-garbage",
  "snapshot-garbage",
  "source-garbage",
]);

const garbageCollectorScript = fileURLToPath(
  new URL("../../../scripts/library-prune-snapshots.ts", import.meta.url),
);

export const pruneSnapshotGarbage = (garbageDirectory: string) => {
  const resolvedDirectory = resolve(garbageDirectory);
  const garbageKind = basename(resolvedDirectory);
  if (!GARBAGE_DIRECTORIES.has(garbageKind))
    throw new Error(
      "Snapshot garbage collection requires its dedicated directory",
    );

  let entries: Dirent<string>[];
  try {
    entries = readdirSync(resolvedDirectory, {withFileTypes: true});
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }

  for (const entry of entries) {
    if (
      garbageKind !== "source-garbage" &&
      (!entry.isDirectory() || !SNAPSHOT_ID_PATTERN.test(entry.name))
    )
      continue;
    rmSync(resolve(resolvedDirectory, entry.name), {
      force: true,
      recursive: true,
    });
  }
};

export const scheduleSnapshotGarbageCollection = (garbageDirectory: string) => {
  try {
    const child = spawn(
      process.execPath,
      [garbageCollectorScript, garbageDirectory],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.once("error", () => {});
    child.unref();
  } catch {}
};
