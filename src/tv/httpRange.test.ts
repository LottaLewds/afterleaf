import {describe, expect, test} from "bun:test";

import {constrainByteRangeLength, parseByteRange} from "~/tv/httpRange";

describe("TV byte ranges", () => {
  test("parses bounded, open, and suffix ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({end: 19, start: 10});
    expect(parseByteRange("bytes=90-", 100)).toEqual({end: 99, start: 90});
    expect(parseByteRange("bytes=-12", 100)).toEqual({end: 99, start: 88});
    expect(parseByteRange("bytes=90-200", 100)).toEqual({end: 99, start: 90});
  });

  test("rejects malformed and unsatisfiable ranges", () => {
    expect(parseByteRange("items=0-1", 100)).toBe("invalid");
    expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBe("invalid");
  });

  test("constrains large responses without extending small ranges", () => {
    expect(constrainByteRangeLength({end: 99, start: 10}, 32)).toEqual({
      end: 41,
      start: 10,
    });
    expect(constrainByteRangeLength({end: 19, start: 10}, 32)).toEqual({
      end: 19,
      start: 10,
    });
  });

  test("requires a positive safe maximum response length", () => {
    expect(() => constrainByteRangeLength({end: 19, start: 10}, 0)).toThrow(
      RangeError,
    );
    expect(() =>
      constrainByteRangeLength({end: 19, start: 10}, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
  });
});
