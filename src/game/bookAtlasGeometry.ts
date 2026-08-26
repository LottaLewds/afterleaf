import {Float32BufferAttribute, type BoxGeometry} from "three";

import type {CatalogShelfAtlas} from "~/catalog";
import {physicalBookDepth, physicalBookWidth} from "~/game/bookDimensions";

export const remapBookGeometryToAtlas = (
  geometry: BoxGeometry,
  coverAtlas: CatalogShelfAtlas,
  spineAtlas: CatalogShelfAtlas,
  cellIndex: number,
  aspectRatio: number | undefined,
  thicknessMm: number,
) => {
  const remapped = geometry.clone();
  const uv = remapped.getAttribute("uv");
  const sourceUv = geometry.getAttribute("uv");
  const spineUv = new Float32BufferAttribute(new Float32Array(uv.count * 2), 2);
  const remapSurface = (target: typeof uv, atlas: CatalogShelfAtlas, sourceAspectRatio: number) => {
    const region = atlas.regions?.[cellIndex];
    if (region) {
      const left = region.x + 0.5;
      const bottom = atlas.height - region.y - region.height + 0.5;
      for (let index = 0; index < sourceUv.count; index += 1)
        target.setXY(
          index,
          (left + sourceUv.getX(index) * Math.max(0, region.width - 1)) / atlas.width,
          (bottom + sourceUv.getY(index) * Math.max(0, region.height - 1)) / atlas.height,
        );
      target.needsUpdate = true;
      return;
    }
    const column = cellIndex % atlas.columns;
    const row = Math.floor(cellIndex / atlas.columns);
    const scale = Math.min(atlas.cellWidth / sourceAspectRatio, atlas.cellHeight);
    const contentWidth = sourceAspectRatio * scale;
    const contentHeight = scale;
    const left = (atlas.cellWidth - contentWidth) / 2 + 0.5;
    const bottom = (atlas.cellHeight - contentHeight) / 2 + 0.5;
    const sampledWidth = Math.max(0, contentWidth - 1);
    const sampledHeight = Math.max(0, contentHeight - 1);
    for (let index = 0; index < sourceUv.count; index += 1) {
      const localX = left + sourceUv.getX(index) * sampledWidth;
      const localY = bottom + sourceUv.getY(index) * sampledHeight;
      target.setXY(
        index,
        (column + localX / atlas.cellWidth) / atlas.columns,
        (atlas.rows - row - 1 + localY / atlas.cellHeight) / atlas.rows,
      );
    }
    target.needsUpdate = true;
  };
  const coverWidth = Math.max(1, Math.round(coverAtlas.cellHeight * physicalBookWidth(aspectRatio, 1)));
  const spineSourceHeight = spineAtlas.cellHeight * 2;
  const spineWidth = Math.max(1, Math.round(physicalBookDepth(thicknessMm, spineSourceHeight)));
  remapSurface(uv, coverAtlas, coverWidth / coverAtlas.cellHeight);
  remapSurface(spineUv, spineAtlas, spineWidth / spineSourceHeight);
  remapped.setAttribute("bookSpineUv", spineUv);
  return remapped;
};
