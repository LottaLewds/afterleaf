import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from "three";
import type {Group} from "three";
import {
  createStackableStairBoxes,
  SHOP_ATRIUM,
  SHOP_ATRIUM_RAIL_FLOOR_INSET,
  SHOP_STAIR_RAIL_INSET,
  SHOP_STAIR_ROOM,
  SHOP_UPPER_FLOOR_BOXES,
  SHOP_UPPER_FLOOR_Y,
} from "~/game/shopExpansionLayout";
import {createCeilingBoxGeometry} from "~/game/ceilingMaterials";
import {MIN_POSTER_HEIGHT} from "~/game/wallDecorTuning";
import type {AddBox} from "~/game/interior/interiorPrimitives";

/** X positions of the upper-storey windows along both window walls. */
export const UPPER_WINDOW_CENTERS = [-8.25, 0, 8.25] as const;
export const UPPER_WINDOW_WIDTH = 4.8;
export const UPPER_WINDOW_HEIGHT = 3.5;

/**
 * Signature of the wall-patch registration callback used by window walls.
 * The scene owns the poster surface registry; builders only place patches.
 */
export type CreatePosterSurface = (
  parent: Group,
  id: string,
  width: number,
  height: number,
  position: readonly [number, number, number],
  rotationY: number,
) => void;

export const createUpperFloorStructures = (
  parent: Group,
  ceilingMaterial: MeshStandardMaterial,
  registerPropPlacementSupport: (object: Object3D) => void,
) => {
  // Only the underside of each slab is visible from the ground floor; keep
  // the edges (and the covered top) on the cheap unlit gray material.
  const edgeMaterial = new MeshBasicMaterial({color: "#242a28"});
  const slabMaterials = [
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    ceilingMaterial,
    edgeMaterial,
    edgeMaterial,
  ];
  for (const box of SHOP_UPPER_FLOOR_BOXES) {
    const floorStructure = new Mesh(
      createCeilingBoxGeometry(box.size, box.position),
      slabMaterials,
    );
    floorStructure.position.set(...box.position);
    parent.add(floorStructure);
    registerPropPlacementSupport(floorStructure);
  }
};

export const createAtriumRailings = (
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  addBox: AddBox,
) => {
  const railY = SHOP_UPPER_FLOOR_Y + 0.72;
  const postY = SHOP_UPPER_FLOOR_Y + 0.61;
  const minX = SHOP_ATRIUM.minX - SHOP_ATRIUM_RAIL_FLOOR_INSET;
  const maxX = SHOP_ATRIUM.maxX + SHOP_ATRIUM_RAIL_FLOOR_INSET;
  const minZ = SHOP_ATRIUM.minZ - SHOP_ATRIUM_RAIL_FLOOR_INSET;
  const maxZ = SHOP_ATRIUM.maxZ + SHOP_ATRIUM_RAIL_FLOOR_INSET;
  const addRailBars = (
    start: number,
    end: number,
    fixed: number,
    alongX: boolean,
  ) => {
    const length = end - start;
    const center = (start + end) / 2;
    for (const y of [railY - 0.34, railY + 0.36])
      addBox(
        parent,
        alongX ? [length, 0.1, 0.1] : [0.1, 0.1, length],
        alongX ? [center, y, fixed] : [fixed, y, center],
        woodMaterial,
        true,
      );
  };
  const addPost = (x: number, z: number) =>
    addBox(parent, [0.12, 1.22, 0.12], [x, postY, z], woodMaterial, true);
  const addIntermediatePosts = (
    start: number,
    end: number,
    fixed: number,
    alongX: boolean,
  ) => {
    const length = end - start;
    const postCount = Math.ceil(length / 1.75);
    for (let post = 1; post < postCount; post += 1) {
      const offset = start + (length * post) / postCount;
      if (alongX) addPost(offset, fixed);
      else addPost(fixed, offset);
    }
  };
  addRailBars(minZ, maxZ, minX, false);
  addRailBars(minZ, maxZ, maxX, false);
  addRailBars(minX, maxX, minZ, true);
  addRailBars(minX, maxX, maxZ, true);
  for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) addPost(x, z);
  addIntermediatePosts(minZ, maxZ, minX, false);
  addIntermediatePosts(minZ, maxZ, maxX, false);
  addIntermediatePosts(minX, maxX, minZ, true);
  addIntermediatePosts(minX, maxX, maxZ, true);
};

