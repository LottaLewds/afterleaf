export type BookDropLane = {
  centerX: number;
  halfWidth: number;
};

export type BookDropPosition = {
  x: number;
  z: number;
};

export const BOOK_DROP_LANES: readonly BookDropLane[] = [
  {centerX: -9.7, halfWidth: 0.62},
  {centerX: -6.1, halfWidth: 0.72},
  {centerX: -2.85, halfWidth: 0.32},
  {centerX: 2.85, halfWidth: 0.32},
  {centerX: 6.1, halfWidth: 0.72},
  {centerX: 9.7, halfWidth: 0.62},
];

const DROP_MIN_Z = 6.75;
const DROP_MAX_Z = 17.25;
const HASH_FRACTION_MAX = 0x3ff;

/** Keeps deterministic floor stock inside the six walkable shelf aisles. */
export const bookDropPosition = (seed: number): BookDropPosition => {
  const lane = BOOK_DROP_LANES[seed % BOOK_DROP_LANES.length];
  if (!lane) return {x: 0, z: DROP_MIN_Z};
  const xFraction = ((seed >>> 8) & HASH_FRACTION_MAX) / HASH_FRACTION_MAX;
  const zFraction = ((seed >>> 18) & HASH_FRACTION_MAX) / HASH_FRACTION_MAX;
  return {
    x: lane.centerX + (xFraction * 2 - 1) * lane.halfWidth,
    z: DROP_MIN_Z + zFraction * (DROP_MAX_Z - DROP_MIN_Z),
  };
};
