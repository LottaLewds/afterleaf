import {expect, test} from "bun:test";
import {loadReaderBookmarks, saveReaderBookmark} from "~/reader/bookmarks";

test("reader bookmarks tolerate corrupt storage and persist stable publication IDs", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  values.set("afterleaf-reader-bookmarks-v1", "not-json");
  expect(loadReaderBookmarks(storage)).toEqual({});

  const next = saveReaderBookmark({}, "nhentai-42", 12, storage);
  expect(next).toEqual({"nhentai-42": 12});
  expect(loadReaderBookmarks(storage)).toEqual({"nhentai-42": 12});
});