export const createStackableStairwell = (
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  addBox: AddBox,
) => {
  const stairBoxes = createStackableStairBoxes(0);
  const landingMaterial = woodMaterial.clone();
  landingMaterial.color.offsetHSL(0, -0.08, 0.08);
  for (const [index, box] of stairBoxes.entries()) {
    const isTopLanding = index === stairBoxes.length - 1;
    const visualMinX = isTopLanding
      ? Math.max(box.position[0] - box.size[0] / 2, SHOP_STAIR_ROOM.minX)
      : box.position[0] - box.size[0] / 2;
    const visualMaxX = box.position[0] + box.size[0] / 2;
    addBox(
      parent,
      [visualMaxX - visualMinX, box.size[1], box.size[2]],
      [(visualMinX + visualMaxX) / 2, box.position[1], box.position[2]],
      index === 11 || isTopLanding ? landingMaterial : woodMaterial,
      true,
    );
  }

  const addFlightRailings = (
    flightBoxes: readonly (typeof stairBoxes)[number][],
  ) => {
    const ordered = [...flightBoxes].sort(
      (first, second) => first.position[0] - second.position[0],
    );
    const first = ordered[0];
    const last = ordered.at(-1);
    if (!first || !last) return;
    const firstTop = first.position[1] + first.size[1] / 2;
    const lastTop = last.position[1] + last.size[1] / 2;
    const slope = (lastTop - firstTop) / (last.position[0] - first.position[0]);
    const minX = first.position[0] - first.size[0] / 2;
    const maxX = last.position[0] + last.size[0] / 2;
    const treadYAt = (x: number) => firstTop + slope * (x - first.position[0]);
    const edgeOffset = first.size[2] / 2 - SHOP_STAIR_RAIL_INSET;
    for (const z of [
      first.position[2] - edgeOffset,
      first.position[2] + edgeOffset,
    ]) {
      for (const height of [0.55, 1]) {
        const startY = treadYAt(minX) + height;
        const endY = treadYAt(maxX) + height;
        const rail = addBox(
          parent,
          [Math.hypot(maxX - minX, endY - startY), 0.1, 0.1],
          [(minX + maxX) / 2, (startY + endY) / 2, z],
          woodMaterial,
          true,
        );
        rail.rotation.z = Math.atan2(endY - startY, maxX - minX);
      }
      for (let index = 0; index < ordered.length; index += 2) {
        const step = ordered[index];
        if (!step) continue;
        const stepTop = step.position[1] + step.size[1] / 2;
        const handrailY = treadYAt(step.position[0]) + 1;
        addBox(
          parent,
          [0.12, handrailY - stepTop, 0.12],
          [step.position[0], (stepTop + handrailY) / 2, z],
          woodMaterial,
          true,
        );
      }
    }
  };
  addFlightRailings(stairBoxes.slice(0, 11));
  addFlightRailings(stairBoxes.slice(12, 23));

  const addLandingRail = (
    size: readonly [width: number, height: number, depth: number],
    position: readonly [x: number, y: number, z: number],
    alongX: boolean,
  ) => {
    const top = position[1] + size[1] / 2;
    const length = alongX ? size[0] : size[2];
    for (const height of [0.55, 1])
      addBox(
        parent,
        alongX ? [length, 0.1, 0.1] : [0.1, 0.1, length],
        [position[0], top + height, position[2]],
        woodMaterial,
        true,
      );
    const halfLength = length / 2;
    for (const offset of [-halfLength, 0, halfLength])
      addBox(
        parent,
        [0.12, 1, 0.12],
        alongX
          ? [position[0] + offset, top + 0.5, position[2]]
          : [position[0], top + 0.5, position[2] + offset],
        woodMaterial,
        true,
      );
  };
  const turnLanding = stairBoxes[11];
  if (turnLanding) {
    const railSize = [
      turnLanding.size[0] - SHOP_STAIR_RAIL_INSET * 2,
      turnLanding.size[1],
      turnLanding.size[2] - SHOP_STAIR_RAIL_INSET * 2,
    ] as const;
    addLandingRail(
      railSize,
      [
        turnLanding.position[0] +
          turnLanding.size[0] / 2 -
          SHOP_STAIR_RAIL_INSET,
        turnLanding.position[1],
        turnLanding.position[2],
      ],
      false,
    );
    for (const side of [-1, 1])
      addLandingRail(
        railSize,
        [
          turnLanding.position[0],
          turnLanding.position[1],
          turnLanding.position[2] +
            side * (turnLanding.size[2] / 2 - SHOP_STAIR_RAIL_INSET),
        ],
        true,
      );
  }
  const topLanding = stairBoxes.at(-1);
  if (topLanding) {
    const railSize = [
      topLanding.size[0] - SHOP_STAIR_RAIL_INSET * 2,
      topLanding.size[1],
      topLanding.size[2] - SHOP_STAIR_RAIL_INSET * 2,
    ] as const;
    for (const side of [-1, 1])
      addLandingRail(
        railSize,
        [
          topLanding.position[0],
          topLanding.position[1],
          topLanding.position[2] +
            side * (topLanding.size[2] / 2 - SHOP_STAIR_RAIL_INSET),
        ],
        true,
      );
  }
};

