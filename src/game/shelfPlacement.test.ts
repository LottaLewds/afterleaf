import {describe, expect, test} from "bun:test";

import {
  findAdjacentShelfBook,
  findSpineShelfBookAtOffset,
  insertSpineShelfBook,
  spineShelfBookNormalOffset,
} from "~/game/shelfPlacement";

describe("spine shelf targeting", () => {
  test("keeps every book's rear edge on the shelf back plane", () => {
    expect(spineShelfBookNormalOffset(0.5, 0.5)).toBeCloseTo(-0.25);
    expect(spineShelfBookNormalOffset(1.1, 0.5)).toBeCloseTo(0.05);
    expect(spineShelfBookNormalOffset(0.35, 0.5)).toBeCloseTo(-0.325);
  });

  test("gives a thin spine a practical minimum pointer target", () => {
    const books = [{center: 0, id: "thin", width: 0.04}];

    expect(findSpineShelfBookAtOffset(books, 0.08, 0.18)?.id).toBe("thin");
    expect(findSpineShelfBookAtOffset(books, 0.1, 0.18)).toBeUndefined();
  });

  test("chooses the nearest spine when minimum targets overlap", () => {
    const books = [
      {center: -0.05, id: "left", width: 0.04},
      {center: 0.05, id: "right", width: 0.04},
    ];

    expect(findSpineShelfBookAtOffset(books, 0.03, 0.18)?.id).toBe("right");
  });

  test("browses adjacent books in shelf-coordinate order", () => {
    const books = [
      {center: 0.4, id: "right", width: 0.1},
      {center: -0.3, id: "left", width: 0.08},
      {center: 0, id: "middle", width: 0.12},
    ];

    expect(findAdjacentShelfBook(books, "middle", -1)?.id).toBe("left");
    expect(findAdjacentShelfBook(books, "middle", 1)?.id).toBe("right");
    expect(findAdjacentShelfBook(books, "left", -1)).toBeUndefined();
    expect(findAdjacentShelfBook(books, "missing", 1)).toBeUndefined();
  });
});

describe("spine shelf placement", () => {
  test("preserves arbitrary gaps away from the inserted book", () => {
    expect(
      insertSpineShelfBook(
        [
          {center: -1.6, id: "left", width: 0.2},
          {center: 1.4, id: "right", width: 0.3},
        ],
        {center: 0, id: "new", width: 0.4},
        {max: 2, min: -2},
        0.02,
      ),
    ).toEqual([
      {center: -1.6, id: "left", slotIndex: 0, width: 0.2},
      {center: 0, id: "new", slotIndex: 1, width: 0.4},
      {center: 1.4, id: "right", slotIndex: 2, width: 0.3},
    ]);
  });

  test("keeps wide face-out footprints at freely aimed shelf positions", () => {
    const firstPlacement = insertSpineShelfBook(
      [],
      {center: -0.3, id: "face-left", width: 0.5},
      {max: 0.6, min: -0.6},
      0.02,
    );
    const placements = insertSpineShelfBook(
      firstPlacement ?? [],
      {center: 0.3, id: "face-right", width: 0.5},
      {max: 0.6, min: -0.6},
      0.02,
    );

    expect(placements).toEqual([
      {center: -0.3, id: "face-left", slotIndex: 0, width: 0.5},
      {center: 0.3, id: "face-right", slotIndex: 1, width: 0.5},
    ]);
  });

  test("shoves overlapping books outwards on both sides", () => {
    const placements = insertSpineShelfBook(
      [
        {center: -0.08, id: "left", width: 0.2},
        {center: 0.1, id: "right", width: 0.24},
      ],
      {center: 0, id: "new", width: 0.3},
      {max: 1, min: -1},
      0.02,
    );

    expect(placements?.map((placement) => placement.id)).toEqual(["left", "new", "right"]);
    expect(placements?.[0]?.center).toBeCloseTo(-0.27);
    expect(placements?.[1]?.center).toBeCloseTo(0);
    expect(placements?.[2]?.center).toBeCloseTo(0.29);
  });

  test("clamps the inserted chain inside its bounded bay", () => {
    const placements = insertSpineShelfBook(
      [{center: -0.7, id: "first", width: 0.4}],
      {center: -0.95, id: "new", width: 0.4},
      {max: 1, min: -1},
      0.1,
    );

    expect(placements?.[0]?.center).toBeCloseTo(-0.8);
    expect(placements?.[1]?.center).toBeCloseTo(-0.3);
  });

  test("rejects an insertion when the bay has no remaining width", () => {
    expect(
      insertSpineShelfBook(
        [
          {center: -0.5, id: "first", width: 1},
          {center: 0.5, id: "second", width: 1},
        ],
        {center: 0, id: "new", width: 0.1},
        {max: 1, min: -1},
      ),
    ).toBeUndefined();
  });
});
