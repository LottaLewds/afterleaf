import {describe, expect, test} from "bun:test";
import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  readManifest,
  summarizeLibraryIndex,
  summarizeWorldSave,
} from "./manifest";

describe("manifest helpers", () => {
  test("summarizes library index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "afterleaf-port-test-"));
    await writeFile(
      join(dir, "index.json"),
      JSON.stringify({
        schemaVersion: 3,
        snapshots: [{publications: [{id: "a"}, {id: "b"}]}],
      }),
    );
    const summary = await summarizeLibraryIndex(dir);
    expect(summary.schemaVersion).toBe(3);
    expect(summary.snapshotCount).toBe(1);
    expect(summary.publicationCount).toBe(2);
  });

  test("summarizes world save", async () => {
    const dir = await mkdtemp(join(tmpdir(), "afterleaf-port-test-"));
    const path = join(dir, "world-save.json");
    await writeFile(
      path,
      JSON.stringify({schemaVersion: 2, books: [], catalog: {}}),
    );
    const summary = await summarizeWorldSave(path);
    expect(summary.schemaVersion).toBe(2);
    expect(summary.topLevelKeys).toEqual(["books", "catalog", "schemaVersion"]);
  });

  test("reads manifest round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "afterleaf-port-test-"));
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      sections: {library: {included: true, fileCount: 5, byteSize: 1024}},
    };
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
    const read = await readManifest(dir);
    expect(read.version).toBe(1);
    expect(read.sections.library?.byteSize).toBe(1024);
  });
});