const createUpperWindow = (
  parent: Group,
  x: number,
  glassZ: number,
  rotationY: number,
  frameMaterial: MeshStandardMaterial,
  glassMaterial: MeshBasicMaterial,
  addBox: AddBox,
) => {
  const glass = new Mesh(
    new PlaneGeometry(UPPER_WINDOW_WIDTH, UPPER_WINDOW_HEIGHT),
    glassMaterial,
  );
  glass.position.set(x, 7.35, glassZ);
  glass.rotation.y = rotationY;
  parent.add(glass);
  for (const frameX of [
    x - UPPER_WINDOW_WIDTH / 2,
    x,
    x + UPPER_WINDOW_WIDTH / 2,
  ])
    addBox(
      parent,
      [0.09, UPPER_WINDOW_HEIGHT + 0.16, 0.12],
      [frameX, 7.35, glassZ],
      frameMaterial,
      true,
    );
  for (const frameY of [
    7.35 - UPPER_WINDOW_HEIGHT / 2,
    7.35,
    7.35 + UPPER_WINDOW_HEIGHT / 2,
  ])
    addBox(
      parent,
      [UPPER_WINDOW_WIDTH + 0.12, 0.09, 0.12],
      [x, frameY, glassZ],
      frameMaterial,
      true,
    );
};

export const createUpperWindowWall = (
  parent: Group,
  z: number,
  rotationY: number,
  wallMaterial: MeshStandardMaterial,
  frameMaterial: MeshStandardMaterial,
  glassMaterial: MeshBasicMaterial,
  addBox: AddBox,
  createPosterSurface: CreatePosterSurface,
) => {
  addBox(parent, [25, 0.7, 0.18], [0, 5.25, z], wallMaterial);
  addBox(parent, [25, 0.7, 0.18], [0, 9.45, z], wallMaterial);
  const openings = UPPER_WINDOW_CENTERS.map((center) => ({
    max: center + UPPER_WINDOW_WIDTH / 2,
    min: center - UPPER_WINDOW_WIDTH / 2,
  }));
  const solidRuns = [
    {max: openings[0]?.min ?? -12.5, min: -12.5},
    {max: openings[1]?.min ?? 0, min: openings[0]?.max ?? 0},
    {max: openings[2]?.min ?? 0, min: openings[1]?.max ?? 0},
    {max: 12.5, min: openings[2]?.max ?? 12.5},
  ];
  const windowWallId =
    z < 0 ? "upper-north-window-wall" : "upper-south-window-wall";
  for (const [index, run] of solidRuns.entries()) {
    addBox(
      parent,
      [run.max - run.min, 3.5, 0.18],
      [(run.min + run.max) / 2, 7.35, z],
      wallMaterial,
    );

    const surfaceWidth = run.max - run.min - 0.12;
    if (surfaceWidth <= MIN_POSTER_HEIGHT) continue;
    createPosterSurface(
      parent,
      `${windowWallId}-pier-${index + 1}`,
      surfaceWidth,
      3.34,
      [(run.min + run.max) / 2, 7.35, z + (rotationY === 0 ? 0.105 : -0.105)],
      rotationY,
    );
  }

  const glassZ = z + (rotationY === 0 ? 0.105 : -0.105);
  for (const x of UPPER_WINDOW_CENTERS) {
    createUpperWindow(
      parent,
      x,
      glassZ,
      rotationY,
      frameMaterial,
      glassMaterial,
      addBox,
    );
  }
};
