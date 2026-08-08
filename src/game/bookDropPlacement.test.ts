import {describe, expect, test} from "bun:test";

import {BOOK_DROP_LANES, bookDropPosition} from "~/game/bookDropPlacement";

describe("book drop placement", () => {
  test("uses every configured aisle lane", () => {
    const positions = BOOK_DROP_LANES.map((_lane, laneIndex) =>
      bookDropPosition(laneIndex),
    );

    for (const [laneIndex, position] of positions.entries()) {
      const lane = BOOK_DROP_LANES[laneIndex];
      expect(lane).toBeDefined();
      if (!lane) continue;
      expect(position.x).toBeGreaterThanOrEqual(lane.centerX - lane.halfWidth);
      expect(position.x).toBeLessThanOrEqual(lane.centerX + lane.halfWidth);
      expect(position.z).toBeGreaterThanOrEqual(6.75);
      expect(position.z).toBeLessThanOrEqual(17.25);
    }
  });

  test("keeps deterministic jitter within its selected lane", () => {
    const seed = 0xfedcba98;
    const first = bookDropPosition(seed);
    const second = bookDropPosition(seed);
    const lane = BOOK_DROP_LANES[seed % BOOK_DROP_LANES.length];

    expect(first).toEqual(second);
    expect(lane).toBeDefined();
    if (!lane) return;
    expect(first.x).toBeGreaterThanOrEqual(lane.centerX - lane.halfWidth);
    expect(first.x).toBeLessThanOrEqual(lane.centerX + lane.halfWidth);
  });
});
