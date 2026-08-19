import {describe, expect, test} from "bun:test";
import {mergeWorldSave} from "./worldSaveMerge";

describe("mergeWorldSave", () => {
  test("adds keys missing in current", () => {
    const backup = {newKey: "value"};
    const current = {};
    const {summary} = mergeWorldSave(backup, current, new Set(["newKey"]));
    expect(current.newKey).toBe("value");
    expect(summary.addedKeys).toContain("newKey");
  });

  test("replaces differing primitives", () => {
    const backup = {version: 2};
    const current = {version: 1};
    const {summary} = mergeWorldSave(backup, current, new Set(["version"]));
    expect(current.version).toBe(2);
    expect(summary.replacedKeys).toContain("version");
  });

  test("shallow-merges objects with backup winning conflicts", () => {
    const backup = {settings: {a: 1, b: 2}};
    const current = {settings: {b: 0, c: 3}};
    const {summary} = mergeWorldSave(backup, current, new Set(["settings"]));
    expect(current.settings).toEqual({a: 1, b: 2, c: 3});
    expect(summary.shallowMergedKeys).toContain("settings");
  });

  test("leaves identical values unchanged", () => {
    const backup = {same: {x: 1}};
    const current = {same: {x: 1}};
    const {summary} = mergeWorldSave(backup, current, new Set(["same"]));
    expect(summary.unchangedKeys).toContain("same");
  });

  test("leaves keys only in current untouched", () => {
    const backup = {};
    const current = {onlyHere: true};
    const {summary} = mergeWorldSave(backup, current, new Set(["onlyHere"]));
    expect(current.onlyHere).toBe(true);
    expect(summary.onlyInCurrentKeys).toContain("onlyHere");
  });

  test("skips deselected keys", () => {
    const backup = {ignored: 1};
    const current = {ignored: 2};
    const {summary} = mergeWorldSave(backup, current, new Set());
    expect(current.ignored).toBe(2);
    expect(summary.skippedKeys).toContain("ignored");
  });

  test("merges shelved book placements by publicationId", () => {
    const backup = {
      books: [
        {publicationId: "a", state: "shelved", pose: {x: 1}, shelf: "s1"},
        {publicationId: "b", state: "stored"},
      ],
    };
    const current = {
      books: [
        {publicationId: "a", state: "stored"},
        {publicationId: "c", state: "shelved"},
      ],
    };
    const {summary} = mergeWorldSave(backup, current, new Set(["books"]));
    const mergedBook = (
      current.books as Array<{
        publicationId?: string;
        state?: string;
        pose?: unknown;
        shelf?: unknown;
      }>
    ).find((book) => book.publicationId === "a");
    expect(mergedBook?.state).toBe("shelved");
    expect(mergedBook?.pose).toEqual({x: 1});
    expect(mergedBook?.shelf).toBe("s1");
    expect(summary.books.merged).toBe(1);
    expect(summary.books.shelvedInBackup).toBe(1);
  });

  test("reports missing shelved publications", () => {
    const backup = {
      books: [{publicationId: "missing", state: "shelved", pose: {x: 1}}],
    };
    const current = {books: []};
    const {summary} = mergeWorldSave(backup, current, new Set(["books"]));
    expect(summary.books.missingFromNew).toEqual(["missing"]);
  });

  test("counts duplicate shelved entries", () => {
    const backup = {
      books: [
        {publicationId: "dup", state: "shelved"},
        {publicationId: "dup", state: "shelved"},
      ],
    };
    const current = {books: [{publicationId: "dup", state: "stored"}]};
    const {summary} = mergeWorldSave(backup, current, new Set(["books"]));
    expect(summary.books.duplicateShelved).toBe(1);
  });

  test("union mode adds missing books from backup", () => {
    const backup = {
      books: [
        {publicationId: "a", state: "shelved", pose: {x: 1}},
        {publicationId: "b", state: "shelved"},
      ],
    };
    const current = {books: [{publicationId: "c", state: "shelved"}]};
    const {data, summary} = mergeWorldSave(
      backup,
      current,
      new Set(["books"]),
      "union",
    );
    expect((data.books as Array<{publicationId?: string}>).length).toBe(3);
    expect(summary.books.merged).toBe(2);
    expect(summary.books.missingFromNew).toEqual([]);
  });
});
