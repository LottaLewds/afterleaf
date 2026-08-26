import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationMixer,
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Euler,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type AnimationClip,
  type ColorSpace,
  type Material,
} from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader.js";
import {RectAreaLightUniformsLib} from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {clone as cloneWithSkeleton} from "three/examples/jsm/utils/SkeletonUtils.js";
import {DEV} from "solid-js";
import {
  batchStaticInteriorMeshes,
  buildMergedStaticParts,
} from "~/game/staticModelBatching";
import {createBookExteriorMaterial} from "~/game/bookExteriorMaterial";
import {disposeObject} from "~/game/threeDisposal";
import {
  addInteriorBox,
  createHorizontalShape,
  createPosterSurface as createPosterSurfaceTarget,
  createTiledFloorSurface,
} from "~/game/interior/interiorPrimitives";
import {
  createAtriumRailings,
  createStackableStairwell,
  createUpperFloorStructures,
  createUpperWindowWall,
  type CreatePosterSurface,
} from "~/game/interior/upperFloor";
import type {AddBox} from "~/game/interior/interiorPrimitives";
import {
  createReadingChairInstance,
  createReadingTables,
} from "~/game/interior/readingFurniture";
import {createSpineShelfFixture} from "~/game/interior/shelfFixtures";
import {createTelevisionRooms} from "~/game/interior/televisionRooms";
import {
  createNightWindows,
  createTheatreSeating,
} from "~/game/interior/seating";
import {
  createCeilingLightRig,
  createCeilingLightTemplate,
  createDeskLamps,
  playModelAnimations,
} from "~/game/interior/lightingProps";
import {
  DEFAULT_MODEL_SCALE,
  MAX_MODEL_SCALE,
  MIN_MODEL_SCALE,
} from "~/game/propTuning";
import {
  BUILTIN_ARCADE_CABINET_ASSET_ID,
  BUILTIN_CEILING_LIGHT_ASSET_ID,
  BUILTIN_CRT_TV_ASSET_ID,
  BUILTIN_TRASH_CAN_ASSET_ID,
} from "~/game/propAssetIds";
import {
  BUILTIN_SPAWNABLE_PROP_ASSETS,
  TEMPLATE_SPAWNED_BUILTIN_ASSET_IDS,
  placeClonedTemplateObject,
  PropTemplateCache,
  type BuiltinSpawnablePropAsset,
  type SpawnablePropAsset,
} from "~/game/propTemplates";
import {
  clampUnit,
  dotWithPhysicsQuaternion,
  hashString,
} from "~/game/mathHelpers";
import {normalizePosterRotation} from "~/game/wallDecorTuning";
import {
  createBook,
  faceDisplayShelfId,
  faceDisplayShelfOffset,
  type BookRecord,
  type RetainedBookGameplay,
} from "~/game/bookFactory";
import {
  BOOK_HEIGHT,
  BOOK_UNDER_SHELF_RECOVERY_Y,
  BOOK_VOID_RECOVERY_Y,
} from "~/game/bookTuning";
import {
  DiscardBin,
  TRASH_CAN_HEIGHT,
  TRASH_CAN_PROP_ID,
} from "~/game/discardBin";
import {ArtFrameTextureCache} from "~/game/artFrameTextureCache";
import type {DigitalArtFramePasteTarget} from "~/game/artFrameSystem";
import {ArtFrameSystem} from "~/game/artFrameSystem";
import {BookTextureRuntime} from "~/game/bookTextureRuntime";
import {
  GameStateEmitter,
  type GameSnapshotInput,
} from "~/game/gameStateEmitter";
import {createWorldSave} from "~/game/worldSaveSnapshot";
import {TvVideoImporter} from "~/game/tvVideoImporter";
import {PosterSystem} from "~/game/posters/PosterSystem";
import {
  createHallwayDoor,
  createRareRoom,
  DoorSystem,
  type CreateSpineShelfFixture,
} from "~/game/interior/doors";
import {
  createSignVisual,
  shopSignKey,
  SIGN_TEXTURE_MAX_ANISOTROPY,
  ShopSignSystem,
  type ShopSignEditRequest,
  type ShopSignKind,
} from "~/game/signs/ShopSignSystem";
import {
  type MovablePropRegistration,
  type PropMaterialSwap,
  type ReadingFurnitureMaterials,
} from "~/game/propRegistration";
import {
  INSPECTION_ACTION_CLOSE_SPEED,
  INSPECTION_COVER_ANIMATION_SPEED,
  INSPECTION_FRAME_FILL,
  INSPECTION_LIGHTING_BLEND_SPEED,
  INSPECTION_OPEN_ANGLE,
  INSPECTION_OPENING_DELAY_SECONDS,
  INSPECTION_PAGE_DEFORMATION,
  INSPECTION_PAGE_DRAG_FOLLOW_SPEED,
  INSPECTION_PAGE_GUTTER,
  INSPECTION_PAGE_TURN_SPEED,
  INSPECTION_READER_EMISSIVE,
  INSPECTION_READER_EMISSIVE_INTENSITY,
  INSPECTION_SURFACE_GAP,
  INSPECTION_TRANSITION_POSITION_EPSILON_SQ,
  INSPECTION_TRANSITION_ROTATION_EPSILON,
  INSPECTION_TRANSITION_SPEED,
  invertPageTurnEasing,
  SHELF_BROWSE_INTERVAL_MS,
  SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS,
  SHELF_PREVIEW_PULL_END,
  SHELF_PREVIEW_ROTATION_SPEED,
  SHELF_PREVIEW_ROTATION_START,
  SHELF_PREVIEW_SPEED,
  SHELF_PREVIEW_TRANSLATION_SPEED,
  SHELF_RETURN_CLOSE_HANDOFF_ANGLE,
  SHELF_RETURN_ROTATION_HANDOFF_EPSILON,
} from "~/game/bookInspectionTuning";
import {
  DIGITAL_ART_FRAME_INTERVALS,
  MAX_POSTER_HEIGHT,
  MIN_POSTER_HEIGHT,
  POSTER_INTERACTION_DISTANCE,
  POSTER_SURFACE_OFFSET,
  POSTER_WHEEL_ROTATION_STEP,
} from "~/game/wallDecorTuning";
import {FpsHud} from "~/game/FpsHud";

import {artFrameChannelId, type ArtFrameImage} from "~/artFrames/protocol";
import {describeKeyboardEvent} from "~/arcade/emulatorHost";
import {findArcadeSystem} from "~/arcade/systems";
import floorAlbedoUrl from "~/assets/materials/laminate-floor-albedo.webp";
import floorNormalUrl from "~/assets/materials/laminate-floor-normal.webp";
import floorSurfaceUrl from "~/assets/materials/laminate-floor-surface.webp";
import moonriseSkyUrl from "~/assets/materials/qwantani-moonrise-sky.webp";
import crtTvModelUrl from "~/assets/models/crt-tv.glb?url";
import trashCanModelUrl from "~/assets/models/trash_can.glb?url";
import type {CatalogAtlases, CatalogIdentity, CatalogItem} from "~/catalog";
import {bookDropPosition} from "~/game/bookDropPlacement";
import {physicalBookWidth} from "~/game/bookDimensions";
import {type UiMode} from "~/game/uiMode";
import {
  ARCADE_CABINET_HEIGHT,
  ShopArcadeCabinet,
  type ArcadeSessionStatus,
  type ShopArcadePlayRequest,
} from "~/game/ShopArcadeCabinet";
import {PageTextureCache} from "~/game/PageTextureCache";
import {ShopAudioManager} from "~/game/ShopAudioManager";
import {
  findModelTelevisionScreen,
  getInitialModelAnimationIndex,
} from "~/game/modelTelevision";
import {
  applyCeilingShapeUv,
  createCeilingMaterial,
} from "~/game/ceilingMaterials";
import {createWallpaperMaterial} from "~/game/wallpaperMaterials";
import {
  getPageBlockSplit,
  writeActiveLeafDeformation,
  writeActiveLeafPositions,
  type ActiveLeafDeformationTarget,
  type ActiveLeafVertex,
} from "~/game/PageTurnGeometry";
import {
  clampLookDeltaMagnitude,
  dampLookAngles,
  DEFAULT_PITCH_LIMIT,
  getPlanarMovement,
  isPlausiblePointerMovement,
  isPointInsideShopObstacle,
  resolvePlayerGrounded,
  resolveShopMovement,
  transitionBookInteraction,
  updateLookAngles,
  type LookAngles,
  type PlanarMovementInput,
  type PlanarPoint,
  type ShopCollisionWorld,
} from "~/game/shopGameplay";
import {keyboardLayoutEntry, readKeyboardLayout} from "~/game/keyboardLayout";
import {
  loadShortcuts,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/input/bindings";
import {InputManager, type InputMode} from "~/game/input/inputManager";
import {
  loadPadMappingOverrides,
  padForwardEvent,
  type ArcadePadMappingOverrides,
} from "~/arcade/controllerMappings";
import {type InteractionPromptToken} from "~/game/input/hints";
import {
  SHOP_ATRIUM,
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
  SHOP_UPPER_FLOOR_Y,
  SHOP_STAIR_ROOM,
} from "~/game/shopExpansionLayout";
import {
  findAdjacentShelfBook,
  insertSpineShelfBook,
  spineShelfBookNormalOffset,
  ShelfPresentation,
  type SpineShelfPlacement,
} from "~/game/shelfPlacement";
import {
  FACE_OUT_DISPLAY,
  READING_FURNITURE_BOXES,
  SHOP_BOUNDS,
  FACE_DISPLAY_COLUMNS,
  RARE_ROOM_CENTER_X,
  RARE_ROOM_CENTER_Z,
  FACE_DISPLAY_ROWS,
  FACE_SHELF_ID,
  FACE_DISPLAY_COLUMN_SPACING,
  SHOP_INTERIOR_FOOTPRINTS,
  SHOP_MODEL_TELEVISION_SCALE,
  SHOP_MODEL_TELEVISION_SIZE,
  SHOP_STAIR_LOWER_FLIGHT_CENTER_Z,
  SHOP_STAIR_OPENING_WIDTH,
  SPINE_SHELF_BACKING_THICKNESS,
} from "~/game/shopLayout";
import {
  ShopPhysicsWorld,
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  type BookPhysicsPose,
  type MutableBookPhysicsTransform,
  type MutablePlayerMovement,
} from "~/game/ShopPhysicsWorld";
import {
  CRT_TV_SAFE_AREA,
  ShopTelevision,
  type ShopTelevisionInteraction,
} from "~/game/ShopTelevision";
import type {ShopMediaCatalog} from "~/game/shopMediaCatalog";
import type {ModelAsset} from "~/models/protocol";
import {
  INITIAL_WORLD_SEEDING_VERSION,
  MAX_CARRIED_BOOKS,
  WORLD_SEEDING_VERSION,
  worldSaveCanReconcileCatalog,
  worldSaveMatchesCatalog,
  worldSaveSeedingVersion,
  type WorldBookSave,
  type WorldModelPropSave,
  type WorldPropSave,
  type WorldQuaternion,
  type WorldSaveV1,
  type WorldTelevisionChannels,
  type WorldTelevisionVolumes,
} from "~/game/worldSave";
import {createWoodMaterial, loadWoodTextures} from "~/game/woodMaterials";
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
  type TvChannel,
  tvChannelId,
  tvVideoImportUrl,
  type TvVideo,
} from "~/tv/protocol";
import type {PosterAsset} from "~/posters/protocol";

const FACE_SHELF_SLOT_COUNT = FACE_DISPLAY_COLUMNS * FACE_DISPLAY_ROWS;
const FACE_DISPLAY_SHELF_HALF_WIDTH = 4.4;
const FACE_DISPLAY_SHELF_INSET = 0.15;
const FACE_DISPLAY_SHELF_FRONT_Z = -9.54;
const SHOP_PLAYER_START_X = 0;
const SHOP_PLAYER_START_Z = 25;
const SPINE_SHELF_GAP = 0.018;
const TELEVISION_TABLE_SHELF_BACK_INSET = 0.91;
const HELD_BOOK_STACK_GAP = 0.012;
const HELD_BOOK_FAN_X_SPACING = 0.105;
const HELD_BOOK_FAN_Y_SPACING = 0.008;
const HELD_BOOK_FAN_ANGLE = 0.1;
const MAX_PIXEL_RATIO = 2;
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
const SIGN_INTERACTION_DISTANCE = 3.4;
const TELEVISION_INTERACTION_DISTANCE = 3.6;
const ARCADE_INTERACTION_DISTANCE = 3.4;
// Each entry places one cabinet (model screen faces +Z; rotationY flips it
// toward the shop interior). Add entries to open more arcade lanes. The
// origin is the model center, so the lane spawns half a height above floor.
const ARCADE_CABINET_PLACEMENTS: readonly {
  position: readonly [number, number, number];
  rotationY: number;
}[] = [{position: [2.7, ARCADE_CABINET_HEIGHT / 2, 16.2], rotationY: Math.PI}];
const MOVABLE_PROP_INTERACTION_DISTANCE = 4;
const SHOP_MEDIA_CATALOG_REFRESH_INTERVAL_MS = 10_000;
const TV_WHEEL_SCRUB_RESET_MS = 900;
const TV_WHEEL_SCRUB_STEPS_SECONDS = [3, 5, 10, 15, 30] as const;
const TELEVISION_TABLE_SHELF_ID = "television-table:lower";
const MODEL_TELEVISION_PHYSICS_ID = "crt-television";
// A content model whose GLB contains a node with this name spawns as a
// television: the node's first mesh becomes the video screen.
const MODEL_TELEVISION_SCREEN_NODE_NAME = "TVScreen";
const MODEL_TELEVISION_DENSITY = 60;
const FIXED_TELEVISION_SAVE_ID = "fixed";
const DISCARD_TOSS_DURATION_SECONDS = 0.52;
const SHELVE_BOOK_DURATION_SECONDS = 0.34;
const LOOK_SENSITIVITY = 0.0021;
/** Gamepad look speed in equivalent mouse pixels per second at full deflection. */
const GAMEPAD_LOOK_SPEED = 700;

const LOOK_SMOOTHING = 32;
const MAX_LOOK_DELTA_PER_FRAME = (Math.PI / 180) * 10;
const WORLD_SAVE_INTERVAL_MS = 10_000;
const WORLD_SAVE_IDLE_TIMEOUT_MS = 250;
// Late async prop models (CRT GLBs, cabinets, lamps) usually finish well
// within this window; the second compile pass sweeps up their programs.
const SHADER_PRECOMPILE_LATE_DELAY_MS = 4_000;
// While the camera holds still, the aim sweep reuses its previous result
// and refreshes at this interval so dynamic content cannot stale-highlight.
// The full-shop reticle sweep runs on a fixed-rate budget (60 Hz) instead
// of every animation tick; highlight prompts and clicks tolerate a frame
// or two of latency, and the sweep costs real time against many props.
const AIM_SWEEP_MIN_INTERVAL_MS = 1000 / 60;
/** Extra reach margin so culling never drops a bank the ray could graze. */
const SHELF_HOVER_CULL_MARGIN = 1.5;
const DISCARD_TARGETED_EMISSIVE = new Color("#ff3524");
const DISCARD_TARGETED_EMISSIVE_INTENSITY = 0.95;
const CARRIED_PROP_OPACITY = 0.32;
const PROP_MAX_PROJECTION_DISTANCE = 6;
const PROP_MIN_PROJECTION_DISTANCE = 0.9;
const PROP_PLACEMENT_GRID_SIZE = 0.25;
const PROP_PLACEMENT_HEIGHT_STEP = 0.125;
const PROP_ROTATION_SNAP_STEP = MathUtils.degToRad(15);
const PROP_WHEEL_ROTATION_STEP = MathUtils.degToRad(5);
const PROP_SUPPORT_SNAP_DISTANCE = 0.65;
const MIN_MODEL_COLLIDER_DIMENSION = 0.02;
const MAX_USER_MODEL_PROP_COUNT = 512;
/** Footprint box of the height-normalized cabinet model before scaling. */
const ARCADE_CABINET_BASE_SIZE = {
  depth: 0.7,
  height: ARCADE_CABINET_HEIGHT,
  width: 0.84,
} as const;
const ARCADE_CABINET_DENSITY = 45;
const ARCADE_CABINET_HELD_LOCAL_POSITION = new Vector3(0, -0.42, -2.2);
const IDENTITY_WORLD_QUATERNION: WorldQuaternion = Object.freeze({
  w: 1,
  x: 0,
  y: 0,
  z: 0,
});
const CEILING_LIGHT_COLUMNS = [-7, 0, 7] as const;
const CEILING_LIGHT_ROWS = [-7, -1.5, 4, 9.5, 15, 20.5, 26] as const;
/**
 * Where ceiling-light props hang: the prop origin sits at the housing
 * center, matching the pre-seeding hard-wired fixture height.
 */
const CEILING_LIGHT_ORIGIN_Y = 4.47;
/** Downward offset from the prop origin to the spotlight emitter. */

type CeilingLightPlacement = {rotationY: number; x: number; z: number};

const CEILING_LIGHT_PLACEMENTS: readonly CeilingLightPlacement[] = [
  ...CEILING_LIGHT_COLUMNS.flatMap((x) =>
    CEILING_LIGHT_ROWS.filter((z) => !(x > 0 && z === -7)).map((z) => ({
      rotationY: 0,
      x,
      z,
    })),
  ),
  {
    rotationY: Math.PI / 2,
    x: RARE_ROOM_CENTER_X,
    z: RARE_ROOM_CENTER_Z,
  },
];
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

type SpineShelfDefinition = {
  axis: Vector3;
  backInset: number;
  faceInset: number;
  faceTilt: number;
  frontCenter: Vector3;
  halfWidth: number;
  id: string;
  normal: Vector3;
  signKey?: string;
};

export type ShelfTargetSelection = {
  offset: number;
  placements?: readonly SpineShelfPlacement[];
  presentation: ShelfPresentation;
  shelfId: string;
  slotIndex: number;
};

export type MovablePropRecord = {
  currentPosition: Vector3;
  currentRotation: Quaternion;
  /** Pinned in place: fixed body, immune to bumps, still collides. */
  locked: boolean;
  // Explicitly cleared back to undefined on cancel, so these slots honestly
  // admit undefined under exactOptionalPropertyTypes.
  placementStartPosition?: Vector3 | undefined;
  placementStartRotation?: Quaternion | undefined;
  placementStartScale?: number | undefined;
  ghostMaterialSwaps: PropMaterialSwap[];
  halfDepth: number;
  halfHeight: number;
  halfWidth: number;
  heldLocalPosition: Vector3;
  id: string;
  label: string;
  modelAnimationIndex?: number;
  modelAnimations?: readonly AnimationClip[];
  modelAsset?: ModelAsset;
  modelBaseSize?: Vector3;
  modelMixer?: AnimationMixer;
  modelScale?: number;
  object: Object3D;
  placementSupport: Object3D;
  rotationSnapStep: number;
  spawnAssetId?: string;
  spawned: boolean;
};

type PropPlacementSupport = {
  bounds?: Box3;
  object?: Object3D;
  owner?: MovablePropRecord;
};

type ModelTemplate = {
  animations: readonly AnimationClip[];
  center: Vector3;
  normalizationScale: number;
  scene: Object3D;
  size: Vector3;
};

export type ModelPlacementSession = {
  assetIndex: number;
  id: string;
  revision: number;
};

type DiscardAnimation = {
  elapsedSeconds: number;
  publicationId: string;
  startPosition: Vector3;
  startRotation: Quaternion;
};

export type ShelveAnimation = {
  elapsedSeconds: number;
  placements: readonly SpineShelfPlacement[] | undefined;
  publicationId: string;
  shelfId: string;
  startPosition: Vector3;
  startRotation: Quaternion;
  targetPosition: Vector3;
  targetRotation: Quaternion;
};

export type InspectionCloseAction = "drop" | "return" | "throw";

export type InspectionMode = "closing" | "none" | "spread";

type InspectionShelfReturnPhase = "close" | "rotate" | "translate";

export type ShopInteraction = {
  /** Display string for keyboard users; also used as the aria label. */
  key: string;
  label: string;
  /**
   * Action refs aligned with the " / " alternatives of `key`. While a
   * controller is active, prompts are derived from their pad bindings.
   */
  actions?: readonly (ShortcutAction | undefined)[];
  /**
   * Pad prompt tokens present only while a controller is active; renderers
   * fall back to plain keycaps when omitted.
   */
  prompts?: readonly InteractionPromptToken[];
};

export type ShopGameSnapshot = {
  interactionContext?: string;
  interactions?: readonly ShopInteraction[];
  carriedBookCount?: number;
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
  modelCount?: number;
  modelImportError?: string;
  modelPlacementActive?: boolean;
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
  /** Session state of the cabinet driving the arcade UI; absent when idle. */
  arcadeStatus?: ArcadeSessionStatus;
  arcadeCabinetId?: string;
  arcadeSystemId?: string;
  arcadeDetail?: string;
  arcadeRomName?: string;
  prompt?: string;
  shelvedCount: number;
  throwCharge?: number;
};

export type ShopSceneOptions = {
  canvas: HTMLCanvasElement;
  catalogAtlases: () => CatalogAtlases;
  catalogAvailable: () => boolean;
  catalogIdentity: () => CatalogIdentity;
  catalogItems: () => readonly CatalogItem[];
  initialWorldSave?: WorldSaveV1;
  worldSaveWritable: () => boolean;
  initialPageIndex?: (publicationId: string) => number;
  importArtFrameImage?: (
    image: Blob,
    channelId: string,
    signal: AbortSignal,
  ) => Promise<ArtFrameImage>;
  loadMediaCatalog?: (signal: AbortSignal) => Promise<ShopMediaCatalog>;
  importPoster?: (image: Blob, signal: AbortSignal) => Promise<PosterAsset>;
  importTvVideo?: (
    url: string,
    channelId: string,
    signal: AbortSignal,
  ) => Promise<TvVideo>;
  mouseSensitivity?: () => number;
  /** Multiplier on the base right-stick look speed. */
  gamepadLookSensitivity?: () => number;
  newPublicationIds?: () => readonly string[];
  tvScreenLighting?: () => boolean;
  onDiscardPublication?: (publicationId: string) => Promise<boolean>;
  onMediaChannelCreateRequest?: (kind: "art-frame" | "tv") => void;
  onGameStateChange?: (snapshot: ShopGameSnapshot) => void;
  onPageIndexChange?: (publicationId: string, pageIndex: number) => void;
  onSignEditRequest?: (request: ShopSignEditRequest) => void;
  onTextPaste?: (text: string) => boolean | Promise<boolean>;
  onWorldSave?: (save: WorldSaveV1) => boolean | void | Promise<boolean | void>;
  selectedPublicationId: () => string | null | undefined;
  onSelectPublication: (publicationId: string) => void;
  onReady?: () => void;
  paused?: () => boolean;
  /** Live shortcuts config; defaults are used when omitted. */
  shortcutsConfig?: () => ShortcutsConfig;
  /** Live per-system emulator pad-mapping overrides; defaults when omitted. */
  padMappingOverrides?: () => ArcadePadMappingOverrides;
  /** Fired when the gamepad requests opening the pause menu. */
  onPauseRequest?: () => void;
  /** Fired when the gamepad requests closing the pause menu. */
  onResumeRequest?: () => void;
  /** Current exclusive input owner; rows are dropped for other modes. */
  mode?: () => UiMode;
};

