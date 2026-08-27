import {Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type MeshStandardMaterial, type Object3D} from "three";
import type {Group} from "three";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {
  SPINE_SHELF_BACKING_THICKNESS,
  SPINE_SHELF_BOARD_DEPTH,
  SPINE_SHELF_BOARD_THICKNESS,
  SPINE_SHELF_BOARD_Y_OFFSETS,
  SPINE_SHELF_DIVIDER_DEPTH,
  SPINE_SHELF_DIVIDER_HEIGHT,
  SPINE_SHELF_DIVIDER_THICKNESS,
  SPINE_SHELF_HEIGHT,
  FACE_OUT_DISPLAY,
  FACE_DISPLAY_ROWS,
} from "~/game/shopLayout";
import {faceDisplayShelfId} from "~/game/bookFactory";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import {MIN_POSTER_HEIGHT, POSTER_SURFACE_OFFSET} from "~/game/wallDecorTuning";
import type {AddBox} from "~/game/interior/interiorPrimitives";
import type {SpineShelfDefinition} from "~/game/shopTypes";

export const FACE_OUT_SHELF_INSET = 0.1;
export const SPINE_SHELF_FRONT_OFFSET = 0.57;

/** Signature of the scene's poster-surface registration delegate. */
export type CreatePosterSurfaceFn = (
  parent: Group,
  id: string,
  width: number,
  height: number,
  position: readonly [number, number, number],
  rotationY: number,
) => void;

export type SpineShelfFixtureDeps = {
  addBox: AddBox;
  createPosterSurface: CreatePosterSurfaceFn;
  registerPropPlacementSupport: (object: Object3D) => void;
  shelfTargetMeshes: Mesh[];
  signs: ShopSignSystem;
  spineShelfDefinitions: Map<string, SpineShelfDefinition>;
};

const createShelfEndPosterSurfaces = (
  parent: Group,
  fixtureId: string,
  x: number,
  z: number,
  length: number,
  elevation: number,
  alongX: boolean,
  createPosterSurface: CreatePosterSurfaceFn,
) => {
  const ends = alongX
    ? [
        {
          id: "west",
          position: [x - length / 2 - 0.055, elevation + 2.05, z] as const,
          rotation: -Math.PI / 2,
        },
        {
          id: "east",
          position: [x + length / 2 + 0.055, elevation + 2.05, z] as const,
          rotation: Math.PI / 2,
        },
      ]
    : [
        {
          id: "north",
          position: [x, elevation + 2.05, z - length / 2 - 0.055] as const,
          rotation: Math.PI,
        },
        {
          id: "south",
          position: [x, elevation + 2.05, z + length / 2 + 0.055] as const,
          rotation: 0,
        },
      ];
  for (const end of ends)
    createPosterSurface(parent, `${fixtureId}:end:${end.id}`, 1, 3.96, end.position, end.rotation);
};

const createSpineShelfSignTargets = (
  parent: Group,
  fixtureId: string,
  x: number,
  z: number,
  length: number,
  bayCount: number,
  normal: -1 | 1,
  elevation: number,
  alongX: boolean,
  bayWidth: number,
  targetRotationY: number,
  face: string,
  deps: SpineShelfFixtureDeps,
) => {
  const signKeys = new Map<number, string>();
  for (let bay = 0; bay < bayCount; bay += 1) {
    const bayCenter = -length / 2 + bayWidth * (bay + 0.5);
    const signKey = deps.signs.createSpineShelfSignSlot(
      parent,
      `${fixtureId.toUpperCase()} · BAY ${String(bay + 1).padStart(2, "0")}`,
      alongX ? x + bayCenter : x + normal * 0.57,
      alongX ? z + normal * 0.57 : z + bayCenter,
      bayWidth - 0.22,
      targetRotationY,
      elevation,
    );
    signKeys.set(bay, signKey);
    const signPreviewTarget = new Mesh(
      new PlaneGeometry(bayWidth - 0.18, SPINE_SHELF_HEIGHT),
      new MeshBasicMaterial({
        depthWrite: false,
        opacity: 0,
        transparent: true,
      }),
    );
    signPreviewTarget.name = `spine-shelf-sign-preview-target-${fixtureId}-${face}-${bay}`;
    // Broad raycast-only surface; keep sign previews independent from
    // book placement rows and the physical shelf boards between them.
    signPreviewTarget.visible = false;
    signPreviewTarget.position.set(
      alongX ? x + bayCenter : x + normal * SPINE_SHELF_FRONT_OFFSET,
      elevation + SPINE_SHELF_HEIGHT / 2,
      alongX ? z + normal * SPINE_SHELF_FRONT_OFFSET : z + bayCenter,
    );
    signPreviewTarget.rotation.y = targetRotationY;
    signPreviewTarget.userData.shelfId = `${fixtureId}:${face}:0:${bay}`;
    parent.add(signPreviewTarget);
    deps.signs.registerPreviewTarget(signPreviewTarget);
  }
  return signKeys;
};

