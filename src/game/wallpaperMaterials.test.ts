import {describe, expect, it} from "bun:test";

import {createWallpaperBoxGeometry} from "~/game/wallpaperMaterials";

describe("wallpaper material geometry", () => {
  it("keeps vertical faces upright at a consistent physical scale", () => {
    const geometry = createWallpaperBoxGeometry([4.8, 3.6, 0.2], [0, 1.8, 0]);
    const uv = geometry.getAttribute("uv");

    const uValues = [16, 17, 18, 19].map((index) => uv.getX(index));
    const vValues = [16, 17, 18, 19].map((index) => uv.getY(index));
    expect(Math.max(...uValues) - Math.min(...uValues)).toBeCloseTo(2);
    expect(Math.max(...vValues) - Math.min(...vValues)).toBeCloseTo(1.5);

    geometry.dispose();
  });

  it("keeps the pattern continuous across split walls and doorway headers", () => {
    const lowerWall = createWallpaperBoxGeometry([0.2, 2, 4], [6, 1, -3]);
    const upperWall = createWallpaperBoxGeometry([0.2, 2, 2], [6, 3, 0]);
    const nextWall = createWallpaperBoxGeometry([0.2, 2, 4], [6, 1, 3]);
    const negativeXFace = [4, 5, 6, 7];
    const range = (geometry: ReturnType<typeof createWallpaperBoxGeometry>) => {
      const uv = geometry.getAttribute("uv");
      const u = negativeXFace.map((index) => uv.getX(index));
      const v = negativeXFace.map((index) => uv.getY(index));
      return {
        maxU: Math.max(...u),
        maxV: Math.max(...v),
        minU: Math.min(...u),
        minV: Math.min(...v),
      };
    };

    const lowerRange = range(lowerWall);
    const headerRange = range(upperWall);
    const nextRange = range(nextWall);
    expect(lowerRange.maxU).toBeCloseTo(headerRange.minU);
    expect(headerRange.maxU).toBeCloseTo(nextRange.minU);
    expect(lowerRange.maxV).toBeCloseTo(headerRange.minV);

    lowerWall.dispose();
    upperWall.dispose();
    nextWall.dispose();
  });
});