type ShopPerformanceDebugHandle = {
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  scene: Scene;
};

type ShopPerformanceDebugWindow = Window & {
  __AFTERLEAF_PERFORMANCE_DEBUG__?: ShopPerformanceDebugHandle;
};

/**
 * Dot product against the physics world's plain quaternion record, avoiding a
 * Quaternion allocation that `Quaternion.dot` would otherwise require.
 */

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
  readonly #fpsHud = new FpsHud();
  readonly #booksById = new Map<string, BookRecord>();
  readonly #camera = new PerspectiveCamera(48, 1, 0.1, 45);
  readonly #canvas: HTMLCanvasElement;
  readonly #catalogAvailable: () => boolean;
  readonly #catalogIdentity: () => CatalogIdentity;
  readonly #catalogItems: () => readonly CatalogItem[];
  readonly #heldLocalPosition = new Vector3(0.5, -0.36, -1.08);
  readonly #heldBookFanAxis = new Vector3(0, 0, 1);
  readonly #heldBookFanRotation = new Quaternion();
  readonly #heldBookLocalPoseRotation = new Quaternion();
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
  readonly #loadMediaCatalog: (
    signal: AbortSignal,
  ) => Promise<ShopMediaCatalog>;
  readonly #signs: ShopSignSystem;
  readonly #discardBin: DiscardBin;
  readonly #doors: DoorSystem;
  readonly #posters: PosterSystem;
  readonly #artFrames: ArtFrameSystem;
  readonly #tvVideos: TvVideoImporter;
  readonly #artFrameTextures: ArtFrameTextureCache;
  readonly #bookTextures: BookTextureRuntime;
  readonly #gameStateEmitter = new GameStateEmitter();
  readonly #snapshotInput: GameSnapshotInput;
  readonly #input: InputManager;
  readonly #getShortcuts: () => ShortcutsConfig;
  readonly #getPadMappingOverrides: () => ArcadePadMappingOverrides;
  readonly #onPauseRequest: (() => void) | undefined;
  readonly #onResumeRequest: (() => void) | undefined;
  readonly #keyboardLayout = new Map<string, string>();
  readonly #lookAngles: LookAngles = {pitch: 0, yaw: 0};
  readonly #lookDelta: LookAngles = {pitch: 0, yaw: 0};
  readonly #lookTarget: LookAngles = {pitch: 0, yaw: 0};
  readonly #markTelevisionSettingChanged = () => {
    this.#worldStateDirty = true;
  };
  readonly #movementDelta: PlanarPoint = {x: 0, z: 0};
  readonly #movementInput: PlanarMovementInput = {forward: 0, right: 0};
  readonly #movementPosition: PlanarPoint = {x: 0, z: 0};
  readonly #movableProps = new Map<string, MovablePropRecord>();
  readonly #movablePropTargetMeshes: Mesh[] = [];
  readonly #televisionProps = new Map<ShopTelevision, MovablePropRecord>();
  readonly #televisionsBySaveId = new Map<string, ShopTelevision>();
  // Every placed cabinet runs its own session; the "active" one is the
  // cabinet whose UI (picker or game) the player is currently driving.
  readonly #arcadeCabinets: ShopArcadeCabinet[] = [];
  readonly #arcadeProps = new Map<ShopArcadeCabinet, MovablePropRecord>();
  #targetedArcadeCabinet: ShopArcadeCabinet | undefined;
  #activeArcadeCabinet: ShopArcadeCabinet | undefined;
  readonly #arcadeAimTarget = new Vector3();
  readonly #mouseSensitivity: () => number;
  readonly #gamepadLookSensitivity: () => number;
  readonly #newPublicationIds: () => readonly string[];
  readonly #tvScreenLighting: () => boolean;
  readonly #nextLookAngles: LookAngles = {pitch: 0, yaw: 0};
  readonly #onDiscardPublication:
    | ((publicationId: string) => Promise<boolean>)
    | undefined;
  readonly #onMediaChannelCreateRequest:
    | ((kind: "art-frame" | "tv") => void)
    | undefined;
  readonly #onGameStateChange:
    | ((snapshot: ShopGameSnapshot) => void)
    | undefined;
  readonly #onPageIndexChange:
    | ((publicationId: string, pageIndex: number) => void)
    | undefined;
  readonly #onSelectPublication: (publicationId: string) => void;
  readonly #onWorldSave:
    | ((save: WorldSaveV1) => boolean | void | Promise<boolean | void>)
    | undefined;
  readonly #observedArrivalIds = new Set<string>();
  readonly #paused: () => boolean;
  readonly #mode: (() => UiMode) | undefined;
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
  readonly #posterRaycastMeshes: Mesh[] = [];
  readonly #modelMixers = new Set<AnimationMixer>();
  readonly #modelTemplatePromises = new Map<string, Promise<ModelTemplate>>();
  readonly #builtinPropTemplates = new PropTemplateCache();
  readonly #propSupportBounds = new Box3();
  readonly #propPlacementSupports: PropPlacementSupport[] = [];
  readonly #raycaster = new Raycaster();
  readonly #reticle = new Vector2();
  /** Frame timestamp from the animation loop; one time source per frame. */
  #frameNowMs = 0;
  #lastAimSweepTimeMs = -Infinity;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
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
  /**
   * Lazily initialized because support detection needs the renderer. Serves
   * the basis transcoder from the committed public/basis/ directory.
   */
  #ktx2Loader: KTX2Loader | undefined;
  readonly #televisions: ShopTelevision[] = [];
  readonly #televisionTargetPosition = new Vector3();
  readonly #televisionTargetScale = new Vector3();
  readonly #trashTossTarget = new Vector3();
  readonly #trashTossRotation = new Quaternion().setFromEuler(
    new Euler(-Math.PI / 2, 0.45, Math.PI * 0.5),
  );
  readonly #throwAngularVelocity = new Vector3(2.8, 4.5, 1.9);
  readonly #throwVelocity = new Vector3();
  readonly #upAxis = new Vector3(0, 1, 0);
  readonly #viewDirection = new Vector3();

  #carriedProp: MovablePropRecord | undefined;
  readonly #carriedPublicationIds: string[] = [];
  #carriedPublicationId: string | undefined;
  #discardAnimation: DiscardAnimation | undefined;
  #shelveAnimation: ShelveAnimation | undefined;
  #discardBusy = false;
  #discardError: string | undefined;
  readonly #discardedPublicationIds = new Set<string>();
  #disposed = false;
  #stagedBootStarted = false;
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
  #inspectionQueuedTurn: ReaderNavigation | undefined;
  #inspectionHeldNavigation: ReaderNavigation | undefined;
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
  #lastItems: readonly CatalogItem[] | undefined;
  #lastNewPublicationIds: readonly string[] | undefined;
  #pendingDiscardPublicationId: string | undefined;
  #lastPixelRatio = 0;
  #lastSelectedPublicationId: string | null | undefined;
  #moonEnvironment: Texture | undefined;
  #customModelAssets: readonly ModelAsset[] = [];
  #spawnablePropAssets: readonly SpawnablePropAsset[] =
    BUILTIN_SPAWNABLE_PROP_ASSETS;
  #spawnablePropAssetIndex = 0;
  #modelImportError: string | undefined;
  #modelPlacement: ModelPlacementSession | undefined;
  #modelPlacementRevision = 0;
  #modelRestoreActive = false;
  /** A builtin template landed while a restore pass was running. */
  #modelRestoreRetry = false;
  /** Missing prop assets already reported so each warns only once. */
  readonly #missingPropAssetIds = new Set<string>();
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
  #mediaCatalogRefreshHandle: number | undefined;
  #lateShaderPrecompileHandle: number | undefined;
  #mediaCatalogRequestPending = false;
  #pendingModelPropSaves: readonly WorldModelPropSave[] = [];
  #pendingPropSaves = new Map<string, WorldPropSave>();
  #propPlacementDistance = 2;
  #propPlacementRotationSnapOrigin = 0;
  #propPlacementSnapping = true;
  #propPlacementYaw = 0;
  #pendingPointerMovementX = 0;
  #pendingPointerMovementY = 0;
  #pendingWorldSave: WorldSaveV1 | undefined;
  #ready = false;
  #resizeDirty = true;
  #resizeObserver: ResizeObserver | undefined;
  #shelfTargeted = false;
  #shelfTargetSelection: ShelfTargetSelection | undefined;
  #shelfPresentation: ShelfPresentation = "spine";
  readonly #shelfHoverMeshesByShelf = new Map<string, Mesh[]>();
  readonly #ungroupedShelfHoverMeshes: Mesh[] = [];
  readonly #shelfHoverSweepScratch: Mesh[] = [];
  /** Camera pose at the last completed reticle sweep. */
  readonly #lastSweepPosition = new Vector3();
  readonly #lastSweepQuaternion = new Quaternion();
  /**
   * Forces the next reticle sweep even when the camera has not moved, set
   * whenever targetable scene content changes (books reshelved, props moved).
   */
  #interactionTargetsDirty = true;
  #shelfBrowsePublicationId: string | undefined;
  #shelfBrowseReadyAt = 0;
  #channelEditorDigitalArtFrameId: string | undefined;
  #channelEditorTelevision: ShopTelevision | undefined;
  #targetedProp: MovablePropRecord | undefined;
  #televisionInteraction: ShopTelevisionInteraction | undefined;
  #televisionTargeted = false;
  #targetedTelevision: ShopTelevision | undefined;
  #tvWheelScrubDirection: -1 | 1 | undefined;
  #tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
  #tvWheelScrubStepIndex = 0;
  #tvChannels: readonly TvChannel[] = [];
  #televisionTableMaterial: MeshStandardMaterial | undefined;
  #savedTelevisionChannels: WorldTelevisionChannels = {};
  #savedTelevisionVolumes: WorldTelevisionVolumes = {};
  #trashTargeted = false;
  #targetedTrashBinId: string | undefined;
  #throwChargeActive = false;
  #throwChargeBucket = -1;
  #throwChargeSeconds = 0;
  #viewportHeight = 1;
  #viewportWidth = 1;
  #worldSaveIdleHandle: number | undefined;
  #worldSaveIntervalHandle: number | undefined;
  #worldSavePending: Promise<void> | undefined;
  #worldStateDirty = false;
  readonly #worldSaveWritable: () => boolean;

  constructor(options: ShopSceneOptions) {
    this.#canvas = options.canvas;
    this.#catalogAtlases = options.catalogAtlases;
    this.#catalogAvailable = options.catalogAvailable;
    this.#catalogIdentity = options.catalogIdentity;
    this.#catalogItems = options.catalogItems;
    this.#newPublicationIds = options.newPublicationIds ?? (() => []);
    this.#initialPageIndex = options.initialPageIndex ?? (() => 0);
    this.#importPoster = options.importPoster;
    this.#importArtFrameImage = options.importArtFrameImage;
    this.#onTextPaste = options.onTextPaste;
    this.#loadMediaCatalog =
      options.loadMediaCatalog ??
      (() =>
        Promise.resolve({
          artFrames: {channels: []},
          models: {models: []},
          posters: {posters: []},
          tv: {channels: []},
        }));
    this.#mouseSensitivity = options.mouseSensitivity ?? (() => 1);
    this.#gamepadLookSensitivity = options.gamepadLookSensitivity ?? (() => 1);
    this.#tvScreenLighting = options.tvScreenLighting ?? (() => false);
    this.#mode = options.mode;
    this.#selectedPublicationId = options.selectedPublicationId;
    this.#onSelectPublication = options.onSelectPublication;
    this.#onDiscardPublication = options.onDiscardPublication;
    this.#onMediaChannelCreateRequest = options.onMediaChannelCreateRequest;
    this.#onGameStateChange = options.onGameStateChange;
    this.#onPageIndexChange = options.onPageIndexChange;
    this.#onWorldSave = options.onWorldSave;
    this.#worldSaveWritable = options.worldSaveWritable;
    this.#pendingWorldSave = options.initialWorldSave;
    this.#savedTelevisionChannels =
      options.initialWorldSave?.televisionChannels ?? {};
    this.#savedTelevisionVolumes =
      options.initialWorldSave?.televisionVolumes ?? {};
    this.#onReady = options.onReady;
    this.#paused = options.paused ?? (() => false);
    this.#onResumeRequest = options.onResumeRequest;
    this.#onPauseRequest = options.onPauseRequest;
    // The fallback config is read once; callers pass a live accessor when
    // rebinding from the menu should apply without rebuilding the scene.
    const fallbackShortcuts = loadShortcuts();
    this.#getShortcuts = options.shortcutsConfig ?? (() => fallbackShortcuts);
    this.#getPadMappingOverrides =
      options.padMappingOverrides ?? loadPadMappingOverrides;
    this.#input = new InputManager({
      getShortcuts: this.#getShortcuts,
      handleAction: (action, phase) => {
        if (phase === "up") return this.#handleActionUp(action);
        return this.#handleActionDown(action);
      },
      // While menus or dialogs own the page, bound keys must not swallow
      // typing or scrolling.
      isActive: () => !this.#paused(),
      onMenuToggle: () => {
        if (this.#paused()) this.#onResumeRequest?.();
        else this.#onPauseRequest?.();
      },
      onKeyEvent: (event) => this.#observeKeyboardEvent(event),
    });
    this.#input.setKeyboardInterceptor((event) =>
      this.#forwardArcadeKey(event),
    );
    this.#input.setRawGamepadForward((name, down) => {
      const cabinet =
        this.#activeArcadeCabinet?.sessionStatus === "playing"
          ? this.#activeArcadeCabinet
          : undefined;
      if (!cabinet) return;
      // Resolve against the playing session's system so each console gets
      // its own pad layout; unmapped buttons simply forward nothing.
      const systemId = cabinet.sessionSystemId;
      if (!systemId) return;
      const system = findArcadeSystem(systemId);
      if (!system) return;
      const keyEvent = padForwardEvent(
        system.id,
        name,
        this.#getPadMappingOverrides(),
      );
      if (!keyEvent) return;
      cabinet.forwardKey(down, keyEvent);
    });

    this.#renderer = new WebGLRenderer({
      antialias: true,
      canvas: this.#canvas,
      powerPreference: "high-performance",
    });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    // Deliberate shadow story: no light casts shadows today, so shadow
    // mapping stays off. Mesh cast/receive flags are preserved so wiring a
    // caster later is a one-flag change.
    this.#renderer.shadowMap.enabled = false;
    this.#renderer.shadowMap.type = PCFSoftShadowMap;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.08;

    this.#signs = new ShopSignSystem({
      maxTextureAnisotropy: this.#renderer.capabilities.getMaxAnisotropy(),
      onEditRequest: options.onSignEditRequest,
      releasePointerLock: () => this.#releasePointerLock(),
    });

    this.#artFrameTextures = new ArtFrameTextureCache({
      isDisposed: () => this.#disposed,
      renderer: this.#renderer,
      textureLoader: this.#textureLoader,
    });
    this.#bookTextures = new BookTextureRuntime({
      catalogAtlases: () => this.#catalogAtlases(),
      getBooks: () => this.#booksById,
      isDisposed: () => this.#disposed,
      isActiveDetailTarget: (publicationId) =>
        publicationId === this.#hoveredPublicationId ||
        publicationId === this.#lastSelectedPublicationId,
      isBookInFlight: (publicationId) =>
        this.#carriedPublicationIds.includes(publicationId) ||
        publicationId === this.#inspectionPublicationId ||
        publicationId === this.#discardAnimation?.publicationId ||
        publicationId === this.#shelveAnimation?.publicationId,
      isPinnedOrInFlight: (publicationId) =>
        publicationId === this.#hoveredPublicationId ||
        publicationId === this.#lastSelectedPublicationId ||
        this.#carriedPublicationIds.includes(publicationId) ||
        publicationId === this.#inspectionPublicationId ||
        publicationId === this.#discardAnimation?.publicationId,
      maxAnisotropy: () => this.#renderer.capabilities.getMaxAnisotropy(),
      nextFrame: () => ShopScene.nextFrame(),
      renderer: this.#renderer,
      scene: this.#scene,
      textureLoader: this.#textureLoader,
    });
    this.#snapshotInput = {
      activeArcadeCabinet: () => this.#activeArcadeCabinet,
      arcadeProps: () => this.#arcadeProps,
      arcadeStatusForUi: () => this.#arcadeStatusForUi(),
      arcadeSystemIdForUi: () => this.#arcadeSystemIdForUi(),
      artFrames: () => this.#artFrames,
      booksById: () => this.#booksById,
      carriedProp: () => this.#carriedProp,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      discardBusy: () => this.#discardBusy,
      discardError: () => this.#discardError,
      discardedPublicationIds: () => this.#discardedPublicationIds,
      getShortcuts: () => this.#getShortcuts(),
      hoveredPublicationId: () => this.#hoveredPublicationId,
      input: () => this.#input,
      inspectionCloseAction: () => this.#inspectionCloseAction,
      inspectionMode: () => this.#inspectionMode,
      inspectionOpenAngleTarget: () => this.#inspectionOpenAngleTarget,
      inspectionPageIndex: () => this.#inspectionPageIndex,
      inspectionPageLoadCount: () => this.#inspectionPageLoadCount,
      inspectionPublication: () => this.#inspectionPublication(),
      keyboardLayout: () => this.#keyboardLayout,
      mode: () => this.#mode,
      modelAnimationLabel: (record) => this.#modelAnimationLabel(record) ?? "",
      modelImportError: () => this.#modelImportError,
      modelPlacement: () => this.#modelPlacement,
      onGameStateChange: () => this.#onGameStateChange,
      physicsWorld: () => this.#physicsWorld,
      pointerLocked: () => this.#pointerLocked,
      posters: () => this.#posters,
      propPlacementDistance: () => this.#propPlacementDistance,
      propPlacementSnapping: () => this.#propPlacementSnapping,
      shelfPresentation: () => this.#shelfPresentation,
      shelfTargetSelection: () => this.#shelfTargetSelection,
      shelfTargeted: () => this.#shelfTargeted,
      shelveAnimation: () => this.#shelveAnimation,
      signs: () => this.#signs,
      spawnablePropAssets: () => this.#spawnablePropAssets,
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionProps: () => this.#televisionProps,
      televisionTargeted: () => this.#televisionTargeted,
      throwChargeActive: () => this.#throwChargeActive,
      throwChargeProgress: () => this.#throwChargeProgress(),
      trashTargeted: () => this.#trashTargeted,
      tvVideos: () => this.#tvVideos,
    };
    this.#posters = new PosterSystem({
      abortSignal: this.#abortController.signal,
      camera: this.#camera,
      emitGameState: () => this.#emitGameState(),
      importPoster: options.importPoster,
      isDisposed: () => this.#disposed,
      isPointerLocked: () => this.#pointerLocked,
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      maxTextureAnisotropy: this.#renderer.capabilities.getMaxAnisotropy(),
      posterRaycastMeshes: this.#posterRaycastMeshes,
      raycaster: this.#raycaster,
      scene: this.#scene,
      textureLoader: this.#textureLoader,
    });
    this.#tvVideos = new TvVideoImporter({
      abortSignal: this.#abortController.signal,
      emitGameState: () => this.#emitGameState(),
      importTvVideo: options.importTvVideo,
      isDisposed: () => this.#disposed,
    });
    this.#artFrames = new ArtFrameSystem(
      {
        abortSignal: this.#abortController.signal,
        camera: this.#camera,
        emitGameState: () => this.#emitGameState(),
        getPosterSurface: (surfaceId) => this.#posters.surfaces.get(surfaceId),
        hasPosterPlacement: () => this.#posters.placement !== undefined,
        importArtFrameImage: options.importArtFrameImage,
        importPoster: options.importPoster,
        isDisposed: () => this.#disposed,
        isPointerLocked: () => this.#pointerLocked,
        markWorldStateDirty: () => {
          this.#worldStateDirty = true;
        },
        posterRaycastMeshes: this.#posterRaycastMeshes,
        raycaster: this.#raycaster,
        refreshMediaCatalog: () => this.#refreshMediaCatalog(),
        scene: this.#scene,
      },
      this.#artFrameTextures,
    );
    this.#doors = new DoorSystem();
    this.#discardBin = new DiscardBin({
      ghostObject: (object) => this.#ghostObject(object),
      getMovableProp: (id) => this.#movableProps.get(id),
      isCarried: (record) =>
        this.#carriedProp === (record as unknown as MovablePropRecord),
      isDisposed: () => this.#disposed,
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      modelMixers: this.#modelMixers,
      needsSeedPass: (version) => this.#needsSeedPass(version),
      registerMovableProp: (registration) =>
        this.#registerMovableProp(registration as MovablePropRegistration),
      updatePropPose: (id, pose) =>
        this.#physicsWorld.updatePropPose(id, {
          position: pose.position,
          rotation: pose.rotation,
        }),
    });

    if (DEV)
      (window as ShopPerformanceDebugWindow).__AFTERLEAF_PERFORMANCE_DEBUG__ = {
        camera: this.#camera,
        renderer: this.#renderer,
        scene: this.#scene,
      };

    this.#bindInput();
    void this.#loadKeyboardLayout();
    this.#observeSize();
    const unsubscribeFromWidePages = subscribeToWideReaderPages((url) =>
      this.#handleDetectedWidePage(url),
    );
    this.#abortController.signal.addEventListener(
      "abort",
      () => this.#fpsHud.dispose(),
      {once: true},
    );
    this.#abortController.signal.addEventListener(
      "abort",
      unsubscribeFromWidePages,
      {once: true},
    );
  }

  /**
   * Staged boot: the scene configuration, interior build, and initial book
   * sync each run between frame yields so no single task stalls the main
   * thread long enough to trip the compositor. Readiness waits for shader
   * programs (including atlas-batch and television-light variants) to finish
   * compiling behind the loading overlay instead of stutters landing on the
   * first playable frames.
   */
  async start() {
    if (
      this.#disposed ||
      this.#stagedBootStarted ||
      this.#frameHandle !== undefined
    )
      return;
    this.#stagedBootStarted = true;
    const stage = (label: string) => {
      if (DEV) performance.mark(`afterleaf-boot:${label}`);
    };
    stage("configure-scene-start");
    this.#configureScene();
    stage("interior-start");
    await ShopScene.nextFrame();
    if (this.#disposed) return;
    this.#createShopInterior();
    stage("sync-inputs-start");
    await ShopScene.nextFrame();
    if (this.#disposed) return;
    this.#syncInputs();
    void this.#refreshMediaCatalog();
    void this.#initializePhysics();
    this.#lastFrameTime = performance.now();
    this.#applyResize();
    stage("first-render-start");
    this.#renderer.render(this.#scene, this.#camera);
    this.#worldSaveIntervalHandle = window.setInterval(
      this.#scheduleWorldSave,
      WORLD_SAVE_INTERVAL_MS,
    );
    this.#mediaCatalogRefreshHandle = window.setInterval(
      this.#refreshMediaCatalogIfActive,
      SHOP_MEDIA_CATALOG_REFRESH_INTERVAL_MS,
    );
    this.#frameHandle = requestAnimationFrame(this.#animate);
    stage("warm-shaders-start");
    await this.#warmShaderPrograms();
    if (this.#disposed) return;
    stage("ready");
    if (DEV)
      for (const label of [
        "configure-scene",
        "interior",
        "sync-inputs",
        "first-render",
        "warm-shaders",
      ])
        performance.measure(
          `afterleaf-boot:${label}`,
          `afterleaf-boot:${label}-start`,
          `afterleaf-boot:ready`,
        );
    this.#precompileShaders();
    this.#markReady();
  }

  /**
   * Compiles the current shader variants behind the loading overlay: the
   * no-screen-light variants first, then the rect-area-light variant set
   * from exactly one television's four wash lights (forcing every television
   * would multiply light counts into every program and stall compilation).
   * Book textures stream in afterwards by design; the batch program variant
   * is warmed here so attaching batches only uploads textures.
   */
  async #warmShaderPrograms() {
    if (this.#disposed) return;
    // The atlas-batch book material uses its own program cache key and no
    // batch mesh exists until textures stream in after ready, so warm its
    // variant here with a stand-in mesh covering all batch groups.
    const batchMaterialStandIn = new Mesh(
      new BoxGeometry(0.01, 0.01, 0.01),
      createBookExteriorMaterial(new Color("#ffffff"), -1, true, true).material,
    );
    this.#scene.add(batchMaterialStandIn);
    try {
      await this.#renderer.compileAsync(this.#scene, this.#camera);
      // Warm the rect-area-light variant set with exactly ONE television's
      // four wash lights: forcing every television would multiply the light
      // count into every program and stall the machine during compilation.
      // Multi-TV combinations stay lazy (rare, incremental).
      const sampleTelevision = this.#tvScreenLighting()
        ? this.#televisions[0]
        : undefined;
      if (sampleTelevision) {
        sampleTelevision.setScreenLightsForcedVisible(true);
        await this.#renderer.compileAsync(this.#scene, this.#camera);
        sampleTelevision.setScreenLightsForcedVisible(false);
      }
    } catch (error: unknown) {
      // Lazy compilation still works; precompilation is best-effort.
      if (DEV)
        console.warn("Afterleaf could not precompile shader programs.", error);
    } finally {
      this.#scene.remove(batchMaterialStandIn);
      batchMaterialStandIn.geometry.dispose();
      batchMaterialStandIn.material.dispose();
    }
  }

  /**
   * Compiles shader programs ahead of camera movement. Async prop models
   * (CRT televisions, cabinets, lamps) attach after boot, so a second pass
   * runs later to catch their material variants before the player rotates
   * into them and stutters on first sight.
   */
  #precompileShaders() {
    if (this.#disposed) return;
    void this.#renderer.compileAsync(this.#scene, this.#camera).catch(() => {});
    if (this.#lateShaderPrecompileHandle !== undefined) return;
    this.#lateShaderPrecompileHandle = window.setTimeout(() => {
      this.#lateShaderPrecompileHandle = undefined;
      if (this.#disposed) return;
      void this.#warmShaderPrograms();
    }, SHADER_PRECOMPILE_LATE_DELAY_MS);
  }

  requestPointerLock() {
    // Modes stay exclusive: an arcade session owns the cursor until its
    // ladder exits, so external re-lock requests are ignored meanwhile.
    if (this.#disposed || this.#arcadeStatusForUi()) return;
    this.#inputSuspended = false;
    if (this.#inspectionMode === "spread") return;
    this.#requestPointerLock();
  }

  releasePointerLock() {
    if (this.#disposed) return;
    if (this.#inputSuspended) return;
    this.#inputSuspended = true;
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

  /** Boots a ROM on the named cabinet; called by the ROM picker UI. */
  playArcadeRom(cabinetId: string, request: ShopArcadePlayRequest) {
    if (this.#disposed) return;
    const cabinet = this.#arcadeCabinets.find(
      (entry) => entry.id === cabinetId,
    );
    if (!cabinet) return;
    this.#activeArcadeCabinet = cabinet;
    cabinet.play(request);
    this.#emitGameState();
    // Re-capture the cursor on the picker's own click gesture: launching and
    // playing keep it hidden, matching free roam.
    if (!this.#paused()) this.#requestPointerLock();
  }

  /** Playing → back to the ROM picker of the active session. */
  quitActiveArcadeGame() {
    if (this.#disposed) return;
    this.#activeArcadeCabinet?.quitGame();
    this.#emitGameState();
  }

  /**
   * Escape ladder for the UI-active session: a running game steps away from
   * its cabinet (emulation keeps running), an open picker or boot overlay
   * exits entirely. Called by the shared modal stack, which owns Escape
   * routing while a session is active.
   */
  backOutOfArcade() {
    if (this.#disposed) return;
    this.#exitOneArcadeLevel();
  }

  /** Escape ladder body: playing steps away; picker/boot overlays exit. */
  #exitOneArcadeLevel() {
    const cabinet = this.#activeArcadeCabinet;
    if (!cabinet) return;
    if (cabinet.sessionStatus === "playing") this.stepAwayFromArcade();
    else this.exitArcadeUi();
  }

  /**
   * Backs out of any arcade UI: an open picker or a running game closes and
   * the player returns to walking around the shop.
   */
  exitArcadeUi() {
    if (this.#disposed) return;
    const activeCabinet = this.#activeArcadeCabinet;
    this.#activeArcadeCabinet = undefined;
    activeCabinet?.exitToIdle();
    // Any other cabinet left in a UI state closes too; independent cabinets
    // that are actively playing keep running.
    for (const cabinet of this.#arcadeCabinets)
      if (
        cabinet !== activeCabinet &&
        cabinet.sessionStatus &&
        cabinet.sessionStatus !== "playing"
      )
        cabinet.exitToIdle();
    this.#emitGameState();
    // Hand control back immediately (called from an activating gesture such
    // as Escape or the Leave button), mirroring inspection close.
    if (!this.#paused()) this.#requestPointerLock();
  }

  /**
   * Steps away from the active session's UI without stopping emulation: the
   * world unfreezes, keys stop forwarding, and the cabinet keeps playing
   * until the player targets it again (E resumes) or quits through the ROM
   * picker. Pointer lock is held through the whole cycle; if the browser
   * force-released it (Escape), standard click-to-lock recovers.
   */
  stepAwayFromArcade() {
    if (this.#disposed || !this.#activeArcadeCabinet) return;
    this.#activeArcadeCabinet = undefined;
    this.#emitGameState();
  }

  /**
   * Activates a targeted cabinet's UI: a live session reattaches where it
   * left off, a free one opens its ROM picker, and boots in progress stay
   * owned by the surface that started them.
   */
  #enterArcadeBrowsing(cabinet: ShopArcadeCabinet) {
    const status = cabinet.sessionStatus;
    console.warn("[arcade] interact:", cabinet.id, status);
    if (status === "downloading" || status === "launching") return;
    this.#activeArcadeCabinet = cabinet;
    this.#aimCameraAtObject(cabinet.object);
    if (!status) {
      // Only the ROM picker needs a visible cursor; resuming a live session
      // keeps the pointer exactly where walking left it.
      this.#releasePointerLock();
      cabinet.beginBrowsing();
    }
    this.#emitGameState();
  }

  /** Snapshot fields describing the UI-active cabinet's session, if any. */
  #arcadeStatusForUi(): ArcadeSessionStatus | undefined {
    const activeCabinet = this.#activeArcadeCabinet;
    if (!activeCabinet?.sessionStatus) return undefined;
    return activeCabinet.sessionStatus;
  }

  /** System of the ROM most recently played on the UI-active cabinet. */
  #arcadeSystemIdForUi(): string | undefined {
    return this.#activeArcadeCabinet?.sessionSystemId;
  }

  /** Gently turns the player's view toward a cabinet's screen on entry. */
  #aimCameraAtObject(object: Object3D) {
    object.getWorldPosition(this.#arcadeAimTarget);
    // Center-origin model; the screen sits a little above the middle.
    this.#arcadeAimTarget.y += ARCADE_CABINET_HEIGHT * 0.14;
    const deltaX = this.#arcadeAimTarget.x - this.#camera.position.x;
    const deltaY = this.#arcadeAimTarget.y - this.#camera.position.y;
    const deltaZ = this.#arcadeAimTarget.z - this.#camera.position.z;
    const horizontal = Math.hypot(deltaX, deltaZ);
    if (horizontal < Number.EPSILON) return;
    this.#lookTarget.yaw = Math.atan2(-deltaX, -deltaZ);
    this.#lookTarget.pitch = MathUtils.clamp(
      Math.atan2(deltaY, horizontal),
      -DEFAULT_PITCH_LIMIT,
      DEFAULT_PITCH_LIMIT,
    );
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
    this.#inspectionQueuedTurn = undefined;
    this.#inspectionHeldNavigation = undefined;
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
    this.#tvVideos.clearMessageTimer();
    for (const mixer of this.#modelMixers) mixer.stopAllAction();
    this.#modelMixers.clear();
    this.#physicsWorld.dispose();
    for (const television of this.#televisions) television.dispose();
    this.#televisions.length = 0;
    this.#televisionsBySaveId.clear();
    for (const cabinet of this.#arcadeCabinets) cabinet.dispose();
    this.#arcadeCabinets.length = 0;
    this.#arcadeProps.clear();
    this.#targetedArcadeCabinet = undefined;
    this.#activeArcadeCabinet = undefined;
    this.#carriedProp = undefined;
    this.#targetedTelevision = undefined;
    this.#televisionProps.clear();
    this.#audioManager.dispose();
    for (const record of this.#artFrames.records.values())
      record.frame.dispose();
    this.#artFrames.clearRecords();
    this.#artFrames.preview?.dispose();
    this.#artFrames.preview = undefined;
    this.#inspectionPageTextureCache.dispose();
    this.#inspectionTurningBackTexture?.dispose();
    this.#inspectionTurningBackTexture = undefined;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#ktx2Loader?.dispose();
    this.#ktx2Loader = undefined;
    if (this.#frameHandle !== undefined)
      cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = undefined;
    if (this.#mediaCatalogRefreshHandle !== undefined)
      window.clearInterval(this.#mediaCatalogRefreshHandle);
    this.#mediaCatalogRefreshHandle = undefined;
    if (this.#lateShaderPrecompileHandle !== undefined)
      window.clearTimeout(this.#lateShaderPrecompileHandle);
    this.#lateShaderPrecompileHandle = undefined;

    this.#bookTextures.bumpRevision();
    this.#bookTextures.disposeBookAtlasBatches();
    for (const record of this.#booksById.values())
      this.#disposeBookRecord(record);
    this.#booksById.clear();
    this.#bookTextures.clearStandaloneIds();
    this.#interactiveMeshes = [];
    disposeObject(this.#scene);
    this.#scene.clear();
    this.#moonEnvironment?.dispose();
    this.#moonEnvironment = undefined;
    this.#posters.disposePendingTextures();
    this.#artFrameTextures.cancelPreparation();
    this.#artFrameTextures.disposeAll();
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
    this.#frameNowMs = time;

    this.#syncInputs();
    this.#syncPixelRatio();
    if (this.#resizeDirty) this.#applyResize();

    const paused = this.#paused();
    // Polling runs in every mode so Start keeps toggling the menu and arcade
    // sessions keep receiving forwarded pad buttons.
    const inputMode: InputMode = paused
      ? "paused"
      : this.#activeArcadeCabinet?.sessionStatus === "playing"
        ? "arcade"
        : "shop";
    this.#input.update(inputMode);
    for (const television of this.#televisions) {
      television.setSuspended(paused);
      television.update(deltaSeconds);
    }
    for (const cabinet of this.#arcadeCabinets) cabinet.update(deltaSeconds);
    this.#fpsHud.update(deltaSeconds, this.#activeArcadeCabinet?.perfSample);
    if (paused) {
      if (!this.#inputSuspended) {
        this.#inputSuspended = true;
        this.#suspendInput();
      }
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }
    // While an arcade session is active the world holds still around the
    // player (no movement, targeting, or physics) but keeps rendering so
    // every cabinet's attract mode and live screens stay animated.
    const arcadeActive = this.#arcadeStatusForUi() !== undefined;
    if (arcadeActive) {
      this.#updateCameraLook(deltaSeconds);
      this.#renderer.render(this.#scene, this.#camera);
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }
    this.#inputSuspended = false;

    this.#consumePointerMovement(deltaSeconds);
    this.#updateCameraLook(deltaSeconds);
    this.#updateThrowCharge(deltaSeconds);
    this.#movePlayer(deltaSeconds);
    this.#doors.updateRareRoom(
      deltaSeconds,
      this.#camera.position.x,
      this.#camera.position.z,
    );
    this.#doors.updateHallway(
      deltaSeconds,
      this.#camera.position.x,
      this.#camera.position.z,
    );
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
    for (const record of this.#artFrames.records.values())
      record.frame.update(deltaSeconds);
    this.#animateBooks(deltaSeconds);
    this.#animateShelve(deltaSeconds);
    this.#bookTextures.syncBookAtlasBatches();
    this.#animateDiscard(deltaSeconds);
    for (const mixer of this.#modelMixers) mixer.update(deltaSeconds);
    this.#renderer.render(this.#scene, this.#camera);
    this.#frameHandle = requestAnimationFrame(this.#animate);
  };

  #configureScene() {
    RectAreaLightUniformsLib.init();
    this.#moonEnvironment = this.#createMoonEnvironment();
    this.#scene.background = this.#moonEnvironment;
    this.#scene.backgroundIntensity = 0.34;
    this.#scene.environment = this.#moonEnvironment;
    this.#scene.environmentIntensity = 0.16;
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
    // Downward ceiling spotlights are no longer hard-wired here: every
    // light in the shop hangs on a seeded, movable ceiling-light prop
    // (see #seedDefaultProps and #createSpawnedCeilingLight).
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
    this.#televisionTableMaterial = woodMaterial;

    this.#createFaceOutDisplay(
      architecture,
      woodMaterial,
      shelfBackingMaterial,
    );
    void this.#discardBin.create(architecture);

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
    const readingFurnitureMaterials = createReadingTables(
      architecture,
      woodMaterial,
      {
        addBox: (parent2, size, position2, material, castShadow) =>
          this.#addBox(parent2, size, position2, material, castShadow),
        cacheBuiltinPropTemplate: (registration) =>
          this.#cacheBuiltinPropTemplate(registration),
        createDeskLamps: async (parent2) => {
          await createDeskLamps(parent2, {
            cacheBuiltinPropTemplate: (registration) =>
              this.#cacheBuiltinPropTemplate(registration),
            isDisposed: () => this.#disposed,
            modelMixers: this.#modelMixers,
            needsSeedPass: (version) => this.#needsSeedPass(version),
            registerMovableProp: (registration) =>
              this.#registerMovableProp(registration),
          });
        },
        needsSeedPass: (version) => this.#needsSeedPass(version),
        registerMovableProp: (registration) =>
          this.#registerMovableProp(registration),
      },
    );
    createRareRoom(
      architecture,
      wallMaterial,
      woodMaterial,
      shelfBackingMaterial,
      shelfEdgeMaterial,
      {
        addBox: (parent2, size, position2, material, castShadow) =>
          this.#addBox(parent2, size, position2, material, castShadow),
        createSpineShelfFixture: (...args) =>
          this.#createSpineShelfFixture(
            ...(args as Parameters<CreateSpineShelfFixture>),
          ),
        doors: this.#doors,
        signs: this.#signs,
      },
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
    // Ceiling-light fixtures live on the spawnable props now; the template
    // is registered here so menu spawning works on every world.
    createCeilingLightTemplate({
      cacheBuiltinPropTemplate: (registration) =>
        this.#cacheBuiltinPropTemplate(registration),
      isDisposed: () => this.#disposed,
      modelMixers: this.#modelMixers,
      needsSeedPass: (version) => this.#needsSeedPass(version),
      registerMovableProp: (registration) =>
        this.#registerMovableProp(registration),
    });
    createNightWindows(
      architecture,
      (parent2, size, position2, material, castShadow) =>
        this.#addBox(parent2, size, position2, material, castShadow),
    );
    const fixedTelevision = new ShopTelevision({
      ...this.#sharedTelevisionOptions(
        this.#pendingWorldSave?.televisionChannels?.[FIXED_TELEVISION_SAVE_ID],
        this.#pendingWorldSave?.televisionVolumes?.[FIXED_TELEVISION_SAVE_ID],
      ),
      parent: architecture,
      tableMaterial: woodMaterial,
    });
    this.#registerTelevision(FIXED_TELEVISION_SAVE_ID, fixedTelevision);
    // Default movable props are not hard-wired into the shop: on fresh and
    // legacy worlds they are injected once through the regular spawn
    // factories and from then on live in the world save like any prop the
    // player placed. Deleting one is permanent.
    this.#seedDefaultProps();
    this.#createTelevisionTableShelf(architecture);

    this.#signs.createAisleSignSlot(
      architecture,
      "gondola-1",
      -4.2,
      "成人向けコミック  18+",
      "ADULT COMICS · AISLE 01",
    );
    this.#signs.createAisleSignSlot(architecture, "gondola-2", 4.2, "", "");

    const recommendationCard = createSignVisual(
      "STAFF PICK",
      "深夜のおすすめ",
      1.05,
      0.48,
      "#241b18",
      "#d9b96f",
      SIGN_TEXTURE_MAX_ANISOTROPY,
    );
    recommendationCard.position.set(1.52, 3.38, -9.93);
    recommendationCard.rotation.z = -0.035;
    architecture.add(recommendationCard);
    batchStaticInteriorMeshes(architecture);
  }

  // Two exclusion tiers:
  //   HARD - runtime-mutated materials (screens, displays) or interactive
  //          systems; never swept into batches.
  //   SOFT - movable-later fixtures (shelving); their contents ARE batched,
  //          but scoped inside the fixture so it stays one movable unit.

  /** Resolves on the next animation frame, yielding the main thread. */
  static nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  /**
   * Parameter fingerprint so identical inline materials (builders create
   * `new MeshBasicMaterial({color})` per call) share one batch even though
   * they are separate instances.
   */

  #createFloorMaterial() {
    const anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    const loadTexture = (
      url: string,
      colorSpace: ColorSpace = NoColorSpace,
    ) => {
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
      FACE_OUT_DISPLAY.backingSize,
      FACE_OUT_DISPLAY.backingCenter,
      backingMaterial,
    );
    for (const x of FACE_OUT_DISPLAY.sideOffsetXs)
      this.#addBox(
        parent,
        FACE_OUT_DISPLAY.sideSize,
        [x, FACE_OUT_DISPLAY.sideCenterY, FACE_OUT_DISPLAY.sideCenterZ],
        woodMaterial,
        true,
      );
    for (const y of FACE_OUT_DISPLAY.boardYs) {
      const shelf = this.#addBox(
        parent,
        FACE_OUT_DISPLAY.boardSize,
        [FACE_OUT_DISPLAY.boardCenterX, y, FACE_OUT_DISPLAY.boardZ],
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
      this.#shelfTargetMeshes.push(target);
    }
    const signPreviewTarget = new Mesh(
      new PlaneGeometry(
        FACE_DISPLAY_SHELF_HALF_WIDTH * 2,
        FACE_OUT_DISPLAY.sideSize[1],
      ),
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
    this.#signs.registerPreviewTarget(signPreviewTarget);
    this.#signs.createShelfSignSlots(parent);
  }

  #createTelevisionTableShelf(parent: Group) {
    const frontCenter = new Vector3(0, 0.2 + BOOK_HEIGHT / 2, 26.76);
    this.#spineShelfDefinitions.set(TELEVISION_TABLE_SHELF_ID, {
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
    this.#shelfTargetMeshes.push(target);
  }

  /**
   * Rides an invisible discard volume inside every trash can prop so any
   * spawned, saved, or seeded bin accepts discards.
   */

  /** Drops the discard volume that lived inside a deleted trash can. */

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
      locked: registration.locked ?? false,
      ...(registration.modelAnimationIndex === undefined
        ? {}
        : {modelAnimationIndex: registration.modelAnimationIndex}),
      ...(registration.modelAnimations
        ? {modelAnimations: registration.modelAnimations}
        : {}),
      ...(registration.modelAsset ? {modelAsset: registration.modelAsset} : {}),
      ...(registration.modelBaseSize
        ? {modelBaseSize: registration.modelBaseSize}
        : {}),
      ...(registration.modelMixer ? {modelMixer: registration.modelMixer} : {}),
      ...(registration.modelScale === undefined
        ? {}
        : {modelScale: registration.modelScale}),
      object: registration.object,
      placementSupport: registration.placementSupport ?? registration.object,
      rotationSnapStep:
        registration.rotationSnapStep ?? PROP_ROTATION_SNAP_STEP,
      ...(registration.spawnAssetId
        ? {spawnAssetId: registration.spawnAssetId}
        : {}),
      spawned: registration.spawned ?? false,
    };
    if (registration.targetable !== false)
      (registration.targetObject ?? registration.object).traverse((object) => {
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
    if (record.locked) this.#physicsWorld.setPropLocked(record.id, true);
    // Cache the spawn template before the discard volume joins the object
    // so cloned trash can templates stay volume-free.
    if (registration.templateForSpawning)
      this.#cacheBuiltinPropTemplate(registration);
    if (registration.spawnAssetId === BUILTIN_TRASH_CAN_ASSET_ID)
      this.#discardBin.attach(record);
    return record;
  }

  /**
   * Caches a spawnable prop's template so the generic builtin factory
   * (#createPropFromBuiltinTemplate) can recreate it later. Called from
   * prop registrations and from the furniture template bootstrap, which
   * runs even on worlds whose live defaults come from their saves.
   */
  #cacheBuiltinPropTemplate(registration: MovablePropRegistration) {
    const cached =
      this.#builtinPropTemplates.cacheFromRegistration(registration);
    if (!cached) return;
    // Async builtin templates (the desk lamp GLB, for example) can land
    // after a restore pass already gave up on their saved props. Retry
    // those restores once the template exists.
    if (this.#modelRestoreActive) this.#modelRestoreRetry = true;
    else void this.#restoreSavedModelProps();
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
    if (savedProp.locked !== undefined) record.locked = savedProp.locked;
  }

  #ghostObject(object: Object3D) {
    const swaps: PropMaterialSwap[] = [];
    object.traverse((child) => {
      if (
        !(child instanceof Mesh) ||
        child.userData.movablePropTargetProxy === true
      )
        return;
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
    record.placementStartScale = record.modelScale;
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
    if (this.#modelPlacement?.id === record.id)
      this.#modelPlacement = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #cancelCarriedProp() {
    const record = this.#carriedProp;
    if (record && this.#modelPlacement?.id === record.id) {
      this.#cancelModelPlacement();
      return;
    }
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
    if (record.placementStartScale !== undefined)
      this.#setModelPropScale(record, record.placementStartScale);
    record.placementStartScale = undefined;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  /** Builds one procedural reading table visual (meshes only). */

  /**
   * Builds the shared ceiling-light spawn template: just the fixture
   * meshes, registered once so the prop is spawnable on every world.
   */

  /**
   * Builds one ceiling light's illumination rig: a downward spotlight plus
   * its floor target. Both parent to the prop object so they travel with
   * it whenever the light is moved.
   */

  #createSpawnedCeilingLight(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    locked = true,
  ) {
    const template = this.#builtinPropTemplates.get(asset.id);
    if (!template)
      throw new Error(`${asset.label} is not ready to be spawned.`);
    const object = placeClonedTemplateObject({
      assetId: asset.id,
      camera: this.#camera,
      id,
      pose,
      scale,
      template,
      viewDirection: this.#viewDirection,
    });
    object.add(...createCeilingLightRig());
    this.#scene.add(object);
    return this.#registerMovableProp({
      depth: template.depth * scale,
      height: template.height * scale,
      heldLocalPosition: template.heldLocalPosition.clone(),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(
        template.width,
        template.height,
        template.depth,
      ),
      modelScale: scale,
      object,
      ...(template.rotationSnapStep === undefined
        ? {}
        : {rotationSnapStep: template.rotationSnapStep}),
      spawnAssetId: asset.id,
      spawned: true,
      width: template.width * scale,
      ...(locked ? {locked: true} : {}),
    });
  }

  #createMoonEnvironment() {
    const environment = this.#textureLoader.load(moonriseSkyUrl);
    environment.colorSpace = SRGBColorSpace;
    environment.mapping = EquirectangularReflectionMapping;
    return environment;
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
        createReadingChairInstance(
          parent,
          `upper-reading-chair-${table.id}-${z < 23 ? "north" : "south"}`,
          chairTemplate,
          furnitureMaterials,
          {
            addBox: (parent2, size, position2, material, castShadow) =>
              this.#addBox(parent2, size, position2, material, castShadow),
            cacheBuiltinPropTemplate: (registration) =>
              this.#cacheBuiltinPropTemplate(registration),
            createDeskLamps: async (parent2) => {
              await createDeskLamps(parent2, {
                cacheBuiltinPropTemplate: (registration) =>
                  this.#cacheBuiltinPropTemplate(registration),
                isDisposed: () => this.#disposed,
                modelMixers: this.#modelMixers,
                needsSeedPass: (version) => this.#needsSeedPass(version),
                registerMovableProp: (registration) =>
                  this.#registerMovableProp(registration),
              });
            },
            needsSeedPass: (version) => this.#needsSeedPass(version),
            registerMovableProp: (registration) =>
              this.#registerMovableProp(registration),
          },
          [x, chairCenterY, z],
          z < 23 ? -Math.PI / 2 : Math.PI / 2,
        );
      }
    }
  }

  #registerTelevision(saveId: string, television: ShopTelevision) {
    this.#televisionsBySaveId.set(saveId, television);
    this.#televisions.push(television);
    if (this.#tvChannels.length > 0) television.setChannels(this.#tvChannels);
  }

  // Shared ShopTelevision options for every set; saved tuning slots are only
  // spread when present so exactOptionalPropertyTypes stays honest.
  #sharedTelevisionOptions(
    initialChannelId: string | undefined,
    initialVolume: number | undefined,
  ) {
    return {
      audioManager: this.#audioManager,
      onChannelChange: this.#markTelevisionSettingChanged,
      onStateChange: () => this.#emitGameState(),
      onVolumeChange: this.#markTelevisionSettingChanged,
      tvScreenLighting: this.#tvScreenLighting,
      ...(initialChannelId === undefined ? {} : {initialChannelId}),
      ...(initialVolume === undefined ? {} : {initialVolume}),
    };
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
    const ceilingMaterial = createCeilingMaterial(
      this.#textureLoader,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    createUpperFloorStructures(parent, ceilingMaterial, (object) =>
      this.#registerPropPlacementSupport(object),
    );
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
    createTiledFloorSurface(parent, SHOP_STAIR_ROOM, floorMaterial, [], 0.012);
    createTiledFloorSurface(
      parent,
      {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5},
      floorMaterial,
      [SHOP_ATRIUM],
    );
    createTiledFloorSurface(
      parent,
      {
        maxX: SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2,
        maxZ: SHOP_THEATRE_HALL.centerZ + SHOP_THEATRE_HALL.depth / 2,
        minX: SHOP_THEATRE_HALL.centerX - SHOP_THEATRE_HALL.width / 2,
        minZ: SHOP_THEATRE_HALL.centerZ - SHOP_THEATRE_HALL.depth / 2,
      },
      floorMaterial,
    );
    createTiledFloorSurface(
      parent,
      {
        maxX: SHOP_TV_CAVE_HALL.centerX + SHOP_TV_CAVE_HALL.width / 2,
        maxZ: SHOP_TV_CAVE_HALL.centerZ + SHOP_TV_CAVE_HALL.depth / 2,
        minX: SHOP_TV_CAVE_HALL.centerX - SHOP_TV_CAVE_HALL.width / 2,
        minZ: SHOP_TV_CAVE_HALL.centerZ - SHOP_TV_CAVE_HALL.depth / 2,
      },
      floorMaterial,
    );
    createTiledFloorSurface(
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
    const addBox: AddBox = (parent2, size, position2, material, castShadow) =>
      this.#addBox(parent2, size, position2, material, castShadow);
    const createPosterSurface: CreatePosterSurface = (
      parent2,
      id,
      width,
      height,
      position2,
      rotationY,
    ) =>
      this.#createPosterSurface(
        parent2,
        id,
        width,
        height,
        position2,
        rotationY,
      );
    createUpperWindowWall(
      parent,
      -10.5,
      0,
      upperWallMaterial,
      frameMaterial,
      glassMaterial,
      addBox,
      createPosterSurface,
    );
    createUpperWindowWall(
      parent,
      28,
      Math.PI,
      upperWallMaterial,
      frameMaterial,
      glassMaterial,
      addBox,
      createPosterSurface,
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

    const doorAddBox: AddBox = (
      parent2,
      size,
      position2,
      material,
      castShadow,
    ) => this.#addBox(parent2, size, position2, material, castShadow);
    for (const door of createHallwayDoor(
      parent,
      "theatre",
      SHOP_THEATRE_HALL.centerX + SHOP_THEATRE_HALL.width / 2 + 0.12,
      SHOP_THEATRE_HALL.centerZ,
      "x",
      -1,
      woodMaterial,
      doorAddBox,
    ))
      this.#doors.registerHallwayDoor(door);
    for (const door of createHallwayDoor(
      parent,
      "tv-cave",
      12.38,
      SHOP_TV_CAVE_DOOR_CENTER_Z,
      "x",
      1,
      woodMaterial,
      doorAddBox,
    ))
      this.#doors.registerHallwayDoor(door);

    createAtriumRailings(
      parent,
      woodMaterial,
      (parent2, size, position2, material, castShadow) =>
        this.#addBox(parent2, size, position2, material, castShadow),
    );
    createStackableStairwell(
      parent,
      woodMaterial,
      (parent2, size, position2, material, castShadow) =>
        this.#addBox(parent2, size, position2, material, castShadow),
    );
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
    createTheatreSeating(
      parent,
      (parent2, size, position2, material, castShadow) =>
        this.#addBox(parent2, size, position2, material, castShadow),
    );
    createTelevisionRooms(parent, woodMaterial, {
      addBox: (p, size, pos, mat, castShadow) =>
        this.#addBox(p, size, pos, mat, castShadow),
      createSpawnedCrtTelevision: (asset, id, scale, pose) =>
        this.#createSpawnedCrtTelevision(asset, id, scale, pose),
      needsSeedPass: (version) => this.#needsSeedPass(version),
      registerPropPlacementSupport: (object) =>
        this.#registerPropPlacementSupport(object),
      registerTelevision: (saveId, television) =>
        this.#registerTelevision(saveId, television),
      sharedTelevisionOptions: (channelId, volume) =>
        this.#sharedTelevisionOptions(channelId, volume),
      textureLoader: this.#textureLoader,
      maxTextureAnisotropy: this.#renderer.capabilities.getMaxAnisotropy(),
      televisionChannels: this.#pendingWorldSave?.televisionChannels,
      televisionVolumes: this.#pendingWorldSave?.televisionVolumes,
    });
    this.#signs.createRoomSignSlot(
      parent,
      "moonlight-theatre",
      "MOONLIGHT THEATRE",
      "MOONLIGHT THEATRE",
      "SCREENING ROOM · WEST HALL",
      [-12.37, 7.72, 18.5],
      Math.PI / 2,
    );
    this.#signs.createRoomSignSlot(
      parent,
      "tv-cave",
      "TV CAVE",
      "TV CAVE",
      "SIMULCAST CRT ROOM · EAST ANNEX",
      [12.37, 7.72, SHOP_TV_CAVE_DOOR_CENTER_Z],
      -Math.PI / 2,
    );

    const roofMaterial = ceilingMaterial;
    const skylight = SHOP_ATRIUM;
    const skylightWidth = skylight.maxX - skylight.minX;
    const skylightDepth = skylight.maxZ - skylight.minZ;
    const skylightCenterX = (skylight.minX + skylight.maxX) / 2;
    const skylightCenterZ = (skylight.minZ + skylight.maxZ) / 2;
    const roof = createHorizontalShape(
      parent,
      {maxX: 12.5, maxZ: 28, minX: -12.5, minZ: -10.5},
      [skylight],
      SHOP_UPPER_CEILING_Y,
      roofMaterial,
    );
    applyCeilingShapeUv(roof.geometry);
    roof.name = "main-roof";
    const stairRoof = createHorizontalShape(
      parent,
      SHOP_STAIR_ROOM,
      [],
      SHOP_UPPER_CEILING_Y,
      roofMaterial,
    );
    applyCeilingShapeUv(stairRoof.geometry);
    stairRoof.name = "stair-tower-roof";
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

  setSignContent(
    kind: ShopSignKind,
    id: string,
    title: string,
    subtitle: string,
  ) {
    const key = shopSignKey(kind, id);
    if (!this.#signs.has(key)) return false;
    this.#signs.setSign(key, title, subtitle);
    this.#signs.updateTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
    return true;
  }

  setArtFrameImportChannel(label: string) {
    const channelId = artFrameChannelId(label);
    if (!channelId) return;
    const placement = this.#artFrames.placement;
    if (placement) placement.channelId = channelId;
    else {
      const frameId = this.#artFrames.targetedId;
      if (!frameId || !this.#artFrames.records.has(frameId)) return;
      this.#artFrames.targetImportChannel = {channelId, frameId};
    }
    this.#artFrames.importError = undefined;
    this.#emitGameState();
    return channelId;
  }

  async importArtFrameChannelImage(label: string, image: Blob) {
    const channelId = artFrameChannelId(label);
    if (!channelId) return false;
    const placement = this.#artFrames.placement;
    if (placement) placement.channelId = channelId;
    const frameId = this.#channelEditorDigitalArtFrameId;
    if (!placement && frameId)
      this.#artFrames.targetImportChannel = {channelId, frameId};
    let target: DigitalArtFramePasteTarget | undefined;
    if (placement) target = {channelId, kind: "placement"};
    else if (frameId) target = {channelId, frameId, kind: "frame"};
    if (!target) return false;
    const imported = await this.#artFrames.importPastedArtFrameImage(
      image,
      target,
    );
    if (imported) this.#channelEditorDigitalArtFrameId = undefined;
    return imported;
  }

  async importTvChannelVideo(label: string, text: string) {
    const channelId = tvChannelId(label);
    const url = tvVideoImportUrl(text);
    const television = this.#channelEditorTelevision;
    if (!channelId || !url || !television) return false;
    const imported = await this.#tvVideos.import(
      television,
      url,
      channelId,
      label.trim(),
      true,
    );
    if (imported) this.#channelEditorTelevision = undefined;
    return imported;
  }

  #addBox(
    parent: Group,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: MeshStandardMaterial,
    castShadow = false,
  ) {
    return addInteriorBox(
      parent,
      size,
      position,
      material,
      castShadow,
      this.#posterRaycastMeshes,
    );
  }

  #createPosterSurface(
    parent: Group,
    id: string,
    width: number,
    height: number,
    position: readonly [number, number, number],
    rotationY: number,
  ) {
    createPosterSurfaceTarget(
      parent,
      id,
      width,
      height,
      position,
      rotationY,
      this.#posterRaycastMeshes,
      this.#posters.surfaces,
    );
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

  #modelCatalogMatches(assets: readonly ModelAsset[]) {
    return (
      assets.length === this.#customModelAssets.length &&
      assets.every((asset, index) => {
        const current = this.#customModelAssets[index];
        return (
          current?.id === asset.id &&
          current.label === asset.label &&
          current.url === asset.url
        );
      })
    );
  }

  #applyModelCatalog(assets: readonly ModelAsset[]) {
    if (this.#modelCatalogMatches(assets)) return;
    const selectedAssetId =
      this.#spawnablePropAssets[this.#spawnablePropAssetIndex]?.id;
    const activeAssetId = this.#modelPlacement
      ? this.#spawnablePropAssets[this.#modelPlacement.assetIndex]?.id
      : undefined;
    this.#customModelAssets = assets;
    this.#spawnablePropAssets = [
      ...BUILTIN_SPAWNABLE_PROP_ASSETS,
      ...assets.map(
        (model): SpawnablePropAsset => ({
          id: model.id,
          kind: "model",
          label: model.label,
          model,
        }),
      ),
    ];
    const selectedIndex = selectedAssetId
      ? this.#spawnablePropAssets.findIndex(
          (asset) => asset.id === selectedAssetId,
        )
      : -1;
    this.#spawnablePropAssetIndex = Math.max(0, selectedIndex);
    if (this.#modelPlacement && activeAssetId) {
      const activeIndex = this.#spawnablePropAssets.findIndex(
        (asset) => asset.id === activeAssetId,
      );
      if (activeIndex < 0) this.#cancelModelPlacement();
      else {
        this.#modelPlacement.assetIndex = activeIndex;
        this.#spawnablePropAssetIndex = activeIndex;
      }
    }
    this.#emitGameState();
  }

  #loadModelTemplate(asset: ModelAsset) {
    const cached = this.#modelTemplatePromises.get(asset.id);
    if (cached) return cached;
    const pending = ShopScene.#modelLoader.loadAsync(asset.url).then((gltf) => {
      if (this.#disposed) {
        disposeObject(gltf.scene);
        throw new Error("The shop scene was disposed.");
      }
      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new Vector3());
      const maximumDimension = Math.max(size.x, size.y, size.z);
      if (
        bounds.isEmpty() ||
        !Number.isFinite(maximumDimension) ||
        maximumDimension <= 0
      ) {
        disposeObject(gltf.scene);
        throw new Error("The model has no measurable bounds.");
      }
      return {
        animations: gltf.animations,
        center: bounds.getCenter(new Vector3()),
        normalizationScale: 1 / maximumDimension,
        scene: gltf.scene,
        size: size
          .multiplyScalar(1 / maximumDimension)
          .max(
            new Vector3(
              MIN_MODEL_COLLIDER_DIMENSION,
              MIN_MODEL_COLLIDER_DIMENSION,
              MIN_MODEL_COLLIDER_DIMENSION,
            ),
          ),
      } satisfies ModelTemplate;
    });
    this.#modelTemplatePromises.set(asset.id, pending);
    void pending.catch(() => {
      if (this.#modelTemplatePromises.get(asset.id) === pending)
        this.#modelTemplatePromises.delete(asset.id);
    });
    return pending;
  }

  #createModelPropFromTemplate(
    asset: ModelAsset,
    template: ModelTemplate,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    const model = cloneWithSkeleton(template.scene);
    model.name = `user-model-visual-${asset.id}`;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    // Static decoration models collapse into one draw call per material
    // signature; animated models keep their per-part nodes so mixers can
    // drive them.
    if (template.animations.length === 0) {
      const {consumed, parts} = buildMergedStaticParts(model);
      if (consumed.length > 1) {
        for (const original of consumed) original.removeFromParent();
        for (const {geometry, material} of parts) {
          const mesh = new Mesh(geometry, material);
          mesh.name = "user-model-static-parts";
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          model.add(mesh);
        }
      }
    }
    const normalizedModel = new Group();
    normalizedModel.position
      .copy(template.center)
      .multiplyScalar(-template.normalizationScale);
    normalizedModel.scale.setScalar(template.normalizationScale);
    normalizedModel.add(model);
    const root = new Group();
    root.name = `user-model-${id}`;
    root.scale.setScalar(scale);
    root.add(normalizedModel);
    const targetProxy = new Mesh(
      new BoxGeometry(template.size.x, template.size.y, template.size.z),
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        opacity: 0,
        side: DoubleSide,
        transparent: true,
        visible: false,
      }),
    );
    targetProxy.name = `user-model-target-${id}`;
    targetProxy.userData.movablePropTargetProxy = true;
    root.add(targetProxy);
    if (pose) {
      root.position.copy(pose.position);
      root.quaternion.copy(pose.quaternion);
    } else {
      this.#camera.getWorldDirection(this.#viewDirection);
      root.position
        .copy(this.#camera.position)
        .addScaledVector(this.#viewDirection, 2);
    }
    this.#scene.add(root);
    const modelAnimationIndex = getInitialModelAnimationIndex(
      template.animations,
      animationClip,
    );
    const mixer = playModelAnimations(
      this.#modelMixers,
      model,
      template.animations,
      modelAnimationIndex,
    );
    return this.#registerMovableProp({
      depth: template.size.z * scale,
      height: template.size.y * scale,
      heldLocalPosition: new Vector3(0, -0.18, -2),
      id,
      label: asset.label,
      ...(template.animations.length > 0
        ? {
            modelAnimationIndex,
            modelAnimations: template.animations,
          }
        : {}),
      modelAsset: asset,
      modelBaseSize: template.size.clone(),
      ...(mixer ? {modelMixer: mixer} : {}),
      modelScale: scale,
      object: root,
      spawnAssetId: asset.id,
      spawned: true,
      targetObject: targetProxy,
      width: template.size.x * scale,
    });
  }

  #createPropFromBuiltinTemplate(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const template = this.#builtinPropTemplates.get(asset.id);
    if (!template)
      throw new Error(`${asset.label} is not ready to be spawned.`);
    const object = placeClonedTemplateObject({
      assetId: asset.id,
      camera: this.#camera,
      id,
      pose,
      scale,
      template,
      viewDirection: this.#viewDirection,
    });
    this.#scene.add(object);
    return this.#registerMovableProp({
      ...(template.density === undefined ? {} : {density: template.density}),
      // Part colliders are body-local, so they scale with the prop.
      ...(template.colliderParts
        ? {
            colliderParts: template.colliderParts.map((part) => ({
              halfExtents: {
                x: part.halfExtents.x * scale,
                y: part.halfExtents.y * scale,
                z: part.halfExtents.z * scale,
              },
              position: {
                x: part.position.x * scale,
                y: part.position.y * scale,
                z: part.position.z * scale,
              },
            })),
          }
        : {}),
      depth: template.depth * scale,
      height: template.height * scale,
      heldLocalPosition: template.heldLocalPosition.clone(),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(
        template.width,
        template.height,
        template.depth,
      ),
      modelScale: scale,
      object,
      ...(template.rotationSnapStep === undefined
        ? {}
        : {rotationSnapStep: template.rotationSnapStep}),
      spawnAssetId: asset.id,
      spawned: true,
      ...(template.staticWhenPlaced === undefined
        ? {}
        : {staticWhenPlaced: template.staticWhenPlaced}),
      width: template.width * scale,
    });
  }

  /**
   * True while the world has not yet absorbed the given default-prop
   * seeding pass. Passes are cumulative: a fresh world runs every pass,
   * while saves only run passes introduced after their recorded version.
   */
  #needsSeedPass(version: number) {
    return worldSaveSeedingVersion(this.#pendingWorldSave) < version;
  }

  /**
   * Brings the world up to the current seeding version by running every
   * missing pass. Fresh worlds get each pass at its designed spots; older
   * saves migrate pass by pass. Worlds that already absorbed a pass are
   * authoritative: whatever the players kept, moved, or deleted stays
   * as-is.
   */
  #seedDefaultProps() {
    if (this.#needsSeedPass(INITIAL_WORLD_SEEDING_VERSION))
      this.#seedInitialDefaults();
    if (this.#needsSeedPass(WORLD_SEEDING_VERSION)) this.#seedCeilingLights();
    else this.#restoreSavedCeilingLights();
  }

  /**
   * Seeding pass 1: injects the shop's original movable defaults (lane
   * arcade cabinet(s), the shop's CRT television) as ordinary spawned
   * props. Legacy saves predate seeded props, so they migrate here too.
   */
  #seedInitialDefaults() {
    try {
      const crtAsset = BUILTIN_SPAWNABLE_PROP_ASSETS.find(
        (asset) => asset.id === BUILTIN_CRT_TV_ASSET_ID,
      );
      if (crtAsset) {
        // Menu-spawned CRTs default to 1x; the old hard-wired fixture was
        // 2x. Seed at player scale, resting on the television shelf.
        const seededScale = DEFAULT_MODEL_SCALE;
        const unitHalfHeight =
          SHOP_MODEL_TELEVISION_SIZE.height / (2 * SHOP_MODEL_TELEVISION_SCALE);
        this.#createSpawnedCrtTelevision(
          crtAsset,
          MODEL_TELEVISION_PHYSICS_ID,
          seededScale,
          {
            position: {
              x: -0.72,
              y: 0.91 + unitHalfHeight * seededScale,
              z: 13.82 + 0.183 * seededScale,
            },
            quaternion: IDENTITY_WORLD_QUATERNION,
          },
        );
      }
      const cabinetAsset = BUILTIN_SPAWNABLE_PROP_ASSETS.find(
        (asset) => asset.id === BUILTIN_ARCADE_CABINET_ASSET_ID,
      );
      if (cabinetAsset)
        for (const [
          laneIndex,
          placement,
        ] of ARCADE_CABINET_PLACEMENTS.entries()) {
          const quaternion = new Quaternion().setFromAxisAngle(
            this.#upAxis,
            placement.rotationY,
          );
          this.#createSpawnedArcadeCabinet(
            cabinetAsset,
            `arcade-cabinet-${laneIndex + 1}`,
            DEFAULT_MODEL_SCALE,
            {
              position: {
                x: placement.position[0],
                y: placement.position[1],
                z: placement.position[2],
              },
              quaternion: {
                w: quaternion.w,
                x: quaternion.x,
                y: quaternion.y,
                z: quaternion.z,
              },
            },
          );
        }
    } catch (error) {
      if (DEV && !this.#disposed)
        console.warn("Afterleaf could not seed its default props.", error);
    }
    // Persist promptly so legacy worlds migrate past pass 1 and later
    // deletions of the defaults stick across reloads.
    this.#worldStateDirty = true;
  }

  /**
   * Seeding pass 2: the hard-wired ceiling light grid becomes ordinary
   * spawned props, deletable and movable like any other prop.
   */
  #seedCeilingLights() {
    const asset = BUILTIN_SPAWNABLE_PROP_ASSETS.find(
      (candidate) => candidate.id === BUILTIN_CEILING_LIGHT_ASSET_ID,
    );
    if (!asset) return;
    try {
      for (const [index, placement] of CEILING_LIGHT_PLACEMENTS.entries()) {
        const quaternion = new Quaternion().setFromAxisAngle(
          this.#upAxis,
          placement.rotationY,
        );
        this.#createSpawnedCeilingLight(
          asset,
          `ceiling-light-${index + 1}`,
          DEFAULT_MODEL_SCALE,
          {
            position: {
              x: placement.x,
              y: CEILING_LIGHT_ORIGIN_Y,
              z: placement.z,
            },
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
        );
      }
    } catch (error) {
      if (DEV && !this.#disposed)
        console.warn("Afterleaf could not seed the ceiling lights.", error);
    }
    // Persist promptly so worlds migrate past pass 2 and light deletions
    // stay gone across reloads.
    this.#worldStateDirty = true;
  }

  /**
   * Spawns saved ceiling-light props immediately on boot so the shop is
   * lit without waiting for the catalog-gated model-prop restore. Later,
   * #takeCompatibleWorldSave adopts these registrations in place of their
   * save entries; until then they simply render from the last save.
   */
  #restoreSavedCeilingLights() {
    const save = this.#pendingWorldSave;
    if (!save) return;
    const asset = BUILTIN_SPAWNABLE_PROP_ASSETS.find(
      (candidate) => candidate.id === BUILTIN_CEILING_LIGHT_ASSET_ID,
    );
    if (!asset) return;
    for (const savedProp of save.modelProps ?? []) {
      if (
        savedProp.assetId !== BUILTIN_CEILING_LIGHT_ASSET_ID ||
        this.#movableProps.has(savedProp.id)
      )
        continue;
      try {
        this.#createSpawnedCeilingLight(
          asset,
          savedProp.id,
          savedProp.scale,
          savedProp.pose,
          savedProp.locked === true,
        );
      } catch (error) {
        if (DEV && !this.#disposed)
          console.warn(
            `Afterleaf could not restore ceiling light ${savedProp.id}.`,
            error,
          );
      }
    }
  }

  #createSpawnedCrtTelevision(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const tableMaterial = this.#televisionTableMaterial;
    if (!tableMaterial)
      throw new Error("CRT television materials are not ready.");
    const television = new ShopTelevision({
      ...this.#sharedTelevisionOptions(
        this.#savedTelevisionChannels[id],
        this.#savedTelevisionVolumes[id],
      ),
      model: {
        // The CRT GLB predates the control strip; invisible knob targets
        // would only cost draw calls, and screen clicks already drive power.
        controls: false,
        mergeStaticParts: true,
        screenAspect: 4 / 3,
        screenNodeName: "Screen",
        screenSafeArea: CRT_TV_SAFE_AREA,
        scale: SHOP_MODEL_TELEVISION_SCALE,
        url: crtTvModelUrl,
      },
      parent: this.#scene,
      tableMaterial,
    });
    television.object.name = id;
    television.object.scale.setScalar(scale);
    if (pose) {
      television.object.position.copy(pose.position);
      television.object.quaternion.copy(pose.quaternion);
    } else {
      this.#camera.getWorldDirection(this.#viewDirection);
      television.object.position
        .copy(this.#camera.position)
        .addScaledVector(this.#viewDirection, 2);
    }
    this.#registerTelevision(id, television);
    const prop = this.#registerMovableProp({
      density: 45,
      depth: SHOP_MODEL_TELEVISION_SIZE.depth * scale,
      height: SHOP_MODEL_TELEVISION_SIZE.height * scale,
      heldLocalPosition: new Vector3(0, -0.12, -1.45),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(
        SHOP_MODEL_TELEVISION_SIZE.width,
        SHOP_MODEL_TELEVISION_SIZE.height,
        SHOP_MODEL_TELEVISION_SIZE.depth,
      ),
      modelScale: scale,
      object: television.object,
      spawnAssetId: asset.id,
      spawned: true,
      targetable: false,
      width: SHOP_MODEL_TELEVISION_SIZE.width * scale,
    });
    this.#televisionProps.set(television, prop);
    return prop;
  }

  /**
   * Wraps a cabinet's scene object as a movable prop: released cabinets
   * simulate like the CRT televisions (gravity, tippable, bumpable) unless
   * the player pins them with the lock toggle. The cabinet stays fully
   * interactive while placed.
   */
  #registerArcadeCabinetProp(
    cabinet: ShopArcadeCabinet,
    registration: {
      id: string;
      label: string;
      scale: number;
      spawnAssetId?: string;
      spawned: boolean;
    },
  ) {
    this.#arcadeCabinets.push(cabinet);
    const size = ARCADE_CABINET_BASE_SIZE;
    const scale = registration.scale;
    const prop = this.#registerMovableProp({
      density: ARCADE_CABINET_DENSITY,
      depth: size.depth * scale,
      height: size.height * scale,
      heldLocalPosition: ARCADE_CABINET_HELD_LOCAL_POSITION.clone(),
      id: registration.id,
      label: registration.label,
      modelBaseSize: new Vector3(size.width, size.height, size.depth),
      modelScale: scale,
      object: cabinet.object,
      ...(registration.spawnAssetId
        ? {spawnAssetId: registration.spawnAssetId}
        : {}),
      spawned: registration.spawned,
      // Cabinets simulate like the CRT televisions once released: gravity
      // applies and the player can bump them unless they are locked.
      targetable: false,
      width: size.width * scale,
    });
    this.#arcadeProps.set(cabinet, prop);
    return prop;
  }

  #createSpawnedArcadeCabinet(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const cabinet = new ShopArcadeCabinet({
      parent: this.#scene,
      position: [0, 0, 0],
      audioManager: this.#audioManager,
      onInteractRequest: (target) => this.#enterArcadeBrowsing(target),
      onStateChange: () => this.#emitGameState(),
    });
    cabinet.object.name = id;
    if (pose) {
      cabinet.object.position.copy(pose.position);
      cabinet.object.quaternion.copy(pose.quaternion);
    } else {
      this.#camera.getWorldDirection(this.#viewDirection);
      cabinet.object.position
        .copy(this.#camera.position)
        .addScaledVector(this.#viewDirection, 2);
    }
    cabinet.object.scale.setScalar(scale);
    // Spawned cabinets persist through modelProps (asset id + scale + pose).
    return this.#registerArcadeCabinetProp(cabinet, {
      id,
      label: asset.label,
      scale,
      spawnAssetId: BUILTIN_ARCADE_CABINET_ASSET_ID,
      spawned: true,
    });
  }

  #createModelTelevisionProp(
    asset: ModelAsset,
    template: ModelTemplate,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    const tableMaterial = this.#televisionTableMaterial;
    if (!tableMaterial) throw new Error("Television materials are not ready.");
    const {center, normalizationScale, size} = template;
    const model = cloneWithSkeleton(template.scene);
    model.name = `user-model-television-visual-${asset.id}`;
    const normalizedModel = new Group();
    normalizedModel.position.copy(center).multiplyScalar(-normalizationScale);
    normalizedModel.scale.setScalar(normalizationScale);
    normalizedModel.add(model);
    const television = new ShopTelevision({
      ...this.#sharedTelevisionOptions(
        this.#savedTelevisionChannels[id],
        this.#savedTelevisionVolumes[id],
      ),
      model: {
        audioPosition: [0, 0, 0],
        center: [0, 0, 0],
        controls: false,
        interactionRadius: Math.hypot(size.x, size.y, size.z) / 2,
        label: asset.label,
        object: normalizedModel,
        screenNodeName: MODEL_TELEVISION_SCREEN_NODE_NAME,
        screenSafeArea: {bottom: 0, left: 0, right: 0, top: 0},
        scale: 1,
      },
      parent: this.#scene,
      tableMaterial,
    });
    television.object.name = id;
    television.object.scale.setScalar(scale);
    if (pose) {
      television.object.position.copy(pose.position);
      television.object.quaternion.copy(pose.quaternion);
    } else {
      this.#camera.getWorldDirection(this.#viewDirection);
      television.object.position
        .copy(this.#camera.position)
        .addScaledVector(this.#viewDirection, 2);
    }
    this.#registerTelevision(id, television);
    const modelAnimationIndex = getInitialModelAnimationIndex(
      template.animations,
      animationClip,
    );
    const mixer = playModelAnimations(
      this.#modelMixers,
      model,
      template.animations,
      modelAnimationIndex,
    );
    const prop = this.#registerMovableProp({
      density: MODEL_TELEVISION_DENSITY,
      depth: size.z * scale,
      height: size.y * scale,
      heldLocalPosition: new Vector3(0, -0.18, -2),
      id,
      label: asset.label,
      ...(template.animations.length > 0
        ? {
            modelAnimationIndex,
            modelAnimations: template.animations,
          }
        : {}),
      modelAsset: asset,
      modelBaseSize: size.clone(),
      ...(mixer ? {modelMixer: mixer} : {}),
      modelScale: scale,
      object: television.object,
      spawnAssetId: asset.id,
      spawned: true,
      targetable: false,
      width: size.x * scale,
    });
    this.#televisionProps.set(television, prop);
    return prop;
  }

  async #createSpawnableProp(
    asset: SpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    if (asset.kind === "model") {
      const template = await this.#loadModelTemplate(asset.model);
      if (
        findModelTelevisionScreen(
          template.scene,
          MODEL_TELEVISION_SCREEN_NODE_NAME,
        )
      )
        return this.#createModelTelevisionProp(
          asset.model,
          template,
          id,
          scale,
          pose,
          animationClip,
        );
      return this.#createModelPropFromTemplate(
        asset.model,
        template,
        id,
        scale,
        pose,
        animationClip,
      );
    }
    if (asset.id === BUILTIN_CRT_TV_ASSET_ID)
      return this.#createSpawnedCrtTelevision(asset, id, scale, pose);
    if (asset.id === BUILTIN_ARCADE_CABINET_ASSET_ID)
      return this.#createSpawnedArcadeCabinet(asset, id, scale, pose);
    if (asset.id === BUILTIN_CEILING_LIGHT_ASSET_ID)
      return this.#createSpawnedCeilingLight(asset, id, scale, pose);
    if (asset.id === BUILTIN_TRASH_CAN_ASSET_ID) {
      const modelAsset: ModelAsset = {
        id: asset.id,
        label: asset.label,
        url: trashCanModelUrl,
      };
      const template = await this.#loadModelTemplate(modelAsset);
      return this.#createModelPropFromTemplate(
        modelAsset,
        template,
        id,
        scale,
        pose,
        animationClip,
      );
    }
    return this.#createPropFromBuiltinTemplate(asset, id, scale, pose);
  }

  async #restoreSavedModelProps() {
    if (this.#modelRestoreActive || this.#pendingModelPropSaves.length === 0)
      return;
    this.#modelRestoreActive = true;
    const assetsById = new Map(
      this.#spawnablePropAssets.map((asset) => [asset.id, asset]),
    );
    const unresolved: WorldModelPropSave[] = [];
    const pending = this.#pendingModelPropSaves;
    let restoreAgain = false;
    try {
      for (const savedProp of pending) {
        if (this.#movableProps.has(savedProp.id)) continue;
        const asset = assetsById.get(savedProp.assetId);
        if (!asset) {
          // The content pack renamed or dropped this asset; the saved prop
          // cannot come back, but it must not block anything else either.
          if (DEV && !this.#missingPropAssetIds.has(savedProp.assetId)) {
            this.#missingPropAssetIds.add(savedProp.assetId);
            console.warn(
              `Afterleaf cannot restore prop ${savedProp.id}: its asset "${savedProp.assetId}" is no longer in the spawnable catalog.`,
            );
          }
          unresolved.push(savedProp);
          continue;
        }
        // A template-spawned builtin may still be loading its template;
        // defer quietly, #cacheBuiltinPropTemplate retries once it lands.
        if (
          TEMPLATE_SPAWNED_BUILTIN_ASSET_IDS.has(savedProp.assetId) &&
          !this.#builtinPropTemplates.has(savedProp.assetId)
        ) {
          unresolved.push(savedProp);
          continue;
        }
        try {
          const record = await this.#createSpawnableProp(
            asset,
            savedProp.id,
            savedProp.scale,
            savedProp.pose,
            savedProp.animationClip,
          );
          if (this.#disposed) return;
          if (this.#movableProps.get(savedProp.id) !== record) {
            this.#removeSpawnedProp(record);
          } else if (savedProp.locked && !record.locked) {
            record.locked = true;
            this.#physicsWorld.setPropLocked(record.id, true);
          }
        } catch (error) {
          if (this.#disposed) return;
          unresolved.push(savedProp);
          if (DEV)
            console.warn(
              `Afterleaf could not restore prop ${asset.id}.`,
              error,
            );
        }
      }
      restoreAgain = this.#pendingModelPropSaves !== pending;
      if (!restoreAgain) this.#pendingModelPropSaves = unresolved;
      this.#emitGameState();
    } finally {
      this.#modelRestoreActive = false;
      const retryRequested = this.#modelRestoreRetry;
      this.#modelRestoreRetry = false;
      if (!this.#disposed && (retryRequested || restoreAgain))
        void this.#restoreSavedModelProps();
    }
  }

  async #startModelPlacement(assetIndex: number) {
    if (this.#spawnablePropAssets.length === 0) {
      this.#modelImportError = "No movable prop assets are available.";
      this.#emitGameState();
      return;
    }
    const modelPropCount =
      this.#pendingModelPropSaves.length +
      [...this.#movableProps.values()].filter((record) => record.spawned)
        .length;
    if (modelPropCount >= MAX_USER_MODEL_PROP_COUNT) {
      this.#modelImportError = `The shop can contain at most ${MAX_USER_MODEL_PROP_COUNT} model props.`;
      this.#emitGameState();
      return;
    }
    if (this.#modelPlacement || this.#carriedPublicationId || this.#carriedProp)
      return;
    const normalizedIndex =
      (assetIndex + this.#spawnablePropAssets.length) %
      this.#spawnablePropAssets.length;
    const asset = this.#spawnablePropAssets[normalizedIndex];
    if (!asset) return;
    const revision = (this.#modelPlacementRevision += 1);
    const placement: ModelPlacementSession = {
      assetIndex: normalizedIndex,
      id: crypto.randomUUID(),
      revision,
    };
    this.#modelPlacement = placement;
    this.#spawnablePropAssetIndex = normalizedIndex;
    this.#modelImportError = undefined;
    this.#emitGameState();
    try {
      const record = await this.#createSpawnableProp(
        asset,
        placement.id,
        DEFAULT_MODEL_SCALE,
      );
      if (
        this.#disposed ||
        this.#modelPlacement !== placement ||
        placement.revision !== revision
      ) {
        this.#removeSpawnedProp(record);
        return;
      }
      this.#pickUpProp(record);
    } catch (error) {
      if (this.#disposed) return;
      if (this.#modelPlacement !== placement) return;
      this.#modelPlacement = undefined;
      this.#modelImportError =
        error instanceof Error
          ? error.message
          : "The prop could not be loaded.";
      this.#emitGameState();
    }
  }

  #cancelModelPlacement() {
    const placement = this.#modelPlacement;
    if (!placement) return;
    this.#modelPlacementRevision += 1;
    this.#modelPlacement = undefined;
    const record = this.#movableProps.get(placement.id);
    if (record) this.#removeSpawnedProp(record);
    else this.#emitGameState();
  }

  #cycleModelPlacement(direction: -1 | 1) {
    const placement = this.#modelPlacement;
    if (!placement || this.#spawnablePropAssets.length < 2) return;
    const nextIndex =
      (placement.assetIndex + direction + this.#spawnablePropAssets.length) %
      this.#spawnablePropAssets.length;
    this.#cancelModelPlacement();
    void this.#startModelPlacement(nextIndex);
  }

  #setModelPropScale(record: MovablePropRecord, scale: number) {
    const baseSize = record.modelBaseSize;
    if (!baseSize) return;
    const nextScale = MathUtils.clamp(scale, MIN_MODEL_SCALE, MAX_MODEL_SCALE);
    if (nextScale === record.modelScale) return;
    record.modelScale = nextScale;
    record.object.scale.setScalar(nextScale);
    record.halfWidth = (baseSize.x * nextScale) / 2;
    record.halfHeight = (baseSize.y * nextScale) / 2;
    record.halfDepth = (baseSize.z * nextScale) / 2;
    this.#physicsWorld.updatePropSize(record.id, {
      depth: record.halfDepth * 2,
      height: record.halfHeight * 2,
      width: record.halfWidth * 2,
    });
    this.#updateHeldPhysicsTarget();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #modelAnimationLabel(record: MovablePropRecord) {
    const animations = record.modelAnimations;
    const index = record.modelAnimationIndex;
    if (!animations || index === undefined) return;
    if (index < 0) return "Off";
    const name = animations[index]?.name.trim();
    if (!name) return `Clip ${index + 1}`;
    return name.split("|").at(-1) ?? name;
  }

  #cycleModelAnimation(record: MovablePropRecord, direction: -1 | 1) {
    const animations = record.modelAnimations;
    const mixer = record.modelMixer;
    if (!animations || animations.length === 0 || !mixer) return;
    const currentSlot = (record.modelAnimationIndex ?? 0) + 1;
    const slotCount = animations.length + 1;
    const nextSlot = (currentSlot + direction + slotCount) % slotCount;
    const nextIndex = nextSlot - 1;
    mixer.stopAllAction();
    const clip = animations[nextIndex];
    if (clip) mixer.clipAction(clip).reset().play();
    record.modelAnimationIndex = nextIndex;
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #removeSpawnedProp(record: MovablePropRecord) {
    if (!record.spawned) return;
    if (this.#carriedProp === record) {
      this.#restoreGhostedObject(record.ghostMaterialSwaps);
      this.#carriedProp = undefined;
    }
    if (this.#targetedProp === record) this.#setPropTargeted(undefined);
    record.object.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const index = this.#movablePropTargetMeshes.indexOf(object);
      if (index >= 0) this.#movablePropTargetMeshes.splice(index, 1);
      delete object.userData.movablePropId;
      if (object.userData.movablePropTargetProxy !== true) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    const supportIndex = this.#propPlacementSupports.findIndex(
      (support) => support.owner === record,
    );
    if (supportIndex >= 0) this.#propPlacementSupports.splice(supportIndex, 1);
    record.modelMixer?.stopAllAction();
    if (record.modelMixer) this.#modelMixers.delete(record.modelMixer);
    for (const [television, televisionProp] of this.#televisionProps) {
      if (televisionProp !== record) continue;
      if (this.#targetedTelevision === television)
        this.#setTelevisionTargeted(false);
      this.#televisionProps.delete(television);
      const televisionIndex = this.#televisions.indexOf(television);
      if (televisionIndex >= 0) this.#televisions.splice(televisionIndex, 1);
      for (const [saveId, savedTelevision] of this.#televisionsBySaveId) {
        if (savedTelevision === television)
          this.#televisionsBySaveId.delete(saveId);
      }
      television.dispose();
      break;
    }
    for (const [cabinet, cabinetProp] of this.#arcadeProps) {
      if (cabinetProp !== record) continue;
      if (this.#targetedArcadeCabinet === cabinet)
        this.#setArcadeTargeted(undefined);
      if (this.#activeArcadeCabinet === cabinet)
        this.#activeArcadeCabinet = undefined;
      this.#arcadeProps.delete(cabinet);
      const cabinetIndex = this.#arcadeCabinets.indexOf(cabinet);
      if (cabinetIndex >= 0) this.#arcadeCabinets.splice(cabinetIndex, 1);
      // Disposing kills any emulator session attached to this cabinet.
      cabinet.dispose();
      break;
    }
    // The discard volume lives inside the bin; losing a bin loses its volume.
    this.#discardBin.detach(record);
    this.#physicsWorld.removeProp(record.id);
    if (this.#movableProps.get(record.id) === record)
      this.#movableProps.delete(record.id);
    record.object.removeFromParent();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  readonly #refreshMediaCatalogIfActive = () => {
    if (
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      this.#disposed
    )
      return;
    void this.#refreshMediaCatalog();
  };

  async #refreshMediaCatalog() {
    if (this.#mediaCatalogRequestPending || this.#disposed) return;
    this.#mediaCatalogRequestPending = true;
    try {
      const catalog = await this.#loadMediaCatalog(
        this.#abortController.signal,
      );
      if (this.#disposed) return;
      this.#applyModelCatalog(catalog.models.models);
      await this.#restoreSavedModelProps();
      this.#posters.applyPosterCatalog(catalog.posters.posters);
      if (!this.#posters.saveRestoreCompleted)
        await this.#posters.restoreSavedPosters(catalog.posters.posters);
      this.#artFrames.applyArtFrameCatalog(catalog.artFrames.channels);
      if (!this.#artFrames.saveRestoreCompleted)
        await this.#artFrames.restoreSavedDigitalArtFrames(
          catalog.artFrames.channels,
        );
      this.#tvChannels = catalog.tv.channels;
      for (const television of this.#televisions)
        television.setChannels(catalog.tv.channels);
      this.#emitGameState();
    } catch (error) {
      for (const television of this.#televisions)
        television.setChannelLoadError(error);
      if (DEV && !this.#abortController.signal.aborted)
        console.warn("Afterleaf could not load the shop media catalog.", error);
    } finally {
      this.#mediaCatalogRequestPending = false;
    }
  }

  readonly #handleImagePaste = (event: ClipboardEvent) => {
    if (this.#paused()) return;
    const artFrameTarget = this.#artFrames.digitalArtFramePasteTarget();
    const imageItem = Array.from(event.clipboardData?.items ?? []).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const image = imageItem?.getAsFile();
    if (image && artFrameTarget && this.#importArtFrameImage) {
      event.preventDefault();
      void this.#artFrames.importPastedArtFrameImage(image, artFrameTarget);
      return;
    }
    if (image && this.#posters.placement && this.#importPoster) {
      event.preventDefault();
      void this.#posters.importPastedPoster(image);
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
    await this.#tvVideos.import(television, url, channelId, channelLabel);
  }

  /** Resolves both poster and digital-frame placement against the same wall snap. */

  /** Scene-local adapter for the extracted spine-shelf fixture builder. */
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
    createSpineShelfFixture(
      parent,
      fixtureId,
      x,
      z,
      length,
      bayCount,
      faceNormals,
      woodMaterial,
      backingMaterial,
      shelfEdgeMaterial,
      backingThickness,
      elevation,
      axis,
      {
        addBox: (p, size, pos, mat, castShadow) =>
          this.#addBox(p, size, pos, mat, castShadow),
        createPosterSurface: (p, id, w, h, pos, rot) =>
          this.#createPosterSurface(p, id, w, h, pos, rot),
        registerPropPlacementSupport: (object) =>
          this.#registerPropPlacementSupport(object),
        shelfTargetMeshes: this.#shelfTargetMeshes,
        signs: this.#signs,
        spineShelfDefinitions: this.#spineShelfDefinitions,
      },
    );
  }

  #emitGameState() {
    this.#gameStateEmitter.emit(this.#snapshotInput);
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
    this.#input.attach(this.#abortController.signal);
    window.addEventListener("blur", this.#handleWindowBlur, passiveOptions);
    window.addEventListener("focus", this.#refreshMediaCatalogIfActive, {
      signal: this.#abortController.signal,
    });
    document.addEventListener(
      "visibilitychange",
      this.#refreshMediaCatalogIfActive,
      {signal: this.#abortController.signal},
    );
  }

  async #loadKeyboardLayout() {
    const layout = await readKeyboardLayout();
    if (!layout || this.#disposed) return;
    let changed = false;
    for (const [code, label] of layout) {
      const normalizedLabel = label.toLowerCase();
      if (
        !normalizedLabel ||
        this.#keyboardLayout.get(code) === normalizedLabel
      )
        continue;
      this.#keyboardLayout.set(code, normalizedLabel);
      changed = true;
    }
    if (changed) this.#emitGameState();
  }

  #observeKeyboardEvent(event: KeyboardEvent) {
    const entry = keyboardLayoutEntry(event);
    if (!entry) return;
    const [code, label] = entry;
    if (this.#keyboardLayout.get(code) === label) return;
    this.#keyboardLayout.set(code, label);
    this.#emitGameState();
  }

  readonly #handleCanvasPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.#paused()) return;
    // An arcade session owns the pointer; clicking must not re-lock it.
    if (this.#arcadeStatusForUi()) return;
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
    // Gamepad look rides the same smoothed pointer-delta path as the mouse.
    const padLook = this.#input.gamepad.look;
    if (this.#pointerLocked && (padLook.yaw !== 0 || padLook.pitch !== 0)) {
      const padSensitivity = this.#gamepadLookSensitivity();
      const padMultiplier =
        Number.isFinite(padSensitivity) && padSensitivity > 0
          ? padSensitivity
          : 1;
      this.#pendingPointerMovementX +=
        padLook.yaw * GAMEPAD_LOOK_SPEED * padMultiplier * deltaSeconds;
      this.#pendingPointerMovementY +=
        padLook.pitch * GAMEPAD_LOOK_SPEED * padMultiplier * deltaSeconds;
    }
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
    if (this.#paused() || this.#shelveAnimation) return;
    if (this.#inspectionMode === "spread") {
      if (event.deltaY === 0) return;
      event.preventDefault();
      this.#zoomInspectionAtPointer(event);
      return;
    }
    const artFramePlacement = this.#artFrames.placement;
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
      this.#artFrames.updateDigitalArtFramePlacementTarget();
      this.#emitGameState();
      return;
    }
    const posterPlacement = this.#posters.placement;
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
      this.#posters.updatePosterPlacementTarget();
      this.#emitGameState();
      return;
    }
    if (
      this.#pointerLocked &&
      this.#carriedProp?.modelBaseSize &&
      event.shiftKey &&
      event.deltaY !== 0
    ) {
      event.preventDefault();
      this.#setModelPropScale(
        this.#carriedProp,
        (this.#carriedProp.modelScale ?? DEFAULT_MODEL_SCALE) *
          Math.exp(-event.deltaY * 0.0015),
      );
      return;
    }
    if (
      this.#pointerLocked &&
      this.#carriedProp &&
      event.ctrlKey &&
      event.deltaY !== 0
    ) {
      event.preventDefault();
      const rotationStep = this.#propPlacementSnapping
        ? this.#carriedProp.rotationSnapStep
        : PROP_WHEEL_ROTATION_STEP;
      this.#propPlacementYaw = normalizePosterRotation(
        this.#propPlacementYaw - Math.sign(event.deltaY) * rotationStep,
      );
      this.#updateHeldPhysicsTarget();
      this.#worldStateDirty = true;
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
    if (this.#pointerLocked && this.#carriedPublicationIds.length > 1) {
      const wheelDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (Math.abs(wheelDelta) < 1) return;
      if (!this.#cycleCarriedBook(Math.sign(wheelDelta))) return;
      event.preventDefault();
      return;
    }
    if (this.#pointerLocked && this.#televisionTargeted && event.deltaY !== 0) {
      const direction = Math.sign(event.deltaY) as -1 | 1;
      if (event.ctrlKey) {
        event.preventDefault();
        this.#targetedTelevision?.adjustVolume(direction === 1 ? -1 : 1);
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
    // Cabinet volume: the actively-attached session wins (reticle targeting
    // is not how an attached session is tracked, and pointer lock may be
    // released right after booting from the picker); otherwise a targeted,
    // still-running cabinet responds while the player is stepped away.
    const arcadeVolumeCabinet =
      this.#activeArcadeCabinet?.sessionStatus === "playing"
        ? this.#activeArcadeCabinet
        : this.#targetedArcadeCabinet?.sessionStatus === "playing"
          ? this.#targetedArcadeCabinet
          : undefined;
    if (arcadeVolumeCabinet && event.ctrlKey && event.deltaY !== 0) {
      event.preventDefault();
      // Same convention as the TV: wheel up raises the cabinet's volume.
      arcadeVolumeCabinet.adjustArcadeVolume(
        Math.sign(event.deltaY) === 1 ? -1 : 1,
      );
      return;
    }
    if (
      !this.#pointerLocked ||
      !this.#input.isActionDown("throw") ||
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
    if (!this.#pointerLocked) {
      this.#input.suspend();
      this.#cancelThrowCharge();
      this.#jumpQueued = false;
    }
    this.#canvas.style.cursor = this.#pointerLocked ? "none" : "pointer";
    this.#emitGameState();
    // Pointer lock state is orthogonal to menus: unlocks never open the
    // pause menu. Escape routing owns that (modal stack, then the armed
    // fallback), so programmatic releases and browser lock teardowns around
    // mode changes cannot summon it.
    if (
      resumePointerLock &&
      !this.#paused() &&
      this.#inspectionMode !== "spread" &&
      !this.#arcadeStatusForUi() &&
      !this.#disposed
    )
      this.#requestPointerLock();
  };

  /**
   * Single action dispatcher for every input device. Candidates arrive in
   * `ACTION_DISPATCH_ORDER`; each case checks its own context and returns
   * false when the action does not apply, letting the next candidate run.
   */
  readonly #handleActionDown = (action: ShortcutAction): boolean => {
    if (this.#paused()) return true;
    if (this.#inspectionMode === "spread") {
      switch (action) {
        case "inspectionTurnLeft":
        case "inspectionTurnRight": {
          const publication = this.#inspectionPublication();
          if (!publication) return true;
          const navigation = getArrowNavigation(
            action === "inspectionTurnLeft" ? "ArrowLeft" : "ArrowRight",
            publication.direction,
          );
          this.#inspectionHeldNavigation = navigation;
          this.turnInspectionPage(navigation);
          return true;
        }
        case "inspectionThrow":
          if (this.#inspectionPublicationId !== this.#carriedPublicationId)
            return true;
          this.#startInspectionClose("throw");
          return true;
        case "inspectionDrop":
          if (this.#inspectionPublicationId !== this.#carriedPublicationId)
            return true;
          this.#startInspectionClose("drop");
          return true;
        case "inspectionReturn":
          this.#startInspectionClose("return");
          return true;
        default:
          // A spread owns all other actions while it is open.
          return true;
      }
    }
    if (!this.#pointerLocked) return false;
    switch (action) {
      case "jump":
        this.#jumpQueued = true;
        this.#jumpQueuedAt = performance.now();
        return true;
      case "moveForward":
      case "moveBackward":
      case "moveLeft":
      case "moveRight":
      case "sprint":
        // Held-state actions are queried per frame via isActionDown.
        return true;
      case "toggleModelPlacement":
        if (this.#televisionTargeted) return false;
        if (this.#modelPlacement) {
          this.#cancelModelPlacement();
          return true;
        }
        if (
          !this.#artFrames.placement &&
          !this.#posters.placement &&
          !this.#carriedPublicationId &&
          !this.#carriedProp
        )
          void this.#startModelPlacement(this.#spawnablePropAssetIndex);
        return true;
      case "toggleArtFramePlacement":
        if (this.#artFrames.placement) {
          this.#artFrames.cancelDigitalArtFramePlacement();
          return true;
        }
        if (
          !this.#posters.placement &&
          !this.#modelPlacement &&
          !this.#carriedPublicationId &&
          !this.#carriedProp
        ) {
          if (this.#artFrames.assets.length > 0)
            this.#artFrames.startDigitalArtFramePlacement(
              this.#artFrames.assetIndex,
            );
          else this.#artFrames.startEmptyDigitalArtFramePlacement();
        }
        return true;
      case "channelEditorOpen":
        if (
          !(
            this.#artFrames.placement ||
            this.#artFrames.targetedId ||
            this.#televisionTargeted
          ) ||
          !this.#onMediaChannelCreateRequest
        )
          return false;
        {
          const kind = this.#televisionTargeted ? "tv" : "art-frame";
          this.#channelEditorTelevision =
            kind === "tv" ? this.#targetedTelevision : undefined;
          this.#channelEditorDigitalArtFrameId =
            kind === "art-frame" ? this.#artFrames.targetedId : undefined;
          this.#releasePointerLock();
          this.#onMediaChannelCreateRequest(kind);
        }
        return true;
      case "togglePosterPlacement":
        if (this.#posters.placement) {
          this.#posters.cancelPosterPlacement();
          return true;
        }
        if (
          !this.#artFrames.placement &&
          !this.#modelPlacement &&
          !this.#carriedPublicationId &&
          !this.#carriedProp
        ) {
          if (this.#posters.assets.length > 0)
            void this.#posters.startPosterPlacement(this.#posters.assetIndex);
          else this.#posters.startEmptyPosterPlacement();
        }
        return true;
      case "placementCycleLeft":
        if (this.#modelPlacement) {
          this.#cycleModelPlacement(-1);
          return true;
        }
        if (this.#posters.placement) {
          this.#posters.cyclePoster(-1);
          return true;
        }
        return false;
      case "placementCycleRight":
        if (this.#modelPlacement) {
          this.#cycleModelPlacement(1);
          return true;
        }
        if (this.#posters.placement) {
          this.#posters.cyclePoster(1);
          return true;
        }
        return false;
      case "placementCycleChannelLeft":
        if (!this.#artFrames.placement) return false;
        this.#artFrames.cycleDigitalArtFramePlacementChannel(-1);
        return true;
      case "placementCycleChannelRight":
        if (!this.#artFrames.placement) return false;
        this.#artFrames.cycleDigitalArtFramePlacementChannel(1);
        return true;
      case "placementCycleImageLeft":
        if (!this.#artFrames.placement) return false;
        this.#artFrames.cycleDigitalArtFramePlacementImage(-1);
        return true;
      case "placementCycleImageRight":
        if (!this.#artFrames.placement) return false;
        this.#artFrames.cycleDigitalArtFramePlacementImage(1);
        return true;
      case "placementToggleFit":
        if (!this.#artFrames.placement) return false;
        this.#artFrames.placement.fit =
          this.#artFrames.placement.fit === "contain" ? "cover" : "contain";
        this.#artFrames.preview?.setFit(this.#artFrames.placement.fit);
        this.#emitGameState();
        return true;
      case "placementToggleInterval": {
        if (!this.#artFrames.placement) return false;
        const intervalIndex = DIGITAL_ART_FRAME_INTERVALS.indexOf(
          this.#artFrames.placement
            .intervalSeconds as (typeof DIGITAL_ART_FRAME_INTERVALS)[number],
        );
        const interval =
          DIGITAL_ART_FRAME_INTERVALS[
            (Math.max(0, intervalIndex) + 1) %
              DIGITAL_ART_FRAME_INTERVALS.length
          ];
        if (interval !== undefined)
          this.#artFrames.placement.intervalSeconds = interval;
        this.#emitGameState();
        return true;
      }
      case "propToggleSnap":
        if (!this.#carriedProp) return false;
        this.#propPlacementSnapping = !this.#propPlacementSnapping;
        this.#emitGameState();
        return true;
      case "propCycleAnimationLeft":
        if (!this.#targetedProp?.modelAnimations?.length) return false;
        this.#cycleModelAnimation(this.#targetedProp, -1);
        return true;
      case "propCycleAnimationRight":
        if (!this.#targetedProp?.modelAnimations?.length) return false;
        this.#cycleModelAnimation(this.#targetedProp, 1);
        return true;
      case "removeTargeted": {
        const targetedTelevisionProp = this.#targetedTelevision
          ? this.#televisionProps.get(this.#targetedTelevision)
          : undefined;
        const targetedArcadeProp = this.#targetedArcadeCabinet
          ? this.#arcadeProps.get(this.#targetedArcadeCabinet)
          : undefined;
        if (targetedTelevisionProp?.spawned) {
          this.#removeSpawnedProp(targetedTelevisionProp);
          return true;
        }
        if (targetedArcadeProp?.spawned) {
          this.#removeSpawnedProp(targetedArcadeProp);
          return true;
        }
        if (this.#targetedProp?.spawned) {
          this.#removeSpawnedProp(this.#targetedProp);
          return true;
        }
        if (this.#artFrames.targetedId) {
          this.#artFrames.removeTargetedDigitalArtFrame();
          return true;
        }
        if (this.#posters.targetedId) {
          this.#posters.removeTargetedPoster();
          return true;
        }
        // Nothing targeted: let later candidates use the same binding.
        return false;
      }
      case "placementToggleGridSnap": {
        if (!this.#artFrames.placement && !this.#posters.placement)
          return false;
        const placement = this.#artFrames.placement ?? this.#posters.placement;
        if (placement) placement.gridSnap = !placement.gridSnap;
        this.#artFrames.updateDigitalArtFramePlacementTarget();
        this.#posters.updatePosterPlacementTarget();
        this.#emitGameState();
        return true;
      }
      case "pickUpCancel":
        if (this.#modelPlacement) {
          this.#cancelModelPlacement();
          return true;
        }
        if (this.#artFrames.placement) {
          this.#artFrames.cancelDigitalArtFramePlacement();
          return true;
        }
        if (this.#posters.placement) {
          this.#posters.cancelPosterPlacement();
          return true;
        }
        if (this.#carriedProp) {
          this.#cancelCarriedProp();
          return true;
        }
        if (this.#targetedArcadeCabinet) {
          const cabinetProp = this.#arcadeProps.get(
            this.#targetedArcadeCabinet,
          );
          if (cabinetProp) this.#pickUpProp(cabinetProp);
          return true;
        }
        if (this.#televisionTargeted) {
          const televisionProp = this.#targetedTelevision
            ? this.#televisionProps.get(this.#targetedTelevision)
            : undefined;
          if (televisionProp) this.#pickUpProp(televisionProp);
          return true;
        }
        if (this.#targetedProp) {
          this.#pickUpProp(this.#targetedProp);
          return true;
        }
        if (this.#artFrames.targetedId || this.#posters.targetedId) {
          this.#interact();
          return true;
        }
        return false;
      case "artFramePreviousChannel":
        if (!this.#artFrames.targetedId) return false;
        this.#artFrames.records
          .get(this.#artFrames.targetedId)
          ?.frame.changeChannel(-1);
        this.#worldStateDirty = true;
        this.#emitGameState();
        return true;
      case "artFrameNextChannel":
        if (!this.#artFrames.targetedId) return false;
        this.#artFrames.records
          .get(this.#artFrames.targetedId)
          ?.frame.changeChannel(1);
        this.#worldStateDirty = true;
        this.#emitGameState();
        return true;
      case "artFrameInterval":
        if (!this.#artFrames.targetedId) return false;
        this.#artFrames.cycleTargetedDigitalArtFrameInterval();
        return true;
      case "artFrameFit":
        if (!this.#artFrames.targetedId) return false;
        this.#artFrames.cycleTargetedDigitalArtFrameFit();
        return true;
      case "tvPreviousChannel":
        if (!this.#televisionTargeted) return false;
        this.#targetedTelevision?.previousChannel();
        return true;
      case "tvMute":
        if (!this.#televisionTargeted) return false;
        this.#targetedTelevision?.toggleMuted();
        return true;
      case "toggleShelfPresentation":
        if (!this.#carriedPublicationId) return false;
        this.#shelfPresentation =
          this.#shelfPresentation === "spine" ? "face" : "spine";
        this.#updateInteractionTarget();
        return true;
      case "propPinToggle": {
        // Pin or release whatever movable prop is under the reticle: a
        // locked prop keeps a fixed body that still blocks the player,
        // books, and other props, but nothing can bump it around.
        const lockableProp =
          this.#targetedProp ??
          (this.#targetedTelevision
            ? this.#televisionProps.get(this.#targetedTelevision)
            : undefined) ??
          (this.#targetedArcadeCabinet
            ? this.#arcadeProps.get(this.#targetedArcadeCabinet)
            : undefined);
        if (!lockableProp || this.#carriedProp === lockableProp) return false;
        const locked = !lockableProp.locked;
        lockableProp.locked = locked;
        this.#physicsWorld.setPropLocked(lockableProp.id, locked);
        this.#worldStateDirty = true;
        this.#emitGameState();
        return true;
      }
      case "interact":
        this.#triggerInteraction();
        return true;
      case "throw":
        if (this.#televisionTargeted) this.#targetedTelevision?.skip();
        else if (this.#artFrames.targetedId)
          this.#artFrames.records.get(this.#artFrames.targetedId)?.frame.skip();
        else if (this.#carriedProp) this.#dropCarriedProp(true);
        else if (this.#carriedPublicationId) this.#startThrowCharge();
        // Held throw state drives shelf browsing; isActionDown covers it.
        return true;
      case "drop":
        if (this.#artFrames.placement || this.#posters.placement) return true;
        if (this.#artFrames.targetedId)
          this.#artFrames.removeTargetedDigitalArtFrame();
        else if (this.#posters.targetedId) this.#posters.removeTargetedPoster();
        else if (this.#carriedProp) this.#dropCarriedProp();
        else this.#dropCarriedBook();
        return true;
      case "inspectionReturn": {
        const hoveredRecord = this.#hoveredPublicationId
          ? this.#booksById.get(this.#hoveredPublicationId)
          : undefined;
        if (this.#carriedPublicationId)
          this.#advanceInspectionMode(this.#carriedPublicationId);
        else if (hoveredRecord?.state.status === "shelved")
          this.#advanceInspectionMode(this.#hoveredPublicationId);
        return true;
      }
      default:
        return false;
    }
  };

  readonly #handleActionUp = (action: ShortcutAction): boolean => {
    if (this.#paused()) return true;
    switch (action) {
      case "throw":
        if (this.#throwChargeActive) this.#releaseThrowCharge();
        else if (this.#inspectionMode === "none") {
          this.#shelfBrowsePublicationId = undefined;
          this.#updateInteractionTarget();
        }
        return true;
      case "inspectionTurnLeft":
      case "inspectionTurnRight": {
        const direction = this.#inspectionPublication()?.direction ?? "LTR";
        const navigation = getArrowNavigation(
          action === "inspectionTurnLeft" ? "ArrowLeft" : "ArrowRight",
          direction,
        );
        if (this.#inspectionHeldNavigation === navigation)
          this.#inspectionHeldNavigation = undefined;
        return true;
      }
      default:
        // Decline so lower-priority candidates sharing the binding still
        // receive the release - throwing must see its own key-up.
        return false;
    }
  };

  #triggerInteraction() {
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
    if (this.#targetedProp || this.#posters.targetedId) return;
    this.#interact();
  }

  /** Raw-key interceptor: while an arcade session plays, keys feed it. */
  #forwardArcadeKey(event: KeyboardEvent): boolean {
    if (this.#paused()) return false;
    if (this.#activeArcadeCabinet?.sessionStatus !== "playing") return false;
    // Tab owns the menus and must never reach the game; the global modal
    // stack handles it. Escape stays browser-reserved for pointer lock.
    if (event.type === "keydown" && event.code === "Tab") return true;
    if (event.type === "keydown" && event.code === "KeyR") {
      event.preventDefault();
      this.stepAwayFromArcade();
      return true;
    }
    if (event.type === "keydown" && event.code === "KeyP") {
      event.preventDefault();
      this.quitActiveArcadeGame();
      return true;
    }
    event.preventDefault();
    this.#activeArcadeCabinet.forwardKey(
      event.type === "keydown",
      describeKeyboardEvent(event),
    );
    return true;
  }

  readonly #handleWindowBlur = () => {
    this.#input.suspend();
    this.#inspectionHeldNavigation = undefined;
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
    this.#input.suspend();
    this.#cancelThrowCharge();
    this.#jumpQueued = false;
    this.#resetPointerMovement();
    this.#releasePointerLock();
    this.#setHoveredPublicationId(undefined);
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#signs.previewKey = undefined;
    this.#signs.targetedKey = undefined;
    this.#signs.updateTargetVisuals();
    this.#setPropTargeted(undefined);
    this.#setTelevisionTargeted(false);
    this.#setArcadeTargeted(undefined);
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

  #setArcadeTargeted(cabinet: ShopArcadeCabinet | undefined) {
    if (cabinet === this.#targetedArcadeCabinet) return;
    this.#targetedArcadeCabinet?.setTargeted(false);
    this.#targetedArcadeCabinet = cabinet;
    cabinet?.setTargeted(true);
    this.#emitGameState();
  }

  #setTrashTargeted(targeted: boolean) {
    if (targeted === this.#trashTargeted) return;
    this.#trashTargeted = targeted;
    this.#applyBookStates();
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
    if (record && publicationId !== undefined)
      this.#bookTextures.ensureStandaloneBookTextures(publicationId, record);
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
    // Preserve the mounted world while the catalog is unavailable. Once a valid
    // catalog returns, its changed accessor value will resume synchronization.
    if (!this.#catalogAvailable()) return;
    const items = this.#catalogItems();
    const newPublicationIds = this.#newPublicationIds();
    const itemsChanged = items !== this.#lastItems;
    const arrivalsChanged = newPublicationIds !== this.#lastNewPublicationIds;
    if (itemsChanged || arrivalsChanged) {
      const hasUnobservedArrivals =
        arrivalsChanged &&
        newPublicationIds.some(
          (publicationId) => !this.#observedArrivalIds.has(publicationId),
        );
      const discardOnlyUpdate =
        itemsChanged &&
        !hasUnobservedArrivals &&
        this.#isDiscardOnlyCatalogUpdate(items);
      this.#lastItems = items;
      this.#lastNewPublicationIds = newPublicationIds;
      if ((itemsChanged || hasUnobservedArrivals) && !discardOnlyUpdate)
        this.#syncBooks(items, newPublicationIds);
    }

    const selectedPublicationId = this.#selectedPublicationId();
    if (selectedPublicationId === this.#lastSelectedPublicationId) return;
    this.#lastSelectedPublicationId = selectedPublicationId;
    const record = selectedPublicationId
      ? this.#booksById.get(selectedPublicationId)
      : undefined;
    if (record && selectedPublicationId)
      this.#bookTextures.ensureStandaloneBookTextures(
        selectedPublicationId,
        record,
      );
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
      for (const slot of this.#signs.slots.values()) {
        if (slot.kind === "shelf" && slot.column !== undefined)
          this.#signs.setShelfSign(slot.column, "");
      }
      for (const sign of save.shelfSigns)
        this.#signs.setShelfSign(sign.column, sign.text, sign.subtitle);
    }
    if (save.aisleSigns) {
      for (const [key, slot] of this.#signs.slots) {
        if (slot.kind === "aisle") this.#signs.setSign(key, "", "");
      }
      for (const sign of save.aisleSigns)
        this.#signs.setSign(
          shopSignKey("aisle", sign.id),
          sign.title,
          sign.subtitle ?? "",
        );
    }
    // Legacy trashcan positions apply only while migrating worlds that
    // never ran a seeding pass; afterwards the bin's pose lives in
    // modelProps like any prop.
    if (
      worldSaveSeedingVersion(save) < INITIAL_WORLD_SEEDING_VERSION &&
      save.trashcan
    )
      this.#discardBin.setPosition(save.trashcan.x, save.trashcan.z, false);
    // Legacy `television` pose fields are intentionally ignored: worlds
    // saved before default-prop seeding respawn the movable CRT television
    // at its designed spot through #seedDefaultProps instead.
    const savedProps = save.props ?? [];
    // Cave CRTs live in modelProps now: drop every legacy pose-only
    // tv-cave entry so they cannot double with the restored props, and
    // mark the world dirty so the next save drops them from disk.
    const hasLegacyTvCaveProps = savedProps.some((savedProp) =>
      savedProp.id.startsWith("tv-cave-"),
    );
    if (hasLegacyTvCaveProps) this.#worldStateDirty = true;
    this.#pendingPropSaves = new Map(
      savedProps
        .filter((savedProp) => !savedProp.id.startsWith("tv-cave-"))
        .map((savedProp) => [savedProp.id, savedProp]),
    );
    for (const [id, record] of this.#movableProps) {
      const savedProp = this.#pendingPropSaves.get(id);
      if (!savedProp) continue;
      this.#applySavedPropPose(record, savedProp);
      this.#pendingPropSaves.delete(id);
    }
    this.#posters.pendingSaves = save.posters ?? [];
    this.#artFrames.pendingSaves = save.digitalArtFrames ?? [];
    // Saved model props whose ids already exist (registered during boot)
    // adopt their saved pose, scale, and lock here; only genuinely missing
    // ids remain for #restoreSavedModelProps to spawn.
    const adoptedModelPropSaves: WorldModelPropSave[] = [];
    for (const savedProp of save.modelProps ?? []) {
      const record = this.#movableProps.get(savedProp.id);
      if (!record) {
        adoptedModelPropSaves.push(savedProp);
        continue;
      }
      this.#applySavedPropPose(record, savedProp);
      // Boot-registered defaults spawn at seed scale; without this, a
      // player-scaled default would silently revert and the next save
      // would overwrite the stored scale with the reverted value.
      if (savedProp.scale !== record.modelScale)
        this.#setModelPropScale(record, savedProp.scale);
      if (savedProp.locked && !record.locked) {
        record.locked = true;
        this.#physicsWorld.setPropLocked(record.id, true);
      }
    }
    this.#pendingModelPropSaves = adoptedModelPropSaves;
    void this.#restoreSavedModelProps();
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
    const atlasRevision = this.#bookTextures.bumpRevision();
    this.#bookTextures.disposeBookAtlasBatches();
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
    const retainedIds = new Set<string>([
      ...(this.#discardAnimation ? [this.#discardAnimation.publicationId] : []),
      ...(this.#shelveAnimation ? [this.#shelveAnimation.publicationId] : []),
    ]);
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
        record = createBook(
          item,
          signature,
          initialSlotIndex,
          true,
          retainedGameplay,
          this.#placeBookOnFloor.bind(this) as (
            record: BookRecord,
            floorIndex: number,
            seedValue: string,
          ) => void,
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
        this.#bookTextures.promoteBookCoverTexture(item.id, record);
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
      if (this.#carriedPublicationIds.includes(publicationId))
        this.#removeCarriedPublication(publicationId);
      this.#physicsWorld.removeBook(publicationId);
      this.#disposeBookRecord(record);
      this.#booksById.delete(publicationId);
    }
    this.#syncCarriedPublicationIds();
    this.#syncCarriedBookPresentation();
    this.#syncInteractiveMeshes();
    this.#applyBookStates();
    this.#updateHeldPhysicsTarget();
    this.#worldStateDirty = true;
    this.#emitGameState();
    // Book textures stream into the scene as batches finish; readiness does
    // not wait on them.
    void this.#bookTextures.initializeBookAtlasBatches(items, atlasRevision);
  }

  /**
   * Loads a shelf atlas texture, transparently using basis-compressed KTX2
   * for catalogs that ship it. Compressed textures cannot be flipped at
   * upload time; the pipeline bakes the vertical flip in instead.
   */

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
    const normalOffset =
      record.shelfPresentation === "face"
        ? -record.thickness / 2 - shelf.faceInset
        : spineShelfBookNormalOffset(record.width, shelf.backInset);
    record.shelfPosition
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, record.shelfOffset)
      .addScaledVector(shelf.normal, normalOffset);
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

  #syncCarriedPublicationIds() {
    const carriedIds = new Set(
      [...this.#booksById.entries()]
        .filter(
          ([publicationId, record]) =>
            record.state.status === "carried" &&
            publicationId !== this.#discardAnimation?.publicationId,
        )
        .map(([publicationId]) => publicationId),
    );
    const nextIds = this.#carriedPublicationIds.filter((id) =>
      carriedIds.has(id),
    );
    for (const publicationId of this.#booksById.keys())
      if (carriedIds.has(publicationId) && !nextIds.includes(publicationId))
        nextIds.push(publicationId);
    this.#carriedPublicationIds.splice(
      0,
      this.#carriedPublicationIds.length,
      ...nextIds,
    );
    this.#carriedPublicationId = this.#carriedPublicationIds[0];
  }

  #removeCarriedPublication(publicationId: string) {
    const index = this.#carriedPublicationIds.indexOf(publicationId);
    if (index < 0) return;
    this.#carriedPublicationIds.splice(index, 1);
    this.#carriedPublicationId = this.#carriedPublicationIds[0];
  }

  #syncInteractiveMeshes() {
    this.#interactiveMeshes = [...this.#booksById.values()]
      .filter((record) => record.state.status === "floor")
      .map((record) => record.mesh);
    // Group shelved proxies per shelf so the reticle sweep can cull whole
    // banks by camera distance instead of raycasting every book in the shop.
    this.#shelfHoverMeshesByShelf.clear();
    this.#ungroupedShelfHoverMeshes.length = 0;
    for (const record of this.#booksById.values()) {
      if (record.state.status !== "shelved") continue;
      const {shelfId} = record.state;
      const knownShelf =
        typeof shelfId === "string"
          ? this.#spineShelfDefinitions.get(shelfId)
          : undefined;
      if (!knownShelf || typeof shelfId !== "string") {
        this.#ungroupedShelfHoverMeshes.push(record.hoverTarget);
        continue;
      }
      let bucket = this.#shelfHoverMeshesByShelf.get(shelfId);
      if (!bucket) {
        bucket = [];
        this.#shelfHoverMeshesByShelf.set(shelfId, bucket);
      }
      bucket.push(record.hoverTarget);
    }
    this.#interactionTargetsDirty = true;
  }

  #disposeBookRecord(record: BookRecord) {
    const publicationId = record.mesh.userData.publicationId;
    if (typeof publicationId === "string")
      this.#bookTextures.forgetStandaloneId(publicationId);
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
      const discardTargeted =
        publicationId === this.#carriedPublicationId && this.#trashTargeted;
      record.sceneEmissive.set(
        discardTargeted
          ? DISCARD_TARGETED_EMISSIVE
          : hovered
            ? "#a34437"
            : selected
              ? "#49231f"
              : "#000000",
      );
      record.sceneEmissiveIntensity = discardTargeted
        ? DISCARD_TARGETED_EMISSIVE_INTENSITY
        : hovered
          ? 0.55
          : 0.2;
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
    // Digital keyboard input and analog stick input combine, then clamp.
    const padMovement = this.#input.gamepad.movement;
    this.#movementInput.forward = clampUnit(
      Number(this.#input.isActionDown("moveForward")) -
        Number(this.#input.isActionDown("moveBackward")) +
        padMovement.forward,
    );
    this.#movementInput.right = clampUnit(
      Number(this.#input.isActionDown("moveRight")) -
        Number(this.#input.isActionDown("moveLeft")) +
        padMovement.right,
    );
    const sprinting = this.#input.isActionDown("sprint");
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
      this.#bookTextures.promoteBookCoverTexture(publication.id, record);
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
    if (action === "drop") this.#dropCarriedBook(true, false, 0, publicationId);
    else if (action === "throw")
      this.#dropCarriedBook(true, true, 0, publicationId);
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
    this.#inspectionQueuedTurn = undefined;
    this.#inspectionHeldNavigation = undefined;
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
    this.#inspectionQueuedTurn = undefined;
    this.#inspectionHeldNavigation = undefined;
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
      this.#inspectionOpenAngle > 0.08
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
      this.#inspectionTurnPage !== undefined ||
      this.#inspectionTurnPreparing
    ) {
      // Accept the next command only once the in-flight turn is past 80%;
      // the damped easing makes early progress look faster than it is, so a
      // high threshold keeps rapid taps from queueing unintended turns.
      const forward = this.#inspectionTurnNavigation === "forward";
      const completion = forward
        ? this.#inspectionTurnProgress
        : 1 - this.#inspectionTurnProgress;
      if (completion <= 0.8) return;
      // Buffer the latest intent; it fires once the in-flight turn finishes.
      this.#inspectionQueuedTurn = navigation;
      return;
    }
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
    // Hold the current spread as well: its textures stay assigned to the
    // surface materials until the turn commits, so they must stay referenced
    // even if a prior texture sync was invalidated and dropped its holds.
    const currentUrls = this.#inspectionPageUrls(
      publication,
      this.#inspectionPageIndex,
    );
    const requestedUrls = new Set(
      [
        currentUrls.left,
        currentUrls.right,
        targetUrls.left,
        targetUrls.right,
      ].filter((url): url is string => url !== undefined),
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
    this.#updateHeldInspectionTurn();
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
      // Flush first so a queued prepare re-holds the restored spread
      // textures before this release drops the finished turn's holds.
      this.#flushQueuedInspectionTurn();
      this.#releaseInspectionTurnTextures();
      return;
    }
    this.#onPageIndexChange?.(publication.id, this.#inspectionPageIndex);
    this.#emitGameState();
    // Re-acquire order matters here: the sync below re-holds the newly
    // displayed spread, and a queued prepare re-holds current+target, both
    // synchronously within this task. Releasing the finished turn's holds
    // must also happen in this task — deferring it lets a stale sync run
    // after a newer prepare swapped the turn-texture set, releasing the
    // textures still assigned to materials and flashing them white.
    void this.#syncInspectionPageTextures(publication);
    this.#flushQueuedInspectionTurn();
    this.#releaseInspectionTurnTextures();
  }

  #flushQueuedInspectionTurn() {
    const navigation = this.#inspectionQueuedTurn;
    if (!navigation) return;
    this.#inspectionQueuedTurn = undefined;
    this.turnInspectionPage(navigation);
  }

  // Fires the held key's navigation every frame the book can accept a turn,
  // producing continuous page turns while A or D is held down.
  #updateHeldInspectionTurn() {
    const navigation = this.#inspectionHeldNavigation;
    if (!navigation) return;
    if (
      this.#inspectionMode !== "spread" ||
      this.#inspectionOpeningDelay > 0 ||
      this.#inspectionOpenAngle > 0.08 ||
      this.#inspectionTurnPage !== undefined ||
      this.#inspectionTurnPreparing ||
      this.#inspectionDragging
    )
      return;
    this.turnInspectionPage(navigation);
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
    this.#bookTextures.restoreCompactBookCoverTexture(record);
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
    const turnRevision = this.#inspectionTurnRevision;
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
      // A page turn prepared after this sync started owns the surface
      // materials; applying spread textures here would flash mid-turn.
      turnRevision !== this.#inspectionTurnRevision ||
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
    const publicationId =
      this.#inspectionPublicationId ?? this.#carriedPublicationId;
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
      const publicationId = this.#inspectionPublicationId;
      const carriedIndex = publicationId
        ? this.#carriedPublicationIds.indexOf(publicationId)
        : -1;
      if (carriedIndex >= 0) {
        this.#writeHeldBookLocalPosition(
          carriedIndex,
          this.#inspectionLocalPosition,
        );
        this.#writeHeldBookLocalRotation(
          carriedIndex,
          this.#inspectionLocalRotation,
        );
      } else {
        this.#inspectionLocalPosition.copy(this.#heldLocalPosition);
        this.#inspectionLocalRotation.copy(this.#heldLocalRotation);
      }
      targetPosition = this.#inspectionLocalPosition;
      targetRotation = this.#inspectionLocalRotation;
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

  #heldBookStackOffset(index: number) {
    let offset = 0;
    for (let stackIndex = 1; stackIndex <= index; stackIndex += 1) {
      const previous = this.#booksById.get(
        this.#carriedPublicationIds[stackIndex - 1] ?? "",
      );
      const current = this.#booksById.get(
        this.#carriedPublicationIds[stackIndex] ?? "",
      );
      if (!previous || !current) continue;
      offset += (previous.thickness + current.thickness) / 2;
      offset += HELD_BOOK_STACK_GAP;
    }
    return offset;
  }

  #writeHeldBookLocalPosition(index: number, output: Vector3) {
    const activeIndex = 0;
    const relativeIndex = index - activeIndex;
    output.copy(this.#heldLocalPosition);
    output.x += relativeIndex * HELD_BOOK_FAN_X_SPACING;
    output.y += relativeIndex * HELD_BOOK_FAN_Y_SPACING;
    output.z -= this.#heldBookStackOffset(index);
  }

  #writeHeldBookLocalRotation(index: number, output: Quaternion) {
    const activeIndex = 0;
    const relativeIndex = index - activeIndex;
    this.#heldBookFanRotation.setFromAxisAngle(
      this.#heldBookFanAxis,
      relativeIndex * HELD_BOOK_FAN_ANGLE,
    );
    output.copy(this.#heldLocalRotation).multiply(this.#heldBookFanRotation);
  }

  #syncCarriedBookPresentation() {
    if (this.#physicsWorld.isReady) return;
    for (const [
      index,
      publicationId,
    ] of this.#carriedPublicationIds.entries()) {
      if (
        publicationId === this.#inspectionPublicationId &&
        this.#inspectionMode !== "none"
      )
        continue;
      const record = this.#booksById.get(publicationId);
      if (!record) continue;
      if (record.mesh.parent !== this.#camera) this.#camera.add(record.mesh);
      this.#writeHeldBookLocalPosition(index, this.#heldTargetPosition);
      record.mesh.position.copy(this.#heldTargetPosition);
      this.#writeHeldBookLocalRotation(index, record.mesh.quaternion);
      record.mesh.scale.setScalar(1);
    }
  }

  #writeHeldBookTargetPose(index: number, publicationId: string) {
    const inspecting =
      this.#inspectionMode === "spread" &&
      publicationId === this.#inspectionPublicationId;
    if (inspecting) {
      this.#updateInspectionLocalTarget();
      this.#heldTargetPosition.copy(this.#inspectionLocalPosition);
    } else this.#writeHeldBookLocalPosition(index, this.#heldTargetPosition);
    this.#heldTargetPosition.applyMatrix4(this.#camera.matrixWorld);
    this.#camera.getWorldQuaternion(this.#heldTargetRotation);
    if (!inspecting) {
      this.#writeHeldBookLocalRotation(index, this.#heldBookLocalPoseRotation);
      this.#heldTargetRotation.multiply(this.#heldBookLocalPoseRotation);
    }
  }

  #updateHeldPhysicsTarget() {
    const prop = this.#carriedProp;
    if (prop) {
      this.#camera.updateMatrixWorld();
      this.#heldTargetPosition
        .copy(prop.heldLocalPosition)
        .setZ(-this.#propPlacementDistance)
        .applyMatrix4(this.#camera.matrixWorld);
      if (this.#propPlacementSnapping) {
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
      if (this.#propPlacementSnapping)
        this.#physicsWorld.snapHeldProp(prop.id, this.#heldTargetPose);
      else this.#physicsWorld.setHeldPropTarget(prop.id, this.#heldTargetPose);
      return;
    }

    if (this.#carriedPublicationIds.length === 0) return;
    this.#camera.updateMatrixWorld();
    for (const [
      index,
      publicationId,
    ] of this.#carriedPublicationIds.entries()) {
      this.#writeHeldBookTargetPose(index, publicationId);
      this.#physicsWorld.setHeldTarget(publicationId, this.#heldTargetPose);
    }
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

  #shelfSignKeyForTarget(shelfId: string, offset?: number) {
    const shelf = this.#spineShelfDefinitions.get(shelfId);
    if (!shelf) return undefined;
    if (shelf.signKey) return shelf.signKey;
    if (!shelfId.startsWith(`${FACE_SHELF_ID}:`) || offset === undefined)
      return undefined;
    const column = MathUtils.clamp(
      Math.round(
        offset / FACE_DISPLAY_COLUMN_SPACING + (FACE_DISPLAY_COLUMNS - 1) / 2,
      ),
      0,
      FACE_DISPLAY_COLUMNS - 1,
    );
    const key = shopSignKey("shelf", String(column));
    return this.#signs.has(key) ? key : undefined;
  }

  #cycleCarriedBook(direction: number) {
    if (
      direction === 0 ||
      this.#discardBusy ||
      this.#throwChargeActive ||
      this.#inspectionMode !== "none" ||
      this.#carriedPublicationIds.length < 2
    )
      return false;
    if (direction > 0) {
      const front = this.#carriedPublicationIds.shift();
      if (front) this.#carriedPublicationIds.push(front);
    } else {
      const back = this.#carriedPublicationIds.pop();
      if (back) this.#carriedPublicationIds.unshift(back);
    }
    this.#carriedPublicationId = this.#carriedPublicationIds[0];
    const record = this.#carriedPublicationId
      ? this.#booksById.get(this.#carriedPublicationId)
      : undefined;
    if (record && this.#carriedPublicationId)
      this.#bookTextures.promoteBookCoverTexture(
        this.#carriedPublicationId,
        record,
      );
    this.#syncCarriedBookPresentation();
    this.#updateHeldPhysicsTarget();
    this.#updateInteractionTarget();
    this.#emitGameState();
    return true;
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
    // Whole-shelf cull: shelves farther than the interaction reach cannot
    // contain a hit, so only nearby banks' proxies are raycast. Ungrouped
    // proxies (shelf definition missing) always stay in the candidate set.
    const scratch = this.#shelfHoverSweepScratch;
    scratch.length = 0;
    for (const [shelfId, meshes] of this.#shelfHoverMeshesByShelf) {
      const shelf = this.#spineShelfDefinitions.get(shelfId);
      if (!shelf) continue;
      const cullDistance =
        INTERACTION_DISTANCE + shelf.halfWidth + SHELF_HOVER_CULL_MARGIN;
      if (
        this.#camera.position.distanceToSquared(shelf.frontCenter) >
        cullDistance * cullDistance
      )
        continue;
      for (const mesh of meshes) scratch.push(mesh);
    }
    for (const mesh of this.#ungroupedShelfHoverMeshes) scratch.push(mesh);
    if (scratch.length === 0) return undefined;
    const intersections = this.#raycaster.intersectObjects(scratch, false);
    for (const intersection of intersections) {
      if (intersection.distance > INTERACTION_DISTANCE) break;
      const candidateId = intersection.object.userData.publicationId;
      if (typeof candidateId === "string") return candidateId;
    }
    return undefined;
  }

  #updateInteractionTarget() {
    // An arcade session owns the screen; retargeting would fight its UI.
    if (this.#arcadeStatusForUi()) {
      this.#signs.clearShelfSignPreview();
      return;
    }
    if (this.#inspectionMode !== "none") {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#signs.clearShelfSignPreview();
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      return;
    }
    if (this.#shelveAnimation) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#signs.clearShelfSignPreview();
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      this.#signs.updateTargetVisuals();
      return;
    }
    if (!this.#pointerLocked) {
      this.#signs.clearShelfSignPreview();
      this.#posters.updatePosterPlacementTarget();
      this.#artFrames.updateDigitalArtFramePlacementTarget();
      this.#setHoveredPublicationId(undefined);
      if (
        this.#shelfTargeted ||
        this.#trashTargeted ||
        this.#televisionTargeted ||
        this.#targetedProp !== undefined ||
        this.#artFrames.targetedId !== undefined ||
        this.#posters.targetedId !== undefined ||
        this.#signs.targetedKey !== undefined
      ) {
        this.#shelfTargeted = false;
        this.#shelfTargetSelection = undefined;
        this.#signs.targetedKey = undefined;
        this.#posters.targetedId = undefined;
        this.#artFrames.setDigitalArtFrameTargeted();
        this.#setPropTargeted(undefined);
        this.#setTrashTargeted(false);
        this.#setTelevisionTargeted(false);
        this.#setArcadeTargeted(undefined);
        this.#updateShelfTargetVisuals();
        this.#signs.updateTargetVisuals();
        this.#emitGameState();
      }
      return;
    }

    // Aiming results feed highlight prompts and clicks, which tolerate a
    // frame or two of latency - so the full-shop reticle sweep runs on a
    // fixed-rate budget instead of every tick, capping its cost while the
    // player whips the view around.
    if (this.#frameNowMs - this.#lastAimSweepTimeMs < AIM_SWEEP_MIN_INTERVAL_MS)
      return;
    // The reticle is screen-center, so the sweep result only changes when
    // the camera moves or targetable content changed; skip otherwise.
    if (
      !this.#interactionTargetsDirty &&
      this.#camera.position.equals(this.#lastSweepPosition) &&
      this.#camera.quaternion.equals(this.#lastSweepQuaternion)
    )
      return;
    this.#interactionTargetsDirty = false;
    this.#lastSweepPosition.copy(this.#camera.position);
    this.#lastSweepQuaternion.copy(this.#camera.quaternion);
    this.#lastAimSweepTimeMs = this.#frameNowMs;
    this.#camera.updateMatrixWorld();
    this.#raycaster.setFromCamera(this.#reticle, this.#camera);
    if (this.#artFrames.placement) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#signs.clearShelfSignPreview();
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#updateShelfTargetVisuals();
      this.#signs.updateTargetVisuals();
      this.#artFrames.updateDigitalArtFramePlacementTarget();
      return;
    }
    if (this.#posters.placement) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#signs.clearShelfSignPreview();
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#setArcadeTargeted(undefined);
      this.#updateShelfTargetVisuals();
      this.#signs.updateTargetVisuals();
      this.#posters.updatePosterPlacementTarget();
      return;
    }
    if (this.#carriedProp) {
      this.#setHoveredPublicationId(undefined);
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#signs.clearShelfSignPreview();
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#setTelevisionTargeted(false);
      this.#setArcadeTargeted(undefined);
      this.#updateShelfTargetVisuals();
      this.#signs.updateTargetVisuals();
      return;
    }
    if (this.#carriedPublicationId) {
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setPropTargeted(undefined);
      this.#setTelevisionTargeted(false);
      const trashIntersection = this.#raycaster.intersectObjects(
        this.#discardBin.volumeMeshes,
        false,
      )[0];
      const trashTargeted =
        trashIntersection !== undefined &&
        trashIntersection.distance <= TRASH_INTERACTION_DISTANCE;
      this.#targetedTrashBinId = trashTargeted
        ? (trashIntersection?.object.userData.propId as string | undefined)
        : undefined;
      let pickupPublicationId: string | undefined;
      if (
        !trashTargeted &&
        this.#carriedPublicationIds.length < MAX_CARRIED_BOOKS
      ) {
        const directBookIntersection = this.#raycaster.intersectObjects(
          this.#interactiveMeshes,
          false,
        )[0];
        const directPublicationId =
          directBookIntersection &&
          directBookIntersection.distance <= INTERACTION_DISTANCE
            ? directBookIntersection.object.userData.publicationId
            : undefined;
        const directRecord =
          typeof directPublicationId === "string"
            ? this.#booksById.get(directPublicationId)
            : undefined;
        if (directRecord?.state.status === "floor")
          pickupPublicationId = directPublicationId;
        else {
          const shelfPublicationId = this.#findShelfHoverTargetPublicationId();
          const shelfRecord = shelfPublicationId
            ? this.#booksById.get(shelfPublicationId)
            : undefined;
          if (shelfRecord?.state.status === "shelved")
            pickupPublicationId = shelfPublicationId;
        }
      }
      if (pickupPublicationId) {
        this.#setHoveredPublicationId(pickupPublicationId);
        this.#shelfTargeted = false;
        this.#shelfTargetSelection = undefined;
        this.#signs.clearShelfSignPreview();
        this.#setTrashTargeted(false);
        this.#updateShelfTargetVisuals();
        this.#signs.updateTargetVisuals();
        return;
      }
      this.#setHoveredPublicationId(undefined);
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
      this.#signs.previewKey = selection
        ? this.#shelfSignKeyForTarget(selection.shelfId, selection.offset)
        : undefined;
      this.#setTrashTargeted(trashTargeted);
      this.#updateShelfTargetVisuals();
      this.#signs.updateTargetVisuals();
      this.#emitGameState();
      return;
    }

    if (this.#shelfTargeted) {
      this.#shelfTargeted = false;
      this.#shelfTargetSelection = undefined;
      this.#updateShelfTargetVisuals();
    }
    let arcadeCabinet: ShopArcadeCabinet | undefined;
    let arcadeIntersection:
      | ReturnType<Raycaster["intersectObjects"]>[number]
      | undefined;
    for (const candidate of this.#arcadeCabinets) {
      candidate.object.getWorldPosition(this.#televisionTargetPosition);
      // Scale the cull radius with the cabinet so resized units stay
      // targetable even when their center sits far above or beside the eye.
      const cabinetProp = this.#arcadeProps.get(candidate);
      const cabinetRadius = cabinetProp
        ? Math.max(
            cabinetProp.halfWidth,
            cabinetProp.halfHeight,
            cabinetProp.halfDepth,
          )
        : 0;
      const cabinetCullDistance =
        ARCADE_INTERACTION_DISTANCE + 1.2 + cabinetRadius * 2;
      if (
        this.#camera.position.distanceToSquared(
          this.#televisionTargetPosition,
        ) >
        cabinetCullDistance * cabinetCullDistance
      )
        continue;
      const candidateIntersection = this.#raycaster.intersectObjects(
        candidate.interactionTargets,
        false,
      )[0];
      if (
        !candidateIntersection ||
        (arcadeIntersection &&
          candidateIntersection.distance >= arcadeIntersection.distance)
      )
        continue;
      arcadeCabinet = candidate;
      arcadeIntersection = candidateIntersection;
    }
    const arcadeTargeted =
      arcadeCabinet !== undefined &&
      arcadeIntersection !== undefined &&
      arcadeIntersection.distance <= ARCADE_INTERACTION_DISTANCE;
    this.#setArcadeTargeted(arcadeTargeted ? arcadeCabinet : undefined);
    if (arcadeTargeted) {
      this.#signs.clearShelfSignPreview();
      this.#setTelevisionTargeted(false);
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#signs.updateTargetVisuals();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    let television: ShopTelevision | undefined;
    let televisionIntersection:
      | ReturnType<Raycaster["intersectObjects"]>[number]
      | undefined;
    for (const candidate of this.#televisions) {
      candidate.object.getWorldPosition(this.#televisionTargetPosition);
      candidate.object.getWorldScale(this.#televisionTargetScale);
      const televisionScale = Math.max(
        this.#televisionTargetScale.x,
        this.#televisionTargetScale.y,
        this.#televisionTargetScale.z,
      );
      const televisionCullDistance =
        TELEVISION_INTERACTION_DISTANCE +
        candidate.interactionBoundsRadius * televisionScale;
      if (
        this.#camera.position.distanceToSquared(
          this.#televisionTargetPosition,
        ) >
        televisionCullDistance * televisionCullDistance
      )
        continue;
      const candidateIntersection = this.#raycaster.intersectObjects(
        // Raycaster only reads the input list, so bypass the readonly getter.
        candidate.interactionTargets as Mesh[],
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
      this.#signs.clearShelfSignPreview();
      this.#setPropTargeted(undefined);
      this.#setTrashTargeted(false);
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#signs.updateTargetVisuals();
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
      this.#signs.clearShelfSignPreview();
      this.#setTrashTargeted(false);
      this.#signs.targetedKey = undefined;
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#signs.updateTargetVisuals();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    this.#setTrashTargeted(false);
    const shelfIntersection = this.#raycaster
      .intersectObjects(this.#signs.previewTargetMeshes, false)
      .find((candidate) => candidate.distance <= SHELF_INTERACTION_DISTANCE);
    const shelfId = shelfIntersection?.object.userData.shelfId;
    const shelf =
      typeof shelfId === "string"
        ? this.#spineShelfDefinitions.get(shelfId)
        : undefined;
    const shelfOffset =
      shelf && shelfIntersection
        ? this.#shelfTargetOffset
            .copy(shelfIntersection.point)
            .sub(shelf.frontCenter)
            .dot(shelf.axis)
        : undefined;
    const shelfSignPreviewKey =
      typeof shelfId === "string"
        ? this.#shelfSignKeyForTarget(shelfId, shelfOffset)
        : undefined;
    const signIntersection = this.#raycaster
      .intersectObjects(this.#signs.targetMeshes, false)
      .find((candidate) => candidate.distance <= SIGN_INTERACTION_DISTANCE);
    const signKey = signIntersection?.object.userData.signKey;
    const targetedSignKey = typeof signKey === "string" ? signKey : undefined;
    const nextShelfSignPreviewKey =
      signIntersection === undefined ? shelfSignPreviewKey : undefined;
    const shelfSignPreviewChanged =
      nextShelfSignPreviewKey !== this.#signs.previewKey;
    this.#signs.previewKey = nextShelfSignPreviewKey;
    const targetedSignChanged = targetedSignKey !== this.#signs.targetedKey;
    if (targetedSignChanged || shelfSignPreviewChanged) {
      this.#signs.targetedKey = targetedSignKey;
      this.#signs.updateTargetVisuals();
      if (targetedSignChanged) this.#emitGameState();
    }
    if (targetedSignKey !== undefined) {
      this.#posters.targetedId = undefined;
      this.#artFrames.setDigitalArtFrameTargeted();
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const artFrameIntersection = this.#raycaster
      .intersectObjects(this.#artFrames.targetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const artFrameId = artFrameIntersection?.object.userData.digitalArtFrameId;
    const targetedArtFrameId =
      typeof artFrameId === "string" ? artFrameId : undefined;
    this.#artFrames.setDigitalArtFrameTargeted(targetedArtFrameId);
    if (targetedArtFrameId) {
      this.#posters.targetedId = undefined;
      this.#setHoveredPublicationId(undefined);
      return;
    }
    const posterIntersection = this.#raycaster
      .intersectObjects(this.#posters.targetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const posterId = posterIntersection?.object.userData.posterId;
    const targetedPosterId =
      typeof posterId === "string" ? posterId : undefined;
    if (targetedPosterId !== this.#posters.targetedId) {
      this.#posters.targetedId = targetedPosterId;
      this.#emitGameState();
    }
    if (targetedPosterId) {
      this.#artFrames.setDigitalArtFrameTargeted();
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
    if (this.#discardBusy || this.#shelveAnimation) return;
    if (this.#artFrames.placement) {
      this.#artFrames.placeDigitalArtFrame();
      return;
    }
    if (this.#posters.placement) {
      this.#posters.placePoster();
      return;
    }
    if (this.#carriedProp) {
      this.#dropCarriedProp();
      return;
    }
    if (this.#carriedPublicationId) {
      if (this.#hoveredPublicationId) {
        this.#pickUpBook(this.#hoveredPublicationId);
      } else if (this.#trashTargeted) void this.#discardCarriedBook();
      else if (this.#shelfTargeted) this.#shelveCarriedBook();
      return;
    }
    if (this.#targetedArcadeCabinet) {
      this.#targetedArcadeCabinet.interact();
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
    if (this.#signs.targetedKey !== undefined) {
      this.#signs.requestEdit();
      return;
    }
    if (this.#artFrames.targetedId) {
      const record = this.#artFrames.records.get(this.#artFrames.targetedId);
      const imageId =
        record?.frame.currentImageId() ??
        this.#artFrames.channels.find(
          (channel) => channel.id === record?.frame.channelId(),
        )?.images[0]?.id;
      const assetIndex = imageId
        ? this.#artFrames.assets.findIndex((asset) => asset.id === imageId)
        : -1;
      if (record && assetIndex >= 0)
        this.#artFrames.startDigitalArtFramePlacement(
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
    if (this.#posters.targetedId) {
      const record = this.#posters.records.get(this.#posters.targetedId);
      const assetIndex = record
        ? this.#posters.assets.findIndex(
            (asset) => asset.id === record.asset.id,
          )
        : -1;
      if (record && assetIndex >= 0)
        void this.#posters.startPosterPlacement(
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
    if (
      this.#carriedPublicationIds.length >= MAX_CARRIED_BOOKS ||
      this.#carriedProp
    )
      return;
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
    this.#bookTextures.promoteBookCoverTexture(publicationId, record);
    this.#carriedPublicationIds.unshift(publicationId);
    this.#carriedPublicationId = publicationId;
    this.#discardError = undefined;
    this.#setHoveredPublicationId(undefined);
    this.#physicsWorld.holdBook(publicationId);
    if (this.#physicsWorld.isReady) this.#scene.attach(record.mesh);
    else {
      this.#camera.add(record.mesh);
      this.#writeHeldBookLocalPosition(0, record.mesh.position);
      this.#writeHeldBookLocalRotation(0, record.mesh.quaternion);
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
    if (this.#discardBusy || this.#shelveAnimation) return;
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

    record.mesh.updateMatrixWorld(true);
    const startPosition = record.mesh.getWorldPosition(new Vector3());
    const startRotation = record.mesh.getWorldQuaternion(new Quaternion());
    this.#scene.attach(record.mesh);
    record.mesh.position.copy(startPosition);
    record.mesh.quaternion.copy(startRotation);
    record.state = transition.state;
    record.shelfPresentation = selection.presentation;
    record.slotIndex = selection.slotIndex;
    record.shelfOffset = selection.offset;
    const insertedPlacement = selection.placements?.find(
      (placement) => placement.id === publicationId,
    );
    if (insertedPlacement) {
      record.slotIndex = insertedPlacement.slotIndex;
      record.shelfOffset = insertedPlacement.center;
    }
    this.#setShelfPosition(record);
    this.#setShelfRotation(record, publicationId);
    const targetPosition = record.shelfPosition.clone();
    const targetRotation = new Quaternion().setFromEuler(
      new Euler(
        record.baseRotation.x,
        record.baseRotation.y,
        record.baseRotation.z,
        "XYZ",
      ),
    );
    this.#shelveAnimation = {
      elapsedSeconds: 0,
      placements: selection.placements,
      publicationId,
      shelfId: selection.shelfId,
      startPosition,
      startRotation,
      targetPosition,
      targetRotation,
    };
    this.#removeCarriedPublication(publicationId);
    this.#discardError = undefined;
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#setTrashTargeted(false);
    this.#syncCarriedBookPresentation();
    this.#updateHeldPhysicsTarget();
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
    if (
      this.#carriedPublicationIds.length === 0 ||
      this.#inspectionMode !== "none"
    )
      return;
    this.#dropCarriedBook(false, true, charge);
  }

  #dropCarriedBook(
    fromCurrentPose = false,
    throwBook = false,
    throwCharge = 0,
    publicationIdOverride?: string,
  ) {
    if (this.#discardBusy) return;
    const publicationId = publicationIdOverride ?? this.#carriedPublicationId;
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
    } else {
      this.#updateHeldPhysicsTarget();
      const carriedIndex = this.#carriedPublicationIds.indexOf(publicationId);
      if (carriedIndex >= 0)
        this.#writeHeldBookTargetPose(carriedIndex, publicationId);
      dropPose = this.#heldTargetPose;
    }
    this.#scene.attach(record.mesh);
    this.#camera.getWorldDirection(this.#viewDirection);
    record.state = transition.state;
    this.#bookTextures.restoreCompactBookCoverTexture(record);
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
    this.#physicsWorld.setBookCollisionlessWithHeld(publicationId, true);
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
    this.#removeCarriedPublication(publicationId);
    this.#discardError = undefined;
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#setTrashTargeted(false);
    this.#syncCarriedBookPresentation();
    this.#updateHeldPhysicsTarget();
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
      this.#removeCarriedPublication(publicationId);
      this.#setTrashTargeted(false);
      this.#syncCarriedBookPresentation();
      this.#updateHeldPhysicsTarget();
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
    this.#removeCarriedPublication(publicationId);
    this.#shelfTargeted = false;
    this.#shelfTargetSelection = undefined;
    this.#setTrashTargeted(false);
    this.#syncCarriedBookPresentation();
    this.#updateHeldPhysicsTarget();
    this.#syncInteractiveMeshes();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
    this.#flushWorldSave();
  }

  #finishShelveAnimation() {
    const animation = this.#shelveAnimation;
    if (!animation) return;
    const record = this.#booksById.get(animation.publicationId);
    this.#shelveAnimation = undefined;
    if (!record) return;

    record.mesh.position.copy(animation.targetPosition);
    record.mesh.quaternion.copy(animation.targetRotation);
    record.mesh.scale.setScalar(1);
    record.shelfPreview = 0;
    this.#bookTextures.restoreCompactBookCoverTexture(record);
    if (animation.placements)
      this.#applySpineShelfPlacements(animation.shelfId, animation.placements);
    else {
      record.basePosition.copy(record.shelfPosition);
      this.#physicsWorld.shelveBook(
        animation.publicationId,
        this.#setPhysicsPose(record.shelfPosition, record.baseRotation),
      );
    }
    this.#syncInteractiveMeshes();
    this.#applyBookStates();
    this.#updateShelfTargetVisuals();
    this.#worldStateDirty = true;
    this.#emitGameState();
  }

  #animateShelve(deltaSeconds: number) {
    const animation = this.#shelveAnimation;
    if (!animation) return;
    const record = this.#booksById.get(animation.publicationId);
    if (!record) {
      this.#shelveAnimation = undefined;
      return;
    }
    animation.elapsedSeconds = Math.min(
      SHELVE_BOOK_DURATION_SECONDS,
      animation.elapsedSeconds + deltaSeconds,
    );
    const progress = animation.elapsedSeconds / SHELVE_BOOK_DURATION_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    record.mesh.position.lerpVectors(
      animation.startPosition,
      animation.targetPosition,
      eased,
    );
    record.mesh.quaternion.slerpQuaternions(
      animation.startRotation,
      animation.targetRotation,
      eased,
    );
    record.mesh.scale.setScalar(1);
    if (progress >= 1) this.#finishShelveAnimation();
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
    // Aim the toss at whichever bin the player targeted, falling back to
    // the seeded discard bin when that one is gone.
    const discardBin =
      (this.#targetedTrashBinId !== undefined
        ? this.#movableProps.get(this.#targetedTrashBinId)?.object
        : undefined) ??
      this.#movableProps.get(TRASH_CAN_PROP_ID)?.object ??
      this.#discardBin.group;
    discardBin.updateWorldMatrix(true, false);
    this.#trashTossTarget.set(0, TRASH_CAN_HEIGHT * 0.35, 0);
    discardBin.localToWorld(this.#trashTossTarget);
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

  readonly #scheduleWorldSave = () => {
    if (
      this.#disposed ||
      !this.#catalogAvailable() ||
      !this.#worldSaveWritable() ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
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
        if (
          !this.#disposed &&
          document.visibilityState === "visible" &&
          document.hasFocus()
        )
          this.#flushWorldSave();
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
    if (
      !this.#catalogAvailable() ||
      !this.#worldSaveWritable() ||
      !this.#worldStateDirty ||
      !this.#onWorldSave ||
      this.#worldSavePending
    )
      return;
    this.#worldStateDirty = false;
    try {
      const persisted = this.#onWorldSave(
        createWorldSave({
          artFrames: this.#artFrames,
          books: this.#booksById,
          camera: this.#camera,
          catalogIdentity: () => this.#catalogIdentity(),
          discardedPublicationIds: this.#discardedPublicationIds,
          discardBin: this.#discardBin,
          movableProps: this.#movableProps,
          pendingModelPropSaves: this.#pendingModelPropSaves,
          pendingPropSaves: this.#pendingPropSaves,
          posters: this.#posters,
          signs: this.#signs,
          televisionsBySaveId: this.#televisionsBySaveId,
        }),
      );
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
    const normalOffset =
      selection.presentation === "face"
        ? -shelf.faceInset
        : spineShelfBookNormalOffset(carriedRecord.width, shelf.backInset) +
          carriedRecord.width / 2 +
          0.012;
    this.#shelfSnapMesh.position
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, selection.offset)
      .addScaledVector(shelf.normal, normalOffset);
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
            dotWithPhysicsQuaternion(
              record.currentRotation,
              this.#physicsTransform.rotation,
            ),
          ) >
        1e-7;
      record.object.position.copy(this.#physicsTransform.position);
      record.object.quaternion.copy(this.#physicsTransform.rotation);
      record.currentPosition.copy(this.#physicsTransform.position);
      record.currentRotation.copy(this.#physicsTransform.rotation);
      if (record.id === TRASH_CAN_PROP_ID)
        this.#discardBin.position.copy(record.currentPosition);
      if (positionChanged || rotationChanged) this.#worldStateDirty = true;
    }
  }

  #animateBooks(deltaSeconds: number) {
    let interactionStateChanged = false;
    for (const [publicationId, record] of this.#booksById) {
      if (this.#shelveAnimation?.publicationId === publicationId) continue;
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
          !this.#carriedPublicationIds.includes(publicationId) &&
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
              dotWithPhysicsQuaternion(
                record.mesh.quaternion,
                this.#physicsTransform.rotation,
              ),
            ) >
            1e-7;
        // Batch-rendered books stay detached; their instance matrix picks
        // up any real pose change in #syncBookAtlasBatches.
        if (
          !record.atlasPlacement?.visible &&
          record.mesh.parent !== this.#scene
        )
          this.#scene.attach(record.mesh);
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
              this.#input.isActionDown("throw"),
            deltaSeconds,
          );
        if (positionChanged || rotationChanged) {
          this.#worldStateDirty = true;
          // A moving prop can enter or leave the reticle; re-sweep.
          this.#interactionTargetsDirty = true;
        }
        continue;
      }
      if (record.state.status === "carried") continue;
      if (record.state.status === "shelved") {
        this.#animateShelfPreview(
          record,
          publicationId === this.#hoveredPublicationId &&
            this.#input.isActionDown("throw"),
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
