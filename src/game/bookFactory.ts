import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type MeshBasicMaterialParameters,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
  Vector3,
} from "three";
import type {CatalogItem} from "~/catalog";
import {
  createBookExteriorMaterial,
  type BookAtlasPlacement,
  type BookExteriorUniforms,
} from "~/game/bookExteriorMaterial";
import {PaperSheetSimulation} from "~/game/PaperSheetSimulation";
import {physicalBookDepth, physicalBookWidth} from "~/game/bookDimensions";
import type {ShelfPresentation} from "~/game/shelfPlacement";
import type {BookInteractionState} from "~/game/shopGameplay";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {FACE_DISPLAY_COLUMNS, FACE_DISPLAY_COLUMN_SPACING, FACE_DISPLAY_ROWS, FACE_SHELF_ID} from "~/game/shopLayout";

export const faceDisplayShelfId = (row: number) => `${FACE_SHELF_ID}:row:${row}`;

export const faceDisplayShelfOffset = (slotIndex: number) => {
  const column = slotIndex % FACE_DISPLAY_COLUMNS;
  return (column - (FACE_DISPLAY_COLUMNS - 1) / 2) * FACE_DISPLAY_COLUMN_SPACING;
};

import {
  INSPECTION_PAGE_GUTTER,
  INSPECTION_PAGE_SEGMENTS_X,
  INSPECTION_PAGE_SEGMENTS_Y,
  INSPECTION_READER_COLOR,
  INSPECTION_SURFACE_GAP,
} from "~/game/bookInspectionTuning";

export type BookRecord = {
  atlasPlacement: BookAtlasPlacement | undefined;
  backTexture: Texture | undefined;
  backTextureReady: boolean;
  backTextureUrl: string | undefined;
  basePosition: Vector3;
  baseRotation: Vector3;
  coverTextureUrl: string;
  coverTextureReady: boolean;
  detailCoverUrl: string | undefined;
  detailTexture: Texture | undefined;
  detailTextureLoading: boolean;
  detailTextureReady: boolean;
  exteriorMaterial: MeshStandardMaterial;
  exteriorUniforms: BookExteriorUniforms;
  inspectionBackCover: Mesh<PlaneGeometry, MeshStandardMaterial>;
  inspectionBackCoverMaterial: MeshStandardMaterial;
  inspectionFrontCover: Mesh<PlaneGeometry, MeshStandardMaterial>;
  inspectionFrontCoverMaterial: MeshStandardMaterial;
  inspectionGroup: Group;
  inspectionLightingBlend: number;
  inspectionLeftAssembly: Group;
  inspectionLeftBlock: Mesh<BoxGeometry, MeshStandardMaterial>;
  inspectionLeftMaterial: MeshBasicMaterial;
  inspectionLeftPage: Mesh<PlaneGeometry, MeshBasicMaterial>;
  inspectionPaperMaterial: MeshStandardMaterial;
  inspectionPaperSimulation: PaperSheetSimulation;
  inspectionRightAssembly: Group;
  inspectionRightBlock: Mesh<BoxGeometry, MeshStandardMaterial>;
  inspectionRightMaterial: MeshBasicMaterial;
  inspectionRightPage: Mesh<PlaneGeometry, MeshBasicMaterial>;
  inspectionTurningBackMaterial: MeshBasicMaterial;
  inspectionTurningFrontMaterial: MeshBasicMaterial;
  inspectionTurningPage: Mesh<PlaneGeometry, MeshBasicMaterial[]>;
  inspectionTurningPositions: Float32Array;
  inspectionTurningTargets: Float32Array;
  inspectionTurningUvs: Float32Array;
  hoverTarget: Mesh<BoxGeometry, MeshBasicMaterial>;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  physicsRegistered: boolean;
  publicationAccent: string;
  publicationLanguage: CatalogItem["language"];
  publicationTitle: string;
  sceneEmissive: Color;
  sceneEmissiveIntensity: number;
  shelfPosition: Vector3;
  shelfOffset: number;
  shelfPresentation: ShelfPresentation;
  signature: string;
  slotIndex: number;
  spineNormalSign: -1 | 1;
  spineTexture: Texture | undefined;
  spineTextureReady: boolean;
  spineTextureUrl: string | undefined;
  standaloneTexturesReady: boolean;
  state: BookInteractionState;
  taskBook: boolean;
  shelfPreview: number;
  targetLift: number;
  targetScale: number;
  thickness: number;
  texture: Texture | undefined;
  width: number;
};

