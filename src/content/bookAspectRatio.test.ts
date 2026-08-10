import {expect, test} from "bun:test";
import {
  bookAspectRatioSamplePageIndices,
  inferRepresentativeBookAspectRatio,
} from "~/content/bookAspectRatio";

test("samples early interior pages plus two adjacent midpoint pages", () => {
  expect(bookAspectRatioSamplePageIndices(20)).toEqual([1, 2, 9, 10]);
  expect(bookAspectRatioSamplePageIndices(4)).toEqual([1, 2]);
  expect(bookAspectRatioSamplePageIndices(2)).toEqual([]);
});

test("uses the lower quartile without letting one narrow outlier decide", () => {
  expect(
    inferRepresentativeBookAspectRatio(
      [
        {height: 1_000, width: 400},
        {height: 1_200, width: 800},
        {height: 1_200, width: 800},
        {height: 600, width: 1_200},
      ],
      2 / 3,
    ),
  ).toBeCloseTo(2 / 3);
});
