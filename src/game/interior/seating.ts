import {MeshStandardMaterial, type Group} from "three";
import {SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";
import type {AddBox} from "~/game/interior/interiorPrimitives";

export const createNightWindows = (parent: Group, addBox: AddBox) => {
  const nightGlass = new MeshStandardMaterial({
    color: "#071c27",
    emissive: "#0b2837",
    emissiveIntensity: 0.75,
    metalness: 0.25,
    roughness: 0.2,
  });
  const frame = new MeshStandardMaterial({
    color: "#111918",
    metalness: 0.6,
    roughness: 0.45,
  });
  for (const x of [-9.5, 8.6]) {
    addBox(parent, [2.2, 2.15, 0.035], [x, 2.8, -10.39], nightGlass);
    addBox(parent, [2.3, 0.07, 0.09], [x, 1.7, -10.32], frame);
    addBox(parent, [2.3, 0.07, 0.09], [x, 3.9, -10.32], frame);
    addBox(parent, [0.07, 2.25, 0.09], [x - 1.15, 2.8, -10.32], frame);
    addBox(parent, [0.07, 2.25, 0.09], [x + 1.15, 2.8, -10.32], frame);
    addBox(parent, [0.05, 2.16, 0.08], [x, 2.8, -10.31], frame);
  }
};

export const createTheatreSeating = (parent: Group, addBox: AddBox) => {
  const seatMaterial = new MeshStandardMaterial({
    color: "#562e35",
    roughness: 0.96,
  });
  const frameMaterial = new MeshStandardMaterial({
    color: "#171b1a",
    metalness: 0.5,
    roughness: 0.45,
  });
  const riserMaterial = new MeshStandardMaterial({
    color: "#191520",
    roughness: 1,
  });
  const aisleLightMaterial = new MeshStandardMaterial({
    color: "#72643d",
    emissive: "#d6b35b",
    emissiveIntensity: 2.4,
    roughness: 0.62,
  });
  const rows = [
    {height: 0.4, platformCenterX: -20.85, platformWidth: 7.7, x: -22},
    {height: 0.26, platformCenterX: -26.2, platformWidth: 3, x: -26.2},
    {height: 0.12, platformCenterX: -30.7, platformWidth: 6, x: -30},
  ] as const;
  for (const row of rows) {
    for (const bankZ of [14, 23]) {
      addBox(
        parent,
        [row.platformWidth, row.height, 6.4],
        [row.platformCenterX, SHOP_UPPER_FLOOR_Y + row.height / 2, bankZ],
        riserMaterial,
      );
      addBox(
        parent,
        [0.08, 0.04, 5.8],
        [row.platformCenterX - row.platformWidth / 2 + 0.05, SHOP_UPPER_FLOOR_Y + row.height + 0.025, bankZ],
        aisleLightMaterial,
      );
    }
    for (const z of [12.5, 14.25, 16, 21, 22.75, 24.5]) {
      addBox(parent, [0.72, 0.12, 1.1], [row.x, SHOP_UPPER_FLOOR_Y + row.height + 0.43, z], seatMaterial, true);
      addBox(parent, [0.12, 0.9, 1.1], [row.x + 0.33, SHOP_UPPER_FLOOR_Y + row.height + 0.82, z], seatMaterial, true);
      for (const legZ of [-0.42, 0.42])
        addBox(
          parent,
          [0.07, 0.48, 0.07],
          [row.x, SHOP_UPPER_FLOOR_Y + row.height + 0.24, z + legZ],
          frameMaterial,
          true,
        );
    }
  }
};