export type RetainedBookGameplay = Pick<
  BookRecord,
  "shelfOffset" | "shelfPresentation" | "slotIndex" | "state" | "taskBook"
> & {
  basePosition: Vector3;
  baseRotation: Vector3;
};

type BookRecordSetup = Pick<
  BookRecord,
  | "exteriorMaterial"
  | "exteriorUniforms"
  | "inspectionBackCover"
  | "inspectionBackCoverMaterial"
  | "inspectionFrontCover"
  | "inspectionFrontCoverMaterial"
  | "inspectionGroup"
  | "inspectionLeftAssembly"
  | "inspectionLeftBlock"
  | "inspectionLeftMaterial"
  | "inspectionLeftPage"
  | "inspectionPaperMaterial"
  | "inspectionRightAssembly"
  | "inspectionRightBlock"
  | "inspectionRightMaterial"
  | "inspectionRightPage"
  | "inspectionTurningBackMaterial"
  | "inspectionTurningFrontMaterial"
  | "inspectionTurningPage"
  | "inspectionTurningPositions"
  | "inspectionTurningTargets"
  | "inspectionTurningUvs"
  | "hoverTarget"
  | "mesh"
> & {
  initialTaskBook: boolean;
  inspectionPaperSimulation: PaperSheetSimulation;
  item: CatalogItem;
  retainedGameplay: RetainedBookGameplay | undefined;
  signature: string;
  slotIndex: number;
  spineNormalSign: -1 | 1;
  thickness: number;
  width: number;
};

const createInitialBookState = (initialTaskBook: boolean, slotIndex: number): BookRecord["state"] => {
  if (initialTaskBook) return {status: "floor"};
  return {
    shelfId: faceDisplayShelfId(Math.floor(slotIndex / FACE_DISPLAY_COLUMNS) % FACE_DISPLAY_ROWS),
    slotIndex: slotIndex % FACE_DISPLAY_COLUMNS,
    status: "shelved",
  };
};

const createFreshBookPlacement = (initialTaskBook: boolean, slotIndex: number) => ({
  shelfOffset: initialTaskBook ? 0 : faceDisplayShelfOffset(slotIndex),
  shelfPresentation: initialTaskBook ? ("spine" as const) : ("face" as const),
  slotIndex,
  state: createInitialBookState(initialTaskBook, slotIndex),
  taskBook: initialTaskBook,
});

const resolveBookPlacement = (
  retainedGameplay: RetainedBookGameplay | undefined,
  initialTaskBook: boolean,
  slotIndex: number,
): Pick<BookRecord, "shelfOffset" | "shelfPresentation" | "slotIndex" | "state" | "taskBook"> => {
  if (retainedGameplay)
    return {
      shelfOffset: retainedGameplay.shelfOffset,
      shelfPresentation: retainedGameplay.shelfPresentation,
      slotIndex: retainedGameplay.slotIndex,
      state: retainedGameplay.state,
      taskBook: retainedGameplay.taskBook,
    };
  return createFreshBookPlacement(initialTaskBook, slotIndex);
};

type InspectionTurningSetup = Pick<
  BookRecord,
  | "inspectionTurningBackMaterial"
  | "inspectionTurningFrontMaterial"
  | "inspectionTurningPage"
  | "inspectionTurningPositions"
  | "inspectionTurningTargets"
  | "inspectionTurningUvs"
>;

const createInspectionTurningUvs = (source: ArrayLike<number>, direction: CatalogItem["direction"]) => {
  const uvs = source instanceof Float32Array ? new Float32Array(source.length) : new Float32Array();
  for (let index = 0; index < uvs.length; index += 2) {
    const textureU = source[index] ?? 0;
    uvs[index] = direction === "LTR" ? textureU : 1 - textureU;
    uvs[index + 1] = source[index + 1] ?? 0;
  }
  return uvs;
};