const getSpineShelfFaceLayout = (normal: -1 | 1, alongX: boolean) => ({
  axis: new Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1),
  face: alongX ? (normal > 0 ? "south" : "north") : normal > 0 ? "east" : "west",
  normal: new Vector3(alongX ? 0 : normal, 0, alongX ? normal : 0),
  rotationY: alongX ? (normal > 0 ? 0 : Math.PI) : normal > 0 ? Math.PI / 2 : -Math.PI / 2,
});

const createSpineShelfRows = (
  parent: Group,
  fixtureId: string,
  x: number,
  z: number,
  length: number,
  bayCount: number,
  normal: -1 | 1,
  elevation: number,
  alongX: boolean,
  bayWidth: number,
  backingThickness: number,
  deps: SpineShelfFixtureDeps,
  layout: ReturnType<typeof getSpineShelfFaceLayout>,
  signKeys: Map<number, string>,
) => {
  for (let row = 0; row < 4; row += 1) {
    for (let bay = 0; bay < bayCount; bay += 1) {
      const shelfId = `${fixtureId}:${layout.face}:${row}:${bay}`;
      const bayCenter = -length / 2 + bayWidth * (bay + 0.5);
      const frontCenter = new Vector3(
        alongX ? x + bayCenter : x + normal * SPINE_SHELF_FRONT_OFFSET,
        elevation + 0.25 + row * 0.92 + BOOK_HEIGHT / 2,
        alongX ? z + normal * SPINE_SHELF_FRONT_OFFSET : z + bayCenter,
      );
      const definition: SpineShelfDefinition = {
        axis: layout.axis,
        backInset: SPINE_SHELF_FRONT_OFFSET - backingThickness / 2,
        faceInset: FACE_OUT_SHELF_INSET,
        faceTilt: 0,
        frontCenter,
        halfWidth: (bayWidth - 0.18) / 2,
        id: shelfId,
        normal: layout.normal,
      };
      const signKey = signKeys.get(bay);
      if (signKey) definition.signKey = signKey;
      deps.spineShelfDefinitions.set(shelfId, definition);
      const target = new Mesh(
        new PlaneGeometry(bayWidth - 0.16, 0.76),
        new MeshBasicMaterial({
          color: "#d94c3f",
          depthWrite: false,
          opacity: 0,
          transparent: true,
        }),
      );
      target.name = `spine-shelf-target-${shelfId}`;
      // Invisible raycast proxy - see mixed-shelf-target note above.
      target.visible = false;
      target.position.copy(frontCenter);
      target.rotation.y = layout.rotationY;
      target.userData.shelfId = shelfId;
      parent.add(target);
      deps.shelfTargetMeshes.push(target);
    }
  }
};

const createSpineShelfFace = (
  parent: Group,
  fixtureId: string,
  x: number,
  z: number,
  length: number,
  bayCount: number,
  normal: -1 | 1,
  elevation: number,
  alongX: boolean,
  bayWidth: number,
  backingThickness: number,
  deps: SpineShelfFixtureDeps,
) => {
  const layout = getSpineShelfFaceLayout(normal, alongX);
  const signKeys = createSpineShelfSignTargets(
    parent,
    fixtureId,
    x,
    z,
    length,
    bayCount,
    normal,
    elevation,
    alongX,
    bayWidth,
    layout.rotationY,
    layout.face,
    deps,
  );
  createSpineShelfRows(
    parent,
    fixtureId,
    x,
    z,
    length,
    bayCount,
    normal,
    elevation,
    alongX,
    bayWidth,
    backingThickness,
    deps,
    layout,
    signKeys,
  );
};

/**
 * Builds one spine-shelf fixture: backing, boards, dividers, end poster
 * surfaces, per-bay sign slots with preview proxies, and the shelf target
 * registry entries the book interaction logic aims at.
 */
