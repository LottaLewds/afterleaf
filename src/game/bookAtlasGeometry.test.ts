import {BoxGeometry} from "three";
import {describe, expect, test} from "bun:test";

import type {CatalogShelfAtlas} from "~/catalog";
import {remapBookGeometryToAtlas} from "~/game/bookAtlasGeometry";

const attributeRange = (
  attribute: ReturnType<BoxGeometry["getAttribute"]>,
  component: "x" | "y",
) => {
  const read =
    component === "x"
      ? (index: number) => attribute.getX(index)
      : (index: number) => attribute.getY(index);
  const values = Array.from({length: attribute.count}, (_, index) =>
    read(index),
  );
  return {maximum: Math.max(...values), minimum: Math.min(...values)};
};

describe("remapBookGeometryToAtlas", () => {
  test("derives packed spine UVs from the original geometry after remapping cover UVs", () => {
    const coverAtlas: CatalogShelfAtlas = {
      cellHeight: 384,
      cellWidth: 256,
      columns: 8,
      firstPublicationIndex: 0,
      height: 384,
      publicationCount: 2,
      rows: 1,
      url: "front.webp",
      width: 2048,
    };
    const spineAtlas: CatalogShelfAtlas = {
      cellHeight: 768,
      cellWidth: 48,
      columns: 2,
      firstPublicationIndex: 0,
      height: 768,
      publicationCount: 2,
      regions: [
        {height: 768, width: 20, x: 0, y: 0},
        {height: 768, width: 50, x: 20, y: 0},
      ],
      rows: 1,
      url: "spine.webp",
      width: 70,
    };
    const source = new BoxGeometry(0.5, 0.74, 0.04);
    const remapped = remapBookGeometryToAtlas(
      source,
      coverAtlas,
      spineAtlas,
      1,
      0.68,
      14,
    );
    const spineUv = remapped.getAttribute("bookSpineUv");

    expect(attributeRange(spineUv, "x").minimum).toBeCloseTo(20.5 / 70);
    expect(attributeRange(spineUv, "x").maximum).toBeCloseTo(69.5 / 70);
    expect(attributeRange(spineUv, "y").minimum).toBeCloseTo(0.5 / 768);
    expect(attributeRange(spineUv, "y").maximum).toBeCloseTo(767.5 / 768);

    source.dispose();
    remapped.dispose();
  });
});