const createInspectionTurningSetup = (
  width: number,
  materialOptions: MeshBasicMaterialParameters,
  direction: CatalogItem["direction"],
): InspectionTurningSetup => {
  const inspectionTurningFrontMaterial = new MeshBasicMaterial({
    ...materialOptions,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: FrontSide,
  });
  const inspectionTurningBackMaterial = new MeshBasicMaterial({
    ...materialOptions,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: BackSide,
  });
  const inspectionTurningGeometry = new PlaneGeometry(
    width,
    BOOK_HEIGHT,
    INSPECTION_PAGE_SEGMENTS_X,
    INSPECTION_PAGE_SEGMENTS_Y,
  );
  const turningIndexCount = inspectionTurningGeometry.index?.count ?? 0;
  inspectionTurningGeometry.clearGroups();
  inspectionTurningGeometry.addGroup(0, turningIndexCount, 0);
  inspectionTurningGeometry.addGroup(0, turningIndexCount, 1);
  const inspectionTurningPage = new Mesh(inspectionTurningGeometry, [
    inspectionTurningFrontMaterial,
    inspectionTurningBackMaterial,
  ]);
  const turningUvArray = inspectionTurningGeometry.getAttribute("uv").array;
  const turningPositionArray = inspectionTurningGeometry.getAttribute("position").array;
  const inspectionTurningUvs = createInspectionTurningUvs(turningUvArray, direction);
  const inspectionTurningPositions =
    turningPositionArray instanceof Float32Array ? turningPositionArray : new Float32Array();
  return {
    inspectionTurningBackMaterial,
    inspectionTurningFrontMaterial,
    inspectionTurningPage,
    inspectionTurningPositions,
    inspectionTurningTargets: new Float32Array(inspectionTurningPositions.length),
    inspectionTurningUvs,
  };
};

const finishBookRecord = (
  record: BookRecord,
  retainedGameplay: RetainedBookGameplay | undefined,
  placeBookOnFloor: (record: BookRecord, floorIndex: number, seedValue: string) => void,
  slotIndex: number,
  itemId: string,
) => {
  if (retainedGameplay) {
    record.basePosition.copy(retainedGameplay.basePosition);
    record.baseRotation.copy(retainedGameplay.baseRotation);
    return record;
  }
  if (record.state.status === "floor") placeBookOnFloor(record, slotIndex, itemId);
  return record;
};

const createBookRecord = ({
  exteriorMaterial,
  exteriorUniforms,
  hoverTarget,
  initialTaskBook,
  inspectionBackCover,
  inspectionBackCoverMaterial,
  inspectionFrontCover,
  inspectionFrontCoverMaterial,
  inspectionGroup,
  inspectionLeftAssembly,
  inspectionLeftBlock,
  inspectionLeftMaterial,
  inspectionLeftPage,
  inspectionPaperMaterial,
  inspectionPaperSimulation,
  inspectionRightAssembly,
  inspectionRightBlock,
  inspectionRightMaterial,
  inspectionRightPage,
  inspectionTurningBackMaterial,
  inspectionTurningFrontMaterial,
  inspectionTurningPage,
  inspectionTurningPositions,
  inspectionTurningTargets,
  inspectionTurningUvs,
  item,
  mesh,
  retainedGameplay,
  signature,
  slotIndex,
  spineNormalSign,
  thickness,
  width,
}: BookRecordSetup): BookRecord => {
  const placement = resolveBookPlacement(retainedGameplay, initialTaskBook, slotIndex);
  return {
    atlasPlacement: undefined,
    backTexture: undefined,
    backTextureReady: item.back === undefined,
    backTextureUrl: item.back,
    basePosition: new Vector3(),
    baseRotation: new Vector3(),
    coverTextureUrl: item.cover,
    coverTextureReady: false,
    detailCoverUrl: item.detailCover,
    detailTexture: undefined,
    detailTextureLoading: false,
    detailTextureReady: false,
    exteriorMaterial,
    exteriorUniforms,
    inspectionBackCover,
    inspectionBackCoverMaterial,
    inspectionFrontCover,
    inspectionFrontCoverMaterial,
    inspectionGroup,
    inspectionLightingBlend: 0,
    inspectionLeftAssembly,
    inspectionLeftBlock,
    inspectionLeftMaterial,
    inspectionLeftPage,
    inspectionPaperMaterial,
    inspectionPaperSimulation,
    inspectionRightAssembly,
    inspectionRightBlock,
    inspectionRightMaterial,
    inspectionRightPage,
    inspectionTurningBackMaterial,
    inspectionTurningFrontMaterial,
    inspectionTurningPage,
    inspectionTurningPositions,
    inspectionTurningTargets,
    inspectionTurningUvs,
    hoverTarget,
    mesh,
    physicsRegistered: false,
    publicationAccent: item.accent,
    publicationLanguage: item.language,
    publicationTitle: item.title,
    sceneEmissive: new Color(),
    sceneEmissiveIntensity: 0.2,
    shelfPosition: new Vector3(),
    ...placement,
    signature,
    spineNormalSign,
    spineTexture: undefined,
    spineTextureReady: false,
    spineTextureUrl: item.spine,
    standaloneTexturesReady: false,
    shelfPreview: 0,
    targetLift: 0,
    targetScale: 1,
    thickness,
    texture: undefined,
    width,
  };
};

