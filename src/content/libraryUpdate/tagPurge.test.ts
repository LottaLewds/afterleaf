import {describe, expect, test} from "bun:test";

import {findBlacklistedTagMatches} from "~/content/libraryUpdate/tagPurge";

describe("blacklisted tag purge selection", () => {
  const publications = [
    {id: "one", tags: ["Office Lady", "glasses"]},
    {id: "two", tags: ["office"]},
    {id: "three", tags: ["yuri"]},
    {id: "one", tags: ["yuri"]},
  ];

  test("matches normalized exact tags and deduplicates publications", () => {
    expect(
      findBlacklistedTagMatches(publications, ["  OFFICE   LADY ", "YURI"]),
    ).toEqual([publications[0], publications[2]]);
  });

  test("does not treat a blacklisted tag as a substring", () => {
    expect(findBlacklistedTagMatches(publications, ["office"])).toEqual([
      publications[1],
    ]);
  });

  test("returns no matches when the blacklist is empty", () => {
    expect(findBlacklistedTagMatches(publications, [])).toEqual([]);
  });
});
