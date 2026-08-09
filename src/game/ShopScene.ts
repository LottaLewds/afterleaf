import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BatchedMesh,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  FogExp2,
  FrontSide,
  Group,
  ImageBitmapLoader,
  LinearFilter,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Path,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {DEV} from "solid-js";

import type {ArtFrameFit} from "~/artFrames/aspect";
import {artFrameChannelId} from "~/artFrames/protocol";
import type {ArtFrameChannel, ArtFrameImage} from "~/artFrames/protocol";
import floorAlbedoUrl from "~/assets/materials/laminate-floor-albedo.webp";
import floorNormalUrl from "~/assets/materials/laminate-floor-normal.webp";
import floorSurfaceUrl from "~/assets/materials/laminate-floor-surface.webp";
import moonriseSkyUrl from "~/assets/materials/qwantani-moonrise-sky.webp";
import crtTvModelUrl from "~/assets/models/crt-tv.glb?url";
import lampModelUrl from "~/assets/models/lamp.glb?url";
import trashCanModelUrl from "~/assets/models/trash_can.glb?url";
import type {
  CatalogAtlases,
  CatalogIdentity,
  CatalogItem,
  CatalogShelfAtlas,
} from "~/catalog";
import {bookDropPosition} from "~/game/bookDropPlacement";
import {physicalBookDepth, physicalBookWidth} from "~/game/bookDimensions";
import {remapBookGeometryToAtlas} from "~/game/bookAtlasGeometry";
import {DigitalArtFrame} from "~/game/DigitalArtFrame";
import {PageTextureCache} from "~/game/PageTextureCache";
import {PaperSheetSimulation} from "~/game/PaperSheetSimulation";
import {ShopAudioManager} from "~/game/ShopAudioManager";
import {
  createWallpaperBoxGeometry,
  createWallpaperMaterial,
} from "~/game/wallpaperMaterials";
import {
  easeTurnProgress,
  getPageBlockSplit,
  writeActiveLeafDeformation,
  writeActiveLeafPositions,
  type ActiveLeafDeformationTarget,
  type ActiveLeafVertex,
} from "~/game/PageTurnGeometry";
import {
  clampLookDeltaMagnitude,
  dampLookAngles,
  getPlanarMovement,
  isPlausiblePointerMovement,
  isPointInsideShopObstacle,
  resolvePlayerGrounded,
  resolveShopMovement,
  transitionBookInteraction,
  updateLookAngles,
  type BookInteractionState,
  type LookAngles,
  type PlanarMovementInput,
  type PlanarPoint,
  type ShopCollisionWorld,
} from "~/game/shopGameplay";
import {
  createStackableStairBoxes,
  SHOP_ATRIUM,
  SHOP_ATRIUM_RAIL_FLOOR_INSET,
  SHOP_EXPANSION_WALL_BOXES,
  SHOP_THEATRE,
  SHOP_THEATRE_HALL,
  SHOP_TV_CAVE,
  SHOP_TV_CAVE_DOOR_CENTER_Z,
  SHOP_TV_CAVE_HALL,
  SHOP_UPPER_STACK_CENTER_X,
  SHOP_UPPER_STACK_LENGTH,
  SHOP_UPPER_STACK_ZS,
  SHOP_UPPER_CEILING_Y,
  SHOP_UPPER_FLOOR_BOXES,
  SHOP_UPPER_FLOOR_Y,
  SHOP_STAIR_RAIL_INSET,
  SHOP_STAIR_ROOM,
} from "~/game/shopExpansionLayout";
import {
  findAdjacentShelfBook,
  insertSpineShelfBook,
  type ShelfPresentation,
  type SpineShelfPlacement,
} from "~/game/shelfPlacement";
import {
  READING_FURNITURE_BOXES,
  READING_TABLE_Z_POSITIONS,
  READING_TABLE_SIZE,
  SHOP_BOUNDS,
  SHOP_INTERIOR_FOOTPRINTS,
  SHOP_MODEL_TELEVISION_POSITION,
  SHOP_MODEL_TELEVISION_SCALE,
  SHOP_MODEL_TELEVISION_SIZE,
  SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
  SHOP_STAIR_OPENING_WIDTH,
  type ReadingFurnitureBox,
  type ReadingFurnitureMaterial,
} from "~/game/shopLayout";
import {
  ShopPhysicsWorld,
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  SHOP_PHYSICS_TRASH_HALF_EXTENT,
  SHOP_PHYSICS_TRASH_POSITION_X,
  SHOP_PHYSICS_TRASH_POSITION_Z,
  type BookPhysicsPose,
  type MutableBookPhysicsTransform,
  type MutablePlayerMovement,
  type PhysicsPropColliderDefinition,
} from "~/game/ShopPhysicsWorld";
import {
  CRT_TV_SAFE_AREA,
  ShopTelevision,
  type ShopTelevisionInteraction,
} from "~/game/ShopTelevision";
import {
  WORLD_SAVE_SCHEMA_VERSION,
  worldSaveCanReconcileCatalog,
  worldSaveMatchesCatalog,
  type WorldBookSave,
  type WorldDigitalArtFrameSave,
  type WorldPosterSave,
  type WorldPropSave,
  type WorldSaveV1,
} from "~/game/worldSave";
import {
  createWoodBoxGeometry,
  createWoodMaterial,
  loadWoodTextures,
} from "~/game/woodMaterials";
import {
  detectWideReaderPage,
  getWideReaderPageIndices,
  mirrorReaderPageHorizontalRange,
  readerPageHalf,
  readerPageSourceUrl,
  readerPageTextureUrl,
  subscribeToWideReaderPages,
} from "~/reader/pageSpreadDetection";
import {ReaderPagePreloader} from "~/reader/ReaderPagePreloader";
import {createReaderPagePreloadPlan} from "~/reader/pagePreloadPlan";
import {
  READER_PAGE_TEXTURE_CACHE_SIZE,
  clampPageIndex,
  getAdjacentSpreadStart,
  getArrowNavigation,
  getReaderSpread,
  getReaderSpreadSides,
  type ReaderNavigation,
} from "~/reader/pagination";
import {
  DEFAULT_TV_CHANNEL_ID,
  tvVideoImportUrl,
  type TvChannel,
  type TvVideo,
} from "~/tv/protocol";
import type {PosterAsset} from "~/posters/protocol";

const FACE_DISPLAY_COLUMNS = 8;
const FACE_DISPLAY_ROWS = 4;
const FACE_SHELF_SLOT_COUNT = FACE_DISPLAY_COLUMNS * FACE_DISPLAY_ROWS;
const FACE_SHELF_ID = "new-arrivals";
const FACE_DISPLAY_SHELF_HALF_WIDTH = 4.4;
const FACE_DISPLAY_SHELF_INSET = 0.15;
const FACE_DISPLAY_SHELF_FRONT_Z = -9.54;
const FACE_OUT_SHELF_INSET = 0.1;
const SHOP_PLAYER_START_X = 0;
const SHOP_PLAYER_START_Z = 25;
const SPINE_SHELF_GAP = 0.018;
const SPINE_SHELF_BACKING_THICKNESS = 0.14;
const SPECIAL_COLLECTION_BACKING_THICKNESS = 0.22;
const BOOK_HEIGHT = 0.74;
const BOOK_VOID_RECOVERY_Y = -BOOK_HEIGHT / 2;
const BOOK_UNDER_SHELF_RECOVERY_Y = BOOK_HEIGHT / 2;
const MAX_PIXEL_RATIO = 1.75;
const PLAYER_RADIUS = 0.3;
const WALK_SPEED = 2.65;
const SPRINT_SPEED = 4.35;
const PLAYER_GRAVITY = -18;
const PLAYER_JUMP_SPEED = 6.2;
const PLAYER_JUMP_BUFFER_MS = 160;
const PLAYER_JUMP_COYOTE_MS = 160;
const PLAYER_TERMINAL_VELOCITY = -24;
const THROW_CHARGE_SECONDS = 1.8;
const THROW_MIN_SPEED = 8.5;
const THROW_MAX_SPEED = 13.5;
const THROW_MIN_LIFT = 1.4;
const THROW_MAX_LIFT = 15;
const SHELF_INTERACTION_DISTANCE = 2.75;
const INTERACTION_DISTANCE = SHELF_INTERACTION_DISTANCE;
const TRASH_INTERACTION_DISTANCE = 2.65;
const TRASH_CAN_HEIGHT = 0.9;
const TRASH_CAN_PROP_ID = "discard-trashcan";
const TRASH_CAN_SIZE = SHOP_PHYSICS_TRASH_HALF_EXTENT * 2;
const SIGN_INTERACTION_DISTANCE = 3.4;
const TELEVISION_INTERACTION_DISTANCE = 3.6;
const MOVABLE_PROP_INTERACTION_DISTANCE = 4;
const POSTER_INTERACTION_DISTANCE = 4;
const POSTER_PLACEMENT_DISTANCE = POSTER_INTERACTION_DISTANCE * 2;
const POSTER_CATALOG_REFRESH_INTERVAL_MS = 3_000;
const DEFAULT_POSTER_HEIGHT = 1.15;
const MIN_POSTER_HEIGHT = 0.2;
const MAX_POSTER_HEIGHT = 3.8;
const POSTER_SURFACE_MARGIN = 0.08;
const POSTER_SURFACE_OFFSET = 0.012;
const POSTER_WHEEL_ROTATION_STEP = MathUtils.degToRad(1);
const TV_WHEEL_SCRUB_RESET_MS = 900;
const TV_WHEEL_SCRUB_STEPS_SECONDS = [3, 5, 10, 15, 30] as const;
const TV_CHANNEL_SHARED_CACHE_MS = 2_500;
const DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS = 30;
const DIGITAL_ART_FRAME_INTERVALS = [0, 10, 30, 60, 300] as const;
const DIGITAL_ART_FRAME_BORDER = 0.09;
const ART_FRAME_TEXTURE_UPLOAD_IDLE_BUDGET_MS = 6;
const MAX_UNUSED_ART_FRAME_TEXTURES = 8;
const TELEVISION_TABLE_SHELF_ID = "television-table:lower";
const MODEL_TELEVISION_PHYSICS_ID = "crt-television";
const FIXED_TELEVISION_SAVE_ID = "fixed";
const MOVABLE_TELEVISION_SAVE_ID = "movable";
const THEATRE_TELEVISION_SAVE_ID = "moonlight-theatre";
const LEGACY_MODEL_TELEVISION_ROTATION = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI,
);
const DISCARD_TOSS_DURATION_SECONDS = 0.52;
const LOOK_SENSITIVITY = 0.0021;
const LOOK_SMOOTHING = 32;
const MAX_LOOK_DELTA_PER_FRAME = (Math.PI / 180) * 10;
const WORLD_SAVE_INTERVAL_MS = 10_000;
const WORLD_SAVE_IDLE_TIMEOUT_MS = 250;
const INSPECTION_PAGE_GUTTER = 0;
const INSPECTION_SURFACE_GAP = 0.001;
const INSPECTION_FRAME_FILL = 0.88;
const INSPECTION_OPEN_ANGLE = Math.PI;
const INSPECTION_COVER_ANIMATION_SPEED = 7.5;
const INSPECTION_ACTION_CLOSE_SPEED = 18;
const INSPECTION_OPENING_DELAY_SECONDS = 0.22;
const INSPECTION_READER_COLOR = "#f6f2e8";
const INSPECTION_LIGHTING_BLEND_SPEED = 8;
const INSPECTION_READER_EMISSIVE = new Color("#fff0d8");
const INSPECTION_READER_EMISSIVE_INTENSITY = 0.62;
const INSPECTION_PAGE_DEFORMATION = {
  maxCurl: 0.1,
  maxTorsion: 0.008,
} as const;
const INSPECTION_PAGE_DRAG_FOLLOW_SPEED = 26;
const INSPECTION_PAGE_SEGMENTS_X = 20;
const INSPECTION_PAGE_SEGMENTS_Y = 12;
const INSPECTION_PAGE_TURN_SPEED = 12;
const INSPECTION_TRANSITION_SPEED = 12;
const INSPECTION_TRANSITION_POSITION_EPSILON_SQ = 1e-6;
const INSPECTION_TRANSITION_ROTATION_EPSILON = 1e-6;
const SHELF_PREVIEW_PULL_END = 0.58;
const SHELF_PREVIEW_ROTATION_START = 0.64;
const SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS = 0.96;
const SHELF_PREVIEW_SPEED = 10;
const SHELF_PREVIEW_TRANSLATION_SPEED =
  SHELF_PREVIEW_SPEED / SHELF_PREVIEW_PULL_END;
const SHELF_PREVIEW_ROTATION_SPEED =
  SHELF_PREVIEW_SPEED / (1 - SHELF_PREVIEW_ROTATION_START);
const SHELF_RETURN_CLOSE_HANDOFF_ANGLE = 0.03;
const SHELF_RETURN_ROTATION_HANDOFF_EPSILON = 1e-4;
const SHELF_BROWSE_INTERVAL_MS = 140;
const DESK_LAMP_HEIGHT = 0.64;
const DESK_LAMP_SPAWN_CLEARANCE = 0.015;
const CRT_TABLE_DESK_LAMP_SPAWN_CLEARANCE = 0.08;
const READING_TABLE_SURFACE_Y = 0.91;
const CARRIED_PROP_OPACITY = 0.32;
const PROP_MAX_PROJECTION_DISTANCE = 6;
const PROP_MIN_PROJECTION_DISTANCE = 0.9;
const PROP_PLACEMENT_GRID_SIZE = 0.25;
const PROP_PLACEMENT_HEIGHT_STEP = 0.125;
const PROP_ROTATION_SENSITIVITY = 0.006;
const PROP_ROTATION_SNAP_STEP = MathUtils.degToRad(15);
const PROP_SUPPORT_SNAP_DISTANCE = 0.65;
const CEILING_LIGHT_COLUMNS = [-7, 0, 7] as const;
const CEILING_LIGHT_ROWS = [-7, -1.5, 4, 9.5, 15, 20.5, 26] as const;
const RARE_ROOM_CENTER_X = 8.25;
const RARE_ROOM_CENTER_Z = -6.25;
const RARE_ROOM_DOOR_CENTER_X = 8.4;
const RARE_ROOM_DOOR_Z = -1.92;
const UPPER_WINDOW_CENTERS = [-8.25, 0, 8.25] as const;
const UPPER_WINDOW_WIDTH = 4.8;
const UPPER_WINDOW_HEIGHT = 3.5;
const LEGACY_TV_CAVE_BOUNDS = Object.freeze({
  maxX: 23.5,
  maxZ: 11.5,
  minX: 16.5,
  minZ: 2.5,
});
const SHOP_COLLISION_WORLD: ShopCollisionWorld = {
  bounds: SHOP_BOUNDS,
  obstacles: SHOP_INTERIOR_FOOTPRINTS,
};

type AutomaticDoor = {
  centerX: number;
  centerZ: number;
  open: number;
  openAngle: number;
  pivot: Group;
};

type ReadingFurnitureMaterials = Record<
  ReadingFurnitureMaterial,
  MeshStandardMaterial
>;

type SpineShelfDefinition = {
  axis: Vector3;
  faceInset: number;
  faceTilt: number;
  frontCenter: Vector3;
  halfWidth: number;
  id: string;
  normal: Vector3;
};

const faceDisplayShelfId = (row: number) => `${FACE_SHELF_ID}:row:${row}`;

const faceDisplayShelfOffset = (slotIndex: number) => {
  const column = slotIndex % FACE_DISPLAY_COLUMNS;
  return (column - (FACE_DISPLAY_COLUMNS - 1) / 2) * 1.12;
};

type ShelfTargetSelection = {
  offset: number;
  placements?: readonly SpineShelfPlacement[];
  presentation: ShelfPresentation;
  shelfId: string;
  slotIndex: number;
};

type PosterSurface = {
  height: number;
  target: Mesh<PlaneGeometry, MeshBasicMaterial>;
  width: number;
};

type PosterRecord = {
  asset: PosterAsset;
  height: number;
  id: string;
  mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  rotation: number;
};

type PosterPlacementSession = {
  assetIndex: number;
  desiredHeight: number;
  gridSnap: boolean;
  movingPosterId?: string;
  rotation: number;
};

type PosterPlacementSelection = {
  height: number;
};

type DigitalArtFrameRecord = {
  frame: DigitalArtFrame;
  height: number;
  id: string;
  rotation: number;
};

type ArtFrameTextureCacheEntry = {
  lastUsed: number;
  loadState: ArtFrameTextureLoadState;
  promise: Promise<Texture>;
  references: number;
};

type ArtFrameTextureLoadState = {
  preparation?: ArtFrameTexturePreparation;
  priority: "display" | "preload";
};

type ArtFrameTexturePreparation = {
  loadState: ArtFrameTextureLoadState;
  resolve: () => void;
  texture: Texture;
};

type DigitalArtFramePlacementSession = {
  assetIndex: number;
  aspectRatio: number;
  channelId: string;
  desiredHeight: number;
  fit: ArtFrameFit;
  gridSnap: boolean;
  intervalSeconds: number;
  movingFrameId?: string;
  rotation: number;
};

type DigitalArtFramePlacementSelection = {
  height: number;
};

type DigitalArtFramePasteTarget =
  | {channelId: string; kind: "placement"}
  | {channelId: string; frameId: string; kind: "frame"};

type PropMaterialSwap = {
  material: Material | Material[];
  mesh: Mesh;
  renderOrder: number;
};

type MovablePropRecord = {
  currentPosition: Vector3;
  currentRotation: Quaternion;
  placementStartPosition?: Vector3;
  placementStartRotation?: Quaternion;
  ghostMaterialSwaps: PropMaterialSwap[];
  halfDepth: number;
  halfHeight: number;
  halfWidth: number;
  heldLocalPosition: Vector3;
  id: string;
  label: string;
  object: Object3D;
  persistInWorldProps: boolean;
  placementSupport: Object3D;
  rotationSnapStep: number;
};

type PropPlacementSupport = {
  bounds?: Box3;
  object?: Object3D;
  owner?: MovablePropRecord;
};

type MovablePropRegistration = {
  colliderParts?: readonly PhysicsPropColliderDefinition[];
  density?: number;
  depth: number;
  staticWhenPlaced?: boolean;
  heldLocalPosition: Vector3;
  height: number;
  id: string;
  label: string;
  object: Object3D;
  persistInWorldProps?: boolean;
  placementSupport?: Object3D;
  rotationSnapStep?: number;
  targetable?: boolean;
  width: number;
};

export type ShopSignKind = "aisle" | "shelf";

export type ShopSignEditRequest = {
  id: string;
  kind: ShopSignKind;
  label: string;
  subtitle: string;
  title: string;
};

type ShopSignSlot = ShopSignEditRequest & {
  backgroundColor: string;
  column?: number;
  group: Group;
  height: number;
  sign: Group | undefined;
  target: Mesh<PlaneGeometry, MeshBasicMaterial>;
  width: number;
};

type DiscardAnimation = {
  elapsedSeconds: number;
  publicationId: string;
  startPosition: Vector3;
  startRotation: Quaternion;
};

type InspectionCloseAction = "drop" | "return" | "throw";

type InspectionMode = "closing" | "none" | "spread";

type InspectionShelfReturnPhase = "close" | "rotate" | "translate";

type BookExteriorUniforms = {
  backMap: {value: Texture | null};
  backMapEnabled: {value: boolean};
  backTint: {value: Color};
  coverMap: {value: Texture | null};
  edgeTint: {value: Color};
  pageTint: {value: Color};
  spineMap: {value: Texture | null};
  spineMapEnabled: {value: boolean};
  spineNormalSign: {value: number};
  spineTint: {value: Color};
};

type BookAtlasTextures = {
  back: Texture;
  front: Texture;
  spine: Texture;
};

type BookAtlasBatch = {
  material: MeshStandardMaterial;
  mesh: BatchedMesh;
};

type BookAtlasPlacement = {
  batch: BookAtlasBatch;
  instanceId: number;
  lastMatrix: Matrix4;
  visible: boolean;
};

type BookRecord = {
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

type RetainedBookGameplay = Pick<
  BookRecord,
  "shelfOffset" | "shelfPresentation" | "slotIndex" | "state" | "taskBook"
> & {
  basePosition: Vector3;
  baseRotation: Vector3;
};

export type ShopInteraction = {
  key: string;
  label: string;
};

export type ShopGameSnapshot = {
  interactionContext?: string;
  interactions?: readonly ShopInteraction[];
  carriedPublicationId?: string;
  discardBusy?: boolean;
  discardError?: string;
  inspectionBookOpen?: boolean;
  inspectionCanTurnBackward?: boolean;
  inspectionCanTurnForward?: boolean;
  inspectionPageCount?: number;
  inspectionPageIndex?: number;
  inspectionPagesLoading?: boolean;
  looseCount: number;
  inspectionMode: InspectionMode;
  physicsReady: boolean;
  pointerLocked: boolean;
  posterCount: number;
  posterImportError?: string;
  posterImporting?: boolean;
  posterPlacementActive?: boolean;
  digitalArtFrameCount?: number;
  digitalArtFrameImportError?: string;
  digitalArtFrameImporting?: boolean;
  digitalArtFramePlacementActive?: boolean;
  tvVideoImportError?: string;
  tvVideoImporting?: boolean;
  tvVideoImportMessage?: string;
  prompt?: string;
  shelvedCount: number;
  throwCharge?: number;
};

export type ShopSceneOptions = {
  canvas: HTMLCanvasElement;
  catalogAtlases: () => CatalogAtlases;
  catalogIdentity: () => CatalogIdentity;
  catalogItems: () => readonly CatalogItem[];
  initialWorldSave?: WorldSaveV1;
  initialPageIndex?: (publicationId: string) => number;
  importArtFrameImage?: (
    image: Blob,
    channelId: string,
    signal: AbortSignal,
  ) => Promise<ArtFrameImage>;
  loadArtFrameChannels?: (
    signal: AbortSignal,
  ) => Promise<readonly ArtFrameChannel[]>;
  loadTvChannels?: (signal: AbortSignal) => Promise<readonly TvChannel[]>;
  loadPosters?: (signal: AbortSignal) => Promise<readonly PosterAsset[]>;
  importPoster?: (image: Blob, signal: AbortSignal) => Promise<PosterAsset>;
  importTvVideo?: (
    url: string,
    channelId: string,
    signal: AbortSignal,
  ) => Promise<TvVideo>;
  mouseSensitivity?: () => number;
  newPublicationIds?: () => readonly string[];
  onDiscardPublication?: (publicationId: string) => Promise<boolean>;
  onArtFrameChannelCreateRequest?: (currentChannelLabel: string) => void;
  onGameStateChange?: (snapshot: ShopGameSnapshot) => void;
  onPauseRequest?: () => void;
  onPageIndexChange?: (publicationId: string, pageIndex: number) => void;
  onSignEditRequest?: (request: ShopSignEditRequest) => void;
  onTextPaste?: (text: string) => boolean | Promise<boolean>;
  onWorldSave?: (save: WorldSaveV1) => boolean | void | Promise<boolean | void>;
  selectedPublicationId: () => string | null | undefined;
  onSelectPublication: (publicationId: string) => void;
  onReady?: () => void;
  paused?: () => boolean;
};

type ShopPerformanceDebugHandle = {
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  scene: Scene;
};

type ShopPerformanceDebugWindow = Window & {
  __AFTERLEAF_PERFORMANCE_DEBUG__?: ShopPerformanceDebugHandle;
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const normalizePosterRotation = (rotation: number) =>
  MathUtils.euclideanModulo(rotation + Math.PI, Math.PI * 2) - Math.PI;

const STANDALONE_BOOK_TEXTURE_CACHE_SIZE = 24;

const shopSignKey = (kind: ShopSignKind, id: string) => `${kind}:${id}`;

const invertPageTurnEasing = (easedProgress: number) => {
  if (easedProgress <= 0) return 0;
  if (easedProgress >= 1) return 1;
  let minimum = 0;
  let maximum = 1;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const midpoint = (minimum + maximum) / 2;
    if (easeTurnProgress(midpoint) < easedProgress) minimum = midpoint;
    else maximum = midpoint;
  }
  return (minimum + maximum) / 2;
};

const createBookExteriorMaterial = (
  accent: Color,
  spineNormalSign: -1 | 1,
  atlasUvs = false,
) => {
  const uniforms: BookExteriorUniforms = {
    backMap: {value: null},
    backMapEnabled: {value: false},
    backTint: {value: accent.clone().multiplyScalar(0.76)},
    coverMap: {value: null},
    edgeTint: {value: accent.clone().multiplyScalar(0.62)},
    pageTint: {value: new Color("#d8cfba")},
    spineMap: {value: null},
    spineMapEnabled: {value: false},
    spineNormalSign: {value: spineNormalSign},
    spineTint: {value: accent.clone().multiplyScalar(0.62)},
  };
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#000000",
    roughness: 0.68,
  });
  material.customProgramCacheKey = () =>
    `afterleaf-book-exterior-v4-${atlasUvs ? "atlas" : "standalone"}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float spineNormalSign;
${atlasUvs ? "attribute vec2 bookSpineUv;\nvarying vec2 vBookSpineUv;" : ""}
varying vec2 vBookUv;
varying float vBookFace;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
vBookUv = uv;
${atlasUvs ? "vBookSpineUv = bookSpineUv;" : ""}
if (objectNormal.z > 0.5) vBookFace = 1.0;
else if (objectNormal.z < -0.5) vBookFace = 2.0;
else if (objectNormal.x * spineNormalSign > 0.5) vBookFace = 3.0;
else if (abs(objectNormal.y) > 0.5) vBookFace = 4.0;
else vBookFace = 5.0;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D backMap;
uniform bool backMapEnabled;
uniform vec3 backTint;
uniform sampler2D coverMap;
uniform vec3 edgeTint;
uniform vec3 pageTint;
uniform sampler2D spineMap;
uniform bool spineMapEnabled;
uniform vec3 spineTint;
varying vec2 vBookUv;
${atlasUvs ? "varying vec2 vBookSpineUv;" : ""}
varying float vBookFace;`,
      )
      .replace(
        "#include <map_fragment>",
        `vec4 bookSurface;
if (vBookFace < 1.5) bookSurface = texture2D(coverMap, vBookUv);
else if (vBookFace < 2.5 && backMapEnabled)
  bookSurface = texture2D(backMap, vBookUv);
else if (vBookFace < 2.5) bookSurface = vec4(backTint, 1.0);
else if (vBookFace < 3.5 && spineMapEnabled)
  bookSurface = texture2D(spineMap, ${atlasUvs ? "vBookSpineUv" : "vBookUv"});
else if (vBookFace < 3.5) bookSurface = vec4(spineTint, 1.0);
else if (vBookFace < 4.5) bookSurface = vec4(pageTint, 1.0);
else bookSurface = vec4(edgeTint, 1.0);
diffuseColor *= bookSurface;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `if (vBookFace < 1.5)
  totalEmissiveRadiance *= texture2D(coverMap, vBookUv).rgb;
else if (vBookFace < 2.5 && backMapEnabled)
  totalEmissiveRadiance *= texture2D(backMap, vBookUv).rgb;
else if (vBookFace > 3.5) totalEmissiveRadiance = vec3(0.0);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor;
if (vBookFace < 1.5) roughnessFactor = 0.58;
else if (vBookFace < 2.5) roughnessFactor = 0.74;
else if (vBookFace < 3.5) roughnessFactor = 0.68;
else if (vBookFace < 4.5) roughnessFactor = 0.92;
else roughnessFactor = 0.62;`,
      );
  };
  return {material, uniforms};
};

const disposeMaterial = (material: Material, textures: Set<Texture>) => {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) textures.add(value);
  }
  material.dispose();
};

const disposeObject = (root: Object3D) => {
  const batchedMeshes = new Set<BatchedMesh>();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof BatchedMesh) batchedMeshes.add(object);
    else geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });

  for (const geometry of geometries) geometry.dispose();
  for (const batchedMesh of batchedMeshes) batchedMesh.dispose();
  for (const material of materials) disposeMaterial(material, textures);
  for (const texture of textures) texture.dispose();
};

/**
 * A deliberately bounded visual scene: one persistent renderer and at most
 * twenty interactive covers. The accessors keep catalog ownership in Solid
 * while this runtime owns only imperative Three resources.
 */
export class ShopScene {
  static readonly #modelLoader = new GLTFLoader();

  readonly #abortController = new AbortController();
  readonly #catalogAtlases: () => CatalogAtlases;
  readonly #audioManager = new ShopAudioManager();
  readonly #bookAtlasBatches: BookAtlasBatch[] = [];
  readonly #bookAtlasTextures: BookAtlasTextures[] = [];
  readonly #booksById = new Map<string, BookRecord>();
  readonly #standaloneBookTexturePublicationIds = new Set<string>();
  readonly #camera = new PerspectiveCamera(48, 1, 0.1, 45);
  readonly #canvas: HTMLCanvasElement;
  readonly #catalogIdentity: () => CatalogIdentity;
  readonly #catalogItems: () => readonly CatalogItem[];
  readonly #heldLocalPosition = new Vector3(0.5, -0.36, -1.08);
  readonly #heldLocalRotation = new Quaternion().setFromEuler(
    new Euler(-0.16, -0.48, -0.08),
  );
  readonly #heldTargetPosition = new Vector3();
  readonly #heldTargetRotation = new Quaternion();
  readonly #heldTargetPose: BookPhysicsPose = {
    position: this.#heldTargetPosition,
    rotation: this.#heldTargetRotation,
  };
  readonly #initialPageIndex: (publicationId: string) => number;
  readonly #importPoster:
    | ((image: Blob, signal: AbortSignal) => Promise<PosterAsset>)
    | undefined;
  readonly #importArtFrameImage:
    | ((
        image: Blob,
        channelId: string,
        signal: AbortSignal,
      ) => Promise<ArtFrameImage>)
    | undefined;
  readonly #importTvVideo:
    | ((
        url: string,
        channelId: string,
        signal: AbortSignal,
      ) => Promise<TvVideo>)
    | undefined;
  readonly #onTextPaste:
    | ((text: string) => boolean | Promise<boolean>)
    | undefined;
  readonly #inspectionPointerNdc = new Vector2();
  readonly #inspectionLocalPosition = new Vector3();
  readonly #inspectionLocalRotation = new Quaternion();
  readonly #inspectionShelfWorldRotation = new Quaternion();
  readonly #inspectionPageTextureCache = new PageTextureCache<Texture>({
    load: (url) => this.#loadInspectionPageTexture(url),
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
    onLoadingChange: (count) => {
      this.#inspectionPageLoadCount = count;
      if (!this.#disposed) this.#emitGameState();
    },
  });
  readonly #inspectionPagePreloader = new ReaderPagePreloader({
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
  });
  readonly #inspectionLeafDeformation: ActiveLeafDeformationTarget = {
    curl: 0,
    eased: 0,
    lift: 0,
    normalized: 0,
    phase: "peel",
    phaseProgress: 0,
    sourceSide: 1,
    torsion: 0,
    turnAngle: 0,
  };
  readonly #inspectionLeafVertex: ActiveLeafVertex = {x: 0, y: 0, z: 0};
  readonly #loadArtFrameChannels: (
    signal: AbortSignal,
  ) => Promise<readonly ArtFrameChannel[]>;
  readonly #keysDown = new Set<string>();
  readonly #lookAngles: LookAngles = {pitch: 0, yaw: 0};
  readonly #lookDelta: LookAngles = {pitch: 0, yaw: 0};
  readonly #lookTarget: LookAngles = {pitch: 0, yaw: 0};
  readonly #loadTvChannels: (
    signal: AbortSignal,
  ) => Promise<readonly TvChannel[]>;
  #tvChannelCache: readonly TvChannel[] | undefined;
  #tvChannelCacheLoadedAt = Number.NEGATIVE_INFINITY;
  #tvChannelLoadPromise: Promise<readonly TvChannel[]> | undefined;
  readonly #loadSharedTvChannels = (signal: AbortSignal) => {
    if (signal.aborted)
      return Promise.reject(
        new DOMException("TV channel load aborted", "AbortError"),
      );
    const now = performance.now();
    if (
      this.#tvChannelCache &&
      now - this.#tvChannelCacheLoadedAt < TV_CHANNEL_SHARED_CACHE_MS
    )
      return Promise.resolve(this.#tvChannelCache);
    this.#tvChannelLoadPromise ??= this.#loadTvChannels(
      this.#abortController.signal,
    )
      .then((channels) => {
        this.#tvChannelCache = channels;
        this.#tvChannelCacheLoadedAt = performance.now();
        return channels;
      })
      .finally(() => {
        this.#tvChannelLoadPromise = undefined;
      });
    return this.#tvChannelLoadPromise;
  };
  readonly #markTelevisionSettingChanged = () => {
    this.#worldStateDirty = true;
  };
  readonly #loadPosters: (
    signal: AbortSignal,
  ) => Promise<readonly PosterAsset[]>;
  readonly #movementDelta: PlanarPoint = {x: 0, z: 0};
  readonly #movementInput: PlanarMovementInput = {forward: 0, right: 0};
  readonly #movementPosition: PlanarPoint = {x: 0, z: 0};
  readonly #movableProps = new Map<string, MovablePropRecord>();
  readonly #movablePropTargetMeshes: Mesh[] = [];
  readonly #televisionProps = new Map<ShopTelevision, MovablePropRecord>();
  readonly #televisionsBySaveId = new Map<string, ShopTelevision>();
  readonly #mouseSensitivity: () => number;
  #movableTelevision: ShopTelevision | undefined;
  #movableTelevisionProp: MovablePropRecord | undefined;
  readonly #newPublicationIds: () => readonly string[];
  readonly #nextLookAngles: LookAngles = {pitch: 0, yaw: 0};
  readonly #onDiscardPublication:
    | ((publicationId: string) => Promise<boolean>)
    | undefined;
  readonly #onArtFrameChannelCreateRequest:
    | ((currentChannelLabel: string) => void)
    | undefined;
  readonly #onGameStateChange:
    | ((snapshot: ShopGameSnapshot) => void)
    | undefined;
  readonly #onPauseRequest: (() => void) | undefined;
  readonly #onPageIndexChange:
    | ((publicationId: string, pageIndex: number) => void)
    | undefined;
  readonly #onSelectPublication: (publicationId: string) => void;
  readonly #onSignEditRequest:
    | ((request: ShopSignEditRequest) => void)
    | undefined;
  readonly #onWorldSave:
    | ((save: WorldSaveV1) => boolean | void | Promise<boolean | void>)
    | undefined;
  readonly #observedArrivalIds = new Set<string>();
  readonly #paused: () => boolean;
  readonly #physicsPoseEuler = new Euler();
  readonly #physicsPosePosition = new Vector3();
  readonly #physicsPoseRotation = new Quaternion();
  readonly #physicsPose: BookPhysicsPose = {
    position: this.#physicsPosePosition,
    rotation: this.#physicsPoseRotation,
  };
  readonly #physicsTransform: MutableBookPhysicsTransform = {
    position: new Vector3(),
    rotation: new Quaternion(),
  };
  readonly #playerDesiredDisplacement = new Vector3();
  readonly #playerMovement: MutablePlayerMovement = {
    ceilingHit: false,
    collisionCount: 0,
    correctedDisplacement: new Vector3(),
    eyePosition: new Vector3(),
    grounded: false,
  };
  readonly #physicsWorld = new ShopPhysicsWorld();
  readonly #playerVelocity = new Vector3();
  readonly #posterLocalPoint = new Vector3();
  readonly #posterPlacementPosition = new Vector3();
  readonly #posterPlacementRotation = new Quaternion();
  readonly #posterRaycastMeshes: Mesh[] = [];
  readonly #posterRecords = new Map<string, PosterRecord>();
  readonly #posterSurfaces = new Map<string, PosterSurface>();
  readonly #posterTargetMeshes: Mesh[] = [];
  readonly #posterTexturePromises = new Map<string, Promise<Texture>>();
  readonly #digitalArtFrameRecords = new Map<string, DigitalArtFrameRecord>();
  readonly #digitalArtFrameTargetMeshes: Mesh[] = [];
  readonly #artFrameImageBitmapLoader = new ImageBitmapLoader().setOptions({
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  readonly #artFrameTextureCache = new Map<string, ArtFrameTextureCacheEntry>();
  readonly #artFrameTexturePreparationQueue: ArtFrameTexturePreparation[] = [];
  readonly #hallwayDoors: AutomaticDoor[] = [];
  readonly #propSupportBounds = new Box3();
  readonly #propPlacementSupports: PropPlacementSupport[] = [];
  readonly #raycaster = new Raycaster();
  readonly #rareRoomDoorPivot = new Group();
  readonly #reticle = new Vector2();
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #signSlots = new Map<string, ShopSignSlot>();
  readonly #signTargetMeshes: Mesh[] = [];
  readonly #spineShelfDefinitions = new Map<string, SpineShelfDefinition>();
  readonly #selectedPublicationId: () => string | null | undefined;
  readonly #shelfTargetMeshes: Mesh[] = [];
  readonly #shelfSnapMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: "#78b594",
      depthWrite: false,
      opacity: 0.42,
      transparent: true,
    }),
  );
  readonly #shelfPreviewBaseRotation = new Quaternion();
  readonly #shelfPreviewTargetRotation = new Quaternion();
  readonly #shelfTargetOffset = new Vector3();
  readonly #textureLoader = new TextureLoader();
  readonly #televisions: ShopTelevision[] = [];
  readonly #televisionTargetPosition = new Vector3();
  readonly #trashcanGroup = new Group();
  readonly #trashcanPosition = new Vector3(
    SHOP_PHYSICS_TRASH_POSITION_X,
    TRASH_CAN_HEIGHT / 2,
    SHOP_PHYSICS_TRASH_POSITION_Z,
  );
  readonly #trashTargetMesh = new Mesh<BoxGeometry, MeshBasicMaterial>();
  readonly #trashTossTarget = new Vector3();
  readonly #trashTossRotation = new Quaternion().setFromEuler(
    new Euler(-Math.PI / 2, 0.45, Math.PI * 0.5),
  );
  readonly #throwAngularVelocity = new Vector3(2.8, 4.5, 1.9);
  readonly #throwVelocity = new Vector3();
  readonly #upAxis = new Vector3(0, 1, 0);
  readonly #viewDirection = new Vector3();

  #carriedProp: MovablePropRecord | undefined;
  #carriedPublicationId: string | undefined;
  #discardAnimation: DiscardAnimation | undefined;
  #discardBusy = false;
  #discardError: string | undefined;
  readonly #discardedPublicationIds = new Set<string>();
  #disposed = false;
  #bookAtlasRevision = 0;
  #frameHandle: number | undefined;
  #hoveredPublicationId: string | undefined;
  #inspectionMode: InspectionMode = "none";
  #inspectionDragCurrentX = 0;
  #inspectionDragMoved = false;
  #inspectionDragNavigation: ReaderNavigation | undefined;
  #inspectionDragReleaseDecision: "cancel" | "commit" | undefined;
  #inspectionDragStartX = 0;
  #inspectionDragging = false;
  #inspectionCloseAction: InspectionCloseAction | undefined;
  #inspectionOpenAngle = 0;
  #inspectionOpenAngleTarget = 0;
  #inspectionOpeningDelay = 0;
  #inspectionOpeningHalf: "left" | "right" = "left";
  #inspectionPageIndex = 0;
  #inspectionPageLoadCount = 0;
  #inspectionPhysicsReturnActive = false;
  #inspectionPublicationId: string | undefined;
  #inspectionResumePageIndex = 0;
  #inspectionShelfFocusPending = false;
  #inspectionShelfReturnPhase: InspectionShelfReturnPhase | undefined;
  #inspectionPointerX = 0;
  #inspectionPointerY = 0;
  #inspectionTextureRevision = 0;
  #inspectionTextureUrls = new Set<string>();
  #inspectionTurnPage: "left" | "right" | undefined;
  #inspectionTurnFromSingle = false;
  #inspectionTurnOpeningFromBack = false;
  #inspectionTurnNavigation: ReaderNavigation = "forward";
  #inspectionTurnPreparing = false;
  #inspectionTurnProgress = 0;
  #inspectionTurnProgressTarget = 0;
  #inspectionTurnRevision = 0;
  #inspectionTurnTextureUrls = new Set<string>();
  #inspectionTurnToSingle = false;
  #inspectionTurnDestinationTexture: Texture | null = null;
  #inspectionTurnDestinationPreviousTexture: Texture | null = null;
  #inspectionTurnAnchorX = 1;
  #inspectionTurnAnchorY = 0.5;
  #inspectionTurnSourceSide: "left" | "right" = "left";
  #inspectionTurnSourceDestinationTexture: Texture | null = null;
  #inspectionTurnSourceTexture: Texture | null = null;
  #inspectionTurnBackSourceRevealed = false;
  #inspectionTurnTargetPageIndex = 0;
  #inspectionTurnWillCommit = true;
  #inspectionTurningBackTexture: Texture | undefined;
  #inspectionZoom = 1;
  #inspectionZoomOffsetX = 0;
  #inspectionZoomOffsetY = 0;
  #inspectionZoomOffsetTargetX = 0;
  #inspectionZoomOffsetTargetY = 0;
  #inspectionZoomTarget = 1;
  #interactiveMeshes: Mesh[] = [];
  #didWarnPointerMovement = false;
  #ignoreNextLockedPointerMove = false;
  #anomalousPointerMovementCount = 0;
  #lastFrameTime = 0;
  #lastGameStateSignature = "";
  #lastItems: readonly CatalogItem[] | undefined;
  #lastNewPublicationIds: readonly string[] | undefined;
  #pendingDiscardPublicationId: string | undefined;
  #lastPixelRatio = 0;
  #lastSelectedPublicationId: string | null | undefined;
  #moonEnvironment: Texture | undefined;
  #onReady: (() => void) | undefined;
  #inputSuspended = false;
  #pointerLocked = false;
  #pointerLockReleasePending = false;
  #resumePointerLockAfterRelease = false;
  #jumpQueued = false;
  #jumpQueuedAt = Number.NEGATIVE_INFINITY;
  #lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
  #playerGrounded = false;
  #playerVerticalVelocity = 0;
  #posterAssets: readonly PosterAsset[] = [];
  #posterAssetIndex = 0;
  #posterCatalogRefreshHandle: number | undefined;
  #posterCatalogRequestPending = false;
  #posterImportCount = 0;
  #posterImportError: string | undefined;
  #posterSaveRestoreCompleted = false;
  #posterPlacement: PosterPlacementSession | undefined;
  #posterPlacementRevision = 0;
  #posterPlacementSelection: PosterPlacementSelection | undefined;
  #posterPreview: Mesh<PlaneGeometry, MeshStandardMaterial> | undefined;
  #artFrameAssets: readonly ArtFrameImage[] = [];
  #artFrameAssetIndex = 0;
  #artFrameCatalogRequestPending = false;
  #artFrameChannels: readonly ArtFrameChannel[] = [];
  #artFrameImportCount = 0;
  #artFrameImportError: string | undefined;
  #artFramePlacement: DigitalArtFramePlacementSession | undefined;
  #artFramePlacementRevision = 0;
  #artFramePlacementSelection: DigitalArtFramePlacementSelection | undefined;
  #artFramePreview: DigitalArtFrame | undefined;
  #artFramePreviewMaterialStates: Array<{
    depthWrite: boolean;
    material: Material;
    opacity: number;
    transparent: boolean;
  }> = [];
  #artFrameTargetImportChannel:
    | {channelId: string; frameId: string}
    | undefined;
  #artFrameTextureCacheClock = 0;
  #artFrameTexturePreparationHandle: number | undefined;
  #artFrameTexturePreparationUsesIdleCallback = false;
  #artFrameSaveRestoreCompleted = false;
  #pendingPosterSaves: readonly WorldPosterSave[] = [];
  #pendingDigitalArtFrameSaves: readonly WorldDigitalArtFrameSave[] = [];
  #pendingPropSaves = new Map<string, WorldPropSave>();
  #propPlacementDistance = 2;
  #propPlacementRotationMode = false;
  #propPlacementRotationSnapOrigin = 0;
  #propPlacementSnapping = true;
  #propPlacementYaw = 0;
  #pendingPointerMovementX = 0;
  #pendingPointerMovementY = 0;
  #rareRoomDoorOpen = 0;
  #pendingWorldSave: WorldSaveV1 | undefined;
  #ready = false;
  #resizeDirty = true;
  #resizeObserver: ResizeObserver | undefined;
  #shelfTargeted = false;
  #shelfTargetSelection: ShelfTargetSelection | undefined;
  #shelfPresentation: ShelfPresentation = "spine";
  #shelfHoverTargetMeshes: Mesh[] = [];
  #shelfBrowsePublicationId: string | undefined;
  #shelfBrowseReadyAt = 0;
  #suppressNextPointerUnlockPause = false;
  #targetedSignKey: string | undefined;
  #targetedPosterId: string | undefined;
  #targetedDigitalArtFrameId: string | undefined;
  #targetedProp: MovablePropRecord | undefined;
  #televisionInteraction: ShopTelevisionInteraction | undefined;
  #televisionTargeted = false;
  #targetedTelevision: ShopTelevision | undefined;
  #tvWheelScrubDirection: -1 | 1 | undefined;
  #tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
  #tvWheelScrubStepIndex = 0;
  #tvVideoImportCount = 0;
  #tvVideoImportError: string | undefined;
  #tvVideoImportMessage: string | undefined;
  #tvVideoImportMessageTimer: number | undefined;
  #trashcanProp: MovablePropRecord | undefined;
  #trashTargeted = false;
  #throwChargeActive = false;
  #throwChargeBucket = -1;
  #throwChargeSeconds = 0;
  #viewportHeight = 1;
  #viewportWidth = 1;
  #worldSaveIdleHandle: number | undefined;
  #worldSaveIntervalHandle: number | undefined;
  #worldSavePending: Promise<void> | undefined;
  #worldStateDirty = false;

  constructor(options: ShopSceneOptions) {
    this.#canvas = options.canvas;
    this.#catalogAtlases = options.catalogAtlases;
    this.#catalogIdentity = options.catalogIdentity;
    this.#catalogItems = options.catalogItems;
    this.#newPublicationIds = options.newPublicationIds ?? (() => []);
    this.#initialPageIndex = options.initialPageIndex ?? (() => 0);
    this.#importPoster = options.importPoster;
    this.#importArtFrameImage = options.importArtFrameImage;
    this.#importTvVideo = options.importTvVideo;
    this.#onTextPaste = options.onTextPaste;
    this.#loadArtFrameChannels =
      options.loadArtFrameChannels ?? (() => Promise.resolve([]));
    this.#loadTvChannels =
      options.loadTvChannels ?? (() => Promise.resolve([]));
    this.#loadPosters = options.loadPosters ?? (() => Promise.resolve([]));
    this.#mouseSensitivity = options.mouseSensitivity ?? (() => 1);
    this.#selectedPublicationId = options.selectedPublicationId;
    this.#onSelectPublication = options.onSelectPublication;
    this.#onDiscardPublication = options.onDiscardPublication;
    this.#onArtFrameChannelCreateRequest =
      options.onArtFrameChannelCreateRequest;
    this.#onGameStateChange = options.onGameStateChange;
    this.#onPauseRequest = options.onPauseRequest;
    this.#onPageIndexChange = options.onPageIndexChange;
    this.#onSignEditRequest = options.onSignEditRequest;
    this.#onWorldSave = options.onWorldSave;
    this.#pendingWorldSave = options.initialWorldSave;
    this.#onReady = options.onReady;
    this.#paused = options.paused ?? (() => false);

    this.#renderer = new WebGLRenderer({
      antialias: true,
      canvas: this.#canvas,
      powerPreference: "high-performance",
    });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFSoftShadowMap;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.08;

    if (DEV)
      (window as ShopPerformanceDebugWindow).__AFTERLEAF_PERFORMANCE_DEBUG__ = {
        camera: this.#camera,
        renderer: this.#renderer,
        scene: this.#scene,
      };

    this.#configureScene();
    this.#createShopInterior();
    this.#bindInput();
    this.#observeSize();
    const unsubscribeFromWidePages = subscribeToWideReaderPages((url) =>
      this.#handleDetectedWidePage(url),
    );
    this.#abortController.signal.addEventListener(
      "abort",
      unsubscribeFromWidePages,
      {once: true},
    );
    this.#syncInputs();
    void this.#initializePosters();
    void this.#refreshArtFrameCatalog();
    void this.#initializePhysics();
  }

  start() {
    if (this.#disposed || this.#frameHandle !== undefined) return;
    this.#lastFrameTime = performance.now();
    this.#applyResize();
    this.#renderer.render(this.#scene, this.#camera);
    this.#markReady();
    this.#worldSaveIntervalHandle = window.setInterval(
      this.#scheduleWorldSave,
      WORLD_SAVE_INTERVAL_MS,
    );
    this.#posterCatalogRefreshHandle = window.setInterval(() => {
      void this.#refreshPosterCatalog();
      void this.#refreshArtFrameCatalog();
    }, POSTER_CATALOG_REFRESH_INTERVAL_MS);
    this.#frameHandle = requestAnimationFrame(this.#animate);
  }

  requestPointerLock() {
    if (this.#disposed) return;
    this.#inputSuspended = false;
    if (this.#inspectionMode === "spread") return;
    this.#requestPointerLock();
  }

  releasePointerLock() {
    if (this.#disposed) return;
    if (this.#inputSuspended) return;
    this.#inputSuspended = true;
    if (document.pointerLockElement === this.#canvas)
      this.#suppressNextPointerUnlockPause = true;
    this.#suspendInput();
  }

  unstuckPlayer() {
    if (this.#disposed) return;
    this.#camera.position.set(
      SHOP_PLAYER_START_X,
      SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
      SHOP_PLAYER_START_Z,
    );
    this.#physicsWorld.resetPlayer(this.#camera.position);
    this.#playerVelocity.set(0, 0, 0);
    this.#playerGrounded = false;
    this.#lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
    this.#playerVerticalVelocity = 0;
    this.#jumpQueued = false;
    this.#worldStateDirty = true;
  }

  seekInspectionPage(pageIndex: number) {
    const publication = this.#inspectionPublication();
    if (!publication || this.#inspectionMode !== "spread") return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    const clampedPageIndex = clampPageIndex(
      pageIndex,
      publication.pages.length,
    );
    const nextPageIndex = getReaderSpread(
      clampedPageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    if (nextPageIndex === this.#inspectionPageIndex) return;
    if (this.#inspectionOpenAngleTarget > 0) {
      this.#inspectionResumePageIndex = nextPageIndex;
      this.#openInspectionBook();
      return;
    }
    this.#inspectionTurnRevision += 1;
    this.#inspectionTurnPreparing = false;
    this.#inspectionDragging = false;
    this.#inspectionDragReleaseDecision = undefined;
    this.#releaseInspectionTurnTextures();
    this.#inspectionPageIndex = nextPageIndex;
    this.#inspectionTurnPage = undefined;
    this.#inspectionTurnFromSingle = false;
    this.#inspectionTurnOpeningFromBack = false;
    this.#inspectionTurnToSingle = false;
    record.inspectionTurningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.#setInspectionTurningBackTexture(record, null);
    this.#configureInspectionPages(record, publication);
    void this.#syncInspectionPageTextures(publication);
    this.#onPageIndexChange?.(publication.id, this.#inspectionPageIndex);
    this.#emitGameState();
  }

  turnInspectionPage(navigation: ReaderNavigation) {
    const publication = this.#inspectionPublication();
    if (!publication || this.#inspectionMode !== "spread") return;
    const nextPageIndex = getAdjacentSpreadStart(
      this.#inspectionPageIndex,
      publication.pages.length,
      "spread",
      navigation,
      getWideReaderPageIndices(publication.pages),
    );
    if (nextPageIndex === this.#inspectionPageIndex) return;
    if (this.#inspectionOpenAngleTarget > 0) {
      this.seekInspectionPage(nextPageIndex);
      return;
    }
    this.#turnInspectionPages(navigation);
  }

  async #initializePhysics() {
    try {
      const ready = await this.#physicsWorld.initialize();
      if (!ready || this.#disposed) return;
      this.#physicsWorld.setPlayerPosition(this.#camera.position);
      for (const record of this.#booksById.values()) {
        if (record.state.status !== "carried") continue;
        this.#scene.attach(record.mesh);
      }
      if (this.#carriedProp) this.#scene.attach(this.#carriedProp.object);
      this.#updateHeldPhysicsTarget();
      if (this.#carriedPublicationId)
        this.#physicsWorld.updateBook(this.#carriedPublicationId, {
          pose: this.#heldTargetPose,
        });
      this.#emitGameState();
    } catch (error) {
      if (DEV) console.warn("Afterleaf shop physics is unavailable.", error);
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#stopWorldSaveScheduler();
    this.#flushWorldSave();
    this.#disposed = true;
    if (this.#carriedProp)
      this.#restoreGhostedObject(this.#carriedProp.ghostMaterialSwaps);
    this.#releasePointerLock();
    this.#abortController.abort();
    if (this.#tvVideoImportMessageTimer !== undefined)
      window.clearTimeout(this.#tvVideoImportMessageTimer);
    this.#tvVideoImportMessageTimer = undefined;
    this.#physicsWorld.dispose();
    for (const television of this.#televisions) television.dispose();
    this.#televisions.length = 0;
    this.#televisionsBySaveId.clear();
    this.#carriedProp = undefined;
    this.#movableTelevision = undefined;
    this.#movableTelevisionProp = undefined;
    this.#targetedTelevision = undefined;
    this.#televisionProps.clear();
    this.#audioManager.dispose();
    for (const record of this.#digitalArtFrameRecords.values())
      record.frame.dispose();
    this.#digitalArtFrameRecords.clear();
    this.#artFramePreview?.dispose();
    this.#artFramePreview = undefined;
    this.#inspectionPageTextureCache.dispose();
    this.#inspectionTurningBackTexture?.dispose();
    this.#inspectionTurningBackTexture = undefined;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    if (this.#frameHandle !== undefined)
      cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = undefined;
    if (this.#posterCatalogRefreshHandle !== undefined)
      window.clearInterval(this.#posterCatalogRefreshHandle);
    this.#posterCatalogRefreshHandle = undefined;

    this.#bookAtlasRevision += 1;
    this.#disposeBookAtlasBatches();
    for (const record of this.#booksById.values())
      this.#disposeBookRecord(record);
    this.#booksById.clear();
    this.#standaloneBookTexturePublicationIds.clear();
    this.#interactiveMeshes = [];
    this.#shelfHoverTargetMeshes = [];
    disposeObject(this.#scene);
    this.#scene.clear();
    this.#moonEnvironment?.dispose();
    this.#moonEnvironment = undefined;
    for (const pendingTexture of this.#posterTexturePromises.values())
      void pendingTexture.then((texture) => texture.dispose()).catch(() => {});
    this.#posterTexturePromises.clear();
    this.#cancelArtFrameTexturePreparation();
    for (const entry of this.#artFrameTextureCache.values())
      void entry.promise
        .then((texture) => this.#disposeArtFrameTexture(texture))
        .catch(() => {});
    this.#artFrameTextureCache.clear();
    this.#renderer.renderLists.dispose();
    this.#renderer.dispose();
    const performanceDebugWindow = window as ShopPerformanceDebugWindow;
    if (
      DEV &&
      performanceDebugWindow.__AFTERLEAF_PERFORMANCE_DEBUG__?.renderer ===
        this.#renderer
    )
      delete performanceDebugWindow.__AFTERLEAF_PERFORMANCE_DEBUG__;
    this.#canvas.style.cursor = "";
  }

  readonly #animate = (time: number) => {
    if (this.#disposed) return;
    const deltaSeconds = Math.min((time - this.#lastFrameTime) / 1000, 0.05);
    this.#lastFrameTime = time;

    this.#syncInputs();
    this.#syncPixelRatio();
    if (this.#resizeDirty) this.#applyResize();

    const paused = this.#paused();
    for (const television of this.#televisions) television.setSuspended(paused);
    if (paused) {
      if (!this.#inputSuspended) {
        this.#inputSuspended = true;
        this.#suspendInput();
      }
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }
    this.#inputSuspended = false;

    this.#consumePointerMovement(deltaSeconds);
    this.#updateCameraLook(deltaSeconds);
    this.#updateThrowCharge(deltaSeconds);
    this.#movePlayer(deltaSeconds);
    this.#updateRareRoomDoor(deltaSeconds);
    this.#updateHallwayDoors(deltaSeconds);
    this.#updateInteractionTarget();
    this.#inspectionZoom = MathUtils.damp(
      this.#inspectionZoom,
      this.#inspectionZoomTarget,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#inspectionZoomOffsetX = MathUtils.damp(
      this.#inspectionZoomOffsetX,
      this.#inspectionZoomOffsetTargetX,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#inspectionZoomOffsetY = MathUtils.damp(
      this.#inspectionZoomOffsetY,
      this.#inspectionZoomOffsetTargetY,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#updateHeldPhysicsTarget();
    this.#physicsWorld.step(deltaSeconds);
    this.#syncMovablePropPhysics();
    for (const record of this.#digitalArtFrameRecords.values())
      record.frame.update(deltaSeconds);
    this.#animateBooks(deltaSeconds);
    this.#syncBookAtlasBatches();
    this.#animateDiscard(deltaSeconds);
    this.#renderer.render(this.#scene, this.#camera);
    this.#frameHandle = requestAnimationFrame(this.#animate);
  };

  #configureScene() {
    this.#moonEnvironment = this.#createMoonEnvironment();
    this.#scene.background = this.#moonEnvironment;
    this.#scene.backgroundIntensity = 0.34;
    this.#scene.environment = this.#moonEnvironment;
    this.#scene.environmentIntensity = 0.16;
    this.#scene.fog = new FogExp2("#071010", 0.027);
    this.#camera.far = 110;
    this.#camera.updateProjectionMatrix();
    this.#camera.position.set(
      SHOP_PLAYER_START_X,
      SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
      SHOP_PLAYER_START_Z,
    );
    this.#camera.rotation.order = "YXZ";
    this.#camera.rotation.set(0, 0, 0);
    this.#camera.add(this.#audioManager.listener);
    this.#scene.add(this.#camera);

    this.#scene.add(new AmbientLight("#918b7d", 0.66));
    const moonlight = new DirectionalLight("#8eb8cd", 1.45);
    moonlight.position.set(-4, 6, 5);
    this.#scene.add(moonlight);

    for (const x of CEILING_LIGHT_COLUMNS)
      for (const z of CEILING_LIGHT_ROWS) {
        if (x > 0 && z === -7) continue;
        const fluorescentLight = new PointLight("#f3e3cb", 5.6, 9, 1.75);
        fluorescentLight.position.set(x, 4.25, z);
        this.#scene.add(fluorescentLight);
      }
    const rareRoomLight = new PointLight("#f1dfbd", 7.2, 8, 1.75);
    rareRoomLight.position.set(RARE_ROOM_CENTER_X, 4.25, RARE_ROOM_CENTER_Z);
    this.#scene.add(rareRoomLight);
  }

  #createShopInterior() {
    const architecture = new Group();
    architecture.name = "night-shop-interior";
    this.#scene.add(architecture);
    this.#shelfSnapMesh.name = "shelf-snap-helper";
    this.#shelfSnapMesh.visible = false;
    architecture.add(this.#shelfSnapMesh);

    const floorMaterial = this.#createFloorMaterial();
    const floor = new Mesh(new PlaneGeometry(26, 39), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 8.5);
    floor.receiveShadow = true;
    architecture.add(floor);
    const groundFloorStructure = new Mesh(
      new BoxGeometry(26, 0.18, 39),
      new MeshBasicMaterial({color: "#242a28"}),
    );
    groundFloorStructure.position.set(0, -0.092, 8.5);
    architecture.add(groundFloorStructure);

    const wallMaterial = createWallpaperMaterial(
      this.#textureLoader,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    this.#addBox(architecture, [26, 4.8, 0.16], [0, 2.35, -10.5], wallMaterial);
    this.#addBox(architecture, [26, 4.8, 0.16], [0, 2.35, 28], wallMaterial);
    this.#addBox(
      architecture,
      [0.16, 4.8, 38.5],
      [-12.5, 2.35, 8.75],
      wallMaterial,
    );
    const lowerStairOpeningMinZ =
      SHOP_STAIR_LOWER_FLIGHT_CENTER_Z - SHOP_STAIR_OPENING_WIDTH / 2;
    const lowerStairOpeningMaxZ =
      SHOP_STAIR_LOWER_FLIGHT_CENTER_Z + SHOP_STAIR_OPENING_WIDTH / 2;
    this.#addBox(
      architecture,
      [0.16, 4.8, lowerStairOpeningMinZ + 10.5],
      [12.5, 2.35, (-10.5 + lowerStairOpeningMinZ) / 2],
      wallMaterial,
    );
    this.#addBox(
      architecture,
      [0.16, 4.8, 28 - lowerStairOpeningMaxZ],
      [12.5, 2.35, (28 + lowerStairOpeningMaxZ) / 2],
      wallMaterial,
    );
    this.#createPosterSurface(
      architecture,
      "back-wall",
      24.6,
      4.5,
      [0, 2.35, -10.405],
      0,
    );
    this.#createPosterSurface(
      architecture,
      "front-wall",
      24.6,
      4.5,
      [0, 2.35, 27.905],
      Math.PI,
    );
    this.#createPosterSurface(
      architecture,
      "west-wall",
      37.8,
      4.5,
      [-12.405, 2.35, 8.75],
      Math.PI / 2,
    );
    this.#createPosterSurface(
      architecture,
      "east-wall",
      lowerStairOpeningMinZ + 10.1,
      4.5,
      [12.405, 2.35, (-10.5 + lowerStairOpeningMinZ) / 2],
      -Math.PI / 2,
    );

    const woodTextures = loadWoodTextures(
      this.#textureLoader,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    const woodMaterial = createWoodMaterial(woodTextures);
    const shelfEdgeMaterial = createWoodMaterial(woodTextures, {
      color: "#d8c0aa",
      roughness: 0.76,
    });
    const shelfBackingMaterial = createWoodMaterial(woodTextures, {
      color: "#806f63",
      roughness: 0.92,
    });

    this.#createFaceOutDisplay(
      architecture,
      woodMaterial,
      shelfBackingMaterial,
    );
    void this.#createTrashcan(architecture);

    this.#createSpineShelfFixture(
      architecture,
      "west-wall",
      -11.45,
      8.25,
      35.5,
      9,
      [1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
    );
    this.#createSpineShelfFixture(
      architecture,
      "east-wall",
      11.45,
      5.75,
      30.5,
      8,
      [-1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
    );
    for (const [index, x] of [-4.2, 4.2].entries())
      this.#createSpineShelfFixture(
        architecture,
        `gondola-${index + 1}`,
        x,
        10,
        17,
        7,
        [-1, 1],
        woodMaterial,
        shelfBackingMaterial,
        shelfEdgeMaterial,
      );
    for (const [index, x] of [-8, 8].entries())
      this.#createSpineShelfFixture(
        architecture,
        `outer-gondola-${index + 1}`,
        x,
        12,
        12,
        5,
        [-1, 1],
        woodMaterial,
        shelfBackingMaterial,
        shelfEdgeMaterial,
      );
    const readingFurnitureMaterials = this.#createReadingTables(
      architecture,
      woodMaterial,
    );
    this.#createRareRoom(
      architecture,
      wallMaterial,
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
    );
    const upperFloorMaterial = this.#cloneFloorMaterial(
      floorMaterial,
      0.25,
      0.25,
    );
    this.#createShopExpansion(
      architecture,
      upperFloorMaterial,
      wallMaterial,
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      readingFurnitureMaterials,
    );
    this.#createCeilingLights(architecture);
    this.#createNightWindows(architecture);
    const fixedTelevision = new ShopTelevision({
      audioManager: this.#audioManager,
      initialChannelId:
        this.#pendingWorldSave?.televisionChannels?.[FIXED_TELEVISION_SAVE_ID],
      initialVolume:
        this.#pendingWorldSave?.televisionVolumes?.[FIXED_TELEVISION_SAVE_ID],
      loadChannels: this.#loadSharedTvChannels,
      onChannelChange: this.#markTelevisionSettingChanged,
      onStateChange: () => this.#emitGameState(),
      onVolumeChange: this.#markTelevisionSettingChanged,
      parent: architecture,
      tableMaterial: woodMaterial,
    });
    const movableTelevision = new ShopTelevision({
      audioManager: this.#audioManager,
      initialChannelId:
        this.#pendingWorldSave?.televisionChannels?.[
          MOVABLE_TELEVISION_SAVE_ID
        ],
      initialVolume:
        this.#pendingWorldSave?.televisionVolumes?.[MOVABLE_TELEVISION_SAVE_ID],
      loadChannels: this.#loadSharedTvChannels,
      model: {
        screenAspect: 4 / 3,
        screenNodeName: "Screen",
        screenSafeArea: CRT_TV_SAFE_AREA,
        scale: SHOP_MODEL_TELEVISION_SCALE,
        url: crtTvModelUrl,
      },
      onChannelChange: this.#markTelevisionSettingChanged,
      onStateChange: () => this.#emitGameState(),
      onVolumeChange: this.#markTelevisionSettingChanged,
      parent: architecture,
      position: SHOP_MODEL_TELEVISION_POSITION,
      rotationY: 0,
      tableMaterial: woodMaterial,
    });
    this.#movableTelevision = movableTelevision;
    this.#registerTelevision(FIXED_TELEVISION_SAVE_ID, fixedTelevision);
    this.#registerTelevision(MOVABLE_TELEVISION_SAVE_ID, movableTelevision);
    this.#movableTelevisionProp = this.#registerMovableProp({
      density: 45,
      depth: SHOP_MODEL_TELEVISION_SIZE.depth,
      height: SHOP_MODEL_TELEVISION_SIZE.height,
      heldLocalPosition: new Vector3(0, -0.12, -1.45),
      id: MODEL_TELEVISION_PHYSICS_ID,
      label: "CRT television",
      object: movableTelevision.object,
      persistInWorldProps: false,
      targetable: false,
      width: SHOP_MODEL_TELEVISION_SIZE.width,
    });
    this.#televisionProps.set(movableTelevision, this.#movableTelevisionProp);
    this.#createTelevisionTableShelf(architecture);

    this.#createAisleSignSlot(
      architecture,
      "gondola-1",
      -4.2,
      "成人向けコミック  18+",
      "ADULT COMICS · AISLE 01",
    );
    this.#createAisleSignSlot(architecture, "gondola-2", 4.2, "", "");

    const recommendationCard = this.#createSign(
      "STAFF PICK",
      "深夜のおすすめ",
      1.05,
      0.48,
      "#241b18",
      "#d9b96f",
    );
    recommendationCard.position.set(1.52, 3.38, -9.93);
    recommendationCard.rotation.z = -0.035;
    architecture.add(recommendationCard);
    this.#batchStaticInteriorMeshes(architecture);
  }

  #batchStaticInteriorMeshes(parent: Group) {
    const batchesByMaterial = new Map<
      Material,
      Map<string, Mesh<BufferGeometry, Material>[]>
    >();
    for (const object of [...parent.children]) {
      if (!(object instanceof Mesh) || object instanceof BatchedMesh) continue;
      if (
        !object.visible ||
        Array.isArray(object.material) ||
        object.material.transparent ||
        object.children.length > 0
      )
        continue;
      const position = object.geometry.getAttribute("position");
      if (!position) continue;
      const attributeSignature = Object.entries(object.geometry.attributes)
        .map(
          ([name, attribute]) =>
            `${name}:${attribute.array.constructor.name}:${attribute.itemSize}:${attribute.normalized}`,
        )
        .sort()
        .join("|");
      const index = object.geometry.getIndex();
      const signature = [
        object.castShadow,
        object.receiveShadow,
        object.renderOrder,
        index?.array.constructor.name ?? "unindexed",
        attributeSignature,
      ].join(":");
      let batches = batchesByMaterial.get(object.material);
      if (!batches) {
        batches = new Map();
        batchesByMaterial.set(object.material, batches);
      }
      const meshes = batches.get(signature);
      if (meshes) meshes.push(object);
      else batches.set(signature, [object]);
    }

    let batchIndex = 0;
    for (const [material, batches] of batchesByMaterial)
      for (const meshes of batches.values()) {
        if (meshes.length < 2) continue;
        const vertexCount = meshes.reduce(
          (total, mesh) =>
            total + (mesh.geometry.getAttribute("position")?.count ?? 0),
          0,
        );
        const indexCount = meshes.reduce(
          (total, mesh) => total + (mesh.geometry.getIndex()?.count ?? 0),
          0,
        );
        const batch = new BatchedMesh(
          meshes.length,
          vertexCount,
          indexCount,
          material,
        );
        batch.name = `static-interior-batch-${batchIndex}`;
        batchIndex += 1;
        batch.castShadow = meshes[0]?.castShadow ?? false;
        batch.receiveShadow = meshes[0]?.receiveShadow ?? false;
        batch.renderOrder = meshes[0]?.renderOrder ?? 0;
        batch.sortObjects = false;
        for (const mesh of meshes) {
          mesh.updateMatrix();
          const geometryId = batch.addGeometry(mesh.geometry);
          const instanceId = batch.addInstance(geometryId);
          batch.setMatrixAt(instanceId, mesh.matrix);
          mesh.visible = false;
        }
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        parent.add(batch);
      }
  }

  #createFloorMaterial() {
    const anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    const loadTexture = (url: string, colorSpace = NoColorSpace) => {
      const texture = this.#textureLoader.load(url);
      texture.colorSpace = colorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(6.5, 9.75);
      texture.anisotropy = anisotropy;
      return texture;
    };
    const surface = loadTexture(floorSurfaceUrl);
    surface.channel = 0;
    return new MeshStandardMaterial({
      aoMap: surface,
      aoMapIntensity: 0.72,
      map: loadTexture(floorAlbedoUrl, SRGBColorSpace),
      metalness: 0,
      normalMap: loadTexture(floorNormalUrl),
      normalScale: new Vector2(0.72, 0.72),
      roughness: 0.82,
      roughnessMap: surface,
    });
  }

  #cloneFloorMaterial(
    source: MeshStandardMaterial,
    repeatX: number,
    repeatY: number,
  ) {
    const material = source.clone();
    const clones = new Map<Texture, Texture>();
    const cloneTexture = (texture: Texture | null) => {
      if (!texture) return null;
      const existing = clones.get(texture);
      if (existing) return existing;
      const clone = texture.clone();
      clone.repeat.set(repeatX, repeatY);
      clone.needsUpdate = true;
      clones.set(texture, clone);
      return clone;
    };
    material.aoMap = cloneTexture(source.aoMap);
    material.map = cloneTexture(source.map);
    material.normalMap = cloneTexture(source.normalMap);
    material.roughnessMap = cloneTexture(source.roughnessMap);
    return material;
  }

  #createFaceOutDisplay(
    parent: Group,
    woodMaterial: MeshStandardMaterial,
    backingMaterial: MeshStandardMaterial,
  ) {
    this.#addBox(
      parent,
      [9.35, 3.72, 0.18],
      [-2, 1.92, -10.18],
      backingMaterial,
    );
    for (const x of [-4.68, 4.68])
      this.#addBox(
        parent,
        [0.12, 3.95, 0.66],
        [x - 2, 1.98, -9.92],
        woodMaterial,
        true,
      );
    for (const y of [0.17, 1.07, 1.97, 2.87, 3.77]) {
      const shelf = this.#addBox(
        parent,
        [9.48, 0.1, 0.88],
        [-2, y, -9.9],
        woodMaterial,
        true,
      );
      this.#registerPropPlacementSupport(shelf);
    }

    const targetGeometry = new PlaneGeometry(
      FACE_DISPLAY_SHELF_HALF_WIDTH * 2,
      0.76,
    );
    for (let row = 0; row < FACE_DISPLAY_ROWS; row += 1) {
      const shelfId = faceDisplayShelfId(row);
      const frontCenter = new Vector3(
        -2,
        0.595 + row * 0.9,
        FACE_DISPLAY_SHELF_FRONT_Z,
      );
      this.#spineShelfDefinitions.set(shelfId, {
        axis: new Vector3(1, 0, 0),
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
      target.position.copy(frontCenter);
      target.userData.shelfId = shelfId;
      parent.add(target);
      this.#shelfTargetMeshes.push(target);
    }
    this.#createShelfSignSlots(parent);
  }

  #createTelevisionTableShelf(parent: Group) {
    const frontCenter = new Vector3(0, 0.2 + BOOK_HEIGHT / 2, 26.76);
    this.#spineShelfDefinitions.set(TELEVISION_TABLE_SHELF_ID, {
      axis: new Vector3(1, 0, 0),
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
    parent.add(target);
    this.#shelfTargetMeshes.push(target);
  }

  #createShelfSignSlots(parent: Group) {
    const targetGeometry = new PlaneGeometry(1.02, 0.52);
    for (let column = 0; column < FACE_DISPLAY_COLUMNS; column += 1) {
      const group = new Group();
      group.position.set(
        -2 + (column - (FACE_DISPLAY_COLUMNS - 1) / 2) * 1.12,
        4.18,
        -9.82,
      );
      const target = new Mesh(
        targetGeometry,
        new MeshBasicMaterial({
          color: "#d9b96f",
          depthWrite: false,
          opacity: 0.1,
          side: DoubleSide,
          transparent: true,
        }),
      );
      target.name = `shelf-sign-target-${column}`;
      const id = String(column);
      const key = shopSignKey("shelf", id);
      target.userData.signKey = key;
      group.add(target);
      parent.add(group);
      this.#signTargetMeshes.push(target);
      this.#signSlots.set(key, {
        backgroundColor: column === 0 ? "#b83931" : "#354843",
        column,
        group,
        height: 0.46,
        id,
        kind: "shelf",
        label: `DISPLAY ${String(column + 1).padStart(2, "0")}`,
        sign: undefined,
        subtitle: "",
        target,
        title: "",
        width: 1.02,
      });
    }
    this.#setShelfSign(0, "NEW ARRIVALS", "DISPLAY 01");
  }

  async #createTrashcan(parent: Group) {
    const trashcan = this.#trashcanGroup;
    trashcan.name = "discard-trashcan";
    trashcan.position.copy(this.#trashcanPosition);
    parent.add(trashcan);

    const sign = this.#createSign(
      "DISCARDS  /  廃棄",
      "REMOVE FROM LIBRARY",
      1.35,
      0.42,
      "#f3ecdc",
      "#7b302a",
    );
    sign.position.set(0, 1.26 - TRASH_CAN_HEIGHT / 2, 0.025);
    trashcan.add(sign);

    this.#trashTargetMesh.geometry = new BoxGeometry(1.18, 1.45, 1.18);
    this.#trashTargetMesh.material = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    this.#trashTargetMesh.name = "discard-trashcan-target";
    this.#trashTargetMesh.position.y = 0.69 - TRASH_CAN_HEIGHT / 2;
    trashcan.add(this.#trashTargetMesh);
    this.#trashcanProp = this.#registerMovableProp({
      depth: TRASH_CAN_SIZE,
      height: TRASH_CAN_HEIGHT,
      heldLocalPosition: new Vector3(0, -0.65, -1.8),
      id: TRASH_CAN_PROP_ID,
      label: "trash can",
      object: trashcan,
      staticWhenPlaced: true,
      width: TRASH_CAN_SIZE,
    });

    try {
      const gltf = await ShopScene.#modelLoader.loadAsync(trashCanModelUrl);
      if (this.#disposed) {
        disposeObject(gltf.scene);
        return;
      }

      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene);
      const height = bounds.max.y - bounds.min.y;
      if (!(height > 0)) {
        disposeObject(gltf.scene);
        throw new Error("The trash can model has no measurable height.");
      }

      const scale = TRASH_CAN_HEIGHT / height;
      const center = bounds.getCenter(new Vector3());
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.set(
        -center.x * scale,
        -bounds.min.y * scale - TRASH_CAN_HEIGHT / 2,
        -center.z * scale,
      );
      gltf.scene.name = "trash-can-model";
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      trashcan.add(gltf.scene);
      const trashcanProp = this.#trashcanProp;
      if (trashcanProp && this.#carriedProp === trashcanProp)
        trashcanProp.ghostMaterialSwaps.push(...this.#ghostObject(gltf.scene));
    } catch (error) {
      if (DEV && !this.#disposed)
        console.warn("Afterleaf could not load the trash can model.", error);
    }
  }

  #setTrashcanPosition(x: number, z: number, markDirty = true) {
    this.#trashcanPosition.set(x, TRASH_CAN_HEIGHT / 2, z);
    this.#trashcanGroup.position.copy(this.#trashcanPosition);
    this.#trashcanProp?.currentPosition.copy(this.#trashcanPosition);
    this.#physicsWorld.updatePropPose(TRASH_CAN_PROP_ID, {
      position: this.#trashcanPosition,
      rotation: this.#trashcanGroup.quaternion,
    });
    if (markDirty) this.#worldStateDirty = true;
  }

  #registerMovableProp(registration: MovablePropRegistration) {
    registration.object.updateWorldMatrix(true, false);
    const currentPosition = registration.object.getWorldPosition(new Vector3());
    const currentRotation = registration.object.getWorldQuaternion(
      new Quaternion(),
    );
    const record: MovablePropRecord = {
      currentPosition,
      currentRotation,
      ghostMaterialSwaps: [],
      halfDepth: registration.depth / 2,
      halfHeight: registration.height / 2,
      halfWidth: registration.width / 2,
      heldLocalPosition: registration.heldLocalPosition,
      id: registration.id,
      label: registration.label,
      object: registration.object,
      persistInWorldProps: registration.persistInWorldProps ?? true,
      placementSupport: registration.placementSupport ?? registration.object,
      rotationSnapStep:
        registration.rotationSnapStep ?? PROP_ROTATION_SNAP_STEP,
    };
    if (registration.targetable !== false)
      registration.object.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.userData.movablePropId = registration.id;
        this.#movablePropTargetMeshes.push(object);
      });
    this.#movableProps.set(record.id, record);
    this.#propPlacementSupports.push({
      object: record.placementSupport,
      owner: record,
    });
    this.#physicsWorld.addProp({
      ...(registration.colliderParts
        ? {colliderParts: registration.colliderParts}
        : {}),
      ...(registration.density !== undefined
        ? {density: registration.density}
        : {}),
      depth: registration.depth,
      ...(registration.staticWhenPlaced !== undefined
        ? {staticWhenPlaced: registration.staticWhenPlaced}
        : {}),
      height: registration.height,
      id: registration.id,
      pose: {position: currentPosition, rotation: currentRotation},
      width: registration.width,
    });
    const savedProp = this.#pendingPropSaves.get(record.id);
    if (savedProp) {
      this.#applySavedPropPose(record, savedProp);
      this.#pendingPropSaves.delete(record.id);
    }
    return record;
  }

  #registerPropPlacementSupport(object: Object3D) {
    object.updateWorldMatrix(true, false);
    this.#propPlacementSupports.push({
      bounds: new Box3().setFromObject(object),
    });
  }

  #applySavedPropPose(record: MovablePropRecord, savedProp: WorldPropSave) {
    this.#scene.attach(record.object);
    record.object.position.copy(savedProp.pose.position);
    record.object.quaternion.copy(savedProp.pose.quaternion);
    record.currentPosition.copy(savedProp.pose.position);
    record.currentRotation.copy(savedProp.pose.quaternion);
    this.#physicsWorld.updatePropPose(record.id, {
      position: savedProp.pose.position,
      rotation: savedProp.pose.quaternion,
    });
  }

  #ghostObject(object: Object3D) {
    const swaps: PropMaterialSwap[] = [];
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material;
      const createGhostMaterial = (source: Material) => {
        const ghost = source.clone();
        ghost.alphaTest *= CARRIED_PROP_OPACITY;
        ghost.depthWrite = false;
        ghost.opacity = source.opacity * CARRIED_PROP_OPACITY;
        ghost.transparent = true;
        return ghost;
      };
      const ghostMaterial = Array.isArray(material)
        ? material.map(createGhostMaterial)
        : createGhostMaterial(material);
      swaps.push({material, mesh: child, renderOrder: child.renderOrder});
      child.material = ghostMaterial;
      child.renderOrder = 10;
    });
    return swaps;
  }

  #restoreGhostedObject(swaps: PropMaterialSwap[]) {
    for (const swap of swaps) {
      const ghostMaterials = Array.isArray(swap.mesh.material)
        ? swap.mesh.material
        : [swap.mesh.material];
      swap.mesh.material = swap.material;
      swap.mesh.renderOrder = swap.renderOrder;
      for (const material of ghostMaterials) material.dispose();
    }
    swaps.length = 0;
  }

  #beginPropPlacement(
    object: Object3D,
    projectionDistance: number,
    rotationSnapStep: number,
  ) {
    object.updateWorldMatrix(true, false);
    object.getWorldQuaternion(this.#physicsPoseRotation);
    this.#physicsPoseEuler.setFromQuaternion(this.#physicsPoseRotation, "YXZ");
    this.#propPlacementDistance = MathUtils.clamp(
      projectionDistance,
      PROP_MIN_PROJECTION_DISTANCE,
      PROP_MAX_PROJECTION_DISTANCE,
    );
    this.#propPlacementRotationMode = false;
    this.#propPlacementRotationSnapOrigin = 0;
    this.#propPlacementYaw = normalizePosterRotation(
      Math.round(this.#physicsPoseEuler.y / rotationSnapStep) *
        rotationSnapStep,
    );
  }

  #resolvedPropPlacementYaw(rotationSnapStep: number) {
    if (!this.#propPlacementSnapping) return this.#propPlacementYaw;
    return (
      this.#propPlacementRotationSnapOrigin +
      Math.round(
        (this.#propPlacementYaw - this.#propPlacementRotationSnapOrigin) /
          rotationSnapStep,
      ) *
        rotationSnapStep
    );
  }

  #snapHeldPropToSupport(
    heldProp: MovablePropRecord | undefined,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    yaw: number,
  ) {
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    const extentX = cosine * halfWidth + sine * halfDepth;
    const extentZ = sine * halfWidth + cosine * halfDepth;
    const bottom = this.#heldTargetPosition.y - halfHeight;
    let supportTop = 0;
    let supportX = this.#heldTargetPosition.x;
    let supportZ = this.#heldTargetPosition.z;
    for (const candidate of this.#propPlacementSupports) {
      if (candidate.owner === heldProp) continue;
      const resolvedBounds =
        candidate.bounds ??
        (candidate.object
          ? this.#propSupportBounds.setFromObject(candidate.object)
          : undefined);
      if (!resolvedBounds) continue;
      const supportWidth = resolvedBounds.max.x - resolvedBounds.min.x;
      const supportDepth = resolvedBounds.max.z - resolvedBounds.min.z;
      if (
        extentX * 2 > supportWidth ||
        extentZ * 2 > supportDepth ||
        this.#heldTargetPosition.x + extentX < resolvedBounds.min.x ||
        this.#heldTargetPosition.x - extentX > resolvedBounds.max.x ||
        this.#heldTargetPosition.z + extentZ < resolvedBounds.min.z ||
        this.#heldTargetPosition.z - extentZ > resolvedBounds.max.z ||
        Math.abs(bottom - resolvedBounds.max.y) > PROP_SUPPORT_SNAP_DISTANCE ||
        resolvedBounds.max.y <= supportTop
      )
        continue;
      supportTop = resolvedBounds.max.y;
      supportX = MathUtils.clamp(
        this.#heldTargetPosition.x,
        resolvedBounds.min.x + extentX,
        resolvedBounds.max.x - extentX,
      );
      supportZ = MathUtils.clamp(
        this.#heldTargetPosition.z,
        resolvedBounds.min.z + extentZ,
        resolvedBounds.max.z - extentZ,
      );
    }
    if (supportTop <= 0) return;
    this.#heldTargetPosition.set(supportX, supportTop + halfHeight, supportZ);
  }

  #pickUpProp(record: MovablePropRecord) {
    if (this.#carriedPublicationId || this.#carriedProp) return;
    record.object.updateMatrixWorld(true);
    const placementStartPosition = record.object.getWorldPosition(
      new Vector3(),
    );
    const placementStartRotation = record.object.getWorldQuaternion(
      new Quaternion(),
    );
    if (!this.#physicsWorld.holdProp(record.id)) return;
    record.placementStartPosition = placementStartPosition;
    record.placementStartRotation = placementStartRotation;
    this.#beginPropPlacement(
      record.object,
      Math.abs(record.heldLocalPosition.z),
      record.rotationSnapStep,
    );
    this.#carriedProp = record;
    this.#setPropTargeted(undefined);
    this.#setHoveredPublicationId(undefined);
    record.ghostMaterialSwaps = this.#ghostObject(record.object);
    if (this.#physicsWorld.isReady) this.#scene.attach(record.object);
    else {
      this.#camera.add(record.object);
      record.object.position.copy(record.heldLocalPosition);
      record.object.quaternion.identity();
    }
    this.#updateHeldPhysicsTarget();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #dropCarriedProp(throwProp = false) {
    const record = this.#carriedProp;
    if (!record) return;
    record.object.updateMatrixWorld(true);
    record.object.getWorldPosition(this.#physicsPosePosition);
    record.object.getWorldQuaternion(this.#physicsPoseRotation);
    this.#scene.attach(record.object);
    this.#camera.getWorldDirection(this.#viewDirection);
    const linearVelocity = throwProp
      ? this.#throwVelocity
          .copy(this.#viewDirection)
          .multiplyScalar(4.2)
          .add(this.#playerVelocity)
          .setY(this.#viewDirection.y * 4.2 + this.#playerVelocity.y + 0.8)
      : this.#playerVelocity;
    this.#physicsWorld.dropProp(record.id, {
      ...(throwProp ? {angularVelocity: {x: 0.35, y: 0.6, z: 0.25}} : {}),
      linearVelocity,
      pose: this.#physicsPose,
    });
    this.#restoreGhostedObject(record.ghostMaterialSwaps);
    this.#carriedProp = undefined;
    this.#propPlacementRotationMode = false;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #cancelCarriedProp() {
    const record = this.#carriedProp;
    const position = record?.placementStartPosition;
    const rotation = record?.placementStartRotation;
    if (!record || !position || !rotation) return;
    this.#dropCarriedProp();
    this.#physicsWorld.updatePropPose(record.id, {
      position: {x: position.x, y: position.y, z: position.z},
      rotation: {w: rotation.w, x: rotation.x, y: rotation.y, z: rotation.z},
    });
    record.placementStartPosition = undefined;
    record.placementStartRotation = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #createSpineShelfFixture(
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
    backingThickness = SPINE_SHELF_BACKING_THICKNESS,
    elevation = 0,
    axis: "x" | "z" = "z",
  ) {
    const alongX = axis === "x";
    this.#addBox(
      parent,
      alongX
        ? [length, 4.15, backingThickness]
        : [backingThickness, 4.15, length],
      [x, elevation + 2.05, z],
      backingMaterial,
    );

    for (const y of [0.2, 1.12, 2.04, 2.96, 3.88]) {
      const shelf = this.#addBox(
        parent,
        alongX ? [length, 0.09, 1.08] : [1.08, 0.09, length],
        [x, elevation + y, z],
        woodMaterial,
        true,
      );
      this.#registerPropPlacementSupport(shelf);
    }

    const bayWidth = length / bayCount;
    for (let divider = 0; divider <= bayCount; divider += 1)
      this.#addBox(
        parent,
        alongX ? [0.1, 4.12, 1.1] : [1.1, 4.12, 0.1],
        alongX
          ? [x - length / 2 + divider * bayWidth, elevation + 2.05, z]
          : [x, elevation + 2.05, z - length / 2 + divider * bayWidth],
        shelfEdgeMaterial,
      );
    if (alongX) {
      this.#createPosterSurface(
        parent,
        `${fixtureId}:end:west`,
        1,
        3.96,
        [x - length / 2 - 0.055, elevation + 2.05, z],
        -Math.PI / 2,
      );
      this.#createPosterSurface(
        parent,
        `${fixtureId}:end:east`,
        1,
        3.96,
        [x + length / 2 + 0.055, elevation + 2.05, z],
        Math.PI / 2,
      );
    } else {
      this.#createPosterSurface(
        parent,
        `${fixtureId}:end:north`,
        1,
        3.96,
        [x, elevation + 2.05, z - length / 2 - 0.055],
        Math.PI,
      );
      this.#createPosterSurface(
        parent,
        `${fixtureId}:end:south`,
        1,
        3.96,
        [x, elevation + 2.05, z + length / 2 + 0.055],
        0,
      );
    }

    for (const normal of faceNormals) {
      const shelfAxis = new Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1);
      const shelfNormal = new Vector3(
        alongX ? 0 : normal,
        0,
        alongX ? normal : 0,
      );
      let targetRotationY = normal > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (alongX) targetRotationY = normal > 0 ? 0 : Math.PI;
      for (let bay = 0; bay < bayCount; bay += 1) {
        const bayCenter = -length / 2 + bayWidth * (bay + 0.5);
        this.#createSpineShelfSignSlot(
          parent,
          `${fixtureId.toUpperCase()} · BAY ${String(bay + 1).padStart(2, "0")}`,
          alongX ? x + bayCenter : x + normal * 0.57,
          alongX ? z + normal * 0.57 : z + bayCenter,
          bayWidth - 0.22,
          targetRotationY,
          elevation,
        );
      }
      for (let row = 0; row < 4; row += 1) {
        for (let bay = 0; bay < bayCount; bay += 1) {
          let face = normal > 0 ? "east" : "west";
          if (alongX) face = normal > 0 ? "south" : "north";
          const shelfId = `${fixtureId}:${face}:${row}:${bay}`;
          const bayCenter = -length / 2 + bayWidth * (bay + 0.5);
          const frontCenter = new Vector3(
            alongX ? x + bayCenter : x + normal * 0.57,
            elevation + 0.25 + row * 0.92 + BOOK_HEIGHT / 2,
            alongX ? z + normal * 0.57 : z + bayCenter,
          );
          const definition: SpineShelfDefinition = {
            axis: shelfAxis,
            faceInset: FACE_OUT_SHELF_INSET,
            faceTilt: 0,
            frontCenter,
            halfWidth: (bayWidth - 0.18) / 2,
            id: shelfId,
            normal: shelfNormal,
          };
          this.#spineShelfDefinitions.set(shelfId, definition);
          const material = new MeshBasicMaterial({
            color: "#d94c3f",
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const target = new Mesh(
            new PlaneGeometry(bayWidth - 0.16, 0.76),
            material,
          );
          target.name = `spine-shelf-target-${shelfId}`;
          target.position.copy(frontCenter);
          target.rotation.y = targetRotationY;
          target.userData.shelfId = shelfId;
          parent.add(target);
          this.#shelfTargetMeshes.push(target);
        }
      }
    }
  }

  #createSpineShelfSignSlot(
    parent: Group,
    label: string,
    x: number,
    z: number,
    width: number,
    rotationY: number,
    elevation = 0,
  ) {
    const column = [...this.#signSlots.values()].filter(
      (slot) => slot.kind === "shelf",
    ).length;
    const group = new Group();
    group.position.set(x, elevation + 4.2, z);
    group.rotation.y = rotationY;
    const target = new Mesh(
      new PlaneGeometry(width, 0.5),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthWrite: false,
        opacity: 0.1,
        side: DoubleSide,
        transparent: true,
      }),
    );
    target.name = `spine-shelf-sign-target-${column}`;
    const id = String(column);
    const key = shopSignKey("shelf", id);
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#signTargetMeshes.push(target);
    this.#signSlots.set(key, {
      backgroundColor: "#354843",
      column,
      group,
      height: 0.46,
      id,
      kind: "shelf",
      label,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width,
    });
  }

  #createAisleSignSlot(
    parent: Group,
    id: string,
    x: number,
    title: string,
    subtitle: string,
  ) {
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(x, 4.35, 0.7);
    group.rotation.y = x < 0 ? 0.08 : -0.08;
    const target = new Mesh(
      new PlaneGeometry(2.6, 0.72),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthWrite: false,
        opacity: 0.1,
        side: DoubleSide,
        transparent: true,
      }),
    );
    target.name = `aisle-sign-target-${id}`;
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#signTargetMeshes.push(target);
    this.#signSlots.set(key, {
      backgroundColor: "#242e2b",
      group,
      height: 0.72,
      id,
      kind: "aisle",
      label: `AISLE ${id === "gondola-1" ? "01" : "02"}`,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.6,
    });
    this.#setSign(key, title, subtitle);
  }

  #createReadingChairInstance(
    parent: Group,
    id: string,
    chairBoxes: readonly ReadingFurnitureBox[],
    furnitureMaterials: ReadingFurnitureMaterials,
    position?: readonly [x: number, y: number, z: number],
    rotationY = 0,
  ) {
    const bounds = new Box3();
    const min = new Vector3();
    const max = new Vector3();
    for (const box of chairBoxes) {
      min.set(
        box.position.x - box.halfExtents.x,
        box.position.y - box.halfExtents.y,
        box.position.z - box.halfExtents.z,
      );
      max.set(
        box.position.x + box.halfExtents.x,
        box.position.y + box.halfExtents.y,
        box.position.z + box.halfExtents.z,
      );
      bounds.expandByPoint(min);
      bounds.expandByPoint(max);
    }
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const chair = new Group();
    chair.name = id;
    if (position) chair.position.set(...position);
    else chair.position.copy(center);
    chair.rotation.y = rotationY;
    let seat: Mesh | undefined;
    for (const box of chairBoxes) {
      const mesh = this.#addBox(
        chair,
        [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
        [
          box.position.x - center.x,
          box.position.y - center.y,
          box.position.z - center.z,
        ],
        furnitureMaterials[box.material],
        true,
      );
      if (box.material === "upholstery") seat = mesh;
    }
    parent.add(chair);
    this.#registerMovableProp({
      colliderParts: chairBoxes.map((box) => ({
        halfExtents: box.halfExtents,
        position: {
          x: box.position.x - center.x,
          y: box.position.y - center.y,
          z: box.position.z - center.z,
        },
      })),
      depth: size.z,
      staticWhenPlaced: true,
      heldLocalPosition: new Vector3(0, -1.05, -2.2),
      height: size.y,
      id,
      label: id.replaceAll("-", " "),
      object: chair,
      ...(seat ? {placementSupport: seat} : {}),
      rotationSnapStep: Math.PI / 2,
      width: size.x,
    });
  }

  #createReadingTables(parent: Group, woodMaterial: MeshStandardMaterial) {
    const legMaterial = new MeshStandardMaterial({
      color: "#2b2420",
      metalness: 0.3,
      roughness: 0.58,
    });
    const upholsteryMaterial = new MeshStandardMaterial({
      color: "#556e63",
      roughness: 0.92,
    });
    const furnitureMaterials: ReadingFurnitureMaterials = {
      leg: legMaterial,
      upholstery: upholsteryMaterial,
      wood: woodMaterial,
    };

    for (const box of READING_FURNITURE_BOXES) {
      if (box.movableId) continue;
      this.#addBox(
        parent,
        [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
        [box.position.x, box.position.y, box.position.z],
        furnitureMaterials[box.material],
        true,
      );
    }

    for (const [tableIndex, tableZ] of READING_TABLE_Z_POSITIONS.entries()) {
      const id = `reading-table-${tableIndex + 1}`;
      const table = new Group();
      table.name = id;
      table.position.set(0, READING_TABLE_SIZE.height / 2, tableZ);
      for (const box of READING_FURNITURE_BOXES) {
        if (box.movableId !== id) continue;
        this.#addBox(
          table,
          [box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2],
          [
            box.position.x,
            box.position.y - READING_TABLE_SIZE.height / 2,
            box.position.z - tableZ,
          ],
          furnitureMaterials[box.material],
          true,
        );
      }
      parent.add(table);
      const tableBoxes = READING_FURNITURE_BOXES.filter(
        (box) => box.movableId === id,
      );
      this.#registerMovableProp({
        colliderParts: tableBoxes.map((box) => ({
          halfExtents: box.halfExtents,
          position: {
            x: box.position.x,
            y: box.position.y - READING_TABLE_SIZE.height / 2,
            z: box.position.z - tableZ,
          },
        })),
        depth: READING_TABLE_SIZE.depth,
        staticWhenPlaced: true,
        heldLocalPosition: new Vector3(0, -1.15, -3.65),
        height: READING_TABLE_SIZE.height,
        id,
        label: `reading table ${tableIndex + 1}`,
        object: table,
        rotationSnapStep: Math.PI / 2,
        width: 2.4,
      });
    }

    const chairIds = new Set(
      READING_FURNITURE_BOXES.flatMap((box) =>
        box.movableId?.startsWith("reading-chair-") ? [box.movableId] : [],
      ),
    );
    for (const id of chairIds) {
      const chairBoxes = READING_FURNITURE_BOXES.filter(
        (box) => box.movableId === id,
      );
      this.#createReadingChairInstance(
        parent,
        id,
        chairBoxes,
        furnitureMaterials,
      );
    }

    void this.#createDeskLamps(parent);
    return furnitureMaterials;
  }

  async #createDeskLamps(parent: Group) {
    try {
      const gltf = await ShopScene.#modelLoader.loadAsync(lampModelUrl);
      if (this.#disposed) {
        disposeObject(gltf.scene);
        return;
      }

      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene);
      const height = bounds.max.y - bounds.min.y;
      if (!(height > 0)) {
        disposeObject(gltf.scene);
        throw new Error("The lamp model has no measurable height.");
      }

      const scale = DESK_LAMP_HEIGHT / height;
      const center = bounds.getCenter(new Vector3());
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.set(
        -center.x * scale,
        -bounds.min.y * scale,
        -center.z * scale,
      );
      gltf.scene.name = "reading-table-lamp";
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });

      for (const [index, z] of READING_TABLE_Z_POSITIONS.entries()) {
        const lamp = index === 0 ? gltf.scene : gltf.scene.clone(true);
        const spawnClearance =
          index === 1
            ? CRT_TABLE_DESK_LAMP_SPAWN_CLEARANCE
            : DESK_LAMP_SPAWN_CLEARANCE;
        lamp.position.y =
          READING_TABLE_SURFACE_Y + spawnClearance - bounds.min.y * scale;
        lamp.position.z = z - center.z * scale;
        parent.add(lamp);
        const lampBounds = new Box3().setFromObject(lamp);
        const lampSize = lampBounds.getSize(new Vector3());
        const lampRoot = new Group();
        lampRoot.name = `desk-lamp-${index + 1}`;
        lampRoot.position.copy(lampBounds.getCenter(new Vector3()));
        parent.add(lampRoot);
        lampRoot.attach(lamp);
        this.#registerMovableProp({
          density: 8,
          depth: lampSize.z,
          heldLocalPosition: new Vector3(0, -0.12, -1.6),
          height: lampSize.y,
          id: `desk-lamp-${index + 1}`,
          label: `desk lamp ${index + 1}`,
          object: lampRoot,
          width: lampSize.x,
        });
      }
    } catch (error) {
      if (DEV && !this.#disposed)
        console.warn("Afterleaf could not load the desk lamp model.", error);
    }
  }

  #createRareRoom(
    parent: Group,
    wallMaterial: MeshStandardMaterial,
    woodMaterial: MeshStandardMaterial,
    shelfBackingMaterial: MeshStandardMaterial,
    shelfEdgeMaterial: MeshStandardMaterial,
  ) {
    const carpetMaterial = new MeshStandardMaterial({
      color: "#4d2528",
      roughness: 1,
    });
    const carpet = new Mesh(new PlaneGeometry(5.25, 8.15), carpetMaterial);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(RARE_ROOM_CENTER_X, 0.012, RARE_ROOM_CENTER_Z);
    carpet.receiveShadow = true;
    parent.add(carpet);

    this.#addBox(
      parent,
      [0.18, 4.55, 8.5],
      [5.45, 2.275, RARE_ROOM_CENTER_Z],
      wallMaterial,
    );

    this.#createSpineShelfFixture(
      parent,
      "special-collection",
      5.45,
      RARE_ROOM_CENTER_Z,
      8.1,
      4,
      [-1, 1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      SPECIAL_COLLECTION_BACKING_THICKNESS,
    );
    this.#addBox(parent, [2.05, 4.55, 0.18], [6.475, 2.275, -2], wallMaterial);
    this.#addBox(parent, [1.7, 4.55, 0.18], [10.15, 2.275, -2], wallMaterial);
    this.#addBox(parent, [2.1, 1.45, 0.18], [8.4, 3.825, -2], wallMaterial);

    const frameMaterial = woodMaterial.clone();
    frameMaterial.color.set("#7d6658");
    frameMaterial.roughness = 0.8;
    this.#addBox(
      parent,
      [0.16, 3.05, 0.28],
      [7.43, 1.525, -1.98],
      frameMaterial,
      true,
    );
    this.#addBox(
      parent,
      [0.16, 3.05, 0.28],
      [9.37, 1.525, -1.98],
      frameMaterial,
      true,
    );
    this.#addBox(
      parent,
      [2.1, 0.18, 0.28],
      [8.4, 3.01, -1.98],
      frameMaterial,
      true,
    );

    const door = this.#rareRoomDoorPivot;
    door.name = "special-collection-door";
    door.position.set(7.52, 0, RARE_ROOM_DOOR_Z);
    parent.add(door);
    const doorMaterial = woodMaterial.clone();
    doorMaterial.color.set("#d6b499");
    doorMaterial.roughness = 0.72;
    this.#addBox(door, [1.77, 2.9, 0.12], [0.885, 1.45, 0], doorMaterial, true);
    for (const side of [-1, 1])
      for (const y of [0.75, 2.05])
        this.#addBox(
          door,
          [1.29, 0.9, 0.055],
          [0.885, y, side * 0.085],
          frameMaterial,
          true,
        );
    const handleMaterial = new MeshStandardMaterial({
      color: "#b89a55",
      metalness: 0.82,
      roughness: 0.26,
    });
    const handleGeometry = new CylinderGeometry(0.055, 0.055, 0.16, 14);
    for (const side of [-1, 1]) {
      const handle = new Mesh(handleGeometry, handleMaterial);
      handle.position.set(1.5, 1.42, side * 0.13);
      handle.rotation.x = Math.PI / 2;
      handle.castShadow = true;
      door.add(handle);
    }

    this.#createRareRoomSignSlot(parent);
  }

  #createRareRoomSignSlot(parent: Group) {
    const id = "special-collection";
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(RARE_ROOM_DOOR_CENTER_X, 3.55, -1.88);
    const target = new Mesh(
      new PlaneGeometry(2.65, 0.58),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthWrite: false,
        opacity: 0.1,
        side: DoubleSide,
        transparent: true,
      }),
    );
    target.name = "special-collection-sign-target";
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#signTargetMeshes.push(target);
    this.#signSlots.set(key, {
      backgroundColor: "#3e251e",
      group,
      height: 0.58,
      id,
      kind: "aisle",
      label: "SPECIAL COLLECTION",
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.65,
    });
  }

  #updateRareRoomDoor(deltaSeconds: number) {
    const distance = Math.hypot(
      this.#camera.position.x - RARE_ROOM_DOOR_CENTER_X,
      this.#camera.position.z - RARE_ROOM_DOOR_Z,
    );
    const target = distance < 3.35 ? 1 : 0;
    this.#rareRoomDoorOpen = MathUtils.damp(
      this.#rareRoomDoorOpen,
      target,
      target > 0 ? 9 : 5,
      deltaSeconds,
    );
    this.#rareRoomDoorPivot.rotation.y =
      this.#rareRoomDoorOpen * Math.PI * 0.52;
  }

  #updateHallwayDoors(deltaSeconds: number) {
    for (const door of this.#hallwayDoors) {
      const distance = Math.hypot(
        this.#camera.position.x - door.centerX,
        this.#camera.position.z - door.centerZ,
      );
      const target = distance < 3.35 ? 1 : 0;
      door.open = MathUtils.damp(
        door.open,
        target,
        target > 0 ? 9 : 5,
        deltaSeconds,
      );
      door.pivot.rotation.y = door.open * door.openAngle;
    }
  }

  #createCeilingLights(parent: Group) {
    const fixtureMaterial = new MeshStandardMaterial({
      color: "#dce9e2",
      emissive: "#dff9ed",
      emissiveIntensity: 3.8,
      roughness: 0.28,
    });
    const housingMaterial = new MeshStandardMaterial({
      color: "#525c58",
      metalness: 0.6,
      roughness: 0.42,
    });
    for (const x of CEILING_LIGHT_COLUMNS)
      for (const z of CEILING_LIGHT_ROWS) {
        if (x > 0 && z === -7) continue;
        this.#addBox(parent, [2.15, 0.05, 0.25], [x, 4.47, z], housingMaterial);
        this.#addBox(
          parent,
          [1.92, 0.025, 0.12],
          [x, 4.43, z],
          fixtureMaterial,
        );
      }
    const rareRoomHousing = this.#addBox(
      parent,
      [2.15, 0.05, 0.25],
      [RARE_ROOM_CENTER_X, 4.47, RARE_ROOM_CENTER_Z],
      housingMaterial,
    );
    rareRoomHousing.rotation.y = Math.PI / 2;
    const rareRoomFixture = this.#addBox(
      parent,
      [1.92, 0.025, 0.12],
      [RARE_ROOM_CENTER_X, 4.43, RARE_ROOM_CENTER_Z],
      fixtureMaterial,
    );
    rareRoomFixture.rotation.y = Math.PI / 2;
  }

  #createNightWindows(parent: Group) {
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
      this.#addBox(parent, [2.2, 2.15, 0.035], [x, 2.8, -10.39], nightGlass);
      this.#addBox(parent, [2.3, 0.07, 0.09], [x, 1.7, -10.32], frame);
      this.#addBox(parent, [2.3, 0.07, 0.09], [x, 3.9, -10.32], frame);
      this.#addBox(parent, [0.07, 2.25, 0.09], [x - 1.15, 2.8, -10.32], frame);
      this.#addBox(parent, [0.07, 2.25, 0.09], [x + 1.15, 2.8, -10.32], frame);
      this.#addBox(parent, [0.05, 2.16, 0.08], [x, 2.8, -10.31], frame);
    }
  }

  #createMoonEnvironment() {
    const environment = this.#textureLoader.load(moonriseSkyUrl);
    environment.colorSpace = SRGBColorSpace;
    environment.mapping = EquirectangularReflectionMapping;
    return environment;
  }

  #createHorizontalShape(
    parent: Group,
    bounds: {maxX: number; maxZ: number; minX: number; minZ: number},
    holes: readonly {
      maxX: number;
      maxZ: number;
      minX: number;
      minZ: number;
    }[],
    y: number,
    material: MeshStandardMaterial,
  ) {
    const localMinY = -bounds.maxZ;
    const localMaxY = -bounds.minZ;
    const shape = new Shape();
    shape.moveTo(bounds.minX, localMinY);
    shape.lineTo(bounds.minX, localMaxY);
    shape.lineTo(bounds.maxX, localMaxY);
    shape.lineTo(bounds.maxX, localMinY);
    shape.closePath();
    for (const holeBounds of holes) {
      const localHoleMinY = -holeBounds.maxZ;
      const localHoleMaxY = -holeBounds.minZ;
      const hole = new Path();
      hole.moveTo(holeBounds.minX, localHoleMinY);
      hole.lineTo(holeBounds.maxX, localHoleMinY);
      hole.lineTo(holeBounds.maxX, localHoleMaxY);
      hole.lineTo(holeBounds.minX, localHoleMaxY);
      hole.closePath();
      shape.holes.push(hole);
    }
    const mesh = new Mesh(new ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  #createFloorUnderside(parent: Group, surface: Mesh<BufferGeometry>) {
    const underside = new Mesh(
      surface.geometry,
      new MeshBasicMaterial({color: "#242a28", side: BackSide}),
    );
    underside.name = `${surface.name || "floor"}-underside`;
    underside.position.copy(surface.position);
    underside.quaternion.copy(surface.quaternion);
    parent.add(underside);
  }

  #createUpperFloorStructures(parent: Group) {
    const material = new MeshBasicMaterial({color: "#242a28"});
    for (const box of SHOP_UPPER_FLOOR_BOXES) {
      const floorStructure = new Mesh(new BoxGeometry(...box.size), material);
      floorStructure.position.set(...box.position);
      parent.add(floorStructure);
      this.#registerPropPlacementSupport(floorStructure);
    }
  }

  #createTiledFloorSurface(
    parent: Group,
    bounds: {maxX: number; maxZ: number; minX: number; minZ: number},
    floorMaterial: MeshStandardMaterial,
    holes: readonly {
      maxX: number;
      maxZ: number;
      minX: number;
      minZ: number;
    }[] = [],
    y = SHOP_UPPER_FLOOR_Y + 0.002,
  ) {
    const material = floorMaterial.clone();
    const floor = this.#createHorizontalShape(
      parent,
      bounds,
      holes,
      y,
      material,
    );
    return floor;
  }

  #createAtriumRailings(parent: Group, woodMaterial: MeshStandardMaterial) {
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
        this.#addBox(
          parent,
          alongX ? [length, 0.1, 0.1] : [0.1, 0.1, length],
          alongX ? [center, y, fixed] : [fixed, y, center],
          woodMaterial,
          true,
        );
    };
    const addPost = (x: number, z: number) =>
      this.#addBox(
        parent,
        [0.12, 1.22, 0.12],
        [x, postY, z],
        woodMaterial,
        true,
      );
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
  }

  #createStackableStairwell(parent: Group, woodMaterial: MeshStandardMaterial) {
    const stairBoxes = createStackableStairBoxes(0);
    const landingMaterial = woodMaterial.clone();
    landingMaterial.color.offsetHSL(0, -0.08, 0.08);
    for (const [index, box] of stairBoxes.entries()) {
      const isTopLanding = index === stairBoxes.length - 1;
      const visualMinX = isTopLanding
        ? Math.max(box.position[0] - box.size[0] / 2, SHOP_STAIR_ROOM.minX)
        : box.position[0] - box.size[0] / 2;
      const visualMaxX = box.position[0] + box.size[0] / 2;
      this.#addBox(
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
      const slope =
        (lastTop - firstTop) / (last.position[0] - first.position[0]);
      const minX = first.position[0] - first.size[0] / 2;
      const maxX = last.position[0] + last.size[0] / 2;
      const treadYAt = (x: number) =>
        firstTop + slope * (x - first.position[0]);
      const edgeOffset = first.size[2] / 2 - SHOP_STAIR_RAIL_INSET;
      for (const z of [
        first.position[2] - edgeOffset,
        first.position[2] + edgeOffset,
      ]) {
        for (const height of [0.55, 1]) {
          const startY = treadYAt(minX) + height;
          const endY = treadYAt(maxX) + height;
          const rail = this.#addBox(
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
          this.#addBox(
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
        this.#addBox(
          parent,
          alongX ? [length, 0.1, 0.1] : [0.1, 0.1, length],
          [position[0], top + height, position[2]],
          woodMaterial,
          true,
        );
      const halfLength = length / 2;
      for (const offset of [-halfLength, 0, halfLength])
        this.#addBox(
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
  }

  #createUpperWindowWall(
    parent: Group,
    z: number,
    rotationY: number,
    wallMaterial: MeshStandardMaterial,
    frameMaterial: MeshStandardMaterial,
    glassMaterial: MeshBasicMaterial,
  ) {
    this.#addBox(parent, [25, 0.7, 0.18], [0, 5.25, z], wallMaterial);
    this.#addBox(parent, [25, 0.7, 0.18], [0, 9.45, z], wallMaterial);
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
      this.#addBox(
        parent,
        [run.max - run.min, 3.5, 0.18],
        [(run.min + run.max) / 2, 7.35, z],
        wallMaterial,
      );

      const surfaceWidth = run.max - run.min - 0.12;
      if (surfaceWidth <= MIN_POSTER_HEIGHT) continue;
      this.#createPosterSurface(
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
        this.#addBox(
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
        this.#addBox(
          parent,
          [UPPER_WINDOW_WIDTH + 0.12, 0.09, 0.12],
          [x, frameY, glassZ],
          frameMaterial,
          true,
        );
    }
  }

  #createUpperReadingFurniture(
    parent: Group,
    woodMaterial: MeshStandardMaterial,
    furnitureMaterials: ReadingFurnitureMaterials,
  ) {
    const chairTemplate = READING_FURNITURE_BOXES.filter(
      (box) => box.movableId === "reading-chair-1",
    );
    const chairMinY = Math.min(
      ...chairTemplate.map((box) => box.position.y - box.halfExtents.y),
    );
    const chairMaxY = Math.max(
      ...chairTemplate.map((box) => box.position.y + box.halfExtents.y),
    );
    const chairCenterY = SHOP_UPPER_FLOOR_Y + (chairMinY + chairMaxY) / 2;
    for (const table of [
      {id: "west", x: -8.25},
      {id: "center", x: -3.5},
    ] as const) {
      const x = table.x;
      this.#addBox(parent, [2.7, 0.14, 1.3], [x, 5.72, 23], woodMaterial, true);
      for (const offsetX of [-1.08, 1.08])
        for (const offsetZ of [-0.43, 0.43])
          this.#addBox(
            parent,
            [0.09, 0.78, 0.09],
            [x + offsetX, 5.29, 23 + offsetZ],
            furnitureMaterials.leg,
            true,
          );
      for (const z of [21.95, 24.05]) {
        this.#createReadingChairInstance(
          parent,
          `upper-reading-chair-${table.id}-${z < 23 ? "north" : "south"}`,
          chairTemplate,
          furnitureMaterials,
          [x, chairCenterY, z],
          z < 23 ? -Math.PI / 2 : Math.PI / 2,
        );
      }
    }
  }

  #createTheatreSeating(parent: Group) {
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
        this.#addBox(
          parent,
          [row.platformWidth, row.height, 6.4],
          [row.platformCenterX, SHOP_UPPER_FLOOR_Y + row.height / 2, bankZ],
          riserMaterial,
        );
        this.#addBox(
          parent,
          [0.08, 0.04, 5.8],
          [
            row.platformCenterX - row.platformWidth / 2 + 0.05,
            SHOP_UPPER_FLOOR_Y + row.height + 0.025,
            bankZ,
          ],
          aisleLightMaterial,
        );
      }
      for (const z of [12.5, 14.25, 16, 21, 22.75, 24.5]) {
        this.#addBox(
          parent,
          [0.72, 0.12, 1.1],
          [row.x, SHOP_UPPER_FLOOR_Y + row.height + 0.43, z],
          seatMaterial,
          true,
        );
        this.#addBox(
          parent,
          [0.12, 0.9, 1.1],
          [row.x + 0.33, SHOP_UPPER_FLOOR_Y + row.height + 0.82, z],
          seatMaterial,
          true,
        );
        for (const legZ of [-0.42, 0.42])
          this.#addBox(
            parent,
            [0.07, 0.48, 0.07],
            [row.x, SHOP_UPPER_FLOOR_Y + row.height + 0.24, z + legZ],
            frameMaterial,
            true,
          );
      }
    }
  }

  #createRoomSignSlot(
    parent: Group,
    id: string,
    label: string,
    title: string,
    subtitle: string,
    position: readonly [x: number, y: number, z: number],
    rotationY: number,
  ) {
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(...position);
    group.rotation.y = rotationY;
    const target = new Mesh(
      new PlaneGeometry(2.8, 0.64),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthWrite: false,
        opacity: 0.1,
        side: DoubleSide,
        transparent: true,
      }),
    );
    target.name = `${id}-sign-target`;
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#signTargetMeshes.push(target);
    this.#signSlots.set(key, {
      backgroundColor: id === "moonlight-theatre" ? "#25213c" : "#24353d",
      group,
      height: 0.64,
      id,
      kind: "aisle",
      label,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.8,
    });
    this.#setSign(key, title, subtitle);
  }

  #createHallwayDoor(
    parent: Group,
    id: string,
    centerX: number,
    centerZ: number,
    wallAxis: "x" | "z",
    corridorDirection: -1 | 1,
    woodMaterial: MeshStandardMaterial,
  ) {
    const frameMaterial = woodMaterial.clone();
    frameMaterial.color.set("#3d302a");
    const doorMaterial = woodMaterial.clone();
    doorMaterial.color.set("#594038");
    const frameThickness = 0.18;
    const framePostOffset = 1.42;
    const frameHeaderCenterY = SHOP_UPPER_FLOOR_Y + 2.52;
    const leafHalfWidth = framePostOffset - frameThickness / 2;
    const leafHeight =
      frameHeaderCenterY - frameThickness / 2 - SHOP_UPPER_FLOOR_Y;
    const frameCenterY = SHOP_UPPER_FLOOR_Y + 1.3;
    const doorGroup = new Group();
    doorGroup.name = `upper-hallway-door-${id}`;
    doorGroup.position.set(centerX, 0, centerZ);
    if (wallAxis === "z") doorGroup.rotation.y = Math.PI / 2;
    parent.add(doorGroup);
    for (const z of [-framePostOffset, framePostOffset])
      this.#addBox(
        doorGroup,
        [frameThickness, 2.6, frameThickness],
        [0, frameCenterY, z],
        frameMaterial,
        true,
      );
    this.#addBox(
      doorGroup,
      [frameThickness, frameThickness, 3],
      [0, frameHeaderCenterY, 0],
      frameMaterial,
      true,
    );
    for (const side of [-1, 1] as const) {
      const pivot = new Group();
      pivot.name = `upper-hallway-door-${id}-${side < 0 ? "first" : "second"}`;
      pivot.position.set(0, SHOP_UPPER_FLOOR_Y, side * leafHalfWidth);
      doorGroup.add(pivot);

      const leafCenterZ = (-side * leafHalfWidth) / 2;
      this.#addBox(
        pivot,
        [0.12, leafHeight, leafHalfWidth],
        [0, leafHeight / 2, leafCenterZ],
        doorMaterial,
        true,
      );
      for (const face of [-1, 1] as const)
        for (const y of [0.68, 1.72])
          this.#addBox(
            pivot,
            [0.055, 0.76, 0.92],
            [face * 0.085, y, leafCenterZ],
            frameMaterial,
            true,
          );
      for (const face of [-1, 1] as const)
        this.#addBox(
          pivot,
          [0.1, 0.09, 0.09],
          [face * 0.13, 1.16, -side * 1.08],
          frameMaterial,
        );
      this.#hallwayDoors.push({
        centerX,
        centerZ,
        open: 0,
        openAngle: -corridorDirection * side * Math.PI * 0.5,
        pivot,
      });
    }
  }

  #registerTelevision(saveId: string, television: ShopTelevision) {
    this.#televisionsBySaveId.set(saveId, television);
    this.#televisions.push(television);
  }

  #createTelevisionRooms(parent: Group, woodMaterial: MeshStandardMaterial) {
    const theatreTelevision = new ShopTelevision({
      audioManager: this.#audioManager,
      flatScreen: {height: 6.6, width: 11.75},
      initialChannelId:
        this.#pendingWorldSave?.televisionChannels?.[
          THEATRE_TELEVISION_SAVE_ID
        ] ??
        this.#pendingWorldSave?.televisionChannels?.[FIXED_TELEVISION_SAVE_ID],
      initialVolume:
        this.#pendingWorldSave?.televisionVolumes?.[
          THEATRE_TELEVISION_SAVE_ID
        ] ??
        this.#pendingWorldSave?.televisionVolumes?.[FIXED_TELEVISION_SAVE_ID],
      loadChannels: this.#loadSharedTvChannels,
      onChannelChange: this.#markTelevisionSettingChanged,
      onStateChange: () => this.#emitGameState(),
      onVolumeChange: this.#markTelevisionSettingChanged,
      parent,
      position: [-33.78, 9.75, SHOP_THEATRE.centerZ],
      rotationY: Math.PI / 2,
      tableMaterial: woodMaterial,
    });
    theatreTelevision.object.name = `${THEATRE_TELEVISION_SAVE_ID}-screen`;
    this.#registerTelevision(THEATRE_TELEVISION_SAVE_ID, theatreTelevision);

    const theatreTrimMaterial = new MeshStandardMaterial({
      color: "#120f17",
      metalness: 0.16,
      roughness: 0.86,
    });
    const acousticMaterial = new MeshStandardMaterial({
      color: "#322738",
      roughness: 0.98,
    });
    this.#addBox(
      parent,
      [1.45, 0.32, 14.5],
      [-33.05, SHOP_UPPER_FLOOR_Y + 0.16, SHOP_THEATRE.centerZ],
      theatreTrimMaterial,
    );
    for (const z of [12.35, 24.65])
      this.#addBox(
        parent,
        [0.3, 7.35, 0.34],
        [-33.64, 9.78, z],
        theatreTrimMaterial,
      );
    this.#addBox(
      parent,
      [0.3, 0.3, 12.65],
      [-33.64, 13.42, SHOP_THEATRE.centerZ],
      theatreTrimMaterial,
    );
    for (const x of [-20, -24, -28, -32]) {
      for (const z of [10.68, 26.32])
        this.#addBox(parent, [2.25, 2.2, 0.16], [x, 9.15, z], acousticMaterial);
      this.#addBox(
        parent,
        [2.6, 0.12, 12.5],
        [x, 15.38, SHOP_THEATRE.centerZ],
        acousticMaterial,
      );
    }

    const shelfMaterial = woodMaterial.clone();
    shelfMaterial.color.set("#75665d");
    const shelfYs = [5.02, 6.32, 7.62, 8.92] as const;
    const addShelfBank = (
      axis: "x" | "z",
      backingPosition: readonly [x: number, y: number, z: number],
      shelfPosition: readonly [x: number, z: number],
      length: number,
    ) => {
      const alongX = axis === "x";
      this.#addBox(
        parent,
        alongX ? [length, 4.05, 0.34] : [0.34, 4.05, length],
        backingPosition,
        shelfMaterial,
        true,
      );
      for (const y of shelfYs) {
        const shelf = this.#addBox(
          parent,
          alongX ? [length, 0.1, 1.2] : [1.2, 0.1, length],
          [shelfPosition[0], y, shelfPosition[1]],
          shelfMaterial,
          true,
        );
        this.#registerPropPlacementSupport(shelf);
      }
    };
    addShelfBank("z", [23.03, 6.95, 18.3], [22.6, 18.3], 8.2);
    addShelfBank("z", [16.97, 6.95, 16.45], [17.4, 16.45], 4.7);
    addShelfBank(
      "x",
      [SHOP_TV_CAVE.centerX, 6.95, 14.27],
      [SHOP_TV_CAVE.centerX, 14.7],
      6.45,
    );
    addShelfBank(
      "x",
      [SHOP_TV_CAVE.centerX, 6.95, 22.33],
      [SHOP_TV_CAVE.centerX, 21.9],
      6.45,
    );

    const rowYs = shelfYs
      .slice(0, 3)
      .map((y) => y + SHOP_MODEL_TELEVISION_SIZE.height / 2 + 0.04);
    const addCrt = (
      wall: "east" | "north" | "south" | "west",
      row: number,
      column: number,
      position: readonly [x: number, y: number, z: number],
      rotationY: number,
    ) => {
      const id = `tv-cave-v6-${wall}-${row + 1}-${column + 1}`;
      const television = new ShopTelevision({
        audioManager: this.#audioManager,
        initialChannelId:
          this.#pendingWorldSave?.televisionChannels?.[id] ??
          this.#pendingWorldSave?.televisionChannels?.[
            MOVABLE_TELEVISION_SAVE_ID
          ],
        initialVolume:
          this.#pendingWorldSave?.televisionVolumes?.[id] ??
          this.#pendingWorldSave?.televisionVolumes?.[
            MOVABLE_TELEVISION_SAVE_ID
          ],
        loadChannels: this.#loadSharedTvChannels,
        model: {
          screenAspect: 4 / 3,
          screenNodeName: "Screen",
          screenSafeArea: CRT_TV_SAFE_AREA,
          scale: SHOP_MODEL_TELEVISION_SCALE,
          url: crtTvModelUrl,
        },
        onChannelChange: this.#markTelevisionSettingChanged,
        onStateChange: () => this.#emitGameState(),
        onVolumeChange: this.#markTelevisionSettingChanged,
        parent,
        position,
        rotationY,
        tableMaterial: woodMaterial,
      });
      television.object.name = id;
      this.#registerTelevision(id, television);
      const prop = this.#registerMovableProp({
        density: 45,
        depth: SHOP_MODEL_TELEVISION_SIZE.depth,
        height: SHOP_MODEL_TELEVISION_SIZE.height,
        heldLocalPosition: new Vector3(0, -0.12, -1.45),
        id,
        label: `TV cave ${wall} CRT ${row + 1}-${column + 1}`,
        object: television.object,
        staticWhenPlaced: true,
        targetable: false,
        width: SHOP_MODEL_TELEVISION_SIZE.width,
      });
      this.#televisionProps.set(television, prop);
    };

    const eastColumnZs = [14.6, 16.3, 18, 19.7, 21.4] as const;
    const westColumnZs = [14.7, 16.3, 17.9] as const;
    const crossWallColumnXs = [17.5, 19.5, 21.5] as const;
    for (const [row, y] of rowYs.entries()) {
      for (const [column, z] of eastColumnZs.entries())
        addCrt("east", row, column, [22.4, y, z], Math.PI / 2);
      for (const [column, z] of westColumnZs.entries())
        addCrt("west", row, column, [17.6, y, z], -Math.PI / 2);
      for (const [column, x] of crossWallColumnXs.entries()) {
        addCrt("north", row, column, [x, y, 14.4], Math.PI);
        addCrt("south", row, column, [x, y, 22.2], 0);
      }
    }
  }

  #createShopExpansion(
    parent: Group,
    floorMaterial: MeshStandardMaterial,
    wallMaterial: MeshStandardMaterial,
    woodMaterial: MeshStandardMaterial,
    shelfBackingMaterial: MeshStandardMaterial,
    shelfEdgeMaterial: MeshStandardMaterial,
    readingFurnitureMaterials: ReadingFurnitureMaterials,
  ) {
    this.#createUpperFloorStructures(parent);
    const stairFloorStructure = new Mesh(
      new BoxGeometry(
        SHOP_STAIR_ROOM.maxX - SHOP_STAIR_ROOM.minX,
        0.18,
        SHOP_STAIR_ROOM.maxZ - SHOP_STAIR_ROOM.minZ,
      ),
      new MeshBasicMaterial({color: "#242a28"}),
    );
    stairFloorStructure.position.set(
      (SHOP_STAIR_ROOM.minX + SHOP_STAIR_ROOM.maxX) / 2,
      -0.092,
      (SHOP_STAIR_ROOM.minZ + SHOP_STAIR_ROOM.maxZ) / 2,
    );
    parent.add(stairFloorStructure);
    this.#createTiledFloorSurface(
      parent,
      SHOP_STAIR_ROOM,
      floorMaterial,
      [],
      0.012,
    );
    this.#createTiledFloorSurface(
      parent,
      {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5},
      floorMaterial,
      [SHOP_ATRIUM],
    );
    this.#createTiledFloorSurface(
      parent,
      {
        maxX: SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2,
        maxZ: SHOP_THEATRE_HALL.centerZ + SHOP_THEATRE_HALL.depth / 2,
        minX: SHOP_THEATRE_HALL.centerX - SHOP_THEATRE_HALL.width / 2,
        minZ: SHOP_THEATRE_HALL.centerZ - SHOP_THEATRE_HALL.depth / 2,
      },
      floorMaterial,
    );
    this.#createTiledFloorSurface(
      parent,
      {
        maxX: SHOP_TV_CAVE_HALL.centerX + SHOP_TV_CAVE_HALL.width / 2,
        maxZ: SHOP_TV_CAVE_HALL.centerZ + SHOP_TV_CAVE_HALL.depth / 2,
        minX: SHOP_TV_CAVE_HALL.centerX - SHOP_TV_CAVE_HALL.width / 2,
        minZ: SHOP_TV_CAVE_HALL.centerZ - SHOP_TV_CAVE_HALL.depth / 2,
      },
      floorMaterial,
    );
    this.#createTiledFloorSurface(
      parent,
      {
        maxX: SHOP_TV_CAVE.centerX + SHOP_TV_CAVE.width / 2,
        maxZ: SHOP_TV_CAVE.centerZ + SHOP_TV_CAVE.depth / 2,
        minX: SHOP_TV_CAVE.centerX - SHOP_TV_CAVE.width / 2,
        minZ: SHOP_TV_CAVE.centerZ - SHOP_TV_CAVE.depth / 2,
      },
      floorMaterial,
    );
    const theatreCarpet = new Mesh(
      new PlaneGeometry(SHOP_THEATRE.width, SHOP_THEATRE.depth),
      new MeshStandardMaterial({
        color: "#211c2b",
        roughness: 1,
      }),
    );
    theatreCarpet.rotation.x = -Math.PI / 2;
    theatreCarpet.position.set(
      SHOP_THEATRE.centerX,
      SHOP_UPPER_FLOOR_Y + 0.012,
      SHOP_THEATRE.centerZ,
    );
    theatreCarpet.receiveShadow = true;
    parent.add(theatreCarpet);

    const upperWallMaterial = wallMaterial.clone();
    upperWallMaterial.color.set("#d7ddd6");
    const darkWallMaterial = wallMaterial.clone();
    darkWallMaterial.color.set("#59626a");
    const frameMaterial = woodMaterial.clone();
    frameMaterial.color.set("#473c36");
    const glassMaterial = new MeshBasicMaterial({
      color: "#183b4d",
      depthWrite: false,
      opacity: 0.32,
      side: DoubleSide,
      transparent: true,
    });
    glassMaterial.forceSinglePass = true;
    this.#createUpperWindowWall(
      parent,
      -10.5,
      0,
      upperWallMaterial,
      frameMaterial,
      glassMaterial,
    );
    this.#createUpperWindowWall(
      parent,
      28,
      Math.PI,
      upperWallMaterial,
      frameMaterial,
      glassMaterial,
    );
    for (const [index, box] of SHOP_EXPANSION_WALL_BOXES.entries()) {
      if (index < 2) continue;
      let roomWall = upperWallMaterial;
      if (box.position[1] < SHOP_UPPER_FLOOR_Y) roomWall = wallMaterial;
      else if (box.position[0] < -16) roomWall = darkWallMaterial;
      this.#addBox(parent, box.size, box.position, roomWall);
      this.#createWallPosterSurfaces(
        parent,
        `expansion-wall-${index + 1}`,
        box,
      );
    }

    this.#createHallwayDoor(
      parent,
      "theatre",
      SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2 + 0.12,
      SHOP_THEATRE_HALL.centerZ,
      "x",
      -1,
      woodMaterial,
    );
    this.#createHallwayDoor(
      parent,
      "tv-cave",
      12.38,
      SHOP_TV_CAVE_DOOR_CENTER_Z,
      "x",
      1,
      woodMaterial,
    );

    this.#createAtriumRailings(parent, woodMaterial);
    this.#createStackableStairwell(parent, woodMaterial);
    this.#createSpineShelfFixture(
      parent,
      "mezzanine-west",
      -11.45,
      -5,
      9,
      3,
      [1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      SPINE_SHELF_BACKING_THICKNESS,
      SHOP_UPPER_FLOOR_Y,
    );
    this.#createSpineShelfFixture(
      parent,
      "mezzanine-east",
      11.45,
      -5,
      9,
      3,
      [-1],
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      SPINE_SHELF_BACKING_THICKNESS,
      SHOP_UPPER_FLOOR_Y,
    );
    for (const side of [-1, 1] as const)
      for (const [index, z] of SHOP_UPPER_STACK_ZS.entries())
        this.#createSpineShelfFixture(
          parent,
          `mezzanine-${side < 0 ? "west" : "east"}-stack-${index + 1}`,
          side * SHOP_UPPER_STACK_CENTER_X,
          z,
          SHOP_UPPER_STACK_LENGTH,
          2,
          [-1, 1],
          woodMaterial,
          shelfBackingMaterial,
          shelfEdgeMaterial,
          SPINE_SHELF_BACKING_THICKNESS,
          SHOP_UPPER_FLOOR_Y,
          "x",
        );
    this.#createUpperReadingFurniture(
      parent,
      woodMaterial,
      readingFurnitureMaterials,
    );
    this.#createTheatreSeating(parent);
    this.#createTelevisionRooms(parent, woodMaterial);
    this.#createRoomSignSlot(
      parent,
      "moonlight-theatre",
      "MOONLIGHT THEATRE",
      "MOONLIGHT THEATRE",
      "SCREENING ROOM · WEST HALL",
      [-12.37, 7.72, 18.5],
      Math.PI / 2,
    );
    this.#createRoomSignSlot(
      parent,
      "tv-cave",
      "TV CAVE",
      "TV CAVE",
      "SIMULCAST CRT ROOM · EAST ANNEX",
      [12.37, 7.72, SHOP_TV_CAVE_DOOR_CENTER_Z],
      -Math.PI / 2,
    );

    const roofMaterial = new MeshStandardMaterial({
      color: "#1d2927",
      metalness: 0.22,
      roughness: 0.82,
    });
    const skylight = SHOP_ATRIUM;
    const skylightWidth = skylight.maxX - skylight.minX;
    const skylightDepth = skylight.maxZ - skylight.minZ;
    const skylightCenterX = (skylight.minX + skylight.maxX) / 2;
    const skylightCenterZ = (skylight.minZ + skylight.maxZ) / 2;
    const roof = this.#createHorizontalShape(
      parent,
      {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5},
      [skylight],
      SHOP_UPPER_CEILING_Y,
      roofMaterial,
    );
    roof.name = "main-roof";
    this.#createFloorUnderside(parent, roof);
    const stairRoof = this.#createHorizontalShape(
      parent,
      SHOP_STAIR_ROOM,
      [],
      SHOP_UPPER_CEILING_Y,
      roofMaterial,
    );
    stairRoof.name = "stair-tower-roof";
    this.#createFloorUnderside(parent, stairRoof);
    const skylightGlass = new Mesh(
      new PlaneGeometry(skylightWidth, skylightDepth),
      glassMaterial,
    );
    skylightGlass.rotation.x = -Math.PI / 2;
    skylightGlass.position.set(
      skylightCenterX,
      SHOP_UPPER_CEILING_Y + 0.015,
      skylightCenterZ,
    );
    parent.add(skylightGlass);
    for (const [size, position] of [
      [
        [skylightWidth + 0.15, 0.16, 0.16],
        [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.07, skylight.minZ],
      ],
      [
        [skylightWidth + 0.15, 0.16, 0.16],
        [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.07, skylight.maxZ],
      ],
      [
        [0.16, 0.16, skylightDepth + 0.15],
        [skylight.minX, SHOP_UPPER_CEILING_Y + 0.07, skylightCenterZ],
      ],
      [
        [0.16, 0.16, skylightDepth + 0.15],
        [skylight.maxX, SHOP_UPPER_CEILING_Y + 0.07, skylightCenterZ],
      ],
      [
        [0.11, 0.12, skylightDepth],
        [skylightCenterX, SHOP_UPPER_CEILING_Y + 0.09, skylightCenterZ],
      ],
    ] as const)
      this.#addBox(parent, size, position, frameMaterial, true);

    this.#addBox(
      parent,
      [SHOP_THEATRE.width, 0.18, SHOP_THEATRE.depth],
      [SHOP_THEATRE.centerX, 15.82, SHOP_THEATRE.centerZ],
      roofMaterial,
    );
    this.#addBox(
      parent,
      [SHOP_TV_CAVE.width, 0.18, SHOP_TV_CAVE.depth],
      [SHOP_TV_CAVE.centerX, 9.72, SHOP_TV_CAVE.centerZ],
      roofMaterial,
    );
  }

  #createSign(
    title: string,
    subtitle: string,
    width: number,
    height: number,
    textColor: string,
    backgroundColor: string,
  ) {
    const sign = new Group();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.max(128, Math.round(canvas.width * (height / width)));
    const context = canvas.getContext("2d");
    if (!context) {
      const geometry = new PlaneGeometry(width, height);
      const front = new Mesh(
        geometry,
        new MeshBasicMaterial({color: backgroundColor, side: FrontSide}),
      );
      const back = new Mesh(geometry, front.material.clone());
      back.rotation.y = Math.PI;
      sign.add(front, back);
      return sign;
    }

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = textColor;
    context.globalAlpha = 0.28;
    context.lineWidth = 5;
    const inset = Math.max(12, Math.round(canvas.height * 0.065));
    context.strokeRect(
      inset,
      inset,
      canvas.width - inset * 2,
      canvas.height - inset * 2,
    );
    context.globalAlpha = 1;
    context.fillStyle = textColor;
    context.font = `700 ${Math.round(canvas.height * 0.28)}px "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(title, canvas.width / 2, canvas.height * 0.42);
    context.globalAlpha = 0.72;
    context.font = `600 ${Math.round(canvas.height * 0.12)}px Inter, "Yu Gothic", sans-serif`;
    context.letterSpacing = `${Math.max(1, canvas.height * 0.012)}px`;
    context.fillText(subtitle, canvas.width / 2, canvas.height * 0.72);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    const material = new MeshBasicMaterial({
      map: texture,
      side: FrontSide,
      toneMapped: false,
    });
    const geometry = new PlaneGeometry(width, height);
    const front = new Mesh(geometry, material);
    const back = new Mesh(geometry, material.clone());
    front.position.z = 0.001;
    back.position.z = -0.001;
    back.rotation.y = Math.PI;
    sign.add(front, back);
    return sign;
  }

  #setSign(key: string, title: string, subtitle: string) {
    const slot = this.#signSlots.get(key);
    if (!slot) return;
    if (slot.sign) {
      slot.group.remove(slot.sign);
      disposeObject(slot.sign);
      slot.sign = undefined;
    }
    slot.title = title.trim().slice(0, 48);
    slot.subtitle = subtitle.trim().slice(0, 72);
    if (!slot.title) {
      slot.subtitle = "";
      slot.target.material.opacity = 0.1;
      return;
    }
    const sign = this.#createSign(
      slot.title,
      slot.subtitle,
      slot.width,
      slot.height,
      "#efe5cc",
      slot.backgroundColor,
    );
    sign.position.z = -0.012;
    slot.sign = sign;
    slot.target.material.opacity = 0;
    slot.group.add(sign);
  }

  #setShelfSign(column: number, title: string, subtitle?: string) {
    const key = shopSignKey("shelf", String(column));
    const slot = this.#signSlots.get(key);
    this.#setSign(key, title, subtitle ?? slot?.label ?? "");
  }

  setSignContent(
    kind: ShopSignKind,
    id: string,
    title: string,
    subtitle: string,
  ) {
    const key = shopSignKey(kind, id);
    if (!this.#signSlots.has(key)) return false;
    this.#setSign(key, title, subtitle);
    this.#updateSignTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
    return true;
  }

  setArtFrameImportChannel(label: string) {
    const channelId = artFrameChannelId(label);
    if (!channelId) return;
    const placement = this.#artFramePlacement;
    if (placement) placement.channelId = channelId;
    else {
      const frameId = this.#targetedDigitalArtFrameId;
      if (!frameId || !this.#digitalArtFrameRecords.has(frameId)) return;
      this.#artFrameTargetImportChannel = {channelId, frameId};
    }
    this.#artFrameImportError = undefined;
    this.#emitGameState();
    return channelId;
  }

  #createBookSpineTexture(
    title: string,
    language: CatalogItem["language"],
    accent: string,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const background = new Color(accent).multiplyScalar(0.42).getStyle();
    const border = new Color(accent).multiplyScalar(0.88).getStyle();
    const characters = Array.from(title.trim().replace(/\s+/g, " "));
    const label =
      characters.length > 54
        ? `${characters.slice(0, 53).join("")}…`
        : characters.join("");

    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(5, 8, 7, 0.48)");
    gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.03)");
    gradient.addColorStop(0.86, "rgba(255, 255, 255, 0.03)");
    gradient.addColorStop(1, "rgba(255, 245, 220, 0.14)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = border;
    context.globalAlpha = 0.8;
    context.lineWidth = 3;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.globalAlpha = 1;
    context.fillStyle = "#efe6d5";
    context.font = '700 20px Inter, "Yu Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(language === "japanese" ? "JP" : "EN", 64, 52);
    context.strokeStyle = border;
    context.beginPath();
    context.moveTo(20, 88);
    context.lineTo(108, 88);
    context.moveTo(20, 680);
    context.lineTo(108, 680);
    context.stroke();
    context.save();
    context.translate(66, 650);
    context.rotate(-Math.PI / 2);
    context.font = '600 38px Inter, "Yu Gothic", sans-serif';
    context.textAlign = "left";
    context.fillText(label || "Untitled edition", 0, 0, 530);
    context.restore();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    return texture;
  }

  #addBox(
    parent: Group,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: MeshStandardMaterial,
    castShadow = false,
  ) {
    let geometry: BoxGeometry;
    if (material.userData.boxUvMode === "wallpaper")
      geometry = createWallpaperBoxGeometry(size, position);
    else if (material.map) geometry = createWoodBoxGeometry(size, position);
    else geometry = new BoxGeometry(...size);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.#posterRaycastMeshes.push(mesh);
    return mesh;
  }

  #createPosterSurface(
    parent: Group,
    id: string,
    width: number,
    height: number,
    position: readonly [number, number, number],
    rotationY: number,
  ) {
    const target = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
      }),
    );
    target.name = `poster-surface-${id}`;
    target.position.set(...position);
    target.rotation.y = rotationY;
    target.userData.posterSurfaceId = id;
    parent.add(target);
    this.#posterRaycastMeshes.push(target);
    this.#posterSurfaces.set(id, {height, target, width});
  }

  #createWallPosterSurfaces(
    parent: Group,
    id: string,
    wall: {
      position: readonly [x: number, y: number, z: number];
      size: readonly [width: number, height: number, depth: number];
    },
  ) {
    const [width, height, depth] = wall.size;
    if (height < 1) return;
    const surfaceHeight = height - 0.16;
    if (width >= depth) {
      const surfaceWidth = width - 0.16;
      if (surfaceWidth < MIN_POSTER_HEIGHT) return;
      for (const side of [-1, 1] as const)
        this.#createPosterSurface(
          parent,
          `${id}:${side < 0 ? "north" : "south"}`,
          surfaceWidth,
          surfaceHeight,
          [
            wall.position[0],
            wall.position[1],
            wall.position[2] + side * (depth / 2 + POSTER_SURFACE_OFFSET),
          ],
          side < 0 ? Math.PI : 0,
        );
      return;
    }
    const surfaceWidth = depth - 0.16;
    if (surfaceWidth < MIN_POSTER_HEIGHT) return;
    for (const side of [-1, 1] as const)
      this.#createPosterSurface(
        parent,
        `${id}:${side < 0 ? "west" : "east"}`,
        surfaceWidth,
        surfaceHeight,
        [
          wall.position[0] + side * (width / 2 + POSTER_SURFACE_OFFSET),
          wall.position[1],
          wall.position[2],
        ],
        side < 0 ? -Math.PI / 2 : Math.PI / 2,
      );
  }

  #initializePosters() {
    void this.#refreshPosterCatalog();
  }

  #posterCatalogMatches(assets: readonly PosterAsset[]) {
    return (
      assets.length === this.#posterAssets.length &&
      assets.every((asset, index) => {
        const current = this.#posterAssets[index];
        if (!current) return false;
        return (
          asset.aspectRatio === current.aspectRatio &&
          asset.id === current.id &&
          asset.label === current.label &&
          asset.url === current.url
        );
      })
    );
  }

  #applyPosterCatalog(assets: readonly PosterAsset[]) {
    if (this.#posterCatalogMatches(assets)) return;
    const activeAssetId = this.#posterPlacement
      ? this.#posterAssets[this.#posterPlacement.assetIndex]?.id
      : undefined;
    const selectedAssetId = this.#posterAssets[this.#posterAssetIndex]?.id;
    this.#posterAssets = assets;
    const selectedIndex = selectedAssetId
      ? assets.findIndex((asset) => asset.id === selectedAssetId)
      : -1;
    this.#posterAssetIndex = Math.max(0, selectedIndex);
    if (this.#posterPlacement && activeAssetId) {
      const activeIndex = assets.findIndex(
        (asset) => asset.id === activeAssetId,
      );
      if (activeIndex < 0) this.#cancelPosterPlacement();
      else {
        this.#posterPlacement.assetIndex = activeIndex;
        this.#posterAssetIndex = activeIndex;
      }
    }
    this.#emitGameState();
  }

  async #restoreSavedPosters(assets: readonly PosterAsset[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const restoredIds = new Set<string>();
    await Promise.all(
      this.#pendingPosterSaves.map(async (savedPoster) => {
        const asset = assetsById.get(savedPoster.assetId);
        if (!asset) return;
        try {
          const mesh = await this.#createPosterMesh(asset, savedPoster.height);
          if (this.#disposed) {
            this.#disposePosterMesh(mesh);
            return;
          }
          mesh.position.copy(savedPoster.pose.position);
          mesh.quaternion.copy(savedPoster.pose.quaternion);
          this.#scene.add(mesh);
          this.#posterRecords.set(savedPoster.id, {
            asset,
            height: savedPoster.height,
            id: savedPoster.id,
            mesh,
            rotation: savedPoster.rotation ?? 0,
          });
          mesh.userData.posterId = savedPoster.id;
          this.#posterTargetMeshes.push(mesh);
          restoredIds.add(savedPoster.id);
        } catch (error) {
          if (DEV)
            console.warn(
              `Afterleaf could not restore poster ${savedPoster.assetId}.`,
              error,
            );
        }
      }),
    );
    if (restoredIds.size !== this.#pendingPosterSaves.length)
      this.#worldStateDirty = true;
    this.#pendingPosterSaves = [];
    this.#posterSaveRestoreCompleted = true;
  }

  async #refreshPosterCatalog() {
    if (this.#posterCatalogRequestPending || this.#disposed) return;
    this.#posterCatalogRequestPending = true;
    try {
      const assets = await this.#loadPosters(this.#abortController.signal);
      if (this.#disposed) return;
      this.#applyPosterCatalog(assets);
      if (!this.#posterSaveRestoreCompleted)
        await this.#restoreSavedPosters(assets);
      this.#emitGameState();
    } catch (error) {
      if (DEV && !this.#abortController.signal.aborted)
        console.warn("Afterleaf could not load the poster catalog.", error);
    } finally {
      this.#posterCatalogRequestPending = false;
    }
  }

  #artFrameTexture(
    image: ArtFrameImage,
    priority: ArtFrameTextureLoadState["priority"],
  ) {
    const cached = this.#artFrameTextureCache.get(image.id);
    if (cached) {
      cached.references += 1;
      cached.lastUsed = this.#artFrameTextureCacheClock += 1;
      if (priority === "display") this.#promoteArtFrameTexture(cached);
      return cached.promise;
    }
    this.#trimArtFrameTextureCache();
    const loadState: ArtFrameTextureLoadState = {priority};
    const pending = this.#loadArtFrameTexture(image, loadState);
    const entry: ArtFrameTextureCacheEntry = {
      lastUsed: (this.#artFrameTextureCacheClock += 1),
      loadState,
      promise: pending,
      references: 1,
    };
    this.#artFrameTextureCache.set(image.id, entry);
    void pending.catch(() => {
      if (this.#artFrameTextureCache.get(image.id) === entry)
        this.#artFrameTextureCache.delete(image.id);
    });
    return pending;
  }

  async #loadArtFrameTexture(
    image: ArtFrameImage,
    loadState: ArtFrameTextureLoadState,
  ) {
    let texture: Texture;
    if (typeof globalThis.createImageBitmap === "function") {
      const bitmap = await this.#artFrameImageBitmapLoader.loadAsync(image.url);
      texture = new Texture(bitmap);
      texture.needsUpdate = true;
    } else texture = await this.#textureLoader.loadAsync(image.url);
    if (this.#disposed) return texture;
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    if (loadState.priority === "display") this.#renderer.initTexture(texture);
    else await this.#prepareArtFrameTexture(texture, loadState);
    return texture;
  }

  #promoteArtFrameTexture(entry: ArtFrameTextureCacheEntry) {
    entry.loadState.priority = "display";
    const preparation = entry.loadState.preparation;
    if (!preparation) return;
    const preparationIndex =
      this.#artFrameTexturePreparationQueue.indexOf(preparation);
    if (preparationIndex >= 0)
      this.#artFrameTexturePreparationQueue.splice(preparationIndex, 1);
    entry.loadState.preparation = undefined;
    try {
      this.#renderer.initTexture(preparation.texture);
    } catch (error) {
      if (DEV)
        console.warn("Afterleaf could not upload an art texture.", error);
    }
    preparation.resolve();
  }

  #releaseArtFrameTexture(imageId: string) {
    const entry = this.#artFrameTextureCache.get(imageId);
    if (!entry) return;
    entry.references = Math.max(0, entry.references - 1);
    entry.lastUsed = this.#artFrameTextureCacheClock += 1;
  }

  #trimArtFrameTextureCache() {
    const unusedEntries = [...this.#artFrameTextureCache.entries()]
      .filter(([, entry]) => entry.references === 0)
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    const removalCount = unusedEntries.length - MAX_UNUSED_ART_FRAME_TEXTURES;
    if (removalCount <= 0) return;
    for (const [imageId, entry] of unusedEntries.slice(0, removalCount)) {
      if (this.#artFrameTextureCache.get(imageId) !== entry) continue;
      this.#artFrameTextureCache.delete(imageId);
      void entry.promise
        .then((texture) => this.#disposeArtFrameTexture(texture))
        .catch(() => {});
    }
  }

  #disposeArtFrameTexture(texture: Texture) {
    texture.dispose();
    const image = texture.image as {close?: () => void} | undefined;
    image?.close?.();
  }

  #prepareArtFrameTexture(
    texture: Texture,
    loadState: ArtFrameTextureLoadState,
  ) {
    if (this.#disposed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const preparation = {loadState, resolve, texture};
      loadState.preparation = preparation;
      this.#artFrameTexturePreparationQueue.push(preparation);
      this.#scheduleArtFrameTexturePreparation();
    });
  }

  #scheduleArtFrameTexturePreparation() {
    if (
      this.#disposed ||
      this.#artFrameTexturePreparationHandle !== undefined ||
      this.#artFrameTexturePreparationQueue.length === 0
    )
      return;
    const prepareNext = (deadline?: IdleDeadline) => {
      this.#artFrameTexturePreparationHandle = undefined;
      if (
        deadline &&
        deadline.timeRemaining() < ART_FRAME_TEXTURE_UPLOAD_IDLE_BUDGET_MS
      ) {
        this.#scheduleArtFrameTexturePreparation();
        return;
      }
      const preparation = this.#artFrameTexturePreparationQueue.shift();
      if (!preparation) return;
      preparation.loadState.preparation = undefined;
      if (!this.#disposed) {
        try {
          this.#renderer.initTexture(preparation.texture);
        } catch (error) {
          if (DEV)
            console.warn(
              "Afterleaf could not pre-upload an art texture.",
              error,
            );
        }
      }
      preparation.resolve();
      this.#scheduleArtFrameTexturePreparation();
    };
    if (typeof window.requestIdleCallback === "function") {
      this.#artFrameTexturePreparationUsesIdleCallback = true;
      this.#artFrameTexturePreparationHandle =
        window.requestIdleCallback(prepareNext);
      return;
    }
    this.#artFrameTexturePreparationUsesIdleCallback = false;
    this.#artFrameTexturePreparationHandle = window.setTimeout(prepareNext, 0);
  }

  #cancelArtFrameTexturePreparation() {
    const handle = this.#artFrameTexturePreparationHandle;
    if (handle !== undefined) {
      if (
        this.#artFrameTexturePreparationUsesIdleCallback &&
        typeof window.cancelIdleCallback === "function"
      )
        window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    }
    this.#artFrameTexturePreparationHandle = undefined;
    for (const preparation of this.#artFrameTexturePreparationQueue) {
      preparation.loadState.preparation = undefined;
      preparation.resolve();
    }
    this.#artFrameTexturePreparationQueue.length = 0;
  }

  #artFrameCatalogMatches(channels: readonly ArtFrameChannel[]) {
    return JSON.stringify(channels) === JSON.stringify(this.#artFrameChannels);
  }

  #applyArtFrameCatalog(channels: readonly ArtFrameChannel[]) {
    if (this.#artFrameCatalogMatches(channels)) return;
    const selectedAssetId = this.#artFrameAssets[this.#artFrameAssetIndex]?.id;
    const activeAssetId = this.#artFramePlacement
      ? this.#artFrameAssets[this.#artFramePlacement.assetIndex]?.id
      : undefined;
    this.#artFrameChannels = channels;
    this.#artFrameAssets = channels.flatMap((channel) => channel.images);
    const selectedIndex = selectedAssetId
      ? this.#artFrameAssets.findIndex((asset) => asset.id === selectedAssetId)
      : -1;
    this.#artFrameAssetIndex = Math.max(0, selectedIndex);
    for (const record of this.#digitalArtFrameRecords.values())
      record.frame.setChannels(channels);
    if (this.#artFramePlacement && activeAssetId) {
      const activeIndex = this.#artFrameAssets.findIndex(
        (asset) => asset.id === activeAssetId,
      );
      if (activeIndex < 0) this.#cancelDigitalArtFramePlacement();
      else {
        this.#artFramePlacement.assetIndex = activeIndex;
        this.#artFrameAssetIndex = activeIndex;
      }
    }
    this.#emitGameState();
  }

  async #restoreSavedDigitalArtFrames(channels: readonly ArtFrameChannel[]) {
    const channelIds = new Set(channels.map((channel) => channel.id));
    const restoredIds = new Set<string>();
    await Promise.all(
      this.#pendingDigitalArtFrameSaves.map(async (savedFrame) => {
        if (!channelIds.has(savedFrame.channelId)) return;
        const frame = new DigitalArtFrame({
          aspectRatio: savedFrame.aspectRatio,
          channelId: savedFrame.channelId,
          channels,
          fit: savedFrame.fit,
          ...(savedFrame.currentImageId
            ? {imageId: savedFrame.currentImageId}
            : {}),
          intervalSeconds: savedFrame.intervalSeconds,
          loadTexture: (image, priority) =>
            this.#artFrameTexture(image, priority),
          onImageChange: () => {
            this.#worldStateDirty = true;
          },
          releaseTexture: (imageId) => this.#releaseArtFrameTexture(imageId),
        });
        if (this.#disposed) {
          frame.dispose();
          return;
        }
        frame.object.position.copy(savedFrame.pose.position);
        frame.object.quaternion.copy(savedFrame.pose.quaternion);
        frame.object.scale.setScalar(savedFrame.height);
        frame.target.userData.digitalArtFrameId = savedFrame.id;
        this.#scene.add(frame.object);
        this.#digitalArtFrameRecords.set(savedFrame.id, {
          frame,
          height: savedFrame.height,
          id: savedFrame.id,
          rotation: savedFrame.rotation ?? 0,
        });
        this.#digitalArtFrameTargetMeshes.push(frame.target);
        restoredIds.add(savedFrame.id);
      }),
    );
    if (restoredIds.size !== this.#pendingDigitalArtFrameSaves.length)
      this.#worldStateDirty = true;
    this.#pendingDigitalArtFrameSaves = [];
    this.#artFrameSaveRestoreCompleted = true;
  }

  async #refreshArtFrameCatalog() {
    if (this.#artFrameCatalogRequestPending || this.#disposed) return;
    this.#artFrameCatalogRequestPending = true;
    try {
      const channels = await this.#loadArtFrameChannels(
        this.#abortController.signal,
      );
      if (this.#disposed) return;
      this.#applyArtFrameCatalog(channels);
      if (!this.#artFrameSaveRestoreCompleted)
        await this.#restoreSavedDigitalArtFrames(channels);
      this.#emitGameState();
    } catch (error) {
      if (DEV && !this.#abortController.signal.aborted)
        console.warn(
          "Afterleaf could not load the digital art frame catalog.",
          error,
        );
    } finally {
      this.#artFrameCatalogRequestPending = false;
    }
  }

  #createDigitalArtFrame(
    asset: ArtFrameImage,
    aspectRatio: number,
    channelId: string,
    fit: ArtFrameFit,
    intervalSeconds: number,
  ) {
    return new DigitalArtFrame({
      aspectRatio,
      channelId,
      channels: this.#artFrameChannels,
      fit,
      imageId: asset.id,
      intervalSeconds,
      loadTexture: (image, priority) => this.#artFrameTexture(image, priority),
      onImageChange: () => {
        this.#worldStateDirty = true;
      },
      releaseTexture: (imageId) => this.#releaseArtFrameTexture(imageId),
    });
  }

  #startDigitalArtFramePlacement(
    assetIndex: number,
    movingFrameId?: string,
    desiredHeight = DEFAULT_POSTER_HEIGHT,
    rotation = 0,
    lockedAspectRatio?: number,
    fit: ArtFrameFit = "contain",
    intervalSeconds = DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS,
  ) {
    if (this.#artFrameAssets.length === 0) return;
    const normalizedIndex =
      (assetIndex + this.#artFrameAssets.length) % this.#artFrameAssets.length;
    const asset = this.#artFrameAssets[normalizedIndex];
    if (!asset) return;
    const channelId = asset.id.split("/")[0];
    if (!channelId) return;
    const revision = (this.#artFramePlacementRevision += 1);
    this.#disposeDigitalArtFramePreview();
    const aspectRatio = lockedAspectRatio ?? asset.aspectRatio;
    this.#artFramePlacement = {
      aspectRatio,
      assetIndex: normalizedIndex,
      channelId,
      desiredHeight,
      fit,
      gridSnap: true,
      intervalSeconds,
      ...(movingFrameId ? {movingFrameId} : {}),
      rotation,
    };
    this.#artFrameAssetIndex = normalizedIndex;
    const movingFrame = this.#digitalArtFrameRecords.get(movingFrameId ?? "");
    if (movingFrame) movingFrame.frame.object.visible = false;
    this.#artFramePlacementSelection = undefined;
    this.#setDigitalArtFrameTargeted();
    const preview = this.#createDigitalArtFrame(
      asset,
      aspectRatio,
      channelId,
      fit,
      0,
    );
    if (
      this.#disposed ||
      revision !== this.#artFramePlacementRevision ||
      this.#artFramePlacement?.assetIndex !== normalizedIndex
    ) {
      preview.dispose();
      return;
    }
    preview.object.name = `digital-art-frame-preview-${asset.id}`;
    this.#ghostDigitalArtFramePreview(preview);
    preview.object.visible = false;
    this.#artFramePreview = preview;
    this.#scene.add(preview.object);
    this.#updateDigitalArtFramePlacementTarget();
    this.#emitGameState();
  }

  #startEmptyDigitalArtFramePlacement() {
    this.#artFramePlacementRevision += 1;
    this.#disposeDigitalArtFramePreview();
    this.#artFramePlacement = {
      aspectRatio: 1.5,
      assetIndex: -1,
      channelId: "pasted",
      desiredHeight: DEFAULT_POSTER_HEIGHT,
      fit: "contain",
      gridSnap: true,
      intervalSeconds: DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS,
      rotation: 0,
    };
    this.#artFramePlacementSelection = undefined;
    this.#setDigitalArtFrameTargeted();
    this.#emitGameState();
  }

  #cycleDigitalArtFrameAsset(direction: number) {
    const placement = this.#artFramePlacement;
    if (!placement || direction === 0) return;
    this.#startDigitalArtFramePlacement(
      placement.assetIndex + direction,
      placement.movingFrameId,
      placement.desiredHeight,
      placement.rotation,
      placement.movingFrameId ? placement.aspectRatio : undefined,
      placement.fit,
      placement.intervalSeconds,
    );
  }

  #disposeDigitalArtFramePreview() {
    const preview = this.#artFramePreview;
    if (!preview) return;
    this.#restoreDigitalArtFramePreview();
    this.#artFramePreview = undefined;
    preview.dispose();
  }

  #cancelDigitalArtFramePlacement() {
    const movingFrameId = this.#artFramePlacement?.movingFrameId;
    this.#artFramePlacementRevision += 1;
    this.#disposeDigitalArtFramePreview();
    const movingFrame = this.#digitalArtFrameRecords.get(movingFrameId ?? "");
    if (movingFrame) movingFrame.frame.object.visible = true;
    this.#artFramePlacement = undefined;
    this.#artFramePlacementSelection = undefined;
    this.#emitGameState();
  }

  #setDigitalArtFramePlacementSelection(height?: number) {
    if (height === this.#artFramePlacementSelection?.height) return;
    this.#artFramePlacementSelection =
      height === undefined ? undefined : {height};
    this.#emitGameState();
  }

  #ghostDigitalArtFramePreview(preview: DigitalArtFrame) {
    this.#artFramePreviewMaterialStates = [];
    preview.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        this.#artFramePreviewMaterialStates.push({
          depthWrite: material.depthWrite,
          material,
          opacity: material.opacity,
          transparent: material.transparent,
        });
        material.transparent = true;
        material.opacity *= 0.62;
        material.depthWrite = false;
      }
    });
  }

  #restoreDigitalArtFramePreview() {
    for (const state of this.#artFramePreviewMaterialStates) {
      state.material.depthWrite = state.depthWrite;
      state.material.opacity = state.opacity;
      state.material.transparent = state.transparent;
    }
    this.#artFramePreviewMaterialStates = [];
  }

  #showDigitalArtFramePlacementGhost(
    preview: DigitalArtFrame,
    placement: DigitalArtFramePlacementSession,
  ) {
    this.#camera.add(preview.object);
    preview.object.position.set(0, -0.1, -1.5);
    preview.object.quaternion.identity();
    preview.object.scale.setScalar(placement.desiredHeight);
    preview.object.visible = true;
  }

  #updateDigitalArtFramePlacementTarget() {
    const placement = this.#artFramePlacement;
    const preview = this.#artFramePreview;
    if (!placement || !preview || !this.#pointerLocked) {
      if (preview) preview.object.visible = false;
      this.#setDigitalArtFramePlacementSelection();
      return;
    }
    const intersection = this.#raycaster.intersectObjects(
      this.#posterRaycastMeshes,
      false,
    )[0];
    const surfaceId = intersection?.object.userData.posterSurfaceId;
    const surface =
      typeof surfaceId === "string"
        ? this.#posterSurfaces.get(surfaceId)
        : undefined;
    if (
      !intersection ||
      intersection.distance > POSTER_PLACEMENT_DISTANCE ||
      !surface
    ) {
      this.#showDigitalArtFramePlacementGhost(preview, placement);
      this.#setDigitalArtFramePlacementSelection();
      return;
    }
    const height = this.#resolveWallPlacement(
      surface,
      intersection.point,
      placement.aspectRatio,
      placement.desiredHeight,
      placement.rotation,
      DIGITAL_ART_FRAME_BORDER,
      placement.gridSnap,
    );
    if (height === undefined) {
      this.#showDigitalArtFramePlacementGhost(preview, placement);
      this.#setDigitalArtFramePlacementSelection();
      return;
    }
    this.#scene.attach(preview.object);
    preview.object.position.copy(this.#posterPlacementPosition);
    preview.object.quaternion.copy(this.#posterPlacementRotation);
    preview.object.rotateZ(placement.rotation);
    preview.object.scale.setScalar(height);
    preview.object.visible = true;
    this.#setDigitalArtFramePlacementSelection(height);
  }

  #placeDigitalArtFrame() {
    const placement = this.#artFramePlacement;
    const selection = this.#artFramePlacementSelection;
    const preview = this.#artFramePreview;
    if (!placement || !selection || !preview || !preview.object.visible) return;
    this.#restoreDigitalArtFramePreview();
    preview.setIntervalSeconds(placement.intervalSeconds);
    const existing = placement.movingFrameId
      ? this.#digitalArtFrameRecords.get(placement.movingFrameId)
      : undefined;
    if (existing) {
      const targetIndex = this.#digitalArtFrameTargetMeshes.indexOf(
        existing.frame.target,
      );
      existing.frame.dispose();
      existing.frame = preview;
      existing.height = selection.height;
      existing.rotation = placement.rotation;
      preview.target.userData.digitalArtFrameId = existing.id;
      if (targetIndex >= 0)
        this.#digitalArtFrameTargetMeshes[targetIndex] = preview.target;
      else this.#digitalArtFrameTargetMeshes.push(preview.target);
    } else {
      const id = globalThis.crypto.randomUUID();
      preview.target.userData.digitalArtFrameId = id;
      this.#digitalArtFrameRecords.set(id, {
        frame: preview,
        height: selection.height,
        id,
        rotation: placement.rotation,
      });
      this.#digitalArtFrameTargetMeshes.push(preview.target);
    }
    this.#artFramePreview = undefined;
    this.#artFramePlacement = undefined;
    this.#artFramePlacementSelection = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #removeTargetedDigitalArtFrame() {
    const frameId = this.#targetedDigitalArtFrameId;
    if (!frameId) return;
    const record = this.#digitalArtFrameRecords.get(frameId);
    if (!record) return;
    record.frame.dispose();
    this.#digitalArtFrameRecords.delete(frameId);
    const targetIndex = this.#digitalArtFrameTargetMeshes.indexOf(
      record.frame.target,
    );
    if (targetIndex >= 0)
      this.#digitalArtFrameTargetMeshes.splice(targetIndex, 1);
    if (this.#artFrameTargetImportChannel?.frameId === frameId)
      this.#artFrameTargetImportChannel = undefined;
    this.#targetedDigitalArtFrameId = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #cycleTargetedDigitalArtFrameFit() {
    const record = this.#targetedDigitalArtFrameId
      ? this.#digitalArtFrameRecords.get(this.#targetedDigitalArtFrameId)
      : undefined;
    if (!record) return;
    record.frame.setFit(record.frame.fit() === "contain" ? "cover" : "contain");
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #cycleTargetedDigitalArtFrameInterval() {
    const record = this.#targetedDigitalArtFrameId
      ? this.#digitalArtFrameRecords.get(this.#targetedDigitalArtFrameId)
      : undefined;
    if (!record) return;
    const intervalIndex = DIGITAL_ART_FRAME_INTERVALS.indexOf(
      record.frame.intervalSeconds() as (typeof DIGITAL_ART_FRAME_INTERVALS)[number],
    );
    const nextInterval =
      DIGITAL_ART_FRAME_INTERVALS[
        (Math.max(0, intervalIndex) + 1) % DIGITAL_ART_FRAME_INTERVALS.length
      ];
    if (nextInterval === undefined) return;
    record.frame.setIntervalSeconds(nextInterval);
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  readonly #handleImagePaste = (event: ClipboardEvent) => {
    if (this.#paused()) return;
    const artFrameTarget = this.#digitalArtFramePasteTarget();
    const imageItem = Array.from(event.clipboardData?.items ?? []).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const image = imageItem?.getAsFile();
    if (image && artFrameTarget && this.#importArtFrameImage) {
      event.preventDefault();
      void this.#importPastedArtFrameImage(image, artFrameTarget);
      return;
    }
    if (image && this.#posterPlacement && this.#importPoster) {
      event.preventDefault();
      void this.#importPastedPoster(image);
      return;
    }
    const clipboardText =
      event.clipboardData?.getData("text/plain") ||
      event.clipboardData?.getData("text/uri-list");
    if (!clipboardText) return;
    const television = this.#televisionTargeted
      ? this.#targetedTelevision
      : undefined;
    const channelId = television?.selectedChannelId();
    event.preventDefault();
    void this.#handlePastedText(
      clipboardText,
      television,
      channelId ?? (television ? DEFAULT_TV_CHANNEL_ID : undefined),
      television?.selectedChannelLabel() ??
        channelId ??
        (television ? "Afterleaf TV" : undefined),
    );
  };

  async #handlePastedText(
    text: string,
    television: ShopTelevision | undefined,
    channelId: string | undefined,
    channelLabel: string | undefined,
  ) {
    let handled = false;
    try {
      handled = (await this.#onTextPaste?.(text)) === true;
    } catch {
      // A provider resolver must not prevent the existing TV paste fallback.
    }
    if (handled) return;
    const url = tvVideoImportUrl(text);
    if (!television || !channelId || !channelLabel || !url) return;
    await this.#importPastedTvVideo(television, url, channelId, channelLabel);
  }

  async #importPastedTvVideo(
    television: ShopTelevision,
    url: string,
    channelId: string,
    channelLabel: string,
  ) {
    const importVideo = this.#importTvVideo;
    if (!importVideo) return;
    this.#tvVideoImportCount += 1;
    this.#tvVideoImportError = undefined;
    this.#tvVideoImportMessage = undefined;
    if (this.#tvVideoImportMessageTimer !== undefined)
      window.clearTimeout(this.#tvVideoImportMessageTimer);
    this.#tvVideoImportMessageTimer = undefined;
    this.#emitGameState();
    try {
      const video = await importVideo(
        url,
        channelId,
        this.#abortController.signal,
      );
      if (this.#disposed) return;
      television.playVideoIfChannelSelected(channelId, video, channelLabel);
      this.#tvVideoImportMessage = `Added ${video.id} to ${channelLabel}`;
      this.#tvVideoImportMessageTimer = window.setTimeout(() => {
        this.#tvVideoImportMessageTimer = undefined;
        this.#tvVideoImportMessage = undefined;
        if (!this.#disposed) this.#emitGameState();
      }, 6_000);
    } catch (error) {
      if (this.#abortController.signal.aborted) return;
      this.#tvVideoImportError =
        error instanceof Error && error.message
          ? error.message
          : "Video URL could not be imported";
    } finally {
      this.#tvVideoImportCount = Math.max(0, this.#tvVideoImportCount - 1);
      if (!this.#disposed) this.#emitGameState();
    }
  }

  #digitalArtFramePasteTarget(): DigitalArtFramePasteTarget | undefined {
    const placement = this.#artFramePlacement;
    if (placement) return {channelId: placement.channelId, kind: "placement"};
    if (this.#posterPlacement) return;
    const frameId = this.#targetedDigitalArtFrameId;
    const frame = frameId
      ? this.#digitalArtFrameRecords.get(frameId)?.frame
      : undefined;
    if (!frameId || !frame) return;
    const pendingChannel = this.#artFrameTargetImportChannel;
    return {
      channelId:
        pendingChannel?.frameId === frameId
          ? pendingChannel.channelId
          : frame.channelId(),
      frameId,
      kind: "frame",
    };
  }

  async #importPastedArtFrameImage(
    image: Blob,
    target: DigitalArtFramePasteTarget,
  ) {
    const importImage = this.#importArtFrameImage;
    if (!importImage) return;
    const importChannelId = target.channelId;
    this.#artFrameImportCount += 1;
    this.#artFrameImportError = undefined;
    this.#emitGameState();
    try {
      const asset = await importImage(
        image,
        importChannelId,
        this.#abortController.signal,
      );
      if (this.#disposed) return;
      const existingChannel = this.#artFrameChannels.find(
        (channel) => channel.id === importChannelId,
      );
      const channel: ArtFrameChannel = {
        id: importChannelId,
        images: [
          ...(existingChannel?.images.filter(
            (candidate) => candidate.id !== asset.id,
          ) ?? []),
          asset,
        ].sort((left, right) => left.id.localeCompare(right.id)),
        label:
          existingChannel?.label ??
          importChannelId
            .split("-")
            .filter(Boolean)
            .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
            .join(" "),
      };
      this.#applyArtFrameCatalog(
        [
          ...this.#artFrameChannels.filter(
            (candidate) => candidate.id !== importChannelId,
          ),
          channel,
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
      const assetIndex = this.#artFrameAssets.findIndex(
        (candidate) => candidate.id === asset.id,
      );
      if (assetIndex >= 0) this.#artFrameAssetIndex = assetIndex;
      if (target.kind === "frame") {
        const record = this.#digitalArtFrameRecords.get(target.frameId);
        if (!record) return;
        record.frame.setChannel(importChannelId, asset.id);
        if (
          this.#artFrameTargetImportChannel?.frameId === target.frameId &&
          this.#artFrameTargetImportChannel.channelId === importChannelId
        )
          this.#artFrameTargetImportChannel = undefined;
        this.#worldStateDirty = true;
        this.#emitGameState();
        return;
      }
      const placement = this.#artFramePlacement;
      if (!placement) return;
      const desiredHeight = placement.desiredHeight;
      const fit = placement.fit;
      const intervalSeconds = placement.intervalSeconds;
      const movingFrameId = placement.movingFrameId;
      const rotation = placement.rotation;
      const aspectRatio = movingFrameId
        ? placement.aspectRatio
        : asset.aspectRatio;
      this.#cancelDigitalArtFramePlacement();
      if (assetIndex >= 0)
        this.#startDigitalArtFramePlacement(
          assetIndex,
          movingFrameId,
          desiredHeight,
          rotation,
          aspectRatio,
          fit,
          intervalSeconds,
        );
    } catch (error) {
      if (this.#abortController.signal.aborted) return;
      this.#artFrameImportError =
        error instanceof Error && error.message
          ? error.message
          : "Pasted art frame image could not be imported";
    } finally {
      this.#artFrameImportCount = Math.max(0, this.#artFrameImportCount - 1);
      if (!this.#disposed) this.#emitGameState();
    }
  }

  async #importPastedPoster(image: Blob) {
    const importPoster = this.#importPoster;
    if (!importPoster) return;
    this.#posterImportCount += 1;
    this.#posterImportError = undefined;
    this.#emitGameState();
    try {
      const asset = await importPoster(image, this.#abortController.signal);
      if (this.#disposed) return;
      this.#applyPosterCatalog(
        [
          ...this.#posterAssets.filter(
            (candidate) => candidate.id !== asset.id,
          ),
          asset,
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
      const assetIndex = this.#posterAssets.findIndex(
        (candidate) => candidate.id === asset.id,
      );
      if (assetIndex >= 0) this.#posterAssetIndex = assetIndex;
      const placement = this.#posterPlacement;
      if (!placement) return;
      const desiredHeight = placement.desiredHeight;
      const rotation = placement.rotation;
      this.#cancelPosterPlacement();
      if (assetIndex >= 0)
        void this.#startPosterPlacement(
          assetIndex,
          undefined,
          desiredHeight,
          rotation,
        );
    } catch (error) {
      if (this.#abortController.signal.aborted) return;
      this.#posterImportError =
        error instanceof Error && error.message
          ? error.message
          : "Pasted poster could not be imported";
    } finally {
      this.#posterImportCount = Math.max(0, this.#posterImportCount - 1);
      if (!this.#disposed) this.#emitGameState();
    }
  }

  #posterTexture(asset: PosterAsset) {
    const cached = this.#posterTexturePromises.get(asset.id);
    if (cached) return cached;
    const pending = this.#textureLoader.loadAsync(asset.url).then((texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.#renderer.capabilities.getMaxAnisotropy(),
      );
      return texture;
    });
    this.#posterTexturePromises.set(asset.id, pending);
    void pending.catch(() => this.#posterTexturePromises.delete(asset.id));
    return pending;
  }

  async #createPosterMesh(asset: PosterAsset, height: number) {
    const texture = await this.#posterTexture(asset);
    const mesh = new Mesh(
      new PlaneGeometry(asset.aspectRatio, 1),
      new MeshStandardMaterial({
        map: texture,
        metalness: 0,
        roughness: 0.84,
      }),
    );
    mesh.name = `poster-${asset.id}`;
    mesh.scale.setScalar(height);
    mesh.userData.posterAssetId = asset.id;
    return mesh;
  }

  #disposePosterMesh(mesh: Mesh<PlaneGeometry, MeshStandardMaterial>) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  async #startPosterPlacement(
    assetIndex: number,
    movingPosterId?: string,
    desiredHeight = DEFAULT_POSTER_HEIGHT,
    rotation = 0,
  ) {
    if (this.#posterAssets.length === 0) return;
    const normalizedIndex =
      (assetIndex + this.#posterAssets.length) % this.#posterAssets.length;
    const asset = this.#posterAssets[normalizedIndex];
    if (!asset) return;
    const revision = (this.#posterPlacementRevision += 1);
    this.#disposePosterPreview();
    this.#posterPlacement = {
      assetIndex: normalizedIndex,
      desiredHeight,
      gridSnap: true,
      ...(movingPosterId ? {movingPosterId} : {}),
      rotation,
    };
    this.#posterAssetIndex = normalizedIndex;
    const movingPoster = this.#posterRecords.get(movingPosterId ?? "");
    if (movingPoster) movingPoster.mesh.visible = false;
    this.#posterPlacementSelection = undefined;
    this.#targetedPosterId = undefined;
    this.#emitGameState();
    try {
      const preview = await this.#createPosterMesh(asset, desiredHeight);
      if (
        this.#disposed ||
        revision !== this.#posterPlacementRevision ||
        this.#posterPlacement?.assetIndex !== normalizedIndex
      ) {
        this.#disposePosterMesh(preview);
        return;
      }
      preview.name = `poster-placement-preview-${asset.id}`;
      preview.material.depthWrite = false;
      preview.material.opacity = 0.72;
      preview.material.transparent = true;
      preview.visible = false;
      this.#posterPreview = preview;
      this.#scene.add(preview);
      this.#updatePosterPlacementTarget();
    } catch (error) {
      if (DEV)
        console.warn(`Afterleaf could not load poster ${asset.id}.`, error);
      if (revision === this.#posterPlacementRevision)
        this.#cancelPosterPlacement();
    }
  }

  #startEmptyPosterPlacement() {
    this.#posterPlacementRevision += 1;
    this.#disposePosterPreview();
    this.#posterPlacement = {
      assetIndex: -1,
      desiredHeight: DEFAULT_POSTER_HEIGHT,
      gridSnap: true,
      rotation: 0,
    };
    this.#posterPlacementSelection = undefined;
    this.#targetedPosterId = undefined;
    this.#emitGameState();
  }

  #cyclePoster(direction: number) {
    const placement = this.#posterPlacement;
    if (!placement || direction === 0) return;
    void this.#startPosterPlacement(
      placement.assetIndex + direction,
      placement.movingPosterId,
      placement.desiredHeight,
      placement.rotation,
    );
  }

  #disposePosterPreview() {
    const preview = this.#posterPreview;
    if (!preview) return;
    this.#posterPreview = undefined;
    this.#disposePosterMesh(preview);
  }

  #cancelPosterPlacement() {
    const movingPosterId = this.#posterPlacement?.movingPosterId;
    this.#posterPlacementRevision += 1;
    this.#disposePosterPreview();
    const movingPoster = this.#posterRecords.get(movingPosterId ?? "");
    if (movingPoster) movingPoster.mesh.visible = true;
    this.#posterPlacement = undefined;
    this.#posterPlacementSelection = undefined;
    this.#emitGameState();
  }

  #setPosterPlacementSelection(height?: number) {
    if (height === this.#posterPlacementSelection?.height) return;
    this.#posterPlacementSelection =
      height === undefined ? undefined : {height};
    this.#emitGameState();
  }

  /** Resolves both poster and digital-frame placement against the same wall snap. */
  #resolveWallPlacement(
    surface: PosterSurface,
    worldPoint: Vector3,
    aspectRatio: number,
    desiredHeight: number,
    rotation: number,
    border = 0,
    gridSnap = true,
  ) {
    const framedAspectRatio = aspectRatio + border;
    const framedHeight = 1 + border;
    const cosine = Math.abs(Math.cos(rotation));
    const sine = Math.abs(Math.sin(rotation));
    const boundingWidthPerHeight =
      cosine * framedAspectRatio + sine * framedHeight;
    const boundingHeightPerHeight =
      sine * framedAspectRatio + cosine * framedHeight;
    const maximumHeight = Math.min(
      MAX_POSTER_HEIGHT,
      (surface.height - POSTER_SURFACE_MARGIN) / boundingHeightPerHeight,
      (surface.width - POSTER_SURFACE_MARGIN) / boundingWidthPerHeight,
    );
    if (maximumHeight < MIN_POSTER_HEIGHT) return;
    const height = MathUtils.clamp(
      desiredHeight,
      MIN_POSTER_HEIGHT,
      maximumHeight,
    );
    const halfWidth = (boundingWidthPerHeight * height) / 2;
    const halfHeight = (boundingHeightPerHeight * height) / 2;
    const point = this.#posterLocalPoint.copy(worldPoint);
    surface.target.worldToLocal(point);
    point.x = MathUtils.clamp(
      point.x,
      -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
      surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
    );
    if (gridSnap)
      point.x = MathUtils.clamp(
        Math.round(point.x / 0.25) * 0.25,
        -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
        surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
      );
    point.y = MathUtils.clamp(
      point.y,
      -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
      surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
    );
    if (gridSnap)
      point.y = MathUtils.clamp(
        Math.round(point.y / 0.25) * 0.25,
        -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
        surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
      );
    point.z = POSTER_SURFACE_OFFSET + (border > 0 ? 0.025 : 0);
    surface.target.localToWorld(this.#posterPlacementPosition.copy(point));
    surface.target.getWorldQuaternion(this.#posterPlacementRotation);
    return height;
  }

  #updatePosterPlacementTarget() {
    const placement = this.#posterPlacement;
    const preview = this.#posterPreview;
    if (!placement || !preview || !this.#pointerLocked) {
      if (preview) preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    const asset = this.#posterAssets[placement.assetIndex];
    if (!asset) return;
    const intersection = this.#raycaster.intersectObjects(
      this.#posterRaycastMeshes,
      false,
    )[0];
    const surfaceId = intersection?.object.userData.posterSurfaceId;
    const surface =
      typeof surfaceId === "string"
        ? this.#posterSurfaces.get(surfaceId)
        : undefined;
    if (
      !intersection ||
      intersection.distance > POSTER_PLACEMENT_DISTANCE ||
      !surface
    ) {
      preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    const height = this.#resolveWallPlacement(
      surface,
      intersection.point,
      asset.aspectRatio,
      placement.desiredHeight,
      placement.rotation,
      0,
      placement.gridSnap,
    );
    if (height === undefined) {
      preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    preview.position.copy(this.#posterPlacementPosition);
    preview.quaternion.copy(this.#posterPlacementRotation);
    preview.rotateZ(placement.rotation);
    preview.scale.setScalar(height);
    preview.visible = true;
    this.#setPosterPlacementSelection(height);
  }

  #placePoster() {
    const placement = this.#posterPlacement;
    const selection = this.#posterPlacementSelection;
    const preview = this.#posterPreview;
    const asset = placement
      ? this.#posterAssets[placement.assetIndex]
      : undefined;
    if (!placement || !selection || !preview || !asset || !preview.visible)
      return;
    preview.material.opacity = 1;
    preview.material.transparent = false;
    preview.material.depthWrite = true;
    const existing = placement.movingPosterId
      ? this.#posterRecords.get(placement.movingPosterId)
      : undefined;
    if (existing) {
      const targetIndex = this.#posterTargetMeshes.indexOf(existing.mesh);
      this.#disposePosterMesh(existing.mesh);
      existing.asset = asset;
      existing.height = selection.height;
      existing.mesh = preview;
      existing.rotation = placement.rotation;
      existing.mesh.material.depthWrite = true;
      existing.mesh.material.opacity = 1;
      existing.mesh.material.transparent = false;
      existing.mesh.userData.posterId = existing.id;
      if (targetIndex >= 0) this.#posterTargetMeshes[targetIndex] = preview;
      else this.#posterTargetMeshes.push(preview);
      this.#posterPreview = undefined;
    } else {
      const id = globalThis.crypto.randomUUID();
      preview.material.depthWrite = true;
      preview.material.opacity = 1;
      preview.material.transparent = false;
      preview.userData.posterId = id;
      this.#posterRecords.set(id, {
        asset,
        height: selection.height,
        id,
        mesh: preview,
        rotation: placement.rotation,
      });
      this.#posterTargetMeshes.push(preview);
      this.#posterPreview = undefined;
    }
    this.#posterPlacement = undefined;
    this.#posterPlacementSelection = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #removeTargetedPoster() {
    const posterId = this.#targetedPosterId;
    if (!posterId) return;
    const record = this.#posterRecords.get(posterId);
    if (!record) return;
    this.#disposePosterMesh(record.mesh);
    this.#posterRecords.delete(posterId);
    const targetIndex = this.#posterTargetMeshes.indexOf(record.mesh);
    if (targetIndex >= 0) this.#posterTargetMeshes.splice(targetIndex, 1);
    this.#targetedPosterId = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #bindInput() {
    const passiveOptions = {
      passive: true,
      signal: this.#abortController.signal,
    } as const;
    this.#canvas.addEventListener(
      "pointerdown",
      this.#handleCanvasPointerDown,
      passiveOptions,
    );
    document.addEventListener(
      "pointermove",
      this.#handlePointerMove,
      passiveOptions,
    );
    window.addEventListener("paste", this.#handleImagePaste, {
      signal: this.#abortController.signal,
    });
    this.#canvas.addEventListener("wheel", this.#handleWheel, {
      passive: false,
      signal: this.#abortController.signal,
    });
    document.addEventListener("pointerup", this.#handleInspectionPointerUp, {
      signal: this.#abortController.signal,
    });
    document.addEventListener(
      "pointercancel",
      this.#handleInspectionPointerUp,
      {signal: this.#abortController.signal},
    );
    document.addEventListener(
      "pointerlockchange",
      this.#handlePointerLockChange,
      passiveOptions,
    );
    window.addEventListener("keydown", this.#handleKeyDown, {
      signal: this.#abortController.signal,
    });
    window.addEventListener("keyup", this.#handleKeyUp, {
      signal: this.#abortController.signal,
    });
    window.addEventListener("blur", this.#handleWindowBlur, passiveOptions);
  }

  readonly #handleCanvasPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.#paused()) return;
    if (this.#inspectionMode === "spread") {
      if (this.#inspectionOpenAngleTarget > 0) {
        this.#openInspectionBook();
        return;
      }
      this.#beginInspectionPointerTurn(event);
      return;
    }
    if (this.#inspectionMode === "closing") return;
    if (this.#pointerLocked) {
      this.#interact(false);
      return;
    }
    this.requestPointerLock();
  };

  readonly #handlePointerMove = (event: PointerEvent) => {
    if (this.#paused()) return;
    if (this.#inspectionDragging) {
      this.#inspectionDragCurrentX = event.clientX;
      if (
        Math.abs(this.#inspectionDragCurrentX - this.#inspectionDragStartX) > 4
      )
        this.#inspectionDragMoved = true;
      this.#updateInspectionDragProgress();
      return;
    }
    if (this.#inspectionMode === "spread") {
      if (event.target instanceof HTMLInputElement) return;
      this.#setInspectionPointer(event.clientX, event.clientY);
      this.#updateInspectionZoomPanTarget();
      return;
    }
    if (!this.#pointerLocked) return;
    if (this.#ignoreNextLockedPointerMove) {
      this.#ignoreNextLockedPointerMove = false;
      return;
    }
    if (!isPlausiblePointerMovement(event.movementX, event.movementY))
      this.#anomalousPointerMovementCount += 1;
    if (!Number.isFinite(event.movementX) || !Number.isFinite(event.movementY))
      return;
    if (event.movementX === 0 && event.movementY === 0) return;
    this.#shelfBrowsePublicationId = undefined;
    this.#pendingPointerMovementX += event.movementX;
    this.#pendingPointerMovementY += event.movementY;
  };

  #consumePointerMovement(deltaSeconds: number) {
    const movementX = this.#pendingPointerMovementX;
    const movementY = this.#pendingPointerMovementY;
    const anomalousEventCount = this.#anomalousPointerMovementCount;
    this.#pendingPointerMovementX = 0;
    this.#pendingPointerMovementY = 0;
    this.#anomalousPointerMovementCount = 0;

    if (anomalousEventCount > 0 && DEV && !this.#didWarnPointerMovement) {
      this.#didWarnPointerMovement = true;
      console.warn(
        "Afterleaf bounded an anomalous pointer-lock movement burst.",
        {
          eventCount: anomalousEventCount,
          frameDeltaMs: deltaSeconds * 1000,
          movementX,
          movementY,
        },
      );
    }
    if (movementX === 0 && movementY === 0) return;

    const sensitivity = this.#mouseSensitivity();
    const sensitivityMultiplier = Number.isFinite(sensitivity)
      ? Math.max(0, sensitivity)
      : 1;
    if (this.#carriedProp && this.#propPlacementRotationMode) {
      this.#propPlacementYaw = normalizePosterRotation(
        this.#propPlacementYaw -
          movementX * PROP_ROTATION_SENSITIVITY * sensitivityMultiplier,
      );
      this.#worldStateDirty = true;
      return;
    }
    clampLookDeltaMagnitude(
      -movementX * LOOK_SENSITIVITY * sensitivityMultiplier,
      -movementY * LOOK_SENSITIVITY * sensitivityMultiplier,
      MAX_LOOK_DELTA_PER_FRAME,
      this.#lookDelta,
    );
    updateLookAngles(
      this.#lookTarget,
      this.#lookDelta.yaw,
      this.#lookDelta.pitch,
      this.#nextLookAngles,
      Math.PI * 0.46,
    );
    this.#lookTarget.yaw = this.#nextLookAngles.yaw;
    this.#lookTarget.pitch = this.#nextLookAngles.pitch;
    this.#worldStateDirty = true;
  }

  readonly #handleWheel = (event: WheelEvent) => {
    if (this.#paused()) return;
    if (this.#inspectionMode === "spread") {
      if (event.deltaY === 0) return;
      event.preventDefault();
      this.#zoomInspectionAtPointer(event);
      return;
    }
    const artFramePlacement = this.#artFramePlacement;
    if (this.#pointerLocked && artFramePlacement && event.deltaY !== 0) {
      event.preventDefault();
      if (event.shiftKey)
        artFramePlacement.rotation = normalizePosterRotation(
          artFramePlacement.rotation -
            Math.sign(event.deltaY) * POSTER_WHEEL_ROTATION_STEP,
        );
      else
        artFramePlacement.desiredHeight = MathUtils.clamp(
          artFramePlacement.desiredHeight * Math.exp(-event.deltaY * 0.0015),
          MIN_POSTER_HEIGHT,
          MAX_POSTER_HEIGHT,
        );
      this.#updateDigitalArtFramePlacementTarget();
      this.#emitGameState();
      return;
    }
    const posterPlacement = this.#posterPlacement;
    if (this.#pointerLocked && posterPlacement && event.deltaY !== 0) {
      event.preventDefault();
      if (event.shiftKey)
        posterPlacement.rotation = normalizePosterRotation(
          posterPlacement.rotation -
            Math.sign(event.deltaY) * POSTER_WHEEL_ROTATION_STEP,
        );
      else
        posterPlacement.desiredHeight = MathUtils.clamp(
          posterPlacement.desiredHeight * Math.exp(-event.deltaY * 0.0015),
          MIN_POSTER_HEIGHT,
          MAX_POSTER_HEIGHT,
        );
      this.#updatePosterPlacementTarget();
      this.#emitGameState();
      return;
    }
    if (this.#pointerLocked && this.#carriedProp) {
      const wheelDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (Math.abs(wheelDelta) < 1) return;
      event.preventDefault();
      this.#propPlacementDistance = MathUtils.clamp(
        this.#propPlacementDistance - wheelDelta * 0.0025,
        PROP_MIN_PROJECTION_DISTANCE,
        PROP_MAX_PROJECTION_DISTANCE,
      );
      this.#worldStateDirty = true;
      this.#emitGameState();
      return;
    }
    if (this.#pointerLocked && this.#televisionTargeted && event.deltaY !== 0) {
      const direction = Math.sign(event.deltaY) as -1 | 1;
      if (event.ctrlKey) {
        event.preventDefault();
        this.#targetedTelevision?.adjustVolume(-direction);
        this.#tvWheelScrubDirection = undefined;
        this.#tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
        this.#tvWheelScrubStepIndex = 0;
        return;
      }
      const continuesScrub =
        direction === this.#tvWheelScrubDirection &&
        event.timeStamp >= this.#tvWheelScrubLastAt &&
        event.timeStamp - this.#tvWheelScrubLastAt <= TV_WHEEL_SCRUB_RESET_MS;
      const stepIndex = continuesScrub
        ? Math.min(
            this.#tvWheelScrubStepIndex + 1,
            TV_WHEEL_SCRUB_STEPS_SECONDS.length - 1,
          )
        : 0;
      const stepSeconds = TV_WHEEL_SCRUB_STEPS_SECONDS[stepIndex];
      if (
        !stepSeconds ||
        !this.#targetedTelevision?.scrub(direction * stepSeconds)
      )
        return;
      event.preventDefault();
      this.#tvWheelScrubDirection = direction;
      this.#tvWheelScrubLastAt = event.timeStamp;
      this.#tvWheelScrubStepIndex = stepIndex;
      return;
    }
    if (
      !this.#pointerLocked ||
      !this.#keysDown.has("KeyF") ||
      event.timeStamp < this.#shelfBrowseReadyAt
    )
      return;
    const wheelDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (Math.abs(wheelDelta) < 4 || !this.#browseShelf(Math.sign(wheelDelta)))
      return;
    event.preventDefault();
    this.#shelfBrowseReadyAt = event.timeStamp + SHELF_BROWSE_INTERVAL_MS;
  };

  readonly #handleInspectionPointerUp = () => {
    if (!this.#inspectionDragging) return;
    this.#inspectionDragging = false;
    const decision =
      !this.#inspectionDragMoved || this.#inspectionDragCompletion() >= 0.5
        ? "commit"
        : "cancel";
    this.#inspectionDragReleaseDecision = decision;
    if (this.#inspectionTurnPage !== undefined)
      this.#resolveInspectionDragDecision(decision);
    this.#inspectionDragNavigation = undefined;
  };

  #updateCameraLook(deltaSeconds: number) {
    if (this.#inspectionMode === "spread") return;
    dampLookAngles(
      this.#lookAngles,
      this.#lookTarget,
      LOOK_SMOOTHING,
      deltaSeconds,
      this.#nextLookAngles,
    );
    this.#lookAngles.yaw = this.#nextLookAngles.yaw;
    this.#lookAngles.pitch = this.#nextLookAngles.pitch;
    this.#camera.rotation.set(this.#lookAngles.pitch, this.#lookAngles.yaw, 0);
  }

  readonly #handlePointerLockChange = () => {
    const wasPointerLocked = this.#pointerLocked;
    this.#pointerLocked = document.pointerLockElement === this.#canvas;
    const releaseCompleted =
      !this.#pointerLocked && this.#pointerLockReleasePending;
    const resumePointerLock =
      releaseCompleted && this.#resumePointerLockAfterRelease;
    if (releaseCompleted) {
      this.#pointerLockReleasePending = false;
      this.#resumePointerLockAfterRelease = false;
    }
    this.#resetPointerMovement();
    this.#ignoreNextLockedPointerMove =
      this.#pointerLocked && !wasPointerLocked;
    const suppressPause =
      wasPointerLocked &&
      !this.#pointerLocked &&
      this.#suppressNextPointerUnlockPause;
    if (suppressPause) this.#suppressNextPointerUnlockPause = false;
    if (!this.#pointerLocked) {
      this.#keysDown.clear();
      this.#cancelThrowCharge();
      this.#jumpQueued = false;
    }
    this.#canvas.style.cursor = this.#pointerLocked ? "none" : "pointer";
    this.#emitGameState();
    if (
      wasPointerLocked &&
      !this.#pointerLocked &&
      !suppressPause &&
      document.hasFocus() &&
      this.#inspectionMode === "none" &&
      !this.#paused() &&
      !this.#disposed
    )
      this.#onPauseRequest?.();
    if (
      resumePointerLock &&
      !this.#paused() &&
      this.#inspectionMode !== "spread" &&
      !this.#disposed
    )
      this.#requestPointerLock();
  };

  readonly #handleKeyDown = (event: KeyboardEvent) => {
    if (this.#paused()) return;
    if (this.#inspectionMode === "spread") {
      if (event.repeat) return;
      const inspectingCarriedBook =
        this.#inspectionPublicationId === this.#carriedPublicationId;
      if (event.code === "KeyA" || event.code === "KeyD") {
        const publication = this.#inspectionPublication();
        if (!publication) return;
        event.preventDefault();
        this.turnInspectionPage(
          getArrowNavigation(
            event.code === "KeyA" ? "ArrowLeft" : "ArrowRight",
            publication.direction,
          ),
        );
        return;
      }
      if (event.code === "KeyF" && inspectingCarriedBook) {
        event.preventDefault();
        this.#startInspectionClose("throw");
        return;
      }
      if (event.code === "KeyG" && inspectingCarriedBook) {
        event.preventDefault();
        this.#startInspectionClose("drop");
        return;
      }
      if (event.code !== "KeyR") return;
      event.preventDefault();
      this.#startInspectionClose("return");
      return;
    }
    if (!this.#pointerLocked) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        this.#jumpQueued = true;
        this.#jumpQueuedAt = performance.now();
      }
      return;
    }
    if (
      event.code === "KeyW" ||
      event.code === "KeyA" ||
      event.code === "KeyS" ||
      event.code === "KeyD" ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight"
    ) {
      event.preventDefault();
      this.#keysDown.add(event.code);
      return;
    }
    if (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) return;
    if (event.repeat) return;
    if (this.#inspectionMode === "closing") return;
    if (event.code === "KeyV") {
      event.preventDefault();
      if (this.#artFramePlacement) {
        this.#cancelDigitalArtFramePlacement();
        return;
      }
      if (
        !this.#posterPlacement &&
        !this.#carriedPublicationId &&
        !this.#carriedProp
      ) {
        if (this.#artFrameAssets.length > 0)
          this.#startDigitalArtFramePlacement(this.#artFrameAssetIndex);
        else this.#startEmptyDigitalArtFramePlacement();
      }
      return;
    }
    if (
      event.code === "KeyN" &&
      (this.#artFramePlacement || this.#targetedDigitalArtFrameId)
    ) {
      event.preventDefault();
      if (!this.#onArtFrameChannelCreateRequest) return;
      const frame = this.#targetedDigitalArtFrameId
        ? this.#digitalArtFrameRecords.get(this.#targetedDigitalArtFrameId)
            ?.frame
        : undefined;
      const channelId =
        this.#artFramePlacement?.channelId ?? frame?.channelId();
      if (!channelId) return;
      const currentChannelLabel =
        this.#artFrameChannels.find((channel) => channel.id === channelId)
          ?.label ?? channelId;
      this.#suppressNextPointerUnlockPause = true;
      this.#releasePointerLock();
      this.#onArtFrameChannelCreateRequest(currentChannelLabel);
      return;
    }
    if (event.code === "KeyP") {
      event.preventDefault();
      if (this.#posterPlacement) {
        this.#cancelPosterPlacement();
        return;
      }
      if (
        !this.#artFramePlacement &&
        !this.#carriedPublicationId &&
        !this.#carriedProp
      ) {
        if (this.#posterAssets.length > 0)
          void this.#startPosterPlacement(this.#posterAssetIndex);
        else this.#startEmptyPosterPlacement();
      }
      return;
    }
    if (
      this.#artFramePlacement &&
      (event.code === "KeyQ" || event.code === "KeyE")
    ) {
      event.preventDefault();
      this.#cycleDigitalArtFrameAsset(event.code === "KeyQ" ? -1 : 1);
      return;
    }
    if (event.code === "KeyF" && this.#artFramePlacement) {
      event.preventDefault();
      this.#artFramePlacement.fit =
        this.#artFramePlacement.fit === "contain" ? "cover" : "contain";
      this.#artFramePreview?.setFit(this.#artFramePlacement.fit);
      this.#emitGameState();
      return;
    }
    if (event.code === "KeyI" && this.#artFramePlacement) {
      event.preventDefault();
      const intervalIndex = DIGITAL_ART_FRAME_INTERVALS.indexOf(
        this.#artFramePlacement
          .intervalSeconds as (typeof DIGITAL_ART_FRAME_INTERVALS)[number],
      );
      const interval =
        DIGITAL_ART_FRAME_INTERVALS[
          (Math.max(0, intervalIndex) + 1) % DIGITAL_ART_FRAME_INTERVALS.length
        ];
      if (interval !== undefined)
        this.#artFramePlacement.intervalSeconds = interval;
      this.#emitGameState();
      return;
    }
    if (
      this.#posterPlacement &&
      (event.code === "KeyQ" || event.code === "KeyE")
    ) {
      event.preventDefault();
      this.#cyclePoster(event.code === "KeyQ" ? -1 : 1);
      return;
    }
    if (event.code === "KeyQ" && this.#carriedProp) {
      event.preventDefault();
      this.#propPlacementSnapping = !this.#propPlacementSnapping;
      this.#emitGameState();
      return;
    }
    if (event.code === "KeyR" && this.#carriedProp) {
      event.preventDefault();
      this.#propPlacementRotationMode = !this.#propPlacementRotationMode;
      this.#resetPointerMovement();
      this.#emitGameState();
      return;
    }
    if (event.code === "Delete" || event.code === "Backspace") {
      if (this.#targetedDigitalArtFrameId) {
        event.preventDefault();
        this.#removeTargetedDigitalArtFrame();
        return;
      }
      if (this.#targetedPosterId) {
        event.preventDefault();
        this.#removeTargetedPoster();
        return;
      }
    }
    if (
      event.code === "KeyX" &&
      (this.#artFramePlacement || this.#posterPlacement)
    ) {
      event.preventDefault();
      const placement = this.#artFramePlacement ?? this.#posterPlacement;
      if (placement) placement.gridSnap = !placement.gridSnap;
      this.#updateDigitalArtFramePlacementTarget();
      this.#updatePosterPlacementTarget();
      this.#emitGameState();
      return;
    }
    if (event.code === "KeyT") {
      if (this.#artFramePlacement) {
        event.preventDefault();
        this.#cancelDigitalArtFramePlacement();
        return;
      }
      if (this.#posterPlacement) {
        event.preventDefault();
        this.#cancelPosterPlacement();
        return;
      }
      if (this.#carriedProp) {
        event.preventDefault();
        this.#cancelCarriedProp();
        return;
      }
      if (this.#televisionTargeted) {
        event.preventDefault();
        if (
          this.#movableTelevision &&
          this.#targetedTelevision === this.#movableTelevision &&
          this.#movableTelevisionProp
        )
          this.#pickUpProp(this.#movableTelevisionProp);
        return;
      }
      if (this.#targetedProp) {
        event.preventDefault();
        this.#pickUpProp(this.#targetedProp);
        return;
      }
      if (this.#targetedDigitalArtFrameId || this.#targetedPosterId) {
        event.preventDefault();
        this.#interact();
        return;
      }
    }
    if (
      this.#targetedDigitalArtFrameId &&
      (event.code === "KeyQ" || event.code === "KeyE")
    ) {
      event.preventDefault();
      this.#digitalArtFrameRecords
        .get(this.#targetedDigitalArtFrameId)
        ?.frame.changeChannel(event.code === "KeyQ" ? -1 : 1);
      this.#worldStateDirty = true;
      this.#emitGameState();
      return;
    }
    if (event.code === "KeyQ" && this.#televisionTargeted) {
      event.preventDefault();
      this.#targetedTelevision?.previousChannel();
      return;
    }
    if (event.code === "KeyQ" && this.#carriedPublicationId) {
      event.preventDefault();
      this.#shelfPresentation =
        this.#shelfPresentation === "spine" ? "face" : "spine";
      this.#updateInteractionTarget();
      return;
    }
    if (event.code === "KeyE") {
      event.preventDefault();
      if (this.#televisionTargeted) {
        if (this.#targetedTelevision?.powered())
          this.#targetedTelevision.nextChannel();
        else this.#targetedTelevision?.togglePower();
        return;
      }
      if (this.#carriedProp) {
        this.#dropCarriedProp();
        return;
      }
      if (this.#targetedProp || this.#targetedPosterId) return;
      this.#interact();
      return;
    }
    if (event.code === "KeyF") {
      event.preventDefault();
      if (this.#televisionTargeted) this.#targetedTelevision?.skip();
      else if (this.#targetedDigitalArtFrameId)
        this.#digitalArtFrameRecords
          .get(this.#targetedDigitalArtFrameId)
          ?.frame.skip();
      else if (this.#carriedProp) this.#dropCarriedProp(true);
      else if (this.#carriedPublicationId) this.#startThrowCharge();
      else this.#keysDown.add(event.code);
      return;
    }
    if (event.code === "KeyM" && this.#televisionTargeted) {
      event.preventDefault();
      this.#targetedTelevision?.toggleMuted();
      return;
    }
    if (event.code === "KeyG") {
      event.preventDefault();
      if (this.#artFramePlacement || this.#posterPlacement) return;
      if (this.#targetedDigitalArtFrameId)
        this.#removeTargetedDigitalArtFrame();
      else if (this.#targetedPosterId) this.#removeTargetedPoster();
      else if (this.#carriedProp) this.#dropCarriedProp();
      else this.#dropCarriedBook();
      return;
    }
    if (event.code === "KeyI" && this.#targetedDigitalArtFrameId) {
      event.preventDefault();
      this.#cycleTargetedDigitalArtFrameInterval();
      return;
    }
    if (event.code === "KeyR" && this.#targetedDigitalArtFrameId) {
      event.preventDefault();
      this.#cycleTargetedDigitalArtFrameFit();
      return;
    }
    if (event.code !== "KeyR") return;
    event.preventDefault();
    const hoveredRecord = this.#hoveredPublicationId
      ? this.#booksById.get(this.#hoveredPublicationId)
      : undefined;
    if (this.#carriedPublicationId)
      this.#advanceInspectionMode(this.#carriedPublicationId);
    else if (hoveredRecord?.state.status === "shelved")
      this.#advanceInspectionMode(this.#hoveredPublicationId);
  };

  readonly #handleKeyUp = (event: KeyboardEvent) => {
    this.#keysDown.delete(event.code);
    if (event.code === "KeyF" && this.#throwChargeActive) {
      event.preventDefault();
      this.#releaseThrowCharge();
      return;
    }
    if (event.code !== "KeyF" || this.#inspectionMode !== "none") return;
    this.#shelfBrowsePublicationId = undefined;
    this.#updateInteractionTarget();
  };

  readonly #handleWindowBlur = () => {
    this.#keysDown.clear();
    this.#cancelThrowCharge();
    this.#jumpQueued = false;
    this.#shelfBrowsePublicationId = undefined;
    this.#resetPointerMovement();
  };

  #resetPointerMovement() {
    this.#pendingPointerMovementX = 0;
    this.#pendingPointerMovementY = 0;
    this.#anomalousPointerMovementCount = 0;
    this.#lookTarget.yaw = this.#lookAngles.yaw;
    this.#lookTarget.pitch = this.#lookAngles.pitch;
  }

  #requestPointerLock() {
    if (this.#disposed || document.pointerLockElement === this.#canvas) return;
    if (this.#pointerLockReleasePending) {
      this.#resumePointerLockAfterRelease = true;
      return;
    }
    this.#resumePointerLockAfterRelease = false;
    void this.#canvas.requestPointerLock().catch((cause) => {
      if (DEV) console.warn("Afterleaf could not acquire pointer lock.", cause);
    });
  }

  #releasePointerLock() {
    this.#resumePointerLockAfterRelease = false;
    if (
      this.#pointerLockReleasePending ||
      document.pointerLockElement !== this.#canvas
    )
      return;
    this.#pointerLockReleasePending = true;
    document.exitPointerLock();
  }

  #suspendInput() {
    this.#keysDown.clear();
    this.#cancelThrowCharge();
    this.#jumpQueued = false;
    this.#resetPointerMovement();
    this.#releasePointerLock();
    this.#setHoveredPublicationId(undefined);
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#targetedSignKey = undefined;
    this.#setPropTargeted(undefined);
    this.#setTelevisionTargeted(false);
    this.#setTrashTargeted(false);
    this.#emitGameState();
  }

  #setTelevisionTargeted(
    targeted: boolean,
    interaction?: ShopTelevisionInteraction,
    television?: ShopTelevision,
  ) {
    const nextTelevision = targeted ? television : undefined;
    const nextInteraction = targeted ? (interaction ?? "screen") : undefined;
    if (
      nextInteraction === this.#televisionInteraction &&
      nextTelevision === this.#targetedTelevision
    )
      return;
    if (nextTelevision !== this.#targetedTelevision) {
      this.#tvWheelScrubDirection = undefined;
      this.#tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
      this.#tvWheelScrubStepIndex = 0;
    }
    this.#targetedTelevision?.setTargeted(undefined);
    this.#targetedTelevision = nextTelevision;
    this.#televisionInteraction = nextInteraction;
    this.#televisionTargeted = nextInteraction !== undefined;
    nextTelevision?.setTargeted(nextInteraction);
    this.#emitGameState();
  }

  #setTrashTargeted(targeted: boolean) {
    if (targeted === this.#trashTargeted) return;
    this.#trashTargeted = targeted;
    this.#emitGameState();
  }

  #setPropTargeted(record: MovablePropRecord | undefined) {
    if (record === this.#targetedProp) return;
    this.#targetedProp = record;
    this.#emitGameState();
  }

  #setHoveredPublicationId(publicationId: string | undefined) {
    if (publicationId === undefined) this.#shelfBrowsePublicationId = undefined;
    if (publicationId === this.#hoveredPublicationId) return;
    this.#hoveredPublicationId = publicationId;
    const record = publicationId
      ? this.#booksById.get(publicationId)
      : undefined;
    if (record) this.#ensureStandaloneBookTextures(publicationId, record);
    this.#applyBookStates();
    this.#emitGameState();
  }

  #observeSize() {
    const bounds = this.#canvas.getBoundingClientRect();
    this.#viewportWidth = bounds.width;
    this.#viewportHeight = bounds.height;
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.#viewportWidth = entry.contentRect.width;
      this.#viewportHeight = entry.contentRect.height;
      this.#resizeDirty = true;
    });
    this.#resizeObserver.observe(this.#canvas);
  }

  #syncPixelRatio() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    if (pixelRatio === this.#lastPixelRatio) return;
    this.#resizeDirty = true;
  }

  #applyResize() {
    this.#resizeDirty = false;
    const width = Math.max(1, Math.floor(this.#viewportWidth));
    const height = Math.max(1, Math.floor(this.#viewportHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.#lastPixelRatio = pixelRatio;
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  #syncInputs() {
    const items = this.#catalogItems();
    const newPublicationIds = this.#newPublicationIds();
    if (
      items !== this.#lastItems ||
      newPublicationIds !== this.#lastNewPublicationIds
    ) {
      const discardOnlyUpdate =
        newPublicationIds === this.#lastNewPublicationIds &&
        this.#isDiscardOnlyCatalogUpdate(items);
      this.#lastItems = items;
      this.#lastNewPublicationIds = newPublicationIds;
      if (!discardOnlyUpdate) this.#syncBooks(items, newPublicationIds);
    }

    const selectedPublicationId = this.#selectedPublicationId();
    if (selectedPublicationId === this.#lastSelectedPublicationId) return;
    this.#lastSelectedPublicationId = selectedPublicationId;
    const record = selectedPublicationId
      ? this.#booksById.get(selectedPublicationId)
      : undefined;
    if (record)
      this.#ensureStandaloneBookTextures(selectedPublicationId, record);
    this.#applyBookStates();
  }

  #isDiscardOnlyCatalogUpdate(items: readonly CatalogItem[]) {
    const previousItems = this.#lastItems;
    if (!previousItems || items.length >= previousItems.length) return false;

    let itemIndex = 0;
    let removedCount = 0;
    for (const previousItem of previousItems) {
      const item = items[itemIndex];
      if (item?.id === previousItem.id) {
        if (this.#bookSignature(item) !== this.#bookSignature(previousItem))
          return false;
        itemIndex += 1;
        continue;
      }

      const discardPending =
        previousItem.id === this.#pendingDiscardPublicationId;
      if (
        !discardPending &&
        !this.#discardedPublicationIds.has(previousItem.id)
      )
        return false;
      removedCount += 1;
    }

    return removedCount > 0 && itemIndex === items.length;
  }

  #bookSignature(item: CatalogItem) {
    return `${item.cover}|${item.detailCover ?? "no-detail-cover"}|${item.back ?? "solid-back"}|${item.spine ?? "generated-spine"}|${item.accent}|${item.thicknessMm}|${item.aspectRatio ?? "default-aspect"}|${item.direction}|${item.title}`;
  }

  #takeCompatibleWorldSave() {
    const save = this.#pendingWorldSave;
    if (!save) return;
    const catalog = this.#catalogIdentity();
    const exactMatch = worldSaveMatchesCatalog(save, catalog);
    if (!exactMatch && !worldSaveCanReconcileCatalog(save, catalog)) return;
    this.#pendingWorldSave = undefined;
    if (!exactMatch) this.#worldStateDirty = true;
    if (save.shelfSigns) {
      for (const slot of this.#signSlots.values()) {
        if (slot.kind === "shelf" && slot.column !== undefined)
          this.#setShelfSign(slot.column, "");
      }
      for (const sign of save.shelfSigns)
        this.#setShelfSign(sign.column, sign.text, sign.subtitle);
    }
    if (save.aisleSigns) {
      for (const [key, slot] of this.#signSlots) {
        if (slot.kind === "aisle") this.#setSign(key, "", "");
      }
      for (const sign of save.aisleSigns)
        this.#setSign(
          shopSignKey("aisle", sign.id),
          sign.title,
          sign.subtitle ?? "",
        );
    }
    if (save.trashcan)
      this.#setTrashcanPosition(save.trashcan.x, save.trashcan.z, false);
    if (
      save.television &&
      this.#movableTelevision &&
      this.#movableTelevisionProp
    ) {
      this.#physicsPoseRotation.copy(save.television.quaternion);
      if (save.televisionModelVersion !== 2)
        this.#physicsPoseRotation.multiply(LEGACY_MODEL_TELEVISION_ROTATION);
      this.#movableTelevision.object.position.copy(save.television.position);
      this.#movableTelevision.object.quaternion.copy(this.#physicsPoseRotation);
      this.#movableTelevisionProp.currentPosition.copy(
        save.television.position,
      );
      this.#movableTelevisionProp.currentRotation.copy(
        this.#physicsPoseRotation,
      );
      this.#physicsWorld.updatePropPose(MODEL_TELEVISION_PHYSICS_ID, {
        position: save.television.position,
        rotation: this.#physicsPoseRotation,
      });
    }
    const savedProps = save.props ?? [];
    const hasLegacyTvCaveProps = savedProps.some(
      (savedProp) =>
        savedProp.id.startsWith("tv-cave-") &&
        !savedProp.id.startsWith("tv-cave-v6-"),
    );
    if (hasLegacyTvCaveProps) this.#worldStateDirty = true;
    this.#pendingPropSaves = new Map(
      savedProps
        .filter(
          (savedProp) =>
            !savedProp.id.startsWith("tv-cave-") ||
            savedProp.id.startsWith("tv-cave-v6-"),
        )
        .map((savedProp) => [savedProp.id, savedProp]),
    );
    for (const [id, record] of this.#movableProps) {
      const savedProp = this.#pendingPropSaves.get(id);
      if (!savedProp) continue;
      this.#applySavedPropPose(record, savedProp);
      this.#pendingPropSaves.delete(id);
    }
    this.#pendingPosterSaves = save.posters ?? [];
    this.#pendingDigitalArtFrameSaves = save.digitalArtFrames ?? [];
    const playerWasInLegacyTvCave =
      save.player.position.y > SHOP_UPPER_FLOOR_Y &&
      save.player.position.x >= LEGACY_TV_CAVE_BOUNDS.minX &&
      save.player.position.x <= LEGACY_TV_CAVE_BOUNDS.maxX &&
      save.player.position.z >= LEGACY_TV_CAVE_BOUNDS.minZ &&
      save.player.position.z <= LEGACY_TV_CAVE_BOUNDS.maxZ;
    if (playerWasInLegacyTvCave) {
      this.#camera.position.set(
        SHOP_TV_CAVE.centerX,
        SHOP_UPPER_FLOOR_Y + SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
        SHOP_TV_CAVE.centerZ,
      );
      this.#worldStateDirty = true;
    } else this.#camera.position.copy(save.player.position);
    this.#camera.quaternion.copy(save.player.quaternion);
    this.#physicsPoseEuler.setFromQuaternion(this.#camera.quaternion, "YXZ");
    this.#lookAngles.pitch = this.#physicsPoseEuler.x;
    this.#lookAngles.yaw = this.#physicsPoseEuler.y;
    this.#lookTarget.pitch = this.#lookAngles.pitch;
    this.#lookTarget.yaw = this.#lookAngles.yaw;
    this.#camera.rotation.set(
      this.#lookAngles.pitch,
      this.#lookAngles.yaw,
      0,
      "YXZ",
    );
    this.#physicsWorld.setPlayerPosition(this.#camera.position);
    return new Map(
      save.books
        .filter(
          (book) => !this.#discardedPublicationIds.has(book.publicationId),
        )
        .map((book) => [book.publicationId, book]),
    );
  }

  #applySavedBook(record: BookRecord, savedBook: WorldBookSave) {
    record.basePosition.copy(savedBook.pose.position);
    record.mesh.quaternion.copy(savedBook.pose.quaternion);
    this.#physicsPoseEuler.setFromQuaternion(record.mesh.quaternion, "XYZ");
    record.baseRotation.set(
      this.#physicsPoseEuler.x,
      this.#physicsPoseEuler.y,
      this.#physicsPoseEuler.z,
    );
    if (savedBook.state === "shelved") {
      const requestedShelfId = savedBook.shelf.shelfId;
      const legacySlotIndex = savedBook.shelf.slotIndex % FACE_SHELF_SLOT_COUNT;
      const requestedShelf = this.#spineShelfDefinitions.get(requestedShelfId);
      const useFaceDisplayFallback =
        requestedShelfId === FACE_SHELF_ID || !requestedShelf;
      const shelfId = useFaceDisplayFallback
        ? faceDisplayShelfId(Math.floor(legacySlotIndex / FACE_DISPLAY_COLUMNS))
        : requestedShelfId;
      const shelf = this.#spineShelfDefinitions.get(shelfId);
      const slotIndex = useFaceDisplayFallback
        ? legacySlotIndex % FACE_DISPLAY_COLUMNS
        : savedBook.shelf.slotIndex;
      record.slotIndex = slotIndex;
      record.shelfPresentation = useFaceDisplayFallback
        ? "face"
        : (savedBook.shelf.presentation ?? "spine");
      record.shelfOffset = useFaceDisplayFallback
        ? faceDisplayShelfOffset(legacySlotIndex)
        : shelf
          ? this.#physicsPosePosition
              .copy(savedBook.pose.position)
              .sub(shelf.frontCenter)
              .dot(shelf.axis)
          : 0;
      record.state = {
        shelfId,
        slotIndex,
        status: "shelved",
      };
      this.#setShelfPosition(record);
      record.basePosition.copy(record.shelfPosition);
      this.#setShelfRotation(record, savedBook.publicationId);
    } else record.state = {status: savedBook.state};
  }

  #syncBooks(
    items: readonly CatalogItem[],
    newPublicationIds: readonly string[] = this.#newPublicationIds(),
  ) {
    const atlasRevision = ++this.#bookAtlasRevision;
    this.#disposeBookAtlasBatches();
    const savedBooks = this.#takeCompatibleWorldSave();
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const unobservedArrivalIds = newPublicationIds.filter((publicationId) => {
      if (
        !itemsById.has(publicationId) ||
        this.#observedArrivalIds.has(publicationId)
      )
        return false;
      this.#observedArrivalIds.add(publicationId);
      return true;
    });
    const arrivalIds = new Set(unobservedArrivalIds);
    const retainedIds = new Set<string>(
      this.#discardAnimation
        ? [this.#discardAnimation.publicationId]
        : undefined,
    );
    const displayItems = items.filter(
      (item) => !this.#discardedPublicationIds.has(item.id),
    );
    for (const [index, item] of displayItems.entries()) {
      if (retainedIds.has(item.id)) continue;
      retainedIds.add(item.id);
      const signature = this.#bookSignature(item);
      let record = this.#booksById.get(item.id);
      let recordCreated = false;
      if (record?.signature !== signature) {
        const retainedGameplay: RetainedBookGameplay | undefined = record
          ? {
              basePosition: record.basePosition.clone(),
              baseRotation: record.baseRotation.clone(),
              shelfOffset: record.shelfOffset,
              shelfPresentation: record.shelfPresentation,
              slotIndex: record.slotIndex,
              state: record.state,
              taskBook: record.taskBook,
            }
          : undefined;
        const initialSlotIndex = retainedGameplay?.slotIndex ?? index;
        if (record) {
          this.#physicsWorld.removeBook(item.id);
          this.#disposeBookRecord(record);
        }
        record = this.#createBook(
          item,
          signature,
          initialSlotIndex,
          true,
          retainedGameplay,
        );
        this.#booksById.set(item.id, record);
        recordCreated = true;
      }

      const restoredFromSave = arrivalIds.has(item.id)
        ? undefined
        : savedBooks?.get(item.id);
      if (restoredFromSave) this.#applySavedBook(record, restoredFromSave);
      else if (recordCreated && arrivalIds.has(item.id))
        this.#placeNewArrivalAboveFloor(record, item.id);
      if (!record.taskBook) record.slotIndex = index;
      this.#setShelfPosition(record);
      if (record.state.status === "shelved" && !restoredFromSave) {
        record.basePosition.copy(record.shelfPosition);
        this.#setShelfRotation(record, item.id);
      }
      if (record.state.status === "carried") {
        this.#carriedPublicationId = item.id;
        this.#promoteBookCoverTexture(item.id, record);
        if (this.#physicsWorld.isReady) this.#scene.add(record.mesh);
        else {
          this.#camera.add(record.mesh);
          record.mesh.position.copy(this.#heldLocalPosition);
          record.mesh.quaternion.copy(this.#heldLocalRotation);
        }
      } else if (record.mesh.parent === null) {
        record.mesh.position.copy(record.basePosition);
        record.mesh.rotation.set(
          record.baseRotation.x,
          record.baseRotation.y,
          record.baseRotation.z,
          "XYZ",
        );
        this.#scene.add(record.mesh);
      }
      this.#syncBookPhysics(item.id, record);
    }

    for (const [publicationId, record] of this.#booksById) {
      if (retainedIds.has(publicationId)) continue;
      if (this.#inspectionPublicationId === publicationId)
        this.#endInspection();
      if (this.#carriedPublicationId === publicationId) {
        this.#endInspection();
        this.#carriedPublicationId = undefined;
      }
      this.#physicsWorld.removeBook(publicationId);
      this.#disposeBookRecord(record);
      this.#booksById.delete(publicationId);
    }
    this.#syncInteractiveMeshes();
    this.#applyBookStates();
    this.#worldStateDirty = true;
    this.#emitGameState();
    void this.#initializeBookAtlasBatches(items, atlasRevision);
  }

  async #initializeBookAtlasBatches(
    items: readonly CatalogItem[],
    revision: number,
  ) {
    const atlases = this.#catalogAtlases();
    const atlasIndexes = [
      ...new Set(
        items.flatMap((item) =>
          item.shelfAtlas === undefined ? [] : [item.shelfAtlas.index],
        ),
      ),
    ];
    const atlasResources = new Map<
      number,
      {
        coverAtlas: CatalogShelfAtlas;
        spineAtlas: CatalogShelfAtlas;
        textures: BookAtlasTextures;
      }
    >();
    try {
      const loadedResources = await Promise.all(
        atlasIndexes.map(async (atlasIndex) => {
          const front = atlases.front[atlasIndex];
          const back = atlases.back[atlasIndex];
          const spine = atlases.spine[atlasIndex];
          if (
            !front ||
            !back ||
            !spine ||
            front.columns !== back.columns ||
            front.rows !== back.rows ||
            front.firstPublicationIndex !== back.firstPublicationIndex ||
            front.firstPublicationIndex !== spine.firstPublicationIndex ||
            front.publicationCount !== back.publicationCount ||
            front.publicationCount !== spine.publicationCount
          )
            return;
          const [frontTexture, backTexture, spineTexture] = await Promise.all([
            this.#textureLoader.loadAsync(front.url),
            this.#textureLoader.loadAsync(back.url),
            this.#textureLoader.loadAsync(spine.url),
          ]);
          const textures = {
            back: backTexture,
            front: frontTexture,
            spine: spineTexture,
          };
          for (const texture of Object.values(textures)) {
            texture.colorSpace = SRGBColorSpace;
            texture.generateMipmaps = false;
            texture.minFilter = LinearFilter;
          }
          return [
            atlasIndex,
            {coverAtlas: front, spineAtlas: spine, textures},
          ] as const;
        }),
      );
      for (const resource of loadedResources) {
        if (!resource) continue;
        atlasResources.set(...resource);
      }
    } catch (error) {
      for (const resource of atlasResources.values())
        for (const texture of Object.values(resource.textures))
          texture.dispose();
      if (DEV && !this.#disposed)
        console.warn(
          "Afterleaf could not load the book texture atlases.",
          error,
        );
      return;
    }
    if (this.#disposed || revision !== this.#bookAtlasRevision) {
      for (const resource of atlasResources.values())
        for (const texture of Object.values(resource.textures))
          texture.dispose();
      return;
    }

    const groups = new Map<
      string,
      {
        accent: string;
        coverAtlas: CatalogShelfAtlas;
        direction: CatalogItem["direction"];
        entries: {item: CatalogItem; record: BookRecord}[];
        spineAtlas: CatalogShelfAtlas;
        textures: BookAtlasTextures;
      }
    >();
    for (const item of items) {
      const shelfAtlas = item.shelfAtlas;
      const record = this.#booksById.get(item.id);
      if (!shelfAtlas || !record) continue;
      const resource = atlasResources.get(shelfAtlas.index);
      if (
        !resource ||
        shelfAtlas.cellIndex < 0 ||
        shelfAtlas.cellIndex >= resource.coverAtlas.publicationCount
      )
        continue;
      const key = `${shelfAtlas.index}:${item.accent}:${item.direction}`;
      const group = groups.get(key);
      if (group) group.entries.push({item, record});
      else
        groups.set(key, {
          accent: item.accent,
          coverAtlas: resource.coverAtlas,
          direction: item.direction,
          entries: [{item, record}],
          spineAtlas: resource.spineAtlas,
          textures: resource.textures,
        });
    }

    for (const group of groups.values()) {
      const {material, uniforms} = createBookExteriorMaterial(
        new Color(group.accent),
        group.direction === "LTR" ? -1 : 1,
        true,
      );
      uniforms.coverMap.value = group.textures.front;
      uniforms.backMap.value = group.textures.back;
      uniforms.backMapEnabled.value = true;
      uniforms.spineMap.value = group.textures.spine;
      uniforms.spineMapEnabled.value = true;
      const vertexCount = group.entries.reduce(
        (total, entry) =>
          total +
          (entry.record.mesh.geometry.getAttribute("position")?.count ?? 0),
        0,
      );
      const indexCount = group.entries.reduce(
        (total, entry) =>
          total + (entry.record.mesh.geometry.getIndex()?.count ?? 0),
        0,
      );
      const mesh = new BatchedMesh(
        group.entries.length,
        vertexCount,
        indexCount,
        material,
      );
      mesh.name = "book-atlas-batch";
      mesh.userData.publicationIds = group.entries.map(({item}) => item.id);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // Three's per-object BatchedMesh culling incorrectly drops thin,
      // spine-facing books at some camera angles. The whole library is only a
      // few thousand triangles, so drawing every batched book is cheaper than
      // falling back to hundreds of standalone meshes.
      mesh.perObjectFrustumCulled = false;
      mesh.sortObjects = false;
      const batch = {material, mesh};
      for (const {item, record} of group.entries) {
        const shelfAtlas = item.shelfAtlas;
        if (!shelfAtlas) continue;
        const geometry = remapBookGeometryToAtlas(
          record.mesh.geometry,
          group.coverAtlas,
          group.spineAtlas,
          shelfAtlas.cellIndex,
          item.aspectRatio,
          item.thicknessMm,
        );
        const geometryId = mesh.addGeometry(geometry);
        geometry.dispose();
        const instanceId = mesh.addInstance(geometryId);
        record.mesh.updateMatrix();
        mesh.setMatrixAt(instanceId, record.mesh.matrix);
        record.atlasPlacement = {
          batch,
          instanceId,
          lastMatrix: record.mesh.matrix.clone(),
          visible: true,
        };
      }
      this.#scene.add(mesh);
      this.#bookAtlasBatches.push(batch);
    }
    this.#bookAtlasTextures.push(
      ...[...atlasResources.values()].map((resource) => resource.textures),
    );
    this.#syncBookAtlasBatches();
  }

  #syncBookAtlasBatches() {
    for (const [publicationId, record] of this.#booksById) {
      const placement = record.atlasPlacement;
      if (!placement) {
        record.mesh.visible = true;
        continue;
      }
      const forcedStandalone =
        record.mesh.parent !== this.#scene ||
        publicationId === this.#carriedPublicationId ||
        publicationId === this.#inspectionPublicationId ||
        publicationId === this.#discardAnimation?.publicationId;
      const readyStandalone =
        record.standaloneTexturesReady &&
        (publicationId === this.#hoveredPublicationId ||
          publicationId === this.#lastSelectedPublicationId);
      const standalone = forcedStandalone || readyStandalone;
      const batchVisible = record.exteriorMaterial.visible && !standalone;
      if (batchVisible !== placement.visible) {
        placement.batch.mesh.setVisibleAt(placement.instanceId, batchVisible);
        placement.visible = batchVisible;
      }
      record.mesh.visible = standalone;
      if (!batchVisible) continue;
      record.mesh.updateMatrix();
      if (placement.lastMatrix.equals(record.mesh.matrix)) continue;
      placement.lastMatrix.copy(record.mesh.matrix);
      placement.batch.mesh.setMatrixAt(
        placement.instanceId,
        record.mesh.matrix,
      );
    }
  }

  #disposeBookAtlasBatches() {
    for (const record of this.#booksById.values()) {
      const placement = record.atlasPlacement;
      if (placement)
        placement.batch.mesh.setVisibleAt(placement.instanceId, false);
      record.atlasPlacement = undefined;
      record.mesh.visible = true;
    }
    for (const batch of this.#bookAtlasBatches) {
      batch.mesh.removeFromParent();
      batch.mesh.dispose();
      batch.material.dispose();
    }
    this.#bookAtlasBatches.length = 0;
    for (const textures of this.#bookAtlasTextures)
      for (const texture of Object.values(textures)) texture.dispose();
    this.#bookAtlasTextures.length = 0;
  }

  #createBook(
    item: CatalogItem,
    signature: string,
    slotIndex: number,
    initialTaskBook: boolean,
    retainedGameplay?: RetainedBookGameplay,
  ): BookRecord {
    const accent = new Color(item.accent);
    const spineNormalSign = item.direction === "LTR" ? -1 : 1;
    const {material: exteriorMaterial, uniforms: exteriorUniforms} =
      createBookExteriorMaterial(accent, spineNormalSign);
    const width = physicalBookWidth(item.aspectRatio, BOOK_HEIGHT);
    const thickness = physicalBookDepth(item.thicknessMm, BOOK_HEIGHT);
    const mesh = new Mesh(
      new BoxGeometry(width, BOOK_HEIGHT, thickness),
      exteriorMaterial,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.publicationId = item.id;
    const hoverTarget = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial(),
    );
    hoverTarget.name = "shelved-book-hover-target";
    hoverTarget.visible = false;
    hoverTarget.userData.publicationId = item.id;
    this.#scene.add(hoverTarget);

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
    const inspectionLeftBlock = new Mesh(
      new BoxGeometry(width, BOOK_HEIGHT, paperBlockDepth),
      inspectionPaperMaterial,
    );
    const inspectionRightBlock = new Mesh(
      new BoxGeometry(width, BOOK_HEIGHT, paperBlockDepth),
      inspectionPaperMaterial,
    );
    inspectionLeftBlock.name = "inspection-left-paper-block";
    inspectionRightBlock.name = "inspection-right-paper-block";
    inspectionLeftBlock.position.x = -pageCenterOffset;
    inspectionRightBlock.position.x = pageCenterOffset;
    const inspectionFrontCover = new Mesh(
      new PlaneGeometry(width, BOOK_HEIGHT),
      inspectionFrontCoverMaterial,
    );
    inspectionFrontCover.name = "inspection-front-cover-art";
    inspectionFrontCover.castShadow = true;
    inspectionFrontCover.receiveShadow = true;
    inspectionFrontCover.rotation.y = Math.PI;
    inspectionFrontCover.position.set(
      item.direction === "LTR" ? -pageCenterOffset : pageCenterOffset,
      0,
      -paperBlockDepth / 2 - INSPECTION_SURFACE_GAP * 2,
    );
    const inspectionBackCover = new Mesh(
      new PlaneGeometry(width, BOOK_HEIGHT),
      inspectionBackCoverMaterial,
    );
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
    const inspectionLeftMaterial = new MeshBasicMaterial(
      inspectionMaterialOptions,
    );
    const inspectionRightMaterial = new MeshBasicMaterial(
      inspectionMaterialOptions,
    );
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
    const inspectionLeftPage = new Mesh(
      new PlaneGeometry(width, BOOK_HEIGHT),
      inspectionLeftMaterial,
    );
    const inspectionRightPage = new Mesh(
      new PlaneGeometry(width, BOOK_HEIGHT),
      inspectionRightMaterial,
    );
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
    const turningPositionArray =
      inspectionTurningGeometry.getAttribute("position").array;
    const inspectionTurningUvs =
      turningUvArray instanceof Float32Array
        ? new Float32Array(turningUvArray.length)
        : new Float32Array();
    const inspectionTurningPositions =
      turningPositionArray instanceof Float32Array
        ? turningPositionArray
        : new Float32Array();
    const inspectionTurningTargets = new Float32Array(
      inspectionTurningPositions.length,
    );
    for (let index = 0; index < inspectionTurningUvs.length; index += 2) {
      const textureU = turningUvArray[index] ?? 0;
      inspectionTurningUvs[index] =
        item.direction === "LTR" ? textureU : 1 - textureU;
      inspectionTurningUvs[index + 1] = turningUvArray[index + 1] ?? 0;
    }
    inspectionLeftPage.name = "inspection-left-page";
    inspectionRightPage.name = "inspection-right-page";
    inspectionTurningPage.name = "inspection-turning-page";
    inspectionTurningPage.frustumCulled = false;
    inspectionTurningPage.visible = false;
    inspectionLeftPage.position.set(
      -pageCenterOffset,
      0,
      thickness / 2 + INSPECTION_SURFACE_GAP,
    );
    inspectionRightPage.position.set(
      pageCenterOffset,
      0,
      thickness / 2 + INSPECTION_SURFACE_GAP,
    );
    inspectionLeftPage.renderOrder = 20;
    inspectionRightPage.renderOrder = 20;
    inspectionTurningPage.renderOrder = 30;
    inspectionLeftAssembly.add(inspectionLeftBlock, inspectionLeftPage);
    inspectionRightAssembly.add(inspectionRightBlock, inspectionRightPage);
    const inspectionOuterCoverAssembly =
      item.direction === "LTR"
        ? inspectionLeftAssembly
        : inspectionRightAssembly;
    inspectionOuterCoverAssembly.add(inspectionFrontCover, inspectionBackCover);
    inspectionGroup.add(
      inspectionLeftAssembly,
      inspectionRightAssembly,
      inspectionTurningPage,
    );
    mesh.add(inspectionGroup);

    const record: BookRecord = {
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
      hoverTarget,
      mesh,
      physicsRegistered: false,
      publicationAccent: item.accent,
      publicationLanguage: item.language,
      publicationTitle: item.title,
      sceneEmissive: new Color(),
      sceneEmissiveIntensity: 0.2,
      shelfPosition: new Vector3(),
      shelfOffset:
        retainedGameplay?.shelfOffset ??
        (initialTaskBook ? 0 : faceDisplayShelfOffset(slotIndex)),
      shelfPresentation:
        retainedGameplay?.shelfPresentation ??
        (initialTaskBook ? "spine" : "face"),
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
              shelfId: faceDisplayShelfId(
                Math.floor(slotIndex / FACE_DISPLAY_COLUMNS) %
                  FACE_DISPLAY_ROWS,
              ),
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
    };
    if (retainedGameplay) {
      record.basePosition.copy(retainedGameplay.basePosition);
      record.baseRotation.copy(retainedGameplay.baseRotation);
    } else if (record.state.status === "floor")
      this.#placeBookOnFloor(record, slotIndex, item.id);

    return record;
  }

  #placeBookOnFloor(record: BookRecord, floorIndex: number, seedValue: string) {
    const seed = hashString(`${seedValue}:${floorIndex}`);
    const position = bookDropPosition(seed);
    record.basePosition.set(
      position.x,
      record.thickness / 2 + 0.014,
      position.z,
    );
    record.baseRotation.set(
      -Math.PI / 2,
      ((seed >>> 20) % 1_000) * (Math.PI / 500),
      (((seed >>> 27) % 32) / 31 - 0.5) * 0.24,
    );
  }

  #placeNewArrivalAboveFloor(record: BookRecord, seedValue: string) {
    const seed = hashString(`${seedValue}:arrival`);
    const position = bookDropPosition(seed);
    record.basePosition.set(
      position.x,
      2.7 + ((seed >>> 11) % 100) * 0.012,
      position.z,
    );
    record.baseRotation.set(
      -Math.PI / 2 + (((seed >>> 8) % 100) / 100 - 0.5) * 0.7,
      ((seed >>> 15) % 100) * (Math.PI / 50),
      (((seed >>> 24) % 100) / 100 - 0.5) * 0.6,
    );
  }

  #setShelfPosition(record: BookRecord) {
    const state = record.state;
    if (state.status !== "shelved") return;

    const shelf = this.#spineShelfDefinitions.get(state.shelfId);
    if (!shelf) return;
    const shelfWidth =
      record.shelfPresentation === "face" ? record.width : record.thickness;
    record.shelfOffset = MathUtils.clamp(
      record.shelfOffset,
      -shelf.halfWidth + shelfWidth / 2,
      shelf.halfWidth - shelfWidth / 2,
    );
    record.shelfPosition
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, record.shelfOffset)
      .addScaledVector(
        shelf.normal,
        record.shelfPresentation === "face"
          ? -record.thickness / 2 - shelf.faceInset
          : -record.width / 2,
      );
  }

  #setShelfRotation(record: BookRecord, publicationId: string) {
    if (record.state.status !== "shelved") return;
    const shelf = this.#spineShelfDefinitions.get(record.state.shelfId);
    if (!shelf) return;
    if (record.shelfPresentation === "face") {
      record.baseRotation.set(
        shelf.faceTilt,
        Math.atan2(shelf.normal.x, shelf.normal.z),
        ((hashString(publicationId) % 100) / 100 - 0.5) * 0.035,
      );
      this.#syncShelfHoverTarget(record);
      return;
    }
    const sign = record.spineNormalSign;
    record.baseRotation.set(
      0,
      Math.atan2(-shelf.normal.z * sign, shelf.normal.x * sign),
      0,
    );
    this.#syncShelfHoverTarget(record);
  }

  #syncShelfHoverTarget(record: BookRecord) {
    if (record.state.status !== "shelved") return;
    record.hoverTarget.position.copy(record.shelfPosition);
    record.hoverTarget.rotation.set(
      record.baseRotation.x,
      record.baseRotation.y,
      record.baseRotation.z,
      "XYZ",
    );
    record.hoverTarget.scale.set(record.width, BOOK_HEIGHT, record.thickness);
    record.hoverTarget.updateMatrixWorld(true);
  }

  #setPhysicsPose(position: Vector3, rotation: Vector3) {
    this.#physicsPosePosition.copy(position);
    this.#physicsPoseEuler.set(rotation.x, rotation.y, rotation.z, "XYZ");
    this.#physicsPoseRotation.setFromEuler(this.#physicsPoseEuler);
    return this.#physicsPose;
  }

  #syncBookPhysics(publicationId: string, record: BookRecord) {
    const pose = this.#setPhysicsPose(record.basePosition, record.baseRotation);
    if (!record.physicsRegistered) {
      record.physicsRegistered = this.#physicsWorld.addBook({
        ...(record.state.status === "shelved"
          ? {initialState: "shelved" as const}
          : {}),
        pose,
        publicationId,
        thickness: record.thickness,
        width: record.width,
      });
      if (record.physicsRegistered && record.state.status === "carried")
        this.#physicsWorld.holdBook(publicationId);
      return;
    }

    this.#physicsWorld.updateBook(publicationId, {
      ...(record.state.status === "shelved" ? {pose} : {}),
      thickness: record.thickness,
      width: record.width,
    });
  }

  #syncInteractiveMeshes() {
    this.#interactiveMeshes = [...this.#booksById.values()]
      .filter((record) => record.state.status === "floor")
      .map((record) => record.mesh);
    this.#shelfHoverTargetMeshes = [...this.#booksById.values()]
      .filter((record) => record.state.status === "shelved")
      .map((record) => record.hoverTarget);
  }

  #disposeBookRecord(record: BookRecord) {
    const publicationId = record.mesh.userData.publicationId;
    if (typeof publicationId === "string")
      this.#standaloneBookTexturePublicationIds.delete(publicationId);
    if (record.atlasPlacement)
      record.atlasPlacement.batch.mesh.setVisibleAt(
        record.atlasPlacement.instanceId,
        false,
      );
    record.atlasPlacement = undefined;
    record.hoverTarget.removeFromParent();
    record.hoverTarget.geometry.dispose();
    record.hoverTarget.material.dispose();
    record.mesh.removeFromParent();
    record.inspectionLeftMaterial.map = null;
    record.inspectionRightMaterial.map = null;
    record.inspectionTurningFrontMaterial.map = null;
    this.#setInspectionTurningBackTexture(record, null);
    record.inspectionTurningPage.visible = false;
    record.inspectionLeftPage.geometry.dispose();
    record.inspectionRightPage.geometry.dispose();
    record.inspectionLeftBlock.geometry.dispose();
    record.inspectionRightBlock.geometry.dispose();
    record.inspectionBackCover.geometry.dispose();
    record.inspectionFrontCover.geometry.dispose();
    record.inspectionTurningPage.geometry.dispose();
    record.inspectionLeftMaterial.dispose();
    record.inspectionRightMaterial.dispose();
    record.inspectionPaperMaterial.dispose();
    record.inspectionBackCoverMaterial.dispose();
    record.inspectionFrontCoverMaterial.dispose();
    record.inspectionTurningFrontMaterial.dispose();
    record.inspectionTurningBackMaterial.dispose();
    record.texture?.dispose();
    record.detailTexture?.dispose();
    record.backTexture?.dispose();
    record.spineTexture?.dispose();
    record.mesh.geometry.dispose();
    record.exteriorMaterial.dispose();
  }

  #setBookCoverTexture(record: BookRecord, texture: Texture) {
    record.exteriorUniforms.coverMap.value = texture;
    record.inspectionFrontCoverMaterial.map = texture;
    record.inspectionFrontCoverMaterial.emissiveMap = texture;
    record.inspectionFrontCoverMaterial.needsUpdate = true;
  }

  #syncStandaloneBookTextureReadiness(record: BookRecord) {
    const ready =
      record.coverTextureReady &&
      record.backTextureReady &&
      record.spineTextureReady;
    if (ready === record.standaloneTexturesReady) return;
    record.standaloneTexturesReady = ready;
    this.#syncBookAtlasBatches();
  }

  #ensureStandaloneBookTextures(publicationId: string, record: BookRecord) {
    this.#standaloneBookTexturePublicationIds.delete(publicationId);
    this.#standaloneBookTexturePublicationIds.add(publicationId);
    const anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    if (!record.texture) {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#textureLoader.load(
        record.coverTextureUrl,
        (loadedTexture) => {
          if (
            this.#disposed ||
            this.#booksById.get(publicationId) !== record ||
            record.texture !== loadedTexture
          ) {
            loadedTexture.dispose();
            return;
          }
          loadedTexture.colorSpace = SRGBColorSpace;
          loadedTexture.anisotropy = anisotropy;
          record.coverTextureReady = true;
          if (!record.detailTextureReady)
            this.#setBookCoverTexture(record, loadedTexture);
          this.#syncStandaloneBookTextureReadiness(record);
        },
        undefined,
        () => {
          if (record.texture !== requestedTexture) return;
          requestedTexture?.dispose();
          record.texture = undefined;
          record.coverTextureReady = false;
          record.exteriorUniforms.coverMap.value = null;
          this.#syncStandaloneBookTextureReadiness(record);
        },
      );
      requestedTexture.colorSpace = SRGBColorSpace;
      requestedTexture.anisotropy = anisotropy;
      record.texture = requestedTexture;
      if (!record.detailTextureReady)
        this.#setBookCoverTexture(record, requestedTexture);
    }
    if (record.backTextureUrl && !record.backTexture) {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#textureLoader.load(
        record.backTextureUrl,
        (loadedTexture) => {
          if (
            this.#disposed ||
            this.#booksById.get(publicationId) !== record ||
            record.backTexture !== loadedTexture
          ) {
            loadedTexture.dispose();
            return;
          }
          loadedTexture.colorSpace = SRGBColorSpace;
          loadedTexture.anisotropy = anisotropy;
          record.backTextureReady = true;
          record.exteriorUniforms.backMap.value = loadedTexture;
          record.exteriorUniforms.backMapEnabled.value = true;
          record.inspectionBackCoverMaterial.color.set("#ffffff");
          record.inspectionBackCoverMaterial.map = loadedTexture;
          record.inspectionBackCoverMaterial.emissiveMap = loadedTexture;
          record.inspectionBackCoverMaterial.needsUpdate = true;
          this.#syncStandaloneBookTextureReadiness(record);
        },
        undefined,
        () => {
          if (record.backTexture !== requestedTexture) return;
          requestedTexture?.dispose();
          record.backTexture = undefined;
          record.backTextureReady = true;
          record.exteriorUniforms.backMap.value = null;
          record.exteriorUniforms.backMapEnabled.value = false;
          this.#syncStandaloneBookTextureReadiness(record);
        },
      );
      requestedTexture.colorSpace = SRGBColorSpace;
      requestedTexture.anisotropy = anisotropy;
      record.backTexture = requestedTexture;
    }
    if (!record.spineTexture) {
      const spineTextureUrl = record.spineTextureUrl;
      if (spineTextureUrl) {
        let requestedTexture: Texture | undefined;
        requestedTexture = this.#textureLoader.load(
          spineTextureUrl,
          (loadedTexture) => {
            if (
              this.#disposed ||
              this.#booksById.get(publicationId) !== record ||
              record.spineTexture !== loadedTexture
            ) {
              loadedTexture.dispose();
              return;
            }
            loadedTexture.colorSpace = SRGBColorSpace;
            loadedTexture.anisotropy = anisotropy;
            record.spineTextureReady = true;
            record.exteriorUniforms.spineMap.value = loadedTexture;
            record.exteriorUniforms.spineMapEnabled.value = true;
            this.#syncStandaloneBookTextureReadiness(record);
          },
          undefined,
          () => {
            if (record.spineTexture !== requestedTexture) return;
            requestedTexture?.dispose();
            const fallbackTexture = this.#createBookSpineTexture(
              record.publicationTitle,
              record.publicationLanguage,
              record.publicationAccent,
            );
            record.spineTexture = fallbackTexture;
            record.spineTextureReady = true;
            record.exteriorUniforms.spineMap.value = fallbackTexture ?? null;
            record.exteriorUniforms.spineMapEnabled.value =
              fallbackTexture !== undefined;
            this.#syncStandaloneBookTextureReadiness(record);
          },
        );
        requestedTexture.colorSpace = SRGBColorSpace;
        requestedTexture.anisotropy = anisotropy;
        record.spineTexture = requestedTexture;
      } else {
        const fallbackTexture = this.#createBookSpineTexture(
          record.publicationTitle,
          record.publicationLanguage,
          record.publicationAccent,
        );
        record.spineTexture = fallbackTexture;
        record.spineTextureReady = true;
        record.exteriorUniforms.spineMap.value = fallbackTexture ?? null;
        record.exteriorUniforms.spineMapEnabled.value =
          fallbackTexture !== undefined;
        this.#syncStandaloneBookTextureReadiness(record);
      }
    }
    this.#trimStandaloneBookTextures();
  }

  #releaseStandaloneBookTextures(publicationId: string, record: BookRecord) {
    this.#standaloneBookTexturePublicationIds.delete(publicationId);
    record.texture?.dispose();
    record.texture = undefined;
    record.coverTextureReady = false;
    record.backTexture?.dispose();
    record.backTexture = undefined;
    record.backTextureReady = record.backTextureUrl === undefined;
    record.spineTexture?.dispose();
    record.spineTexture = undefined;
    record.spineTextureReady = false;
    record.standaloneTexturesReady = false;
    record.exteriorUniforms.coverMap.value = null;
    record.exteriorUniforms.backMap.value = null;
    record.exteriorUniforms.backMapEnabled.value = false;
    record.exteriorUniforms.spineMap.value = null;
    record.exteriorUniforms.spineMapEnabled.value = false;
    record.inspectionFrontCoverMaterial.map = null;
    record.inspectionFrontCoverMaterial.emissiveMap = null;
    record.inspectionFrontCoverMaterial.needsUpdate = true;
    record.inspectionBackCoverMaterial.map = null;
    record.inspectionBackCoverMaterial.emissiveMap = null;
    record.inspectionBackCoverMaterial.color
      .set(record.publicationAccent)
      .multiplyScalar(0.76);
    record.inspectionBackCoverMaterial.needsUpdate = true;
  }

  #trimStandaloneBookTextures() {
    if (
      this.#standaloneBookTexturePublicationIds.size <=
      STANDALONE_BOOK_TEXTURE_CACHE_SIZE
    )
      return;
    for (const publicationId of this.#standaloneBookTexturePublicationIds) {
      if (
        publicationId === this.#hoveredPublicationId ||
        publicationId === this.#lastSelectedPublicationId ||
        publicationId === this.#carriedPublicationId ||
        publicationId === this.#inspectionPublicationId ||
        publicationId === this.#discardAnimation?.publicationId
      )
        continue;
      const record = this.#booksById.get(publicationId);
      if (record) this.#releaseStandaloneBookTextures(publicationId, record);
      else this.#standaloneBookTexturePublicationIds.delete(publicationId);
      if (
        this.#standaloneBookTexturePublicationIds.size <=
        STANDALONE_BOOK_TEXTURE_CACHE_SIZE
      )
        return;
    }
  }

  #promoteBookCoverTexture(publicationId: string, record: BookRecord) {
    this.#ensureStandaloneBookTextures(publicationId, record);
    if (record.detailTextureReady && record.detailTexture) {
      this.#setBookCoverTexture(record, record.detailTexture);
      return;
    }
    const detailCoverUrl = record.detailCoverUrl;
    if (!detailCoverUrl || record.detailTextureLoading) return;
    record.detailTextureLoading = true;
    const detailTexture = this.#textureLoader.load(
      detailCoverUrl,
      (loadedTexture) => {
        if (this.#disposed || this.#booksById.get(publicationId) !== record) {
          loadedTexture.dispose();
          return;
        }
        loadedTexture.colorSpace = SRGBColorSpace;
        loadedTexture.anisotropy = Math.min(
          8,
          this.#renderer.capabilities.getMaxAnisotropy(),
        );
        record.detailTexture = loadedTexture;
        record.detailTextureLoading = false;
        if (
          record.state.status !== "carried" &&
          this.#inspectionPublicationId !== publicationId
        ) {
          loadedTexture.dispose();
          record.detailTexture = undefined;
          record.detailTextureReady = false;
          return;
        }
        record.detailTextureReady = true;
        this.#setBookCoverTexture(record, loadedTexture);
      },
      undefined,
      () => {
        if (this.#booksById.get(publicationId) !== record) return;
        record.detailTexture?.dispose();
        record.detailTexture = undefined;
        record.detailTextureLoading = false;
      },
    );
    record.detailTexture = detailTexture;
  }

  #restoreCompactBookCoverTexture(record: BookRecord) {
    if (record.texture) this.#setBookCoverTexture(record, record.texture);
    if (!record.detailTextureReady) return;
    record.detailTexture?.dispose();
    record.detailTexture = undefined;
    record.detailTextureReady = false;
  }

  #applyBookStates() {
    for (const [publicationId, record] of this.#booksById) {
      const selected =
        publicationId === this.#lastSelectedPublicationId ||
        publicationId === this.#inspectionPublicationId;
      const hovered = publicationId === this.#hoveredPublicationId;
      const shelfHovered = hovered && record.state.status === "shelved";
      let targetScale = 1;
      if (hovered && !shelfHovered) targetScale = 1.08;
      else if (selected) targetScale = 1.025;
      record.targetScale = targetScale;
      record.targetLift = hovered && !shelfHovered ? 0.08 : 0;
      record.sceneEmissive.set(
        hovered ? "#a34437" : selected ? "#49231f" : "#000000",
      );
      record.sceneEmissiveIntensity = hovered ? 0.55 : 0.2;
      record.exteriorMaterial.emissive.copy(record.sceneEmissive);
      record.exteriorMaterial.emissiveIntensity = record.sceneEmissiveIntensity;
      this.#applyInspectionLighting(record);
    }
  }

  #applyInspectionLighting(record: BookRecord) {
    record.exteriorMaterial.emissive
      .copy(record.sceneEmissive)
      .lerp(INSPECTION_READER_EMISSIVE, record.inspectionLightingBlend);
    record.exteriorMaterial.emissiveIntensity = MathUtils.lerp(
      record.sceneEmissiveIntensity,
      INSPECTION_READER_EMISSIVE_INTENSITY,
      record.inspectionLightingBlend,
    );
    record.inspectionFrontCoverMaterial.emissive.copy(
      record.exteriorMaterial.emissive,
    );
    record.inspectionFrontCoverMaterial.emissiveIntensity =
      record.exteriorMaterial.emissiveIntensity;
    record.inspectionBackCoverMaterial.emissive.copy(
      record.exteriorMaterial.emissive,
    );
    record.inspectionBackCoverMaterial.emissiveIntensity =
      record.exteriorMaterial.emissiveIntensity;
  }

  #animateInspectionLighting(
    record: BookRecord,
    focused: boolean,
    deltaSeconds: number,
  ) {
    const target = focused ? 1 : 0;
    if (record.inspectionLightingBlend === target) return;
    const nextBlend = MathUtils.damp(
      record.inspectionLightingBlend,
      target,
      INSPECTION_LIGHTING_BLEND_SPEED,
      deltaSeconds,
    );
    if (Math.abs(nextBlend - target) < 0.001)
      record.inspectionLightingBlend = target;
    else record.inspectionLightingBlend = nextBlend;
    this.#applyInspectionLighting(record);
  }

  #movePlayer(deltaSeconds: number) {
    if (!this.#pointerLocked || this.#inspectionMode === "spread") {
      this.#playerVelocity.set(0, 0, 0);
      this.#playerVerticalVelocity = 0;
      this.#jumpQueued = false;
      return;
    }
    this.#movementInput.forward =
      Number(this.#keysDown.has("KeyW")) - Number(this.#keysDown.has("KeyS"));
    this.#movementInput.right =
      Number(this.#keysDown.has("KeyD")) - Number(this.#keysDown.has("KeyA"));
    const sprinting =
      this.#keysDown.has("ShiftLeft") || this.#keysDown.has("ShiftRight");
    getPlanarMovement(
      this.#movementInput,
      this.#lookAngles.yaw,
      (sprinting ? SPRINT_SPEED : WALK_SPEED) * deltaSeconds,
      this.#movementDelta,
    );
    const previousX = this.#camera.position.x;
    const previousY = this.#camera.position.y;
    const previousZ = this.#camera.position.z;
    if (this.#physicsWorld.isReady) {
      const movementTime = performance.now();
      const canJump =
        this.#playerGrounded ||
        movementTime - this.#lastPlayerGroundedAt <= PLAYER_JUMP_COYOTE_MS ||
        this.#camera.position.y <= SHOP_PHYSICS_PLAYER_EYE_HEIGHT + 0.025;
      const jumpBuffered =
        this.#jumpQueued &&
        movementTime - this.#jumpQueuedAt <= PLAYER_JUMP_BUFFER_MS;
      if (jumpBuffered && canJump) {
        this.#playerVerticalVelocity = PLAYER_JUMP_SPEED;
        this.#playerGrounded = false;
        this.#lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
      } else
        this.#playerVerticalVelocity = Math.max(
          PLAYER_TERMINAL_VELOCITY,
          this.#playerVerticalVelocity + PLAYER_GRAVITY * deltaSeconds,
        );
      this.#jumpQueued = jumpBuffered && !canJump;
      this.#playerDesiredDisplacement.set(
        this.#movementDelta.x,
        this.#playerVerticalVelocity * deltaSeconds,
        this.#movementDelta.z,
      );
      this.#physicsWorld.movePlayer(
        this.#playerDesiredDisplacement,
        this.#playerMovement,
      );
      this.#camera.position.copy(this.#playerMovement.eyePosition);
      const correctedY = this.#playerMovement.correctedDisplacement.y;
      const descending = this.#playerVerticalVelocity <= 0;
      const supportedWhileFalling =
        descending && correctedY > this.#playerDesiredDisplacement.y + 0.0001;
      // Rapier can retain a ground contact during the first upward sweep based
      // on its planar direction. It must not cancel a jump that just launched.
      const grounded = resolvePlayerGrounded(
        this.#playerVerticalVelocity,
        this.#playerMovement.grounded,
        supportedWhileFalling,
      );
      if (
        grounded ||
        (this.#playerVerticalVelocity > 0 && this.#playerMovement.ceilingHit)
      )
        this.#playerVerticalVelocity = 0;
      this.#playerGrounded = grounded;
      if (grounded) this.#lastPlayerGroundedAt = movementTime;
    } else {
      this.#jumpQueued = false;
      this.#movementPosition.x = previousX;
      this.#movementPosition.z = previousZ;
      resolveShopMovement(
        this.#movementPosition,
        this.#movementDelta,
        PLAYER_RADIUS,
        SHOP_COLLISION_WORLD,
        this.#movementPosition,
      );
      this.#camera.position.set(
        this.#movementPosition.x,
        SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
        this.#movementPosition.z,
      );
      this.#playerGrounded = true;
      this.#lastPlayerGroundedAt = performance.now();
      this.#playerVerticalVelocity = 0;
    }
    this.#playerVelocity.set(
      (this.#camera.position.x - previousX) / deltaSeconds,
      (this.#camera.position.y - previousY) / deltaSeconds,
      (this.#camera.position.z - previousZ) / deltaSeconds,
    );
    if (
      this.#camera.position.x !== previousX ||
      this.#camera.position.y !== previousY ||
      this.#camera.position.z !== previousZ
    )
      this.#worldStateDirty = true;
  }

  #inspectionPublication() {
    const publicationId =
      this.#inspectionPublicationId ?? this.#carriedPublicationId;
    if (!publicationId) return;
    return this.#catalogItems().find((item) => item.id === publicationId);
  }

  #advanceInspectionMode(publicationId = this.#carriedPublicationId) {
    if (!publicationId) return;
    const publication = this.#catalogItems().find(
      (item) => item.id === publicationId,
    );
    if (!publication || publication.pages.length === 0) return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;

    if (this.#inspectionMode === "none") {
      const inspectableFromShelf = record.state.status === "shelved";
      if (
        publication.id !== this.#carriedPublicationId &&
        !inspectableFromShelf
      )
        return;
      this.#inspectionPublicationId = publication.id;
      const bookmarkedPage = clampPageIndex(
        this.#initialPageIndex(publication.id),
        publication.pages.length,
      );
      const firstInteriorPage = publication.pages.length > 1 ? 1 : 0;
      this.#inspectionResumePageIndex = getReaderSpread(
        bookmarkedPage === 0 ? firstInteriorPage : bookmarkedPage,
        publication.pages.length,
        "spread",
        getWideReaderPageIndices(publication.pages),
      ).start;
      this.#inspectionPageIndex = 0;
      this.#inspectionMode = "spread";
      this.#inspectionShelfFocusPending =
        inspectableFromShelf && record.shelfPresentation === "spine";
      this.#inspectionOpeningHalf =
        publication.direction === "LTR" ? "left" : "right";
      this.#inspectionCloseAction = undefined;
      this.#inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.#inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.#inspectionOpeningDelay = INSPECTION_OPENING_DELAY_SECONDS;
      this.#applyInspectionOpenAngle(record);
      this.#resetInspectionZoom();
      this.#promoteBookCoverTexture(publication.id, record);
      this.#setHoveredPublicationId(undefined);
      this.#onSelectPublication(publication.id);
      this.#applyBookStates();
      this.#releasePointerLock();
    } else {
      this.#startInspectionClose("return");
      return;
    }

    this.#configureInspectionPages(record, publication);
    if (this.#inspectionOpeningDelay > 0) {
      record.inspectionGroup.visible = false;
      record.exteriorMaterial.visible = true;
    }
    void this.#syncInspectionPageTextures(publication);
    this.#emitGameState();
  }

  #openInspectionBook() {
    const publication = this.#inspectionPublication();
    if (
      !publication ||
      this.#inspectionMode !== "spread" ||
      this.#inspectionOpenAngleTarget === 0
    )
      return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;

    this.#inspectionPageIndex = this.#inspectionResumePageIndex;
    this.#inspectionOpenAngleTarget = 0;
    this.#configureInspectionPages(record, publication);
    if (this.#inspectionOpeningDelay > 0) {
      record.inspectionGroup.visible = false;
      record.exteriorMaterial.visible = true;
    }
    void this.#syncInspectionPageTextures(publication);
    this.#onPageIndexChange?.(publication.id, this.#inspectionPageIndex);
    this.#emitGameState();
  }

  #startInspectionClose(action: InspectionCloseAction) {
    if (this.#inspectionMode !== "spread") return;
    const publication = this.#inspectionPublication();
    if (!publication) return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    this.#inspectionShelfFocusPending = false;
    this.#requestPointerLock();
    if (record.state.status === "shelved") {
      this.#scene.attach(record.mesh);
      this.#inspectionShelfWorldRotation.setFromEuler(
        this.#physicsPoseEuler.set(
          record.baseRotation.x,
          record.baseRotation.y,
          record.baseRotation.z,
          "XYZ",
        ),
      );
      this.#inspectionShelfReturnPhase = "close";
    }
    const widePages = getWideReaderPageIndices(publication.pages);
    const currentSpread = getReaderSpread(
      this.#inspectionPageIndex,
      publication.pages.length,
      "spread",
      widePages,
    );
    const alreadyOnClosedCover =
      currentSpread.start === 0 ||
      (currentSpread.start === publication.pages.length - 1 &&
        !widePages.has(currentSpread.start));
    if (alreadyOnClosedCover) {
      this.#cancelInspectionPageTurn(record, publication);
      this.#inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.#inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.#applyInspectionOpenAngle(record);
      this.#showCompactInspectionBook(record);
    } else if (this.#inspectionOpenAngleTarget !== INSPECTION_OPEN_ANGLE) {
      this.#inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.#cancelInspectionPageTurn(record, publication);
    }
    this.#inspectionMode = "closing";
    this.#inspectionCloseAction = action;
    this.#inspectionPhysicsReturnActive = false;
    this.#inspectionOpeningDelay = 0;
    this.#resetInspectionZoom();
    if (this.#inspectionOpenAngle === INSPECTION_OPEN_ANGLE)
      this.#showCompactInspectionBook(record);
    this.#emitGameState();
  }

  #finishInspectionClose() {
    const action = this.#inspectionCloseAction;
    const publicationId = this.#inspectionPublicationId;
    const record = publicationId
      ? this.#booksById.get(publicationId)
      : undefined;
    this.#endInspection();
    if (action === "return" && publicationId && record) {
      record.mesh.updateMatrixWorld(true);
      record.mesh.getWorldPosition(this.#physicsPosePosition);
      record.mesh.getWorldQuaternion(this.#physicsPoseRotation);
      this.#physicsWorld.snapHeldBook(publicationId, this.#physicsPose);
    }
    if (action === "drop") this.#dropCarriedBook(true);
    else if (action === "throw") this.#dropCarriedBook(true, true);
  }

  #endInspection() {
    if (this.#inspectionMode === "none") return;
    const publicationId = this.#inspectionPublicationId;
    const record = publicationId
      ? this.#booksById.get(publicationId)
      : undefined;
    this.#inspectionMode = "none";
    this.#inspectionCloseAction = undefined;
    this.#inspectionOpenAngle = 0;
    this.#inspectionOpenAngleTarget = 0;
    this.#inspectionOpeningDelay = 0;
    this.#inspectionPhysicsReturnActive = false;
    this.#inspectionShelfFocusPending = false;
    this.#inspectionShelfReturnPhase = undefined;
    this.#resetInspectionZoom();
    this.#inspectionTurnRevision += 1;
    this.#inspectionTurnPreparing = false;
    this.#inspectionDragging = false;
    this.#inspectionDragReleaseDecision = undefined;
    this.#inspectionTurnPage = undefined;
    this.#inspectionTurnFromSingle = false;
    this.#inspectionTurnOpeningFromBack = false;
    this.#inspectionTurnToSingle = false;
    this.#releaseInspectionTurnTextures();
    this.#releaseInspectionPageTextures();
    if (record) {
      this.#applyInspectionOpenAngle(record);
      this.#showCompactInspectionBook(record);
      if (record.mesh.parent === this.#camera) this.#scene.attach(record.mesh);
      if (record.state.status === "shelved") {
        record.mesh.position.copy(record.shelfPosition);
        record.mesh.rotation.set(
          record.baseRotation.x,
          record.baseRotation.y,
          record.baseRotation.z,
          "XYZ",
        );
        record.mesh.scale.setScalar(1);
        record.shelfPreview = 0;
      }
    }
    this.#inspectionPublicationId = undefined;
    this.#emitGameState();
  }

  #cancelInspectionPageTurn(record: BookRecord, publication: CatalogItem) {
    this.#inspectionTurnRevision += 1;
    this.#inspectionTurnPreparing = false;
    this.#inspectionDragging = false;
    this.#inspectionDragNavigation = undefined;
    this.#inspectionDragReleaseDecision = undefined;
    if (this.#inspectionTurnPage !== undefined) {
      const sourceMaterial =
        this.#inspectionTurnSourceSide === "left"
          ? record.inspectionLeftMaterial
          : record.inspectionRightMaterial;
      sourceMaterial.map = this.#inspectionTurnSourceTexture;
      sourceMaterial.needsUpdate = true;
      const destinationMaterial =
        this.#inspectionTurnPage === "left"
          ? record.inspectionLeftMaterial
          : record.inspectionRightMaterial;
      destinationMaterial.map = this.#inspectionTurnDestinationPreviousTexture;
      destinationMaterial.needsUpdate = true;
    }
    this.#inspectionTurnPage = undefined;
    this.#inspectionTurnFromSingle = false;
    this.#inspectionTurnOpeningFromBack = false;
    this.#inspectionTurnToSingle = false;
    record.inspectionTurningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.#setInspectionTurningBackTexture(record, null);
    this.#releaseInspectionTurnTextures();
    this.#configureInspectionPages(record, publication);
  }

  #turnInspectionPages(navigation: ReaderNavigation) {
    const publication = this.#inspectionPublication();
    if (
      !publication ||
      this.#inspectionMode !== "spread" ||
      this.#inspectionOpenAngle > 0.08 ||
      this.#inspectionTurnPage !== undefined
    )
      return;
    const previousPageIndex = this.#inspectionPageIndex;
    const nextPageIndex = getAdjacentSpreadStart(
      previousPageIndex,
      publication.pages.length,
      "spread",
      navigation,
      getWideReaderPageIndices(publication.pages),
    );
    if (nextPageIndex === previousPageIndex) return;
    if (
      this.#inspectionTurnPreparing &&
      nextPageIndex === this.#inspectionTurnTargetPageIndex
    )
      return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    void this.#prepareInspectionPageTurn(
      record,
      publication,
      nextPageIndex,
      navigation,
    );
  }

  #beginInspectionPointerTurn(event: PointerEvent) {
    const publication = this.#inspectionPublication();
    if (
      !publication ||
      this.#inspectionMode !== "spread" ||
      this.#inspectionOpeningDelay > 0 ||
      this.#inspectionOpenAngle > 0.08 ||
      this.#inspectionTurnPage !== undefined
    )
      return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    const bounds = this.#canvas.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const pointerY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.#inspectionPointerNdc.set(pointerX, pointerY);
    this.#raycaster.setFromCamera(this.#inspectionPointerNdc, this.#camera);
    const intersections = this.#raycaster.intersectObjects(
      [record.inspectionLeftPage, record.inspectionRightPage].filter(
        (page) => page.visible,
      ),
      false,
    );
    const intersection = intersections[0];
    const page = intersection?.object;
    if (!page) return;
    let clickedSide: "left" | "right";
    if (record.inspectionLeftPage.visible && record.inspectionRightPage.visible)
      clickedSide = page === record.inspectionLeftPage ? "left" : "right";
    else clickedSide = pointerX < 0 ? "left" : "right";
    const forwardSide = publication.direction === "LTR" ? "right" : "left";
    const navigation = clickedSide === forwardSide ? "forward" : "backward";
    this.#inspectionDragging = true;
    this.#inspectionDragMoved = false;
    this.#inspectionDragNavigation = navigation;
    this.#inspectionDragReleaseDecision = undefined;
    this.#inspectionDragStartX = event.clientX;
    this.#inspectionDragCurrentX = event.clientX;
    const textureU = intersection?.uv?.x ?? 1;
    this.#inspectionTurnAnchorX = MathUtils.clamp(
      clickedSide === "right" ? textureU : 1 - textureU,
      0.08,
      1,
    );
    this.#inspectionTurnAnchorY = intersection?.uv?.y ?? 0.5;
    this.#turnInspectionPages(navigation);
  }

  #inspectionDragCompletion() {
    const navigation = this.#inspectionDragNavigation;
    const publication = this.#inspectionPublication();
    if (!navigation || !publication) return 0;
    const forward = navigation === "forward";
    const ltr = publication.direction === "LTR";
    const destinationSide = forward === ltr ? "left" : "right";
    const screenDirection = destinationSide === "left" ? -1 : 1;
    const dragDistance =
      (this.#inspectionDragCurrentX - this.#inspectionDragStartX) *
      screenDirection;
    const distance = this.#inspectionBaseDistance() / this.#inspectionZoom;
    const bookWidth = physicalBookWidth(publication.aspectRatio, BOOK_HEIGHT);
    const pagePixelWidth =
      (bookWidth / (distance * Math.tan(this.#horizontalFieldOfView() / 2))) *
      (this.#viewportWidth / 2);
    const grabRadius = Math.max(
      1,
      pagePixelWidth * this.#inspectionTurnAnchorX,
    );
    const turnAngle = Math.acos(
      1 - MathUtils.clamp(dragDistance / grabRadius, 0, 2),
    );
    return invertPageTurnEasing(MathUtils.clamp(turnAngle / Math.PI, 0, 1));
  }

  #updateInspectionDragProgress() {
    const navigation = this.#inspectionDragNavigation;
    const publication = this.#inspectionPublication();
    if (!navigation || !publication || this.#inspectionTurnPage === undefined)
      return;
    const completion = this.#inspectionDragCompletion();
    this.#inspectionTurnProgressTarget =
      navigation === "forward" ? completion : 1 - completion;
  }

  #resolveInspectionDragDecision(decision: "cancel" | "commit") {
    this.#inspectionDragReleaseDecision = undefined;
    this.#inspectionTurnWillCommit = decision === "commit";
    const forward = this.#inspectionTurnNavigation === "forward";
    this.#inspectionTurnProgressTarget =
      decision === "commit" ? (forward ? 1 : 0) : forward ? 0 : 1;
  }

  #zoomInspectionAtPointer(event: WheelEvent) {
    this.#setInspectionPointer(event.clientX, event.clientY);
    const nextZoom = MathUtils.clamp(
      this.#inspectionZoomTarget * Math.exp(-event.deltaY * 0.0015),
      1,
      4,
    );
    if (nextZoom === this.#inspectionZoomTarget) return;
    this.#inspectionZoomTarget = nextZoom;
    this.#updateInspectionZoomPanTarget();
  }

  #setInspectionPointer(clientX: number, clientY: number) {
    const bounds = this.#canvas.getBoundingClientRect();
    this.#inspectionPointerX = MathUtils.clamp(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -1,
      1,
    );
    this.#inspectionPointerY = MathUtils.clamp(
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
      -1,
      1,
    );
  }

  #updateInspectionZoomPanTarget() {
    const baseDistance = this.#inspectionBaseDistance();
    const zoomPanScale = 1 - 1 / this.#inspectionZoomTarget;
    this.#inspectionZoomOffsetTargetX =
      -this.#inspectionPointerX *
      baseDistance *
      Math.tan(this.#horizontalFieldOfView() / 2) *
      zoomPanScale;
    this.#inspectionZoomOffsetTargetY =
      -this.#inspectionPointerY *
      baseDistance *
      Math.tan(MathUtils.degToRad(this.#camera.fov) / 2) *
      zoomPanScale;
  }

  #inspectionPageUrls(publication: CatalogItem, pageIndex: number) {
    const widePages = getWideReaderPageIndices(publication.pages);
    const spreadSides = getReaderSpreadSides(
      pageIndex,
      publication.pages.length,
      publication.direction,
      widePages,
    );
    const isWideSpread = widePages.has(pageIndex);
    const pageUrl = (
      index: number | undefined,
      half: "left" | "right" | undefined,
    ) => {
      if (index === undefined) return;
      const url = this.#inspectionPageUrl(publication, index);
      return url ? readerPageTextureUrl(url, half) : undefined;
    };
    return {
      left: pageUrl(spreadSides.left, isWideSpread ? "left" : undefined),
      right: pageUrl(spreadSides.right, isWideSpread ? "right" : undefined),
    };
  }

  #inspectionPageUrl(publication: CatalogItem, pageIndex: number) {
    return pageIndex === 0
      ? (publication.detailCover ?? publication.cover)
      : publication.pages[pageIndex];
  }

  async #prepareInspectionPageTurn(
    record: BookRecord,
    publication: CatalogItem,
    nextPageIndex: number,
    navigation: ReaderNavigation,
  ) {
    const revision = ++this.#inspectionTurnRevision;
    this.#inspectionTurnPreparing = true;
    this.#inspectionTurnTargetPageIndex = nextPageIndex;
    const targetUrls = this.#inspectionPageUrls(publication, nextPageIndex);
    const requestedUrls = new Set(
      [targetUrls.left, targetUrls.right].filter(
        (url): url is string => url !== undefined,
      ),
    );
    const textures = new Map<string, Texture>();
    await Promise.all(
      [...requestedUrls].map(async (url) => {
        try {
          textures.set(
            url,
            await this.#inspectionPageTextureCache.acquire(url),
          );
        } catch {
          // A missing destination texture still turns as an unprinted leaf.
        }
      }),
    );
    if (
      this.#disposed ||
      revision !== this.#inspectionTurnRevision ||
      this.#inspectionPublication()?.id !== publication.id
    ) {
      for (const url of textures.keys())
        this.#inspectionPageTextureCache.release(url);
      return;
    }

    this.#releaseInspectionTurnTextures();
    this.#inspectionTurnTextureUrls = new Set(textures.keys());
    const widePages = getWideReaderPageIndices(publication.pages);
    const currentSpread = getReaderSpread(
      this.#inspectionPageIndex,
      publication.pages.length,
      "spread",
      widePages,
    );
    const targetSpread = getReaderSpread(
      nextPageIndex,
      publication.pages.length,
      "spread",
      widePages,
    );
    const currentIsClosedSide =
      currentSpread.start === 0 ||
      (currentSpread.start === publication.pages.length - 1 &&
        !widePages.has(currentSpread.start));
    const targetIsClosedSide =
      targetSpread.start === 0 ||
      (targetSpread.start === publication.pages.length - 1 &&
        !widePages.has(targetSpread.start));
    this.#inspectionTurnFromSingle = currentIsClosedSide && !targetIsClosedSide;
    this.#inspectionTurnOpeningFromBack =
      this.#inspectionTurnFromSingle && currentSpread.start > 0;
    this.#inspectionTurnBackSourceRevealed = false;
    this.#inspectionTurnToSingle = !currentIsClosedSide && targetIsClosedSide;
    this.#inspectionTurnNavigation = navigation;
    const ltr = publication.direction === "LTR";
    const forward = navigation === "forward";
    const sourceSide: "left" | "right" = forward === ltr ? "right" : "left";
    const destinationSide = sourceSide === "left" ? "right" : "left";
    const sourceMaterial =
      sourceSide === "left"
        ? record.inspectionLeftMaterial
        : record.inspectionRightMaterial;
    this.#inspectionTurnSourceSide = sourceSide;
    this.#inspectionTurnSourceTexture = sourceMaterial.map;
    this.#inspectionTurnTargetPageIndex = nextPageIndex;
    const sourceTargetUrl = targetUrls[sourceSide];
    const sourceDestinationTexture = sourceTargetUrl
      ? (textures.get(sourceTargetUrl) ?? null)
      : null;
    const destinationTargetUrl = targetUrls[destinationSide];
    const destinationTexture = destinationTargetUrl
      ? (textures.get(destinationTargetUrl) ?? null)
      : null;
    const destinationMaterial =
      destinationSide === "left"
        ? record.inspectionLeftMaterial
        : record.inspectionRightMaterial;
    const sourceAssembly =
      sourceSide === "left"
        ? record.inspectionLeftAssembly
        : record.inspectionRightAssembly;
    const destinationAssembly =
      destinationSide === "left"
        ? record.inspectionLeftAssembly
        : record.inspectionRightAssembly;
    this.#inspectionTurnDestinationPreviousTexture = destinationMaterial.map;
    this.#inspectionTurnDestinationTexture = destinationTexture;
    this.#inspectionTurnSourceDestinationTexture = sourceDestinationTexture;
    if (forward) {
      record.inspectionTurningFrontMaterial.map = sourceMaterial.map;
      this.#setInspectionTurningBackTexture(record, destinationTexture);
    } else {
      this.#setInspectionTurningBackTexture(record, sourceMaterial.map);
      record.inspectionTurningFrontMaterial.map = destinationTexture;
    }
    if (!this.#inspectionTurnOpeningFromBack) {
      sourceMaterial.map = sourceDestinationTexture;
      sourceMaterial.needsUpdate = true;
    }
    record.inspectionTurningFrontMaterial.needsUpdate = true;
    record.inspectionTurningBackMaterial.needsUpdate = true;
    this.#inspectionTurnPreparing = false;
    this.#inspectionTurnPage = destinationSide;
    this.#inspectionTurnProgress = forward ? 0 : 1;
    this.#inspectionTurnProgressTarget = forward ? 1 : 0;
    this.#inspectionTurnWillCommit = true;
    if (this.#inspectionTurnFromSingle) {
      if (this.#inspectionTurnOpeningFromBack)
        destinationAssembly.visible = false;
      else {
        record.inspectionLeftAssembly.visible = true;
        record.inspectionRightAssembly.visible = true;
        destinationMaterial.map = destinationTexture;
        destinationMaterial.needsUpdate = true;
      }
    } else if (this.#inspectionTurnToSingle) {
      sourceAssembly.visible = false;
      destinationAssembly.visible = true;
    }
    record.inspectionTurningPage.visible = true;
    this.#updateInspectionTurningPageGeometry(record, publication, 0, true);
    if (this.#inspectionDragging) this.#updateInspectionDragProgress();
    else if (this.#inspectionDragReleaseDecision)
      this.#resolveInspectionDragDecision(this.#inspectionDragReleaseDecision);
  }

  #configureInspectionPages(record: BookRecord, publication: CatalogItem) {
    record.inspectionGroup.visible = true;
    record.exteriorMaterial.visible = false;
    const pageZ = record.thickness / 2 + INSPECTION_SURFACE_GAP;
    const pageCenterOffset = record.width / 2 + INSPECTION_PAGE_GUTTER / 2;
    record.inspectionLeftAssembly.position.x = 0;
    record.inspectionRightAssembly.position.x = 0;
    record.inspectionLeftAssembly.visible = true;
    record.inspectionRightAssembly.visible = true;
    record.inspectionLeftPage.rotation.y = 0;
    record.inspectionRightPage.rotation.y = 0;
    if (this.#inspectionTurnPage === undefined) {
      record.inspectionTurningPage.visible = false;
      record.inspectionTurningFrontMaterial.map = null;
      this.#setInspectionTurningBackTexture(record, null);
    }
    const widePages = getWideReaderPageIndices(publication.pages);
    const spread = getReaderSpread(
      this.#inspectionPageIndex,
      publication.pages.length,
      "spread",
      widePages,
    );
    const isWideSpread = widePages.has(spread.start);
    const isTerminalBackSide =
      spread.start > 0 &&
      spread.start === publication.pages.length - 1 &&
      !isWideSpread;
    const openingFromBack =
      this.#inspectionOpenAngleTarget === 0 && isTerminalBackSide;
    record.inspectionFrontCover.visible = !openingFromBack;
    record.inspectionBackCover.visible = openingFromBack;
    const paperDepth = Math.max(0.012, record.thickness);
    const pageBlocks = getPageBlockSplit({
      committedPageIndex: this.#inspectionPageIndex,
      direction: publication.direction,
      totalDepth: paperDepth,
      totalPages: publication.pages.length,
    });
    record.inspectionLeftBlock.scale.z = pageBlocks.left.fraction;
    record.inspectionRightBlock.scale.z = pageBlocks.right.fraction;
    record.inspectionLeftBlock.position.z =
      record.thickness / 2 - pageBlocks.left.depth / 2;
    record.inspectionRightBlock.position.z =
      record.thickness / 2 - pageBlocks.right.depth / 2;
    record.inspectionLeftBlock.visible = pageBlocks.left.depth > 0;
    record.inspectionRightBlock.visible = pageBlocks.right.depth > 0;
    const visiblePageCount = spread.pageIndices.length;
    record.inspectionLeftPage.position.set(-pageCenterOffset, 0, pageZ);
    record.inspectionRightPage.position.set(pageCenterOffset, 0, pageZ);
    if (visiblePageCount > 1 || isWideSpread) {
      record.inspectionLeftPage.visible = true;
      record.inspectionRightPage.visible = true;
      return;
    }
    const isClosedSide = spread.start === 0 || isTerminalBackSide;
    if (!isClosedSide) {
      // A wide scan discovered on the next source page can leave one physical
      // face unprinted. Keep the book open and render that face as bare paper.
      record.inspectionLeftPage.visible = true;
      record.inspectionRightPage.visible = true;
      return;
    }
    const spreadSides = getReaderSpreadSides(
      this.#inspectionPageIndex,
      publication.pages.length,
      publication.direction,
      widePages,
    );
    const singlePageIsLeft = spreadSides.left !== undefined;
    const singlePageVisible =
      !openingFromBack || this.#inspectionOpenAngle < INSPECTION_OPEN_ANGLE / 2;
    record.inspectionLeftPage.visible = singlePageIsLeft && singlePageVisible;
    record.inspectionRightPage.visible = !singlePageIsLeft && singlePageVisible;
    if (this.#inspectionOpenAngleTarget === INSPECTION_OPEN_ANGLE) {
      record.inspectionLeftAssembly.visible = true;
      record.inspectionRightAssembly.visible = true;
      return;
    }
    record.inspectionLeftAssembly.visible = singlePageIsLeft;
    record.inspectionRightAssembly.visible = !singlePageIsLeft;
    if (singlePageIsLeft)
      record.inspectionLeftAssembly.position.x = pageCenterOffset;
    else record.inspectionRightAssembly.position.x = -pageCenterOffset;
  }

  #updateInspectionTurningPageGeometry(
    record: BookRecord,
    publication: CatalogItem,
    deltaSeconds: number,
    resetSimulation = false,
  ) {
    const turningPage = record.inspectionTurningPage;
    const pageZ = record.thickness / 2 + INSPECTION_SURFACE_GAP;
    const pageCenterOffset = record.width / 2 + INSPECTION_PAGE_GUTTER / 2;
    writeActiveLeafDeformation(
      this.#inspectionLeafDeformation,
      this.#inspectionTurnProgress,
      publication.direction,
      INSPECTION_PAGE_DEFORMATION,
    );
    const turnCompletion =
      this.#inspectionTurnNavigation === "forward"
        ? this.#inspectionLeafDeformation.eased
        : 1 - this.#inspectionLeafDeformation.eased;
    let spineX = 0;
    if (this.#inspectionTurnFromSingle || this.#inspectionTurnToSingle) {
      const singlePageIndex = this.#inspectionTurnFromSingle
        ? this.#inspectionPageIndex
        : this.#inspectionTurnTargetPageIndex;
      const singlePageSides = getReaderSpreadSides(
        singlePageIndex,
        publication.pages.length,
        publication.direction,
        getWideReaderPageIndices(publication.pages),
      );
      const singlePageIsLeft = singlePageSides.left !== undefined;
      const closedBindingOffset = singlePageIsLeft
        ? pageCenterOffset
        : -pageCenterOffset;
      spineX =
        closedBindingOffset *
        (this.#inspectionTurnFromSingle ? 1 - turnCompletion : turnCompletion);
      const singlePageAssembly = singlePageIsLeft
        ? record.inspectionLeftAssembly
        : record.inspectionRightAssembly;
      singlePageAssembly.position.x = spineX;
    }
    this.#syncInspectionBackOpeningSpread(record, turnCompletion);
    turningPage.position.set(spineX, 0, pageZ);
    turningPage.rotation.set(0, 0, 0);
    writeActiveLeafPositions(
      record.inspectionTurningUvs,
      record.inspectionTurningTargets,
      record.width,
      BOOK_HEIGHT,
      this.#inspectionLeafDeformation,
      this.#inspectionLeafVertex,
    );
    if (resetSimulation)
      record.inspectionPaperSimulation.reset(record.inspectionTurningTargets);
    record.inspectionPaperSimulation.step({
      deltaSeconds,
      dragging: this.#inspectionDragging,
      grabU: this.#inspectionTurnAnchorX,
      grabV: this.#inspectionTurnAnchorY,
      outputPositions: record.inspectionTurningPositions,
      targetPositions: record.inspectionTurningTargets,
    });
    record.inspectionTurningPage.geometry.getAttribute("position").needsUpdate =
      true;
  }

  #syncInspectionBackOpeningSpread(record: BookRecord, turnCompletion: number) {
    if (!this.#inspectionTurnOpeningFromBack) return;
    const sourceRevealed = turnCompletion > 0.5;
    if (sourceRevealed === this.#inspectionTurnBackSourceRevealed) return;
    this.#inspectionTurnBackSourceRevealed = sourceRevealed;
    const sourceMaterial =
      this.#inspectionTurnSourceSide === "left"
        ? record.inspectionLeftMaterial
        : record.inspectionRightMaterial;
    sourceMaterial.map = sourceRevealed
      ? this.#inspectionTurnSourceDestinationTexture
      : this.#inspectionTurnSourceTexture;
    sourceMaterial.needsUpdate = true;
  }

  #animateInspectionPageTurn(record: BookRecord, deltaSeconds: number) {
    if (this.#inspectionTurnPage === undefined) return;
    const turningPage = record.inspectionTurningPage;
    this.#inspectionTurnProgress = MathUtils.damp(
      this.#inspectionTurnProgress,
      this.#inspectionTurnProgressTarget,
      this.#inspectionDragging
        ? INSPECTION_PAGE_DRAG_FOLLOW_SPEED
        : INSPECTION_PAGE_TURN_SPEED,
      deltaSeconds,
    );
    const publication = this.#inspectionPublication();
    if (!publication) return;
    this.#updateInspectionTurningPageGeometry(
      record,
      publication,
      deltaSeconds,
    );
    if (this.#inspectionDragging) return;
    if (
      Math.abs(
        this.#inspectionTurnProgress - this.#inspectionTurnProgressTarget,
      ) > 0.002
    )
      return;
    this.#inspectionTurnProgress = this.#inspectionTurnProgressTarget;
    if (this.#inspectionTurnWillCommit) {
      const destinationMaterial =
        this.#inspectionTurnPage === "left"
          ? record.inspectionLeftMaterial
          : record.inspectionRightMaterial;
      destinationMaterial.map = this.#inspectionTurnDestinationTexture;
      destinationMaterial.needsUpdate = true;
      this.#inspectionPageIndex = this.#inspectionTurnTargetPageIndex;
    } else {
      const sourceMaterial =
        this.#inspectionTurnSourceSide === "left"
          ? record.inspectionLeftMaterial
          : record.inspectionRightMaterial;
      sourceMaterial.map = this.#inspectionTurnSourceTexture;
      sourceMaterial.needsUpdate = true;
      const destinationMaterial =
        this.#inspectionTurnPage === "left"
          ? record.inspectionLeftMaterial
          : record.inspectionRightMaterial;
      destinationMaterial.map = this.#inspectionTurnDestinationPreviousTexture;
      destinationMaterial.needsUpdate = true;
    }
    turningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.#setInspectionTurningBackTexture(record, null);
    this.#inspectionTurnPage = undefined;
    this.#inspectionTurnFromSingle = false;
    this.#inspectionTurnOpeningFromBack = false;
    this.#inspectionTurnToSingle = false;
    this.#configureInspectionPages(record, publication);
    if (!this.#inspectionTurnWillCommit) {
      this.#releaseInspectionTurnTextures();
      return;
    }
    this.#onPageIndexChange?.(publication.id, this.#inspectionPageIndex);
    this.#emitGameState();
    void this.#syncInspectionPageTextures(publication).finally(() => {
      this.#releaseInspectionTurnTextures();
    });
  }

  #releaseInspectionTurnTextures() {
    for (const url of this.#inspectionTurnTextureUrls)
      this.#inspectionPageTextureCache.release(url);
    this.#inspectionTurnTextureUrls.clear();
    this.#inspectionTurnDestinationTexture = null;
    this.#inspectionTurnDestinationPreviousTexture = null;
    this.#inspectionTurnSourceDestinationTexture = null;
    this.#inspectionTurnSourceTexture = null;
    this.#inspectionTurnBackSourceRevealed = false;
  }

  #setInspectionTurningBackTexture(
    record: BookRecord,
    texture: Texture | null,
  ) {
    this.#inspectionTurningBackTexture?.dispose();
    this.#inspectionTurningBackTexture = texture?.clone();
    const backTexture = this.#inspectionTurningBackTexture;
    if (backTexture) {
      const horizontalRange = mirrorReaderPageHorizontalRange(
        backTexture.offset.x,
        backTexture.repeat.x,
      );
      backTexture.offset.x = horizontalRange.offset;
      backTexture.repeat.x = horizontalRange.repeat;
      backTexture.needsUpdate = true;
    }
    record.inspectionTurningBackMaterial.map = backTexture ?? null;
    record.inspectionTurningBackMaterial.needsUpdate = true;
  }

  #applyInspectionOpenAngle(record: BookRecord) {
    record.inspectionLeftAssembly.rotation.y =
      this.#inspectionOpeningHalf === "left" ? this.#inspectionOpenAngle : 0;
    record.inspectionRightAssembly.rotation.y =
      this.#inspectionOpeningHalf === "right" ? -this.#inspectionOpenAngle : 0;
    const closedRatio = this.#inspectionOpenAngle / INSPECTION_OPEN_ANGLE;
    const closedOffset = record.width / 2 + INSPECTION_PAGE_GUTTER / 2;
    record.inspectionGroup.position.x =
      (this.#inspectionOpeningHalf === "left" ? -1 : 1) *
      closedOffset *
      closedRatio;
  }

  #showCompactInspectionBook(record: BookRecord) {
    this.#restoreCompactBookCoverTexture(record);
    record.inspectionGroup.visible = false;
    record.exteriorMaterial.visible = true;
  }

  #animateInspectionOpening(
    record: BookRecord,
    deltaSeconds: number,
    speed = INSPECTION_COVER_ANIMATION_SPEED,
  ) {
    if (this.#inspectionOpeningDelay > 0) {
      this.#inspectionOpeningDelay = Math.max(
        0,
        this.#inspectionOpeningDelay - deltaSeconds,
      );
      if (this.#inspectionOpeningDelay > 0) return;
      record.inspectionGroup.visible = true;
      record.exteriorMaterial.visible = false;
    }
    if (this.#inspectionOpenAngle === this.#inspectionOpenAngleTarget) return;
    this.#inspectionOpenAngle = MathUtils.damp(
      this.#inspectionOpenAngle,
      this.#inspectionOpenAngleTarget,
      speed,
      deltaSeconds,
    );
    if (
      Math.abs(this.#inspectionOpenAngle - this.#inspectionOpenAngleTarget) <
      0.001
    )
      this.#inspectionOpenAngle = this.#inspectionOpenAngleTarget;
    this.#applyInspectionOpenAngle(record);
    if (record.inspectionBackCover.visible) {
      const backPage =
        record.inspectionBackCover.parent === record.inspectionLeftAssembly
          ? record.inspectionLeftPage
          : record.inspectionRightPage;
      backPage.visible = this.#inspectionOpenAngle < INSPECTION_OPEN_ANGLE / 2;
    }
  }

  async #syncInspectionPageTextures(publication: CatalogItem) {
    const revision = ++this.#inspectionTextureRevision;
    const pageUrls = this.#inspectionPageUrls(
      publication,
      this.#inspectionPageIndex,
    );
    const requestedUrls = new Set(
      [pageUrls.left, pageUrls.right].filter(
        (url): url is string => url !== undefined,
      ),
    );
    const textures = new Map<string, Texture>();
    const preloadPlan = createReaderPagePreloadPlan({
      pageCount: publication.pages.length,
      pageIndex: this.#inspectionPageIndex,
      pageUrl: (pageIndex) => this.#inspectionPageUrl(publication, pageIndex),
      requestedUrls,
      widePageIndices: getWideReaderPageIndices(publication.pages),
    });
    const requestedTextureLoads = [...requestedUrls].map(async (url) => {
      try {
        textures.set(url, await this.#inspectionPageTextureCache.acquire(url));
      } catch {
        // The paper color remains visible when an individual page is absent.
      }
    });
    for (const url of preloadPlan.httpUrls)
      void this.#inspectionPagePreloader.preload(url).catch(() => {});
    await Promise.all(requestedTextureLoads);
    if (
      this.#disposed ||
      revision !== this.#inspectionTextureRevision ||
      this.#inspectionPublication()?.id !== publication.id
    ) {
      for (const url of textures.keys())
        this.#inspectionPageTextureCache.release(url);
      return;
    }

    for (const url of this.#inspectionTextureUrls)
      this.#inspectionPageTextureCache.release(url);
    this.#inspectionTextureUrls = new Set(textures.keys());
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    record.inspectionLeftMaterial.map = pageUrls.left
      ? (textures.get(pageUrls.left) ?? null)
      : null;
    record.inspectionRightMaterial.map = pageUrls.right
      ? (textures.get(pageUrls.right) ?? null)
      : null;
    record.inspectionLeftMaterial.needsUpdate = true;
    record.inspectionRightMaterial.needsUpdate = true;

    for (const url of preloadPlan.textureUrls)
      void this.#inspectionPageTextureCache.prefetch(url).catch(() => {});
  }

  #handleDetectedWidePage(url: string) {
    const publication = this.#inspectionPublication();
    if (this.#disposed || this.#inspectionMode !== "spread" || !publication)
      return;
    const pageIndex = publication.pages.findIndex(
      (page) => readerPageSourceUrl(page) === url,
    );
    if (pageIndex <= 0) return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    this.#cancelInspectionPageTurn(record, publication);
    this.#inspectionTextureRevision += 1;
    this.#inspectionPageIndex = getReaderSpread(
      this.#inspectionPageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    this.#configureInspectionPages(record, publication);
    void this.#syncInspectionPageTextures(publication);
    this.#onPageIndexChange?.(publication.id, this.#inspectionPageIndex);
    this.#emitGameState();
  }

  #releaseInspectionPageTextures() {
    this.#inspectionTextureRevision += 1;
    for (const url of this.#inspectionTextureUrls)
      this.#inspectionPageTextureCache.release(url);
    this.#inspectionTextureUrls.clear();
    const publicationId = this.#carriedPublicationId;
    const record = publicationId
      ? this.#booksById.get(publicationId)
      : undefined;
    if (!record) return;
    record.inspectionLeftMaterial.map = null;
    record.inspectionRightMaterial.map = null;
    record.inspectionTurningFrontMaterial.map = null;
    this.#setInspectionTurningBackTexture(record, null);
    record.inspectionTurningPage.visible = false;
    record.inspectionLeftMaterial.needsUpdate = true;
    record.inspectionRightMaterial.needsUpdate = true;
    record.inspectionTurningFrontMaterial.needsUpdate = true;
    record.inspectionTurningBackMaterial.needsUpdate = true;
  }

  #loadInspectionPageTexture(url: string) {
    return new Promise<Texture>((resolvePromise, rejectPromise) => {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#textureLoader.load(
        url,
        (texture) => {
          const image = texture.image;
          const publication = this.#inspectionPublication();
          if (image instanceof HTMLImageElement && publication)
            detectWideReaderPage(
              url,
              image.naturalWidth,
              image.naturalHeight,
              physicalBookWidth(publication.aspectRatio, 1),
            );
          const half = readerPageHalf(url);
          if (half) {
            texture.repeat.x = 0.5;
            texture.offset.x = half === "left" ? 0 : 0.5;
            texture.needsUpdate = true;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.minFilter = LinearFilter;
          texture.anisotropy = Math.min(
            8,
            this.#renderer.capabilities.getMaxAnisotropy(),
          );
          resolvePromise(texture);
        },
        undefined,
        (error) => {
          requestedTexture?.dispose();
          rejectPromise(
            error instanceof Error
              ? error
              : new Error(`Could not load inspection page ${url}`),
          );
        },
      );
    });
  }

  #horizontalFieldOfView() {
    const verticalFov = MathUtils.degToRad(this.#camera.fov);
    return 2 * Math.atan(Math.tan(verticalFov / 2) * this.#camera.aspect);
  }

  #spreadDistance() {
    const publication = this.#inspectionPublication();
    const bookWidth = physicalBookWidth(publication?.aspectRatio, BOOK_HEIGHT);
    const spreadWidth = bookWidth * 2 + INSPECTION_PAGE_GUTTER;
    const spreadHeight = BOOK_HEIGHT;
    const verticalFieldOfView = MathUtils.degToRad(this.#camera.fov);
    const horizontalDistance =
      spreadWidth /
      2 /
      (Math.tan(this.#horizontalFieldOfView() / 2) * INSPECTION_FRAME_FILL);
    const verticalDistance =
      spreadHeight /
      2 /
      (Math.tan(verticalFieldOfView / 2) * INSPECTION_FRAME_FILL);
    return Math.max(
      this.#camera.near + 0.1,
      horizontalDistance,
      verticalDistance,
    );
  }

  #inspectionBaseDistance() {
    return this.#spreadDistance();
  }

  #resetInspectionZoom() {
    this.#inspectionZoom = 1;
    this.#inspectionZoomTarget = 1;
    this.#inspectionZoomOffsetX = 0;
    this.#inspectionZoomOffsetY = 0;
    this.#inspectionZoomOffsetTargetX = 0;
    this.#inspectionZoomOffsetTargetY = 0;
    this.#inspectionPointerX = 0;
    this.#inspectionPointerY = 0;
  }

  #updateInspectionLocalTarget() {
    const distance = this.#inspectionBaseDistance() / this.#inspectionZoom;
    this.#inspectionLocalPosition.set(
      this.#inspectionZoomOffsetX,
      this.#inspectionZoomOffsetY,
      -distance,
    );
  }

  #animateInspectedBook(record: BookRecord, deltaSeconds: number) {
    const returningToHand = this.#inspectionMode === "closing";
    const returningToShelf =
      returningToHand && record.state.status === "shelved";
    if (returningToShelf) {
      this.#animateInspectionShelfReturn(record, deltaSeconds);
      return;
    }
    if (
      !returningToHand &&
      record.state.status === "shelved" &&
      this.#inspectionShelfFocusPending
    ) {
      if (!this.#animateShelfPreview(record, true, deltaSeconds)) return;
      this.#inspectionShelfFocusPending = false;
      return;
    }
    if (returningToHand) {
      const publicationId = this.#inspectionPublicationId;
      if (
        this.#inspectionPhysicsReturnActive ||
        (publicationId &&
          this.#beginInspectionPhysicsReturn(record, publicationId))
      ) {
        this.#animateInspectionPhysicsReturn(record, deltaSeconds);
        return;
      }
    }
    if (!returningToHand) this.#updateInspectionLocalTarget();
    let targetPosition = this.#inspectionLocalPosition;
    let targetRotation = this.#inspectionLocalRotation;
    if (returningToHand) {
      targetPosition = this.#heldLocalPosition;
      targetRotation = this.#heldLocalRotation;
    }
    if (record.mesh.parent !== this.#camera) this.#camera.attach(record.mesh);
    record.mesh.position.x = MathUtils.damp(
      record.mesh.position.x,
      targetPosition.x,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.y = MathUtils.damp(
      record.mesh.position.y,
      targetPosition.y,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.z = MathUtils.damp(
      record.mesh.position.z,
      targetPosition.z,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.quaternion.slerp(
      targetRotation,
      1 - Math.exp(-INSPECTION_TRANSITION_SPEED * deltaSeconds),
    );
    record.mesh.scale.setScalar(1);
    const closeAction = this.#inspectionCloseAction;
    const coverAnimationSpeed =
      returningToHand && (closeAction === "drop" || closeAction === "throw")
        ? INSPECTION_ACTION_CLOSE_SPEED
        : INSPECTION_COVER_ANIMATION_SPEED;
    this.#animateInspectionOpening(record, deltaSeconds, coverAnimationSpeed);
    if (
      this.#inspectionMode === "closing" &&
      this.#inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.inspectionGroup.visible
    )
      this.#showCompactInspectionBook(record);
    this.#animateInspectionPageTurn(record, deltaSeconds);
    if (
      this.#inspectionMode === "closing" &&
      this.#inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.mesh.position.distanceToSquared(targetPosition) <
        INSPECTION_TRANSITION_POSITION_EPSILON_SQ &&
      1 - Math.abs(record.mesh.quaternion.dot(targetRotation)) <
        INSPECTION_TRANSITION_ROTATION_EPSILON
    ) {
      record.mesh.position.copy(targetPosition);
      record.mesh.quaternion.copy(targetRotation);
      this.#finishInspectionClose();
    }
  }

  #beginInspectionPhysicsReturn(record: BookRecord, publicationId: string) {
    if (!this.#physicsWorld.isReady) return false;
    record.mesh.updateMatrixWorld(true);
    record.mesh.getWorldPosition(this.#physicsPosePosition);
    record.mesh.getWorldQuaternion(this.#physicsPoseRotation);
    if (!this.#physicsWorld.snapHeldBook(publicationId, this.#physicsPose))
      return false;
    if (
      !this.#physicsWorld.sampleInterpolatedBookTransform(
        publicationId,
        this.#physicsTransform,
      )
    )
      return false;
    this.#physicsWorld.setHeldTarget(publicationId, this.#heldTargetPose);
    if (record.mesh.parent !== this.#scene) this.#scene.attach(record.mesh);
    this.#inspectionPhysicsReturnActive = true;
    return true;
  }

  #animateInspectionPhysicsReturn(record: BookRecord, deltaSeconds: number) {
    const publicationId = this.#inspectionPublicationId;
    if (!publicationId) return;
    const closeAction = this.#inspectionCloseAction;
    const actionClosingSpeed =
      closeAction === "drop" || closeAction === "throw"
        ? INSPECTION_ACTION_CLOSE_SPEED
        : INSPECTION_COVER_ANIMATION_SPEED;
    this.#animateInspectionOpening(record, deltaSeconds, actionClosingSpeed);
    if (
      this.#inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.inspectionGroup.visible
    )
      this.#showCompactInspectionBook(record);
    this.#animateInspectionPageTurn(record, deltaSeconds);
    if (
      !this.#physicsWorld.sampleInterpolatedBookTransform(
        publicationId,
        this.#physicsTransform,
      )
    )
      return;
    if (record.mesh.parent !== this.#scene) this.#scene.attach(record.mesh);
    record.mesh.position.copy(this.#physicsTransform.position);
    record.mesh.quaternion.copy(this.#physicsTransform.rotation);
    record.mesh.scale.setScalar(1);
    if (this.#inspectionOpenAngle !== INSPECTION_OPEN_ANGLE) return;
    this.#finishInspectionClose();
  }

  #animateInspectionShelfReturn(record: BookRecord, deltaSeconds: number) {
    let phase = this.#inspectionShelfReturnPhase;
    if (!phase) return;
    if (record.mesh.parent !== this.#scene) this.#scene.attach(record.mesh);
    record.mesh.scale.setScalar(1);
    this.#animateInspectionOpening(record, deltaSeconds);
    this.#animateInspectionPageTurn(record, deltaSeconds);

    if (phase === "close") {
      if (
        INSPECTION_OPEN_ANGLE - this.#inspectionOpenAngle >
        SHELF_RETURN_CLOSE_HANDOFF_ANGLE
      )
        return;
      this.#inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.#applyInspectionOpenAngle(record);
      this.#showCompactInspectionBook(record);
      phase = "rotate";
      this.#inspectionShelfReturnPhase = phase;
    }

    if (phase === "rotate") {
      record.mesh.quaternion.slerp(
        this.#inspectionShelfWorldRotation,
        1 - Math.exp(-SHELF_PREVIEW_ROTATION_SPEED * deltaSeconds),
      );
      if (
        1 -
          Math.abs(
            record.mesh.quaternion.dot(this.#inspectionShelfWorldRotation),
          ) >=
        SHELF_RETURN_ROTATION_HANDOFF_EPSILON
      )
        return;
      record.mesh.quaternion.copy(this.#inspectionShelfWorldRotation);
      phase = "translate";
      this.#inspectionShelfReturnPhase = phase;
    }

    record.mesh.position.x = MathUtils.damp(
      record.mesh.position.x,
      record.shelfPosition.x,
      SHELF_PREVIEW_TRANSLATION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.y = MathUtils.damp(
      record.mesh.position.y,
      record.shelfPosition.y,
      SHELF_PREVIEW_TRANSLATION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.z = MathUtils.damp(
      record.mesh.position.z,
      record.shelfPosition.z,
      SHELF_PREVIEW_TRANSLATION_SPEED,
      deltaSeconds,
    );
    if (
      record.mesh.position.distanceToSquared(record.shelfPosition) >=
      INSPECTION_TRANSITION_POSITION_EPSILON_SQ
    )
      return;
    this.#finishInspectionClose();
  }

  #updateHeldPhysicsTarget() {
    const publicationId = this.#carriedPublicationId;
    const prop = this.#carriedProp;
    if (!publicationId && !prop) return;
    this.#camera.updateMatrixWorld();
    if (prop)
      this.#heldTargetPosition
        .copy(prop.heldLocalPosition)
        .setZ(-this.#propPlacementDistance);
    else if (this.#inspectionMode !== "spread")
      this.#heldTargetPosition.copy(this.#heldLocalPosition);
    else {
      this.#updateInspectionLocalTarget();
      this.#heldTargetPosition.copy(this.#inspectionLocalPosition);
    }
    this.#heldTargetPosition.applyMatrix4(this.#camera.matrixWorld);
    if (prop && this.#propPlacementSnapping) {
      this.#heldTargetPosition.x =
        Math.round(this.#heldTargetPosition.x / PROP_PLACEMENT_GRID_SIZE) *
        PROP_PLACEMENT_GRID_SIZE;
      this.#heldTargetPosition.y =
        Math.round(this.#heldTargetPosition.y / PROP_PLACEMENT_HEIGHT_STEP) *
        PROP_PLACEMENT_HEIGHT_STEP;
      this.#heldTargetPosition.z =
        Math.round(this.#heldTargetPosition.z / PROP_PLACEMENT_GRID_SIZE) *
        PROP_PLACEMENT_GRID_SIZE;
    }
    if (prop) {
      const yaw = this.#resolvedPropPlacementYaw(prop.rotationSnapStep);
      const halfHeight = prop.halfHeight;
      this.#heldTargetPosition.y = Math.max(
        halfHeight,
        this.#heldTargetPosition.y,
      );
      this.#snapHeldPropToSupport(
        prop,
        prop.halfWidth,
        halfHeight,
        prop.halfDepth,
        yaw,
      );
      this.#heldTargetRotation.setFromAxisAngle(this.#upAxis, yaw);
    } else this.#camera.getWorldQuaternion(this.#heldTargetRotation);
    if (!prop && this.#inspectionMode !== "spread")
      this.#heldTargetRotation.multiply(this.#heldLocalRotation);
    if (prop) {
      if (this.#propPlacementSnapping)
        this.#physicsWorld.snapHeldProp(prop.id, this.#heldTargetPose);
      else this.#physicsWorld.setHeldPropTarget(prop.id, this.#heldTargetPose);
    } else if (publicationId)
      this.#physicsWorld.setHeldTarget(publicationId, this.#heldTargetPose);
  }

  #createShelfTargetSelection(
    target: Object3D,
    point: Vector3,
    publicationId: string,
  ): ShelfTargetSelection | undefined {
    const shelfId = target.userData.shelfId;
    if (typeof shelfId !== "string") return undefined;
    const shelf = this.#spineShelfDefinitions.get(shelfId);
    const carriedRecord = this.#booksById.get(publicationId);
    if (!shelf || !carriedRecord) return undefined;
    const offset = this.#shelfTargetOffset
      .copy(point)
      .sub(shelf.frontCenter)
      .dot(shelf.axis);
    const presentation = this.#shelfPresentation;
    const shelfBooks = [...this.#booksById.entries()].flatMap(([id, record]) =>
      record.state.status === "shelved" && record.state.shelfId === shelfId
        ? [
            {
              center: record.shelfOffset,
              id,
              width:
                record.shelfPresentation === "face"
                  ? record.width
                  : record.thickness,
            },
          ]
        : [],
    );
    const insertionWidth =
      presentation === "face" ? carriedRecord.width : carriedRecord.thickness;
    const placements = insertSpineShelfBook(
      shelfBooks,
      {center: offset, id: publicationId, width: insertionWidth},
      {max: shelf.halfWidth, min: -shelf.halfWidth},
      SPINE_SHELF_GAP,
    );
    const insertion = placements?.find(
      (placement) => placement.id === publicationId,
    );
    if (!placements || !insertion) return undefined;
    return {
      offset: insertion.center,
      placements,
      presentation,
      shelfId,
      slotIndex: insertion.slotIndex,
    };
  }

  #browseShelf(direction: number) {
    if (direction === 0 || this.#carriedPublicationId || this.#carriedProp)
      return false;
    const publicationId = this.#hoveredPublicationId;
    const record = publicationId
      ? this.#booksById.get(publicationId)
      : undefined;
    if (!publicationId || record?.state.status !== "shelved") return false;
    const shelfId = record.state.shelfId;
    const shelfBooks = [...this.#booksById.entries()].flatMap(
      ([id, shelfRecord]) =>
        shelfRecord.state.status === "shelved" &&
        shelfRecord.state.shelfId === shelfId
          ? [
              {
                center: shelfRecord.shelfOffset,
                id,
                width:
                  shelfRecord.shelfPresentation === "face"
                    ? shelfRecord.width
                    : shelfRecord.thickness,
              },
            ]
          : [],
    );
    const adjacentBook = findAdjacentShelfBook(
      shelfBooks,
      publicationId,
      direction < 0 ? -1 : 1,
    );
    if (!adjacentBook) return true;
    this.#shelfBrowsePublicationId = adjacentBook.id;
    this.#setHoveredPublicationId(adjacentBook.id);
    return true;
  }

  #findShelfHoverTargetPublicationId() {
    const intersections = this.#raycaster.intersectObjects(
      this.#shelfHoverTargetMeshes,
      false,
    );
    for (const intersection of intersections) {
      if (intersection.distance > INTERACTION_DISTANCE) break;
      const candidateId = intersection.object.userData.publicationId;
      if (typeof candidateId === "string") return candidateId;
    }
    return undefined;
  }

  #editTargetedSign() {
    const key = this.#targetedSignKey;
    if (!key || !this.#onSignEditRequest) return;
    const signSlot = this.#signSlots.get(key);
    if (!signSlot) return;
    this.#suppressNextPointerUnlockPause = true;
    this.#releasePointerLock();
    this.#onSignEditRequest({
      id: signSlot.id,
      kind: signSlot.kind,
      label: signSlot.label,
      subtitle: signSlot.subtitle,
      title: signSlot.title,
    });
  }

  #setDigitalArtFrameTargeted(frameId?: string) {
    if (frameId === this.#targetedDigitalArtFrameId) return;
    if (this.#targetedDigitalArtFrameId)
      this.#digitalArtFrameRecords
        .get(this.#targetedDigitalArtFrameId)
        ?.frame.setTargeted(false);
    this.#targetedDigitalArtFrameId = frameId;
    if (frameId)
      this.#digitalArtFrameRecords.get(frameId)?.frame.setTargeted(true);
    this.#emitGameState();
  }

  #updateInteractionTarget() {
    if (this.#inspectionMode !== "none") {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      return;
    }
    if (!this.#pointerLocked) {
      this.#updatePosterPlacementTarget();
      this.#updateDigitalArtFramePlacementTarget();
      this.#setHoveredPublicationId(undefined);
      if (
        this.#shelfTargeted ||
        this.#trashTargeted ||
        this.#televisionTargeted ||
        this.#targetedProp !== undefined ||
        this.#targetedDigitalArtFrameId !== undefined ||
        this.#targetedPosterId !== undefined ||
        this.#targetedSignKey !== undefined
      ) {
        this.#shelfTargeted = false;
        this.#shelfTargetSelection = undefined;
        this.#targetedSignKey = undefined;
        this.#targetedPosterId = undefined;
        this.#setDigitalArtFrameTargeted();
        this.#setPropTargeted(undefined);
        this.#trashTargeted = false;
        this.#setTelevisionTargeted(false);
        this.#updateShelfTargetVisuals();
        this.#updateSignTargetVisuals();
        this.#emitGameState();
      }
      return;
    }

    this.#camera.updateMatrixWorld();
    this.#raycaster.setFromCamera(this.#reticle, this.#camera);
    if (this.#artFramePlacement) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      this.#updateSignTargetVisuals();
      this.#updateDigitalArtFramePlacementTarget();
      return;
    }
    if (this.#posterPlacement) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      this.#updateSignTargetVisuals();
      this.#updatePosterPlacementTarget();
      return;
    }
    if (this.#carriedProp) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      this.#updateSignTargetVisuals();
      return;
    }
    if (this.#carriedPublicationId) {
      this.#setHoveredPublicationId(undefined);
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTelevisionTargeted(false);
      const trashIntersection = this.#raycaster.intersectObject(
        this.#trashTargetMesh,
        false,
      )[0];
      const trashTargeted =
        trashIntersection !== undefined &&
        trashIntersection.distance <= TRASH_INTERACTION_DISTANCE;
      let selection: ShelfTargetSelection | undefined;
      if (!trashTargeted) {
        const intersections = this.#raycaster.intersectObjects(
          this.#shelfTargetMeshes,
          false,
        );
        for (const intersection of intersections) {
          if (intersection.distance > SHELF_INTERACTION_DISTANCE) break;
          selection = this.#createShelfTargetSelection(
            intersection.object,
            intersection.point,
            this.#carriedPublicationId,
          );
          if (selection) break;
        }
      }
      this.#shelfTargeted = selection !== undefined;
      this.#shelfTargetSelection = selection;
      this.#trashTargeted = trashTargeted;
      this.#updateShelfTargetVisuals();
      this.#updateSignTargetVisuals();
      this.#emitGameState();
      return;
    }

    if (this.#shelfTargeted) {
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#updateShelfTargetVisuals();
    }
    let television: ShopTelevision | undefined;
    let televisionIntersection:
      | ReturnType<Raycaster["intersectObjects"]>[number]
      | undefined;
    for (const candidate of this.#televisions) {
      candidate.object.getWorldPosition(this.#televisionTargetPosition);
      const televisionCullDistance =
        TELEVISION_INTERACTION_DISTANCE + candidate.interactionBoundsRadius;
      if (
        this.#camera.position.distanceToSquared(
          this.#televisionTargetPosition,
        ) >
        televisionCullDistance * televisionCullDistance
      )
        continue;
      const candidateIntersection = this.#raycaster.intersectObjects(
        candidate.interactionTargets,
        false,
      )[0];
      if (
        !candidateIntersection ||
        (televisionIntersection &&
          candidateIntersection.distance >= televisionIntersection.distance)
      )
        continue;
      television = candidate;
      televisionIntersection = candidateIntersection;
    }
    const televisionInteraction = televisionIntersection
      ? television?.resolveInteractionTarget(televisionIntersection.object)
      : undefined;
    const televisionTargeted =
      televisionInteraction !== undefined &&
      televisionIntersection !== undefined &&
      televisionIntersection.distance <= TELEVISION_INTERACTION_DISTANCE;
    this.#setTelevisionTargeted(
      televisionTargeted,
      televisionInteraction,
      television,
    );
    if (televisionTargeted) {
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#updateSignTargetVisuals();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const directBookIntersection = this.#raycaster.intersectObjects(
      this.#interactiveMeshes,
      false,
    )[0];
    const propIntersection = this.#raycaster.intersectObjects(
      this.#movablePropTargetMeshes,
      false,
    )[0];
    const propId = propIntersection?.object.userData.movablePropId;
    const targetedProp =
      propIntersection &&
      propIntersection.distance <= MOVABLE_PROP_INTERACTION_DISTANCE &&
      (!directBookIntersection ||
        directBookIntersection.distance > INTERACTION_DISTANCE ||
        propIntersection.distance < directBookIntersection.distance) &&
      typeof propId === "string"
        ? this.#movableProps.get(propId)
        : undefined;
    this.#setPropTargeted(targetedProp);
    if (targetedProp) {
      this.#setTrashTargeted(false);
      this.#targetedSignKey = undefined;
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#updateSignTargetVisuals();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    this.#setTrashTargeted(false);
    const signIntersection = this.#raycaster
      .intersectObjects(this.#signTargetMeshes, false)
      .find((candidate) => candidate.distance <= SIGN_INTERACTION_DISTANCE);
    const signKey = signIntersection?.object.userData.signKey;
    const targetedSignKey = typeof signKey === "string" ? signKey : undefined;
    if (targetedSignKey !== this.#targetedSignKey) {
      this.#targetedSignKey = targetedSignKey;
      this.#updateSignTargetVisuals();
      this.#emitGameState();
    }
    if (targetedSignKey !== undefined) {
      this.#targetedPosterId = undefined;
      this.#setDigitalArtFrameTargeted();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const artFrameIntersection = this.#raycaster
      .intersectObjects(this.#digitalArtFrameTargetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const artFrameId = artFrameIntersection?.object.userData.digitalArtFrameId;
    const targetedArtFrameId =
      typeof artFrameId === "string" ? artFrameId : undefined;
    this.#setDigitalArtFrameTargeted(targetedArtFrameId);
    if (targetedArtFrameId) {
      this.#targetedPosterId = undefined;
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const posterIntersection = this.#raycaster
      .intersectObjects(this.#posterTargetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const posterId = posterIntersection?.object.userData.posterId;
    const targetedPosterId =
      typeof posterId === "string" ? posterId : undefined;
    if (targetedPosterId !== this.#targetedPosterId) {
      this.#targetedPosterId = targetedPosterId;
      this.#emitGameState();
    }
    if (targetedPosterId) {
      this.#setDigitalArtFrameTargeted();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const directPublicationId =
      directBookIntersection &&
      directBookIntersection.distance <= INTERACTION_DISTANCE
        ? directBookIntersection.object.userData.publicationId
        : undefined;
    const directRecord =
      typeof directPublicationId === "string"
        ? this.#booksById.get(directPublicationId)
        : undefined;
    const shelfPublicationId = this.#findShelfHoverTargetPublicationId();
    let publicationId =
      directRecord?.state.status === "floor"
        ? directPublicationId
        : (shelfPublicationId ?? directPublicationId);
    const browsedRecord = this.#shelfBrowsePublicationId
      ? this.#booksById.get(this.#shelfBrowsePublicationId)
      : undefined;
    const naturallyTargetedRecord =
      typeof publicationId === "string"
        ? this.#booksById.get(publicationId)
        : undefined;
    if (
      browsedRecord?.state.status === "shelved" &&
      naturallyTargetedRecord?.state.status === "shelved" &&
      browsedRecord.state.shelfId === naturallyTargetedRecord.state.shelfId
    )
      publicationId = this.#shelfBrowsePublicationId;
    else this.#shelfBrowsePublicationId = undefined;
    this.#setHoveredPublicationId(
      typeof publicationId === "string" ? publicationId : undefined,
    );
  }

  #interact(allowNonBookPropPickup = true) {
    if (this.#discardBusy) return;
    if (this.#artFramePlacement) {
      this.#placeDigitalArtFrame();
      return;
    }
    if (this.#posterPlacement) {
      this.#placePoster();
      return;
    }
    if (this.#carriedProp) {
      this.#dropCarriedProp();
      return;
    }
    if (this.#carriedPublicationId) {
      if (this.#trashTargeted) void this.#discardCarriedBook();
      else if (this.#shelfTargeted) this.#shelveCarriedBook();
      return;
    }
    if (this.#televisionTargeted) {
      const targetedTelevision = this.#targetedTelevision;
      const televisionProp = targetedTelevision
        ? this.#televisionProps.get(targetedTelevision)
        : undefined;
      if (this.#televisionInteraction === "body" && televisionProp) {
        if (allowNonBookPropPickup) this.#pickUpProp(televisionProp);
        return;
      }
      targetedTelevision?.interactTargeted();
      return;
    }
    if (this.#targetedProp) {
      if (allowNonBookPropPickup) this.#pickUpProp(this.#targetedProp);
      return;
    }
    if (this.#targetedSignKey !== undefined) {
      this.#editTargetedSign();
      return;
    }
    if (this.#targetedDigitalArtFrameId) {
      const record = this.#digitalArtFrameRecords.get(
        this.#targetedDigitalArtFrameId,
      );
      const imageId =
        record?.frame.currentImageId() ??
        this.#artFrameChannels.find(
          (channel) => channel.id === record?.frame.channelId(),
        )?.images[0]?.id;
      const assetIndex = imageId
        ? this.#artFrameAssets.findIndex((asset) => asset.id === imageId)
        : -1;
      if (record && assetIndex >= 0)
        this.#startDigitalArtFramePlacement(
          assetIndex,
          record.id,
          record.height,
          record.rotation,
          record.frame.aspectRatio(),
          record.frame.fit(),
          record.frame.intervalSeconds(),
        );
      return;
    }
    if (this.#targetedPosterId) {
      const record = this.#posterRecords.get(this.#targetedPosterId);
      const assetIndex = record
        ? this.#posterAssets.findIndex((asset) => asset.id === record.asset.id)
        : -1;
      if (record && assetIndex >= 0)
        void this.#startPosterPlacement(
          assetIndex,
          record.id,
          record.height,
          record.rotation,
        );
      return;
    }
    if (!this.#hoveredPublicationId) return;
    this.#pickUpBook(this.#hoveredPublicationId);
  }

  #pickUpBook(publicationId: string) {
    if (this.#carriedPublicationId || this.#carriedProp) return;
    const record = this.#booksById.get(publicationId);
    if (!record) return;
    const previousShelfId =
      record.state.status === "shelved" ? record.state.shelfId : undefined;
    const transition = transitionBookInteraction(record.state, {
      type: "pick-up",
    });
    if (!transition.ok) return;

    record.state = transition.state;
    this.#shelfPresentation = record.shelfPresentation;
    if (previousShelfId) this.#renumberSpineShelf(previousShelfId);
    this.#promoteBookCoverTexture(publicationId, record);
    this.#carriedPublicationId = publicationId;
    this.#discardError = undefined;
    this.#setHoveredPublicationId(undefined);
    this.#physicsWorld.holdBook(publicationId);
    if (this.#physicsWorld.isReady) this.#scene.attach(record.mesh);
    else {
      this.#camera.add(record.mesh);
      record.mesh.position.copy(this.#heldLocalPosition);
      record.mesh.quaternion.copy(this.#heldLocalRotation);
    }
    record.mesh.scale.setScalar(1);
    record.targetLift = 0;
    record.targetScale = 1;
    this.#syncInteractiveMeshes();
    this.#updateHeldPhysicsTarget();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #shelveCarriedBook() {
    if (this.#discardBusy) return;
    const publicationId = this.#carriedPublicationId;
    if (!publicationId) return;
    const record = this.#booksById.get(publicationId);
    if (!record) return;
    const selection = this.#shelfTargetSelection;
    if (!selection) return;
    const transition = transitionBookInteraction(record.state, {
      shelfId: selection.shelfId,
      slotIndex: selection.slotIndex,
      type: "shelve",
    });
    if (!transition.ok) return;

    this.#scene.attach(record.mesh);
    record.state = transition.state;
    record.shelfPresentation = selection.presentation;
    this.#restoreCompactBookCoverTexture(record);
    record.slotIndex = selection.slotIndex;
    record.shelfOffset = selection.offset;
    if (selection.placements)
      this.#applySpineShelfPlacements(selection.shelfId, selection.placements);
    else {
      this.#setShelfPosition(record);
      record.basePosition.copy(record.shelfPosition);
      this.#setShelfRotation(record, publicationId);
      this.#physicsWorld.shelveBook(
        publicationId,
        this.#setPhysicsPose(record.shelfPosition, record.baseRotation),
      );
    }
    this.#carriedPublicationId = undefined;
    this.#discardError = undefined;
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#setTrashTargeted(false);
    this.#syncInteractiveMeshes();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #applySpineShelfPlacements(
    shelfId: string,
    placements: readonly SpineShelfPlacement[],
  ) {
    for (const placement of placements) {
      const record = this.#booksById.get(placement.id);
      if (!record) continue;
      record.slotIndex = placement.slotIndex;
      record.shelfOffset = placement.center;
      record.state = {
        shelfId,
        slotIndex: placement.slotIndex,
        status: "shelved",
      };
      this.#setShelfPosition(record);
      record.basePosition.copy(record.shelfPosition);
      this.#setShelfRotation(record, placement.id);
      this.#physicsWorld.shelveBook(
        placement.id,
        this.#setPhysicsPose(record.shelfPosition, record.baseRotation),
      );
    }
  }

  #renumberSpineShelf(shelfId: string) {
    if (!this.#spineShelfDefinitions.has(shelfId)) return;
    const records = [...this.#booksById.values()]
      .filter(
        (record) =>
          record.state.status === "shelved" && record.state.shelfId === shelfId,
      )
      .sort((first, second) => first.shelfOffset - second.shelfOffset);
    for (const [slotIndex, record] of records.entries()) {
      record.slotIndex = slotIndex;
      record.state = {shelfId, slotIndex, status: "shelved"};
    }
  }

  #throwChargeProgress() {
    return MathUtils.clamp(
      this.#throwChargeSeconds / THROW_CHARGE_SECONDS,
      0,
      1,
    );
  }

  #startThrowCharge() {
    if (
      this.#throwChargeActive ||
      !this.#carriedPublicationId ||
      this.#inspectionMode !== "none"
    )
      return;
    this.#throwChargeActive = true;
    this.#throwChargeBucket = 0;
    this.#throwChargeSeconds = 0;
    this.#emitGameState();
  }

  #updateThrowCharge(deltaSeconds: number) {
    if (!this.#throwChargeActive) return;
    if (!this.#carriedPublicationId || this.#inspectionMode !== "none") {
      this.#cancelThrowCharge();
      return;
    }
    this.#throwChargeSeconds = Math.min(
      THROW_CHARGE_SECONDS,
      this.#throwChargeSeconds + deltaSeconds,
    );
    const bucket = Math.round(this.#throwChargeProgress() * 50);
    if (bucket === this.#throwChargeBucket) return;
    this.#throwChargeBucket = bucket;
    this.#emitGameState();
  }

  #cancelThrowCharge() {
    if (!this.#throwChargeActive) return;
    this.#throwChargeActive = false;
    this.#throwChargeBucket = -1;
    this.#throwChargeSeconds = 0;
    this.#emitGameState();
  }

  #releaseThrowCharge() {
    if (!this.#throwChargeActive) return;
    const charge = this.#throwChargeProgress();
    this.#throwChargeActive = false;
    this.#throwChargeBucket = -1;
    this.#throwChargeSeconds = 0;
    this.#throwCarriedBook(charge);
  }

  #throwCarriedBook(charge = 0) {
    if (!this.#carriedPublicationId || this.#inspectionMode !== "none") return;
    this.#dropCarriedBook(false, true, charge);
  }

  #dropCarriedBook(
    fromCurrentPose = false,
    throwBook = false,
    throwCharge = 0,
  ) {
    if (this.#discardBusy) return;
    const publicationId = this.#carriedPublicationId;
    if (!publicationId) return;
    const record = this.#booksById.get(publicationId);
    if (!record) return;
    if (this.#throwChargeActive) {
      this.#throwChargeActive = false;
      this.#throwChargeBucket = -1;
      this.#throwChargeSeconds = 0;
    }
    const transition = transitionBookInteraction(record.state, {type: "drop"});
    if (!transition.ok) return;

    let dropPose = this.#heldTargetPose;
    if (fromCurrentPose) {
      record.mesh.updateMatrixWorld(true);
      record.mesh.getWorldPosition(this.#physicsPosePosition);
      record.mesh.getWorldQuaternion(this.#physicsPoseRotation);
      dropPose = this.#physicsPose;
    } else this.#updateHeldPhysicsTarget();
    this.#scene.attach(record.mesh);
    this.#camera.getWorldDirection(this.#viewDirection);
    record.state = transition.state;
    this.#restoreCompactBookCoverTexture(record);
    const charge = MathUtils.clamp(throwCharge, 0, 1);
    const throwSpeed = MathUtils.lerp(THROW_MIN_SPEED, THROW_MAX_SPEED, charge);
    const throwLift = MathUtils.lerp(THROW_MIN_LIFT, THROW_MAX_LIFT, charge);
    const linearVelocity = throwBook
      ? this.#throwVelocity
          .copy(this.#viewDirection)
          .multiplyScalar(throwSpeed)
          .add(this.#playerVelocity)
          .setY(
            this.#viewDirection.y * throwSpeed +
              this.#playerVelocity.y +
              throwLift,
          )
      : this.#playerVelocity;
    this.#physicsWorld.dropBook(publicationId, {
      ...(throwBook ? {angularVelocity: this.#throwAngularVelocity} : {}),
      linearVelocity,
      pose: dropPose,
    });
    record.basePosition.set(
      MathUtils.clamp(
        this.#camera.position.x + this.#viewDirection.x * 0.95,
        SHOP_COLLISION_WORLD.bounds.minX + record.width,
        SHOP_COLLISION_WORLD.bounds.maxX - record.width,
      ),
      record.thickness / 2 + 0.014,
      MathUtils.clamp(
        this.#camera.position.z + this.#viewDirection.z * 0.95,
        SHOP_COLLISION_WORLD.bounds.minZ + BOOK_HEIGHT,
        SHOP_COLLISION_WORLD.bounds.maxZ - BOOK_HEIGHT,
      ),
    );
    record.baseRotation.set(-Math.PI / 2, this.#lookAngles.yaw, -0.04);
    this.#carriedPublicationId = undefined;
    this.#discardError = undefined;
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#setTrashTargeted(false);
    this.#syncInteractiveMeshes();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  async #discardCarriedBook() {
    const publicationId = this.#carriedPublicationId;
    if (!publicationId || this.#discardBusy || !this.#trashTargeted) return;
    const record = this.#booksById.get(publicationId);
    if (!record) return;

    this.#discardBusy = true;
    this.#discardError = undefined;
    this.#pendingDiscardPublicationId = publicationId;
    this.#emitGameState();

    let discarded = false;
    try {
      discarded = (await this.#onDiscardPublication?.(publicationId)) === true;
    } catch (error) {
      if (!this.#disposed)
        this.#discardError =
          error instanceof Error && error.message
            ? error.message
            : "The library rejected the discard.";
    }
    if (this.#disposed) return;
    this.#discardBusy = false;
    this.#pendingDiscardPublicationId = undefined;

    if (!discarded) {
      this.#discardError ??= this.#onDiscardPublication
        ? "The library rejected the discard."
        : "Discard is unavailable in this library.";
      this.#emitGameState();
      return;
    }

    this.#discardError = undefined;
    this.#discardedPublicationIds.add(publicationId);
    const currentRecord = this.#booksById.get(publicationId);
    if (currentRecord !== record) {
      if (currentRecord) {
        this.#physicsWorld.removeBook(publicationId);
        this.#disposeBookRecord(currentRecord);
        this.#booksById.delete(publicationId);
      }
      if (this.#carriedPublicationId === publicationId)
        this.#carriedPublicationId = undefined;
      this.#trashTargeted = false;
      this.#syncInteractiveMeshes();
      this.#updateShelfTargetVisuals();
      this.#worldStateDirty = true;
      this.#emitGameState();
      this.#flushWorldSave();
      return;
    }
    this.#scene.attach(record.mesh);
    this.#physicsWorld.removeBook(publicationId);
    record.physicsRegistered = false;
    this.#discardAnimation = {
      elapsedSeconds: 0,
      publicationId,
      startPosition: record.mesh.position.clone(),
      startRotation: record.mesh.quaternion.clone(),
    };
    this.#carriedPublicationId = undefined;
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#trashTargeted = false;
    this.#syncInteractiveMeshes();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
    this.#flushWorldSave();
  }

  #animateDiscard(deltaSeconds: number) {
    const animation = this.#discardAnimation;
    if (!animation) return;
    const record = this.#booksById.get(animation.publicationId);
    if (!record) {
      this.#discardAnimation = undefined;
      return;
    }

    animation.elapsedSeconds = Math.min(
      DISCARD_TOSS_DURATION_SECONDS,
      animation.elapsedSeconds + deltaSeconds,
    );
    const progress = animation.elapsedSeconds / DISCARD_TOSS_DURATION_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    this.#trashTossTarget.set(0, TRASH_CAN_HEIGHT * 0.35, 0);
    this.#trashcanGroup.localToWorld(this.#trashTossTarget);
    record.mesh.position.lerpVectors(
      animation.startPosition,
      this.#trashTossTarget,
      eased,
    );
    record.mesh.position.y += Math.sin(progress * Math.PI) * 0.72;
    record.mesh.quaternion.slerpQuaternions(
      animation.startRotation,
      this.#trashTossRotation,
      eased,
    );
    record.mesh.scale.setScalar(1 - progress * 0.28);
    if (progress < 1) return;

    this.#discardAnimation = undefined;
    this.#physicsWorld.removeBook(animation.publicationId);
    this.#disposeBookRecord(record);
    this.#booksById.delete(animation.publicationId);
    if (this.#hoveredPublicationId === animation.publicationId)
      this.#hoveredPublicationId = undefined;
    this.#syncInteractiveMeshes();
    this.#applyBookStates();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #createWorldSave(): WorldSaveV1 {
    const books: WorldBookSave[] = [];
    for (const [publicationId, record] of this.#booksById) {
      if (this.#discardedPublicationIds.has(publicationId)) continue;
      let position: Vector3;
      let quaternion: Quaternion;
      if (record.state.status === "shelved") {
        position = record.basePosition;
        quaternion = new Quaternion().setFromEuler(
          new Euler(
            record.baseRotation.x,
            record.baseRotation.y,
            record.baseRotation.z,
            "XYZ",
          ),
        );
      } else {
        record.mesh.updateWorldMatrix(true, false);
        position = record.mesh.getWorldPosition(new Vector3());
        quaternion = record.mesh.getWorldQuaternion(new Quaternion());
      }
      const base = {
        copyId: publicationId,
        pose: {
          position: {x: position.x, y: position.y, z: position.z},
          quaternion: {
            w: quaternion.w,
            x: quaternion.x,
            y: quaternion.y,
            z: quaternion.z,
          },
        },
        publicationId,
      };
      if (record.state.status === "shelved") {
        books.push({
          ...base,
          shelf: {
            presentation: record.shelfPresentation,
            shelfId: record.state.shelfId,
            slotIndex: record.state.slotIndex,
          },
          state: "shelved",
        });
        continue;
      }
      books.push({...base, state: record.state.status});
    }
    const catalog = this.#catalogIdentity();
    const playerQuaternion = this.#camera.quaternion;
    const shelfSigns = [...this.#signSlots.values()].flatMap((slot) =>
      slot.kind === "shelf" && slot.column !== undefined && slot.title
        ? [
            {
              column: slot.column,
              ...(slot.subtitle ? {subtitle: slot.subtitle} : {}),
              text: slot.title,
            },
          ]
        : [],
    );
    const aisleSigns = [...this.#signSlots.values()].flatMap((slot) =>
      slot.kind === "aisle" && slot.title
        ? [
            {
              id: slot.id,
              ...(slot.subtitle ? {subtitle: slot.subtitle} : {}),
              title: slot.title,
            },
          ]
        : [],
    );
    const posters: WorldPosterSave[] = [
      ...this.#pendingPosterSaves.filter(
        (savedPoster) => !this.#posterRecords.has(savedPoster.id),
      ),
      ...[...this.#posterRecords.values()].map((record) => {
        record.mesh.updateWorldMatrix(true, false);
        const position = record.mesh.getWorldPosition(new Vector3());
        const quaternion = record.mesh.getWorldQuaternion(new Quaternion());
        return {
          assetId: record.asset.id,
          height: record.height,
          id: record.id,
          pose: {
            position: {x: position.x, y: position.y, z: position.z},
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
          rotation: record.rotation,
        };
      }),
    ];
    const digitalArtFrames: WorldDigitalArtFrameSave[] = [
      ...this.#pendingDigitalArtFrameSaves.filter(
        (savedFrame) => !this.#digitalArtFrameRecords.has(savedFrame.id),
      ),
      ...[...this.#digitalArtFrameRecords.values()].map((record) => {
        record.frame.object.updateWorldMatrix(true, false);
        const position = record.frame.object.getWorldPosition(new Vector3());
        const quaternion = record.frame.object.getWorldQuaternion(
          new Quaternion(),
        );
        return {
          aspectRatio: record.frame.aspectRatio(),
          channelId: record.frame.channelId(),
          ...(record.frame.currentImageId()
            ? {currentImageId: record.frame.currentImageId()}
            : {}),
          fit: record.frame.fit(),
          height: record.height,
          id: record.id,
          intervalSeconds: record.frame.intervalSeconds(),
          pose: {
            position: {x: position.x, y: position.y, z: position.z},
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
          rotation: record.rotation,
        };
      }),
    ];
    const television = this.#movableTelevision;
    television?.object.updateWorldMatrix(true, false);
    const televisionPosition = television?.object.getWorldPosition(
      new Vector3(),
    );
    const televisionQuaternion = television?.object.getWorldQuaternion(
      new Quaternion(),
    );
    const televisionChannels: Record<string, string> = {};
    const televisionVolumes: Record<string, number> = {};
    for (const [saveId, savedTelevision] of this.#televisionsBySaveId) {
      const channelId = savedTelevision.selectedChannelId();
      if (channelId) televisionChannels[saveId] = channelId;
      televisionVolumes[saveId] = savedTelevision.volumeLevel();
    }
    const props: WorldPropSave[] = [
      ...[...this.#pendingPropSaves.values()].filter(
        (savedProp) => !this.#movableProps.has(savedProp.id),
      ),
      ...[...this.#movableProps.values()]
        .filter((record) => record.persistInWorldProps)
        .map((record) => {
          record.object.updateWorldMatrix(true, false);
          const position = record.object.getWorldPosition(new Vector3());
          const quaternion = record.object.getWorldQuaternion(new Quaternion());
          return {
            id: record.id,
            pose: {
              position: {x: position.x, y: position.y, z: position.z},
              quaternion: {
                w: quaternion.w,
                x: quaternion.x,
                y: quaternion.y,
                z: quaternion.z,
              },
            },
          };
        }),
    ];
    return {
      aisleSigns,
      books,
      catalog: {
        catalogContentHash: catalog.catalogContentHash,
        packId: catalog.packId,
        ...(catalog.snapshotId === undefined
          ? {}
          : {snapshotId: catalog.snapshotId}),
      },
      digitalArtFrames,
      player: {
        position: {
          x: this.#camera.position.x,
          y: this.#camera.position.y,
          z: this.#camera.position.z,
        },
        quaternion: {
          w: playerQuaternion.w,
          x: playerQuaternion.x,
          y: playerQuaternion.y,
          z: playerQuaternion.z,
        },
      },
      posters,
      props,
      savedAt: new Date().toISOString(),
      schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
      shelfSigns,
      ...(televisionPosition && televisionQuaternion
        ? {
            television: {
              position: {
                x: televisionPosition.x,
                y: televisionPosition.y,
                z: televisionPosition.z,
              },
              quaternion: {
                w: televisionQuaternion.w,
                x: televisionQuaternion.x,
                y: televisionQuaternion.y,
                z: televisionQuaternion.z,
              },
            },
          }
        : {}),
      televisionChannels,
      televisionModelVersion: 2,
      televisionVolumes,
      trashcan: {
        x: this.#trashcanPosition.x,
        y: 0,
        z: this.#trashcanPosition.z,
      },
    };
  }

  readonly #scheduleWorldSave = () => {
    if (
      this.#disposed ||
      !this.#worldStateDirty ||
      !this.#onWorldSave ||
      this.#worldSaveIdleHandle !== undefined
    )
      return;

    if (typeof window.requestIdleCallback !== "function") {
      this.#flushWorldSave();
      return;
    }

    this.#worldSaveIdleHandle = window.requestIdleCallback(
      () => {
        this.#worldSaveIdleHandle = undefined;
        if (!this.#disposed) this.#flushWorldSave();
      },
      {timeout: WORLD_SAVE_IDLE_TIMEOUT_MS},
    );
  };

  #stopWorldSaveScheduler() {
    if (this.#worldSaveIntervalHandle !== undefined) {
      window.clearInterval(this.#worldSaveIntervalHandle);
      this.#worldSaveIntervalHandle = undefined;
    }
    if (this.#worldSaveIdleHandle === undefined) return;
    window.cancelIdleCallback(this.#worldSaveIdleHandle);
    this.#worldSaveIdleHandle = undefined;
  }

  #flushWorldSave() {
    if (!this.#worldStateDirty || !this.#onWorldSave || this.#worldSavePending)
      return;
    this.#worldStateDirty = false;
    try {
      const persisted = this.#onWorldSave(this.#createWorldSave());
      if (!(persisted instanceof Promise)) {
        if (persisted === false) this.#worldStateDirty = true;
        return;
      }
      this.#worldSavePending = persisted
        .then((didPersist) => {
          if (didPersist === false) this.#worldStateDirty = true;
        })
        .catch((error: unknown) => {
          this.#worldStateDirty = true;
          if (DEV)
            console.warn("Afterleaf could not persist the shop state.", error);
        })
        .finally(() => {
          this.#worldSavePending = undefined;
        });
    } catch (error) {
      this.#worldStateDirty = true;
      if (DEV)
        console.warn("Afterleaf could not persist the shop state.", error);
    }
  }

  #updateShelfTargetVisuals() {
    const selection = this.#shelfTargetSelection;
    for (const target of this.#shelfTargetMeshes) {
      const material = target.material;
      if (!(material instanceof MeshBasicMaterial)) continue;
      const selectedShelf = selection?.shelfId === target.userData.shelfId;
      material.opacity = selectedShelf ? 0.13 : 0;
      material.color.set("#78b594");
    }
    const carriedRecord = this.#carriedPublicationId
      ? this.#booksById.get(this.#carriedPublicationId)
      : undefined;
    if (!selection || !carriedRecord) {
      this.#shelfSnapMesh.visible = false;
      return;
    }
    this.#shelfSnapMesh.visible = true;
    const shelf = this.#spineShelfDefinitions.get(selection.shelfId);
    if (!shelf) {
      this.#shelfSnapMesh.visible = false;
      return;
    }
    this.#shelfSnapMesh.position
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, selection.offset)
      .addScaledVector(
        shelf.normal,
        selection.presentation === "face" ? -shelf.faceInset : 0.012,
      );
    this.#shelfSnapMesh.rotation.set(
      selection.presentation === "face" ? shelf.faceTilt : 0,
      Math.atan2(shelf.normal.x, shelf.normal.z),
      0,
    );
    this.#shelfSnapMesh.scale.set(
      selection.presentation === "face"
        ? carriedRecord.width
        : carriedRecord.thickness,
      BOOK_HEIGHT,
      1,
    );
  }

  #updateSignTargetVisuals() {
    for (const [key, slot] of this.#signSlots) {
      slot.target.material.opacity =
        key === this.#targetedSignKey ? 0.32 : slot.sign ? 0 : 0.1;
    }
  }

  #emitGameState() {
    if (!this.#onGameStateChange) return;
    const records = [...this.#booksById.entries()]
      .filter(
        ([publicationId]) => !this.#discardedPublicationIds.has(publicationId),
      )
      .map(([, record]) => record);
    const taskBooks = records.filter((record) => record.taskBook);
    const shelvedCount = taskBooks.filter(
      (record) => record.state.status === "shelved",
    ).length;
    const looseCount = taskBooks.length - shelvedCount;
    const carriedRecord = this.#carriedPublicationId
      ? this.#booksById.get(this.#carriedPublicationId)
      : undefined;
    const inspectionPublication = this.#inspectionPublication();
    const inspectionWidePages = inspectionPublication
      ? getWideReaderPageIndices(inspectionPublication.pages)
      : undefined;
    const hoveredRecord = this.#hoveredPublicationId
      ? this.#booksById.get(this.#hoveredPublicationId)
      : undefined;
    let prompt: string | undefined;
    let interactionContext: string | undefined;
    let interactions: ShopInteraction[] = [];
    if (this.#inspectionMode === "spread") {
      const shelfInspection =
        inspectionPublication?.id !== this.#carriedPublicationId;
      const openInspectionKey =
        inspectionPublication?.direction === "RTL" ? "A" : "D";
      if (this.#inspectionOpenAngleTarget > 0)
        prompt = shelfInspection
          ? `Click the cover or press ${openInspectionKey} to open · R return to shelf`
          : `Click the cover or press ${openInspectionKey} to open · F throw · G drop · R return`;
      else
        prompt = shelfInspection
          ? "Click or drag a page · A/D turn pages · Wheel zooms · R return to shelf"
          : "Click or drag a page · A/D turn pages · Wheel zooms · F throw · G drop · R return";
    } else if (this.#inspectionMode === "closing")
      prompt =
        this.#inspectionCloseAction === "drop"
          ? "Closing book before dropping…"
          : this.#inspectionCloseAction === "throw"
            ? "Closing book before throwing…"
            : "Closing book…";
    else if (this.#artFramePlacement) {
      const asset = this.#artFrameAssets[this.#artFramePlacement.assetIndex];
      const size = this.#artFramePlacementSelection?.height;
      const rotation = Math.round(
        MathUtils.radToDeg(this.#artFramePlacement.rotation),
      );
      const interval = this.#artFramePlacement.intervalSeconds;
      if (!asset)
        prompt = `Paste the first digital art image · N channel (${this.#artFramePlacement.channelId}) · T exit`;
      else
        prompt = this.#artFramePlacementSelection
          ? `Click to place ${asset.label} · Q/E image · Wheel resize${size ? ` (${size.toFixed(2)} m)` : ""} · Shift+wheel rotate (${rotation}°) · F ${this.#artFramePlacement.fit} · I ${interval === 0 ? "timer off" : `${interval}s timer`} · N channel (${this.#artFramePlacement.channelId}) · Paste image · T exit`
          : `Aim ${asset.label} at a wall or shelf end · Q/E image · Wheel resize · F ${this.#artFramePlacement.fit} · I ${interval === 0 ? "timer off" : `${interval}s timer`} · N channel (${this.#artFramePlacement.channelId}) · Paste image · T exit`;
    } else if (this.#posterPlacement) {
      const asset = this.#posterAssets[this.#posterPlacement.assetIndex];
      const size = this.#posterPlacementSelection?.height;
      const rotation = Math.round(
        MathUtils.radToDeg(this.#posterPlacement.rotation),
      );
      if (!asset) prompt = "Paste an image to add the first poster · T exit";
      else
        prompt = this.#posterPlacementSelection
          ? `Click to place ${asset.label} · Q/E previous/next · Wheel resize${size ? ` (${size.toFixed(2)} m)` : ""} · Shift+wheel rotate (${rotation}°) · Paste image · T exit`
          : `Aim ${asset.label} at a wall or shelf end · Q/E previous/next · Wheel resize · Shift+wheel rotate · Paste image · T exit`;
    } else if (this.#carriedProp)
      prompt = `Click/E place ${this.#carriedProp.label} · T cancel · G drop · F throw · Wheel project (${this.#propPlacementDistance.toFixed(1)} m) · Q grid snap ${this.#propPlacementSnapping ? "on" : "off"} · R ${this.#propPlacementRotationMode ? "position mode" : "rotation mode"} · ${this.#propPlacementRotationMode ? "Mouse rotate" : "Mouse aim"}`;
    else if (carriedRecord && this.#throwChargeActive)
      prompt = `Throw charged ${Math.round(this.#throwChargeProgress() * 100)}% · Release F to launch upstairs`;
    else if (carriedRecord && this.#discardBusy)
      prompt = `Discarding ${carriedRecord.publicationTitle}…`;
    else if (carriedRecord && this.#trashTargeted && this.#discardError)
      prompt = `Discard failed · E retry · Hold F charge throw · G keep ${carriedRecord.publicationTitle}`;
    else if (carriedRecord && this.#trashTargeted)
      prompt = `E discard ${carriedRecord.publicationTitle} · Hold F charge throw · G keep`;
    else if (carriedRecord && this.#shelfTargeted)
      prompt = `E shelve ${this.#shelfTargetSelection?.presentation ?? this.#shelfPresentation}-out · Q switch shelf presentation · Hold F charge throw · G drop · R inspect`;
    else if (carriedRecord)
      prompt = `Q ${this.#shelfPresentation}-out · Aim at a shelf · Hold F charge throw · G drop · R inspect`;
    else if (this.#televisionTargeted) {
      const televisionPrompt = this.#targetedTelevision?.prompt;
      const pastePrompt = this.#targetedTelevision
        ? "Paste video URL"
        : undefined;
      prompt = [televisionPrompt, pastePrompt].filter(Boolean).join(" · ");
    } else if (this.#targetedProp)
      prompt = `T project ${this.#targetedProp.label} for placement`;
    else if (this.#targetedSignKey !== undefined)
      prompt = `E customize ${this.#signSlots.get(this.#targetedSignKey)?.label ?? "shop sign"}`;
    else if (this.#targetedDigitalArtFrameId) {
      const frame = this.#digitalArtFrameRecords.get(
        this.#targetedDigitalArtFrameId,
      )?.frame;
      const interval = frame?.intervalSeconds() ?? 0;
      const pendingChannel = this.#artFrameTargetImportChannel;
      const pasteChannel =
        pendingChannel?.frameId === this.#targetedDigitalArtFrameId
          ? pendingChannel.channelId
          : (frame?.channelLabel() ?? "unavailable");
      prompt = `Paste → ${pasteChannel} · N new channel · T move · Del remove · Q/E channel · F shuffle · R ${frame?.fit() ?? "contain"} · I ${interval === 0 ? "timer off" : `${interval}s timer`}`;
    } else if (this.#targetedPosterId) {
      const poster = this.#posterRecords.get(this.#targetedPosterId);
      prompt = `T move ${poster?.asset.label ?? "poster"} · Del remove`;
    } else if (hoveredRecord)
      prompt =
        hoveredRecord.state.status === "shelved"
          ? `Hold F + wheel browse · E pick up ${hoveredRecord.publicationTitle} · R read in place`
          : `E pick up ${hoveredRecord.publicationTitle} · then R inspect`;

    if (this.#inspectionMode === "spread") {
      const shelfInspection =
        inspectionPublication?.id !== this.#carriedPublicationId;
      interactions = [
        {key: "A / D", label: "Turn page"},
        {key: "Wheel", label: "Zoom"},
        ...(shelfInspection
          ? [{key: "R", label: "Return to shelf"}]
          : [
              {key: "F", label: "Throw book"},
              {key: "G", label: "Drop book"},
              {key: "R", label: "Return to hand"},
            ]),
      ];
    } else if (this.#artFramePlacement) {
      interactionContext = this.#artFramePlacement.channelId;
      interactions = [
        {key: "Click", label: "Place frame"},
        {key: "Q / E", label: "Change image"},
        {key: "F", label: `Fit: ${this.#artFramePlacement.fit}`},
        {
          key: "I",
          label: `Timing: ${this.#artFramePlacement.intervalSeconds === 0 ? "Off" : `${this.#artFramePlacement.intervalSeconds}s`}`,
        },
        {key: "N", label: "New channel"},
        {key: "T", label: "Cancel placement"},
        {key: "V", label: "Cancel placement"},
        {
          key: "X",
          label: `Grid snap: ${this.#artFramePlacement.gridSnap ? "On" : "Off"}`,
        },
        {key: "Wheel", label: "Resize"},
        {key: "Shift + Wheel", label: "Rotate"},
      ];
    } else if (this.#posterPlacement)
      interactions = [
        {key: "Click", label: "Place poster"},
        {key: "Q / E", label: "Change image"},
        {key: "T", label: "Cancel placement"},
        {
          key: "X",
          label: `Grid snap: ${this.#posterPlacement.gridSnap ? "On" : "Off"}`,
        },
        {key: "Wheel", label: "Resize"},
        {key: "Shift + Wheel", label: "Rotate"},
      ];
    else if (this.#carriedProp)
      interactions = [
        {key: "Click / E", label: "Place prop"},
        {key: "G", label: "Drop prop"},
        {key: "T", label: "Cancel placement"},
        {key: "F", label: "Throw prop"},
        {
          key: "Q",
          label: `Grid snap: ${this.#propPlacementSnapping ? "On" : "Off"}`,
        },
        {
          key: "R",
          label: `Mode: ${this.#propPlacementRotationMode ? "Rotate" : "Aim"}`,
        },
        {key: "Wheel", label: "Adjust distance"},
      ];
    else if (carriedRecord) {
      interactions = [
        {key: "F", label: "Throw book"},
        {key: "G", label: "Drop book"},
        {key: "R", label: "Inspect book"},
        {key: "Q", label: "Switch shelf presentation"},
      ];
      if (this.#shelfTargeted)
        interactions.push({key: "Hold F + Wheel", label: "Browse shelf"});
      if (this.#shelfTargeted)
        interactions.unshift({key: "E", label: "Shelve book"});
      if (this.#trashTargeted)
        interactions.unshift({key: "E", label: "Discard book"});
    } else if (this.#televisionTargeted) {
      interactionContext =
        this.#targetedTelevision?.selectedChannelLabel() ??
        this.#targetedTelevision?.selectedChannelId() ??
        (this.#targetedTelevision ? "Afterleaf TV" : undefined);
      interactions = [
        {
          key: "E",
          label: this.#targetedTelevision?.powered()
            ? "Next channel"
            : "Turn on",
        },
        {key: "T", label: "Move TV"},
        {key: "Q", label: "Previous channel"},
        {key: "F", label: "Skip"},
        {
          key: "M",
          label: `Mute (${this.#targetedTelevision?.volumePercent() ?? 0}%)`,
        },
        {key: "Wheel", label: "Scrub video"},
        {
          key: "Ctrl + Wheel",
          label: `Volume: ${this.#targetedTelevision?.volumePercent() ?? 0}%`,
        },
      ];
    } else if (this.#targetedProp)
      interactions = [{key: "T", label: "Move prop"}];
    else if (this.#targetedPosterId)
      interactions = [
        {key: "T", label: "Move poster"},
        {key: "Del", label: "Remove poster"},
      ];
    else if (this.#targetedDigitalArtFrameId) {
      const frame = this.#digitalArtFrameRecords.get(
        this.#targetedDigitalArtFrameId,
      )?.frame;
      const interval = frame?.intervalSeconds() ?? 0;
      interactionContext = frame?.channelLabel();
      interactions = [
        {key: "T", label: "Move frame"},
        {key: "Del", label: "Remove frame"},
        {key: "Q / E", label: "Previous / next channel"},
        {key: "F", label: "Next image"},
        {key: "I", label: `Timing: ${interval === 0 ? "Off" : `${interval}s`}`},
        {key: "R", label: `Fit: ${frame?.fit() ?? "contain"}`},
        {key: "N", label: "New channel"},
      ];
    } else if (this.#targetedSignKey !== undefined)
      interactions = [{key: "E", label: "Customize sign"}];
    else if (hoveredRecord)
      interactions =
        hoveredRecord.state.status === "shelved"
          ? [
              {key: "E", label: "Pick up book"},
              {key: "R", label: "Read book"},
              {key: "Hold F + Wheel", label: "Browse shelf"},
            ]
          : [{key: "E", label: "Pick up book"}];

    if (
      interactions.length === 0 &&
      this.#pointerLocked &&
      this.#inspectionMode === "none"
    )
      interactions = [
        {key: "P", label: "Posters"},
        {key: "V", label: "Digital art frames"},
        {key: "Space", label: "Jump"},
      ];

    const snapshot: ShopGameSnapshot = {
      ...(interactionContext ? {interactionContext} : {}),
      ...(interactions.length > 0 ? {interactions} : {}),
      ...(this.#carriedPublicationId
        ? {carriedPublicationId: this.#carriedPublicationId}
        : {}),
      discardBusy: this.#discardBusy,
      ...(this.#discardError ? {discardError: this.#discardError} : {}),
      ...(this.#inspectionMode === "spread" && inspectionPublication
        ? {
            inspectionBookOpen: this.#inspectionOpenAngleTarget === 0,
            inspectionCanTurnBackward:
              getAdjacentSpreadStart(
                this.#inspectionPageIndex,
                inspectionPublication.pages.length,
                "spread",
                "backward",
                inspectionWidePages,
              ) !== this.#inspectionPageIndex,
            inspectionCanTurnForward:
              getAdjacentSpreadStart(
                this.#inspectionPageIndex,
                inspectionPublication.pages.length,
                "spread",
                "forward",
                inspectionWidePages,
              ) !== this.#inspectionPageIndex,
            inspectionPageCount: inspectionPublication.pages.length,
            inspectionPageIndex: this.#inspectionPageIndex,
            inspectionPagesLoading: this.#inspectionPageLoadCount > 0,
          }
        : {}),
      inspectionMode: this.#inspectionMode,
      looseCount,
      physicsReady: this.#physicsWorld.isReady,
      pointerLocked: this.#pointerLocked,
      digitalArtFrameCount: this.#digitalArtFrameRecords.size,
      ...(this.#artFrameImportError
        ? {digitalArtFrameImportError: this.#artFrameImportError}
        : {}),
      ...(this.#artFrameImportCount > 0
        ? {digitalArtFrameImporting: true}
        : {}),
      ...(this.#artFramePlacement
        ? {digitalArtFramePlacementActive: true}
        : {}),
      posterCount: this.#posterAssets.length,
      ...(this.#posterImportError
        ? {posterImportError: this.#posterImportError}
        : {}),
      ...(this.#posterImportCount > 0 ? {posterImporting: true} : {}),
      ...(this.#posterPlacement ? {posterPlacementActive: true} : {}),
      ...(this.#tvVideoImportError
        ? {tvVideoImportError: this.#tvVideoImportError}
        : {}),
      ...(this.#tvVideoImportCount > 0 ? {tvVideoImporting: true} : {}),
      ...(this.#tvVideoImportMessage
        ? {tvVideoImportMessage: this.#tvVideoImportMessage}
        : {}),
      ...(prompt ? {prompt} : {}),
      shelvedCount,
      ...(this.#throwChargeActive
        ? {throwCharge: this.#throwChargeProgress()}
        : {}),
    };
    const signature = JSON.stringify(snapshot);
    if (signature === this.#lastGameStateSignature) return;
    this.#lastGameStateSignature = signature;
    this.#onGameStateChange(snapshot);
  }

  #syncMovablePropPhysics() {
    for (const record of this.#movableProps.values()) {
      if (
        !this.#physicsWorld.sampleInterpolatedPropTransform(
          record.id,
          this.#physicsTransform,
        )
      )
        continue;
      if (record.object.parent !== this.#scene)
        this.#scene.attach(record.object);
      const positionChanged =
        record.currentPosition.distanceToSquared(
          this.#physicsTransform.position,
        ) > 1e-8;
      const rotationChanged =
        1 -
          Math.abs(
            record.currentRotation.dot(this.#physicsTransform.rotation),
          ) >
        1e-7;
      record.object.position.copy(this.#physicsTransform.position);
      record.object.quaternion.copy(this.#physicsTransform.rotation);
      record.currentPosition.copy(this.#physicsTransform.position);
      record.currentRotation.copy(this.#physicsTransform.rotation);
      if (record === this.#trashcanProp)
        this.#trashcanPosition.copy(record.currentPosition);
      if (positionChanged || rotationChanged) this.#worldStateDirty = true;
    }
  }

  #animateBooks(deltaSeconds: number) {
    let interactionStateChanged = false;
    for (const [publicationId, record] of this.#booksById) {
      const inspectionFocused =
        publicationId === this.#inspectionPublicationId &&
        this.#inspectionMode === "spread";
      if (inspectionFocused || record.inspectionLightingBlend > 0)
        this.#animateInspectionLighting(
          record,
          inspectionFocused,
          deltaSeconds,
        );
      if (
        publicationId === this.#inspectionPublicationId &&
        this.#inspectionMode !== "none"
      ) {
        this.#animateInspectedBook(record, deltaSeconds);
        continue;
      }
      if (
        this.#physicsWorld.isReady &&
        this.#physicsWorld.sampleInterpolatedBookTransform(
          publicationId,
          this.#physicsTransform,
        )
      ) {
        const physicsState = this.#physicsWorld.getBookState(publicationId);
        const trappedUnderShelf =
          physicsState === "dynamic" &&
          this.#physicsTransform.position.y < BOOK_UNDER_SHELF_RECOVERY_Y &&
          SHOP_INTERIOR_FOOTPRINTS.some((footprint) =>
            isPointInsideShopObstacle(
              this.#physicsTransform.position,
              footprint,
            ),
          );
        if (
          publicationId !== this.#carriedPublicationId &&
          (this.#physicsTransform.position.y < BOOK_VOID_RECOVERY_Y ||
            trappedUnderShelf)
        ) {
          if (record.state.status !== "floor") interactionStateChanged = true;
          this.#respawnEscapedBook(publicationId, record);
          continue;
        }
        if (record.state.status === "shelved" && physicsState === "dynamic") {
          record.state = {status: "floor"};
          interactionStateChanged = true;
        }
        const shelfIsStationary = record.state.status === "shelved";
        const positionChanged =
          !shelfIsStationary &&
          record.basePosition.distanceToSquared(
            this.#physicsTransform.position,
          ) > 1e-8;
        const rotationChanged =
          !shelfIsStationary &&
          1 -
            Math.abs(
              record.mesh.quaternion.dot(this.#physicsTransform.rotation),
            ) >
            1e-7;
        if (record.mesh.parent !== this.#scene) this.#scene.attach(record.mesh);
        record.mesh.position.copy(this.#physicsTransform.position);
        record.mesh.quaternion.copy(this.#physicsTransform.rotation);
        record.mesh.scale.setScalar(1);
        record.basePosition.copy(this.#physicsTransform.position);
        this.#physicsPoseEuler.setFromQuaternion(record.mesh.quaternion, "XYZ");
        record.baseRotation.set(
          this.#physicsPoseEuler.x,
          this.#physicsPoseEuler.y,
          this.#physicsPoseEuler.z,
        );
        if (record.state.status === "shelved")
          this.#animateShelfPreview(
            record,
            publicationId === this.#hoveredPublicationId &&
              this.#keysDown.has("KeyF"),
            deltaSeconds,
          );
        if (positionChanged || rotationChanged) this.#worldStateDirty = true;
        continue;
      }
      if (record.state.status === "carried") continue;
      if (record.state.status === "shelved") {
        this.#animateShelfPreview(
          record,
          publicationId === this.#hoveredPublicationId &&
            this.#keysDown.has("KeyF"),
          deltaSeconds,
        );
        continue;
      }
      const scale = MathUtils.damp(
        record.mesh.scale.x,
        record.targetScale,
        13,
        deltaSeconds,
      );
      record.mesh.scale.setScalar(scale);
      record.mesh.position.x = MathUtils.damp(
        record.mesh.position.x,
        record.basePosition.x,
        12,
        deltaSeconds,
      );
      record.mesh.position.y = MathUtils.damp(
        record.mesh.position.y,
        record.basePosition.y + record.targetLift,
        12,
        deltaSeconds,
      );
      record.mesh.position.z = MathUtils.damp(
        record.mesh.position.z,
        record.basePosition.z,
        12,
        deltaSeconds,
      );
      record.mesh.rotation.x = MathUtils.damp(
        record.mesh.rotation.x,
        record.baseRotation.x,
        12,
        deltaSeconds,
      );
      record.mesh.rotation.y = MathUtils.damp(
        record.mesh.rotation.y,
        record.baseRotation.y,
        12,
        deltaSeconds,
      );
      record.mesh.rotation.z = MathUtils.damp(
        record.mesh.rotation.z,
        record.baseRotation.z,
        12,
        deltaSeconds,
      );
    }
    if (!interactionStateChanged) return;
    this.#syncInteractiveMeshes();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #animateShelfPreview(
    record: BookRecord,
    targeted: boolean,
    deltaSeconds: number,
  ) {
    const shelf =
      record.state.status === "shelved"
        ? this.#spineShelfDefinitions.get(record.state.shelfId)
        : undefined;
    if (!shelf) return false;
    record.shelfPreview = MathUtils.damp(
      record.shelfPreview,
      targeted ? 1 : 0,
      SHELF_PREVIEW_SPEED,
      deltaSeconds,
    );
    if (!targeted && record.shelfPreview < 0.001) record.shelfPreview = 0;
    const pullProgress = MathUtils.smoothstep(
      record.shelfPreview,
      0,
      SHELF_PREVIEW_PULL_END,
    );
    const rotationProgress = MathUtils.smoothstep(
      record.shelfPreview,
      SHELF_PREVIEW_ROTATION_START,
      1,
    );
    const outwardDistance =
      record.shelfPresentation === "face" ? 0.14 : record.width * 0.72 + 0.1;
    record.mesh.position
      .copy(record.basePosition)
      .addScaledVector(shelf.normal, outwardDistance * pullProgress);
    this.#shelfPreviewBaseRotation.setFromEuler(
      this.#physicsPoseEuler.set(
        record.baseRotation.x,
        record.baseRotation.y,
        record.baseRotation.z,
        "XYZ",
      ),
    );
    record.mesh.quaternion.copy(this.#shelfPreviewBaseRotation);
    if (record.shelfPresentation === "spine" && rotationProgress > 0) {
      this.#shelfPreviewTargetRotation.setFromEuler(
        this.#physicsPoseEuler.set(
          0,
          Math.atan2(
            this.#camera.position.x - record.mesh.position.x,
            this.#camera.position.z - record.mesh.position.z,
          ),
          0,
          "XYZ",
        ),
      );
      record.mesh.quaternion.slerp(
        this.#shelfPreviewTargetRotation,
        rotationProgress,
      );
    }
    const scaleProgress =
      record.shelfPresentation === "spine" ? rotationProgress : pullProgress;
    record.mesh.scale.setScalar(1 + scaleProgress * 0.025);
    return targeted
      ? rotationProgress >= SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS
      : record.shelfPreview === 0;
  }

  #respawnEscapedBook(publicationId: string, record: BookRecord) {
    const seed = hashString(`${publicationId}:void-recovery`);
    record.state = {status: "floor"};
    record.basePosition.set(
      (((seed >>> 5) % 1_000) / 999 - 0.5) * 3.2,
      5.5 + ((seed >>> 15) % 100) * 0.012,
      21 + ((seed >>> 23) % 100) * 0.025,
    );
    record.baseRotation.set(
      -Math.PI / 2,
      ((seed >>> 11) % 1_000) * (Math.PI / 500),
      (((seed >>> 26) % 64) / 63 - 0.5) * 0.32,
    );
    record.mesh.position.copy(record.basePosition);
    record.mesh.rotation.set(
      record.baseRotation.x,
      record.baseRotation.y,
      record.baseRotation.z,
      "XYZ",
    );
    record.mesh.scale.setScalar(1);
    this.#physicsWorld.respawnBook(
      publicationId,
      this.#setPhysicsPose(record.basePosition, record.baseRotation),
    );
    this.#worldStateDirty = true;
  }

  #markReady() {
    if (this.#ready) return;
    this.#ready = true;
    this.#onReady?.();
    this.#onReady = undefined;
  }
}