export const createSpineShelfFixture = (
  parent: Group,
  fixtureId: string,
  x: number,
  z: number,
  length: number,
  bayCount: number,
  faceNormals: readonly (-1 | 1)[],
  woodMaterial: MeshStandardMaterial,
  backingMaterial: MeshStandardMaterial,
  shelfEdgeMaterial: MeshStandardMaterial,
  backingThickness: number = SPINE_SHELF_BACKING_THICKNESS,
  elevation = 0,
  axis: "x" | "z" = "z",
  deps: SpineShelfFixtureDeps,
) => {
  const alongX = axis === "x";
  deps.addBox(
    parent,
    alongX ? [length, SPINE_SHELF_HEIGHT, backingThickness] : [backingThickness, SPINE_SHELF_HEIGHT, length],
    [x, elevation + SPINE_SHELF_HEIGHT / 2, z],
    backingMaterial,
  );

  for (const y of SPINE_SHELF_BOARD_Y_OFFSETS) {
    const shelf = deps.addBox(
      parent,
      alongX
        ? [length, SPINE_SHELF_BOARD_THICKNESS, SPINE_SHELF_BOARD_DEPTH]
        : [SPINE_SHELF_BOARD_DEPTH, SPINE_SHELF_BOARD_THICKNESS, length],
      [x, elevation + y, z],
      woodMaterial,
      true,
    );
    deps.registerPropPlacementSupport(shelf);
  }

  const bayWidth = length / bayCount;
  for (let divider = 0; divider <= bayCount; divider += 1)
    deps.addBox(
      parent,
      alongX
        ? [SPINE_SHELF_DIVIDER_THICKNESS, SPINE_SHELF_DIVIDER_HEIGHT, SPINE_SHELF_DIVIDER_DEPTH]
        : [SPINE_SHELF_DIVIDER_DEPTH, SPINE_SHELF_DIVIDER_HEIGHT, SPINE_SHELF_DIVIDER_THICKNESS],
      alongX
        ? [x - length / 2 + divider * bayWidth, elevation + SPINE_SHELF_DIVIDER_HEIGHT / 2, z]
        : [x, elevation + SPINE_SHELF_DIVIDER_HEIGHT / 2, z - length / 2 + divider * bayWidth],
      shelfEdgeMaterial,
    );
  createShelfEndPosterSurfaces(parent, fixtureId, x, z, length, elevation, alongX, deps.createPosterSurface);

  for (const normal of faceNormals) {
    createSpineShelfFace(
      parent,
      fixtureId,
      x,
      z,
      length,
      bayCount,
      normal,
      elevation,
      alongX,
      bayWidth,
      backingThickness,
      deps,
    );
  }
};

export const FACE_DISPLAY_SHELF_HALF_WIDTH = 4.4;
export const FACE_DISPLAY_SHELF_INSET = 0.15;
export const FACE_DISPLAY_SHELF_FRONT_Z = -9.54;

export const TELEVISION_TABLE_SHELF_ID = "television-table:lower";
export const TELEVISION_TABLE_SHELF_BACK_INSET = 0.91;

export type FaceOutDisplayDeps = {
  addBox: AddBox;
  registerPropPlacementSupport: (object: Object3D) => void;
  shelfTargetMeshes: Mesh[];
  signs: ShopSignSystem;
  spineShelfDefinitions: Map<string, SpineShelfDefinition>;
};