export const createBook = (
  item: CatalogItem,
  signature: string,
  slotIndex: number,
  initialTaskBook: boolean,
  retainedGameplay: RetainedBookGameplay | undefined,
  placeBookOnFloor: (record: BookRecord, floorIndex: number, seedValue: string) => void,
): BookRecord => {
  const accent = new Color(item.accent);
  const spineNormalSign = item.direction === "LTR" ? -1 : 1;
  const {material: exteriorMaterial, uniforms: exteriorUniforms} = createBookExteriorMaterial(accent, spineNormalSign);
  const width = physicalBookWidth(item.aspectRatio, BOOK_HEIGHT);
  const thickness = physicalBookDepth(item.thicknessMm, BOOK_HEIGHT);
  const mesh = new Mesh(new BoxGeometry(width, BOOK_HEIGHT, thickness), exteriorMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.publicationId = item.id;
  const hoverTarget = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  hoverTarget.name = "shelved-book-hover-target";
  hoverTarget.visible = false;
  hoverTarget.userData.publicationId = item.id;
  // Kept out of the scene graph: it is invisible to rendering and its
  // world matrix is refreshed manually in #syncShelfHoverTarget, so
  // per-frame traversal never needs to visit it.

  const inspectionGroup = new Group();
  inspectionGroup.name = "inspection-pages";
  inspectionGroup.visible = false;
  const inspectionLeftAssembly = new Group();
  const inspectionRightAssembly = new Group();
  inspectionLeftAssembly.name = "inspection-left-half";
  inspectionRightAssembly.name = "inspection-right-half";
  const inspectionPaperMaterial = new MeshStandardMaterial({
    color: "#ded6c5",
    roughness: 0.94,
  });
  const inspectionFrontCoverMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#000000",
    roughness: 0.58,
    side: FrontSide,
  });
  const inspectionBackCoverMaterial = new MeshStandardMaterial({
    color: accent.clone().multiplyScalar(0.76),
    emissive: "#000000",
    roughness: 0.74,
    side: FrontSide,
  });
  const paperBlockDepth = Math.max(0.012, thickness);
  const pageCenterOffset = width / 2 + INSPECTION_PAGE_GUTTER / 2;
  const inspectionLeftBlock = new Mesh(new BoxGeometry(width, BOOK_HEIGHT, paperBlockDepth), inspectionPaperMaterial);
  const inspectionRightBlock = new Mesh(new BoxGeometry(width, BOOK_HEIGHT, paperBlockDepth), inspectionPaperMaterial);
  inspectionLeftBlock.name = "inspection-left-paper-block";
  inspectionRightBlock.name = "inspection-right-paper-block";
  inspectionLeftBlock.position.x = -pageCenterOffset;
  inspectionRightBlock.position.x = pageCenterOffset;
  const inspectionFrontCover = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionFrontCoverMaterial);
  inspectionFrontCover.name = "inspection-front-cover-art";
  inspectionFrontCover.castShadow = true;
  inspectionFrontCover.receiveShadow = true;
  inspectionFrontCover.rotation.y = Math.PI;
  inspectionFrontCover.position.set(
    item.direction === "LTR" ? -pageCenterOffset : pageCenterOffset,
    0,
    -paperBlockDepth / 2 - INSPECTION_SURFACE_GAP * 2,
  );
  const inspectionBackCover = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionBackCoverMaterial);
  inspectionBackCover.name = "inspection-back-cover-art";
  inspectionBackCover.castShadow = true;
  inspectionBackCover.receiveShadow = true;
  inspectionBackCover.rotation.y = Math.PI;
  inspectionBackCover.position.copy(inspectionFrontCover.position);
  inspectionBackCover.visible = false;
  for (const structure of [inspectionLeftBlock, inspectionRightBlock]) {
    structure.castShadow = true;
    structure.receiveShadow = true;
  }
  const inspectionMaterialOptions = {
    color: INSPECTION_READER_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide,
    toneMapped: false,
  } as const;
  const inspectionLeftMaterial = new MeshBasicMaterial(inspectionMaterialOptions);
  const inspectionRightMaterial = new MeshBasicMaterial(inspectionMaterialOptions);
  const inspectionLeftPage = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionLeftMaterial);
  const inspectionRightPage = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionRightMaterial);
  const inspectionTurning = createInspectionTurningSetup(width, inspectionMaterialOptions, item.direction);
  const {
    inspectionTurningBackMaterial,
    inspectionTurningFrontMaterial,
    inspectionTurningPage,
    inspectionTurningPositions,
    inspectionTurningTargets,
    inspectionTurningUvs,
  } = inspectionTurning;
  inspectionLeftPage.name = "inspection-left-page";
  inspectionRightPage.name = "inspection-right-page";
  inspectionTurningPage.name = "inspection-turning-page";
  inspectionTurningPage.frustumCulled = false;
  inspectionTurningPage.visible = false;
  inspectionLeftPage.position.set(-pageCenterOffset, 0, thickness / 2 + INSPECTION_SURFACE_GAP);
  inspectionRightPage.position.set(pageCenterOffset, 0, thickness / 2 + INSPECTION_SURFACE_GAP);
  inspectionLeftPage.renderOrder = 20;
  inspectionRightPage.renderOrder = 20;
  inspectionTurningPage.renderOrder = 30;
  inspectionLeftAssembly.add(inspectionLeftBlock, inspectionLeftPage);
  inspectionRightAssembly.add(inspectionRightBlock, inspectionRightPage);
  const inspectionOuterCoverAssembly = item.direction === "LTR" ? inspectionLeftAssembly : inspectionRightAssembly;
  inspectionOuterCoverAssembly.add(inspectionFrontCover, inspectionBackCover);
  inspectionGroup.add(inspectionLeftAssembly, inspectionRightAssembly, inspectionTurningPage);
  mesh.add(inspectionGroup);

  const record = createBookRecord({
    exteriorMaterial,
    exteriorUniforms,
    hoverTarget,
    initialTaskBook,
    inspectionBackCover,
    inspectionBackCoverMaterial,
    inspectionFrontCover,
    inspectionFrontCoverMaterial,
    inspectionGroup,
    inspectionLeftAssembly,
    inspectionLeftBlock,
    inspectionLeftMaterial,
    inspectionLeftPage,
    inspectionPaperMaterial,
    inspectionPaperSimulation: new PaperSheetSimulation({
      columns: INSPECTION_PAGE_SEGMENTS_X + 1,
      height: BOOK_HEIGHT,
      rows: INSPECTION_PAGE_SEGMENTS_Y + 1,
      uvs: inspectionTurningUvs,
      width,
    }),
    inspectionRightAssembly,
    inspectionRightBlock,
    inspectionRightMaterial,
    inspectionRightPage,
    inspectionTurningBackMaterial,
    inspectionTurningFrontMaterial,
    inspectionTurningPage,
    inspectionTurningPositions,
    inspectionTurningTargets,
    inspectionTurningUvs,
    item,
    mesh,
    retainedGameplay,
    signature,
    slotIndex,
    spineNormalSign,
    thickness,
    width,
  });
  return finishBookRecord(record, retainedGameplay, placeBookOnFloor, slotIndex, item.id);
};
