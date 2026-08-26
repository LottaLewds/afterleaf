import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
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
}: BookRecordSetup): BookRecord => ({
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
  shelfOffset: retainedGameplay?.shelfOffset ?? (initialTaskBook ? 0 : faceDisplayShelfOffset(slotIndex)),
  shelfPresentation: retainedGameplay?.shelfPresentation ?? (initialTaskBook ? "spine" : "face"),
  signature,
  slotIndex: retainedGameplay?.slotIndex ?? slotIndex,
  spineNormalSign,
  spineTexture: undefined,
  spineTextureReady: false,
  spineTextureUrl: item.spine,
  standaloneTexturesReady: false,
  state:
    retainedGameplay?.state ??
    (initialTaskBook
      ? {status: "floor"}
      : {
          shelfId: faceDisplayShelfId(Math.floor(slotIndex / FACE_DISPLAY_COLUMNS) % FACE_DISPLAY_ROWS),
          slotIndex: slotIndex % FACE_DISPLAY_COLUMNS,
          status: "shelved",
        }),
  taskBook: retainedGameplay?.taskBook ?? initialTaskBook,
  shelfPreview: 0,
  targetLift: 0,
  targetScale: 1,
  thickness,
  texture: undefined,
  width,
});

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
  const inspectionTurningFrontMaterial = new MeshBasicMaterial({
    ...inspectionMaterialOptions,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: FrontSide,
  });
  const inspectionTurningBackMaterial = new MeshBasicMaterial({
    ...inspectionMaterialOptions,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: BackSide,
  });
  const inspectionLeftPage = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionLeftMaterial);
  const inspectionRightPage = new Mesh(new PlaneGeometry(width, BOOK_HEIGHT), inspectionRightMaterial);
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
  const inspectionTurningUvs =
    turningUvArray instanceof Float32Array ? new Float32Array(turningUvArray.length) : new Float32Array();
  const inspectionTurningPositions =
    turningPositionArray instanceof Float32Array ? turningPositionArray : new Float32Array();
  const inspectionTurningTargets = new Float32Array(inspectionTurningPositions.length);
  for (let index = 0; index < inspectionTurningUvs.length; index += 2) {
    const textureU = turningUvArray[index] ?? 0;
    inspectionTurningUvs[index] = item.direction === "LTR" ? textureU : 1 - textureU;
    inspectionTurningUvs[index + 1] = turningUvArray[index + 1] ?? 0;
  }
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
  if (retainedGameplay) {
    record.basePosition.copy(retainedGameplay.basePosition);
    record.baseRotation.copy(retainedGameplay.baseRotation);
  } else if (record.state.status === "floor") placeBookOnFloor(record, slotIndex, item.id);

  return record;
};