export const createTelevisionTableShelf = (
  parent: Group,
  deps: {
    shelfTargetMeshes: Mesh[];
    spineShelfDefinitions: Map<string, SpineShelfDefinition>;
  },
) => {
  const frontCenter = new Vector3(0, 0.2 + BOOK_HEIGHT / 2, 26.76);
  deps.spineShelfDefinitions.set(TELEVISION_TABLE_SHELF_ID, {
    axis: new Vector3(1, 0, 0),
    backInset: TELEVISION_TABLE_SHELF_BACK_INSET,
    faceInset: 0.08,
    faceTilt: 0,
    frontCenter,
    halfWidth: 1.2,
    id: TELEVISION_TABLE_SHELF_ID,
    normal: new Vector3(0, 0, -1),
  });

  const target = new Mesh(
    new PlaneGeometry(2.42, 0.76),
    new MeshBasicMaterial({
      color: "#d94c3f",
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
  );
  target.name = `spine-shelf-target-${TELEVISION_TABLE_SHELF_ID}`;
  target.position.copy(frontCenter);
  target.rotation.y = Math.PI;
  target.userData.shelfId = TELEVISION_TABLE_SHELF_ID;
  // Invisible raycast proxy - see mixed-shelf-target note above.
  target.visible = false;
  parent.add(target);
  deps.shelfTargetMeshes.push(target);
};

export const createFaceOutDisplay = (
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  backingMaterial: MeshStandardMaterial,
  deps: FaceOutDisplayDeps,
) => {
  deps.addBox(parent, FACE_OUT_DISPLAY.backingSize, FACE_OUT_DISPLAY.backingCenter, backingMaterial);
  for (const x of FACE_OUT_DISPLAY.sideOffsetXs)
    deps.addBox(
      parent,
      FACE_OUT_DISPLAY.sideSize,
      [x, FACE_OUT_DISPLAY.sideCenterY, FACE_OUT_DISPLAY.sideCenterZ],
      woodMaterial,
      true,
    );
  for (const y of FACE_OUT_DISPLAY.boardYs) {
    const shelf = deps.addBox(
      parent,
      FACE_OUT_DISPLAY.boardSize,
      [FACE_OUT_DISPLAY.boardCenterX, y, FACE_OUT_DISPLAY.boardZ],
      woodMaterial,
      true,
    );
    deps.registerPropPlacementSupport(shelf);
  }

  const targetGeometry = new PlaneGeometry(FACE_DISPLAY_SHELF_HALF_WIDTH * 2, 0.76);
  for (let row = 0; row < FACE_DISPLAY_ROWS; row += 1) {
    const shelfId = faceDisplayShelfId(row);
    const frontCenter = new Vector3(-2, 0.595 + row * 0.9, FACE_DISPLAY_SHELF_FRONT_Z);
    deps.spineShelfDefinitions.set(shelfId, {
      axis: new Vector3(1, 0, 0),
      backInset: 0.55,
      faceInset: FACE_DISPLAY_SHELF_INSET,
      faceTilt: -0.1,
      frontCenter,
      halfWidth: FACE_DISPLAY_SHELF_HALF_WIDTH,
      id: shelfId,
      normal: new Vector3(0, 0, 1),
    });
    const targetMaterial = new MeshBasicMaterial({
      color: "#d94c3f",
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    const target = new Mesh(targetGeometry, targetMaterial);
    target.name = `mixed-shelf-target-${shelfId}`;
    // Invisible raycast proxy: rendering hundreds of fully transparent
    // quads costs a draw call each while contributing nothing on screen.
    // Raycaster does not test .visible, so targeting keeps working.
    target.visible = false;
    target.position.copy(frontCenter);
    target.userData.shelfId = shelfId;
    parent.add(target);
    deps.shelfTargetMeshes.push(target);
  }
  const signPreviewTarget = new Mesh(
    new PlaneGeometry(FACE_DISPLAY_SHELF_HALF_WIDTH * 2, FACE_OUT_DISPLAY.sideSize[1]),
    new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
  );
  signPreviewTarget.name = "mixed-shelf-sign-preview-target";
  // Broad raycast-only surface; keep sign previews independent from book
  // placement rows and the physical shelf boards between them.
  signPreviewTarget.visible = false;
  signPreviewTarget.position.set(
    FACE_OUT_DISPLAY.boardCenterX,
    FACE_OUT_DISPLAY.sideCenterY,
    FACE_DISPLAY_SHELF_FRONT_Z,
  );
  signPreviewTarget.userData.shelfId = faceDisplayShelfId(0);
  parent.add(signPreviewTarget);
  deps.signs.registerPreviewTarget(signPreviewTarget);
  deps.signs.createShelfSignSlots(parent);
};

export const createWallPosterSurfaces = (
  parent: Group,
  id: string,
  wall: {
    position: readonly [x: number, y: number, z: number];
    size: readonly [width: number, height: number, depth: number];
  },
  createPosterSurfaceTarget: CreatePosterSurfaceFn,
) => {
  const [width, height, depth] = wall.size;
  if (height < 1) return;
  const surfaceHeight = height - 0.16;
  if (width >= depth) {
    const surfaceWidth = width - 0.16;
    if (surfaceWidth < MIN_POSTER_HEIGHT) return;
    for (const side of [-1, 1] as const)
      createPosterSurfaceTarget(
        parent,
        `${id}:${side < 0 ? "north" : "south"}`,
        surfaceWidth,
        surfaceHeight,
        [wall.position[0], wall.position[1], wall.position[2] + side * (depth / 2 + POSTER_SURFACE_OFFSET)],
        side < 0 ? Math.PI : 0,
      );
    return;
  }
  const surfaceWidth = depth - 0.16;
  if (surfaceWidth < MIN_POSTER_HEIGHT) return;
  for (const side of [-1, 1] as const)
    createPosterSurfaceTarget(
      parent,
      `${id}:${side < 0 ? "west" : "east"}`,
      surfaceWidth,
      surfaceHeight,
      [wall.position[0] + side * (width / 2 + POSTER_SURFACE_OFFSET), wall.position[1], wall.position[2]],
      side < 0 ? -Math.PI / 2 : Math.PI / 2,
    );
};
