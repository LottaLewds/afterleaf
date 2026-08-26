import {describe, expect, test} from "bun:test";

import {createShuffleBag} from "~/tv/shuffleBag";

describe("TV shuffle bag", () => {
  test("contains every index exactly once", () => {
    const values = [0.7, 0.1, 0.9, 0.2];
    let cursor = 0;
    const bag = createShuffleBag(5, undefined, () => values[cursor++] ?? 0.5);
    expect([...bag].sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4]);
  });

  test("avoids beginning a refill with the previous video", () => {
    expect(createShuffleBag(3, 0, () => 0.99)[0]).not.toBe(0);
    expect(createShuffleBag(1, 0, () => 0.99)).toEqual([0]);
  });

  test("returns an empty bag for invalid counts", () => {
    expect(createShuffleBag(0, undefined)).toEqual([]);
    expect(createShuffleBag(1.5, undefined)).toEqual([]);
  });
});
