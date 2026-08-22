import {describe, expect, test} from "bun:test";

import {findBlacklistedTagMatches} from "~/content/libraryUpdate/tagPurge";

describe("blacklisted tag purge selection", () => {
  const officeLadyPublication = {id: "one", tags: ["Office Lady", "glasses"]};
  const officePublication = {id: "two", tags: ["office"]};
  const yuriPublication = {id: "three", tags: ["yuri"]};
  const duplicateYuriPublication = {id: "one", tags: ["yuri"]};
  const publications = [
    officeLadyPublication,
    officePublication,
    yuriPublication,
    duplicateYuriPublication,
  ];

  test("matches normalized exact tags and deduplicates publications", () => {
    expect(
      findBlacklistedTagMatches(publications, ["  OFFICE   LADY ", "YURI"]),
    ).toEqual([officeLadyPublication, yuriPublication]);
  });

  test("does not treat a blacklisted tag as a substring", () => {
    expect(findBlacklistedTagMatches(publications, ["office"])).toEqual([
      officePublication,
    ]);
  });

  test("returns no matches when the blacklist is empty", () => {
    expect(findBlacklistedTagMatches(publications, [])).toEqual([]);
  });
});
