import {
  ACESFilmicToneMapping,
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  Color,
  EquirectangularReflectionMapping,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
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
} from "three";
import floorAlbedoUrl from "~/assets/materials/laminate-floor-albedo.webp";
import floorNormalUrl from "~/assets/materials/laminate-floor-normal.webp";
import floorSurfaceUrl from "~/assets/materials/laminate-floor-surface.webp";
import moonriseSkyUrl from "~/assets/materials/qwantani-moonrise-sky.webp";
import {
  INSPECTION_TRANSITION_POSITION_EPSILON_SQ,
  INSPECTION_TRANSITION_ROTATION_EPSILON,
  SHELF_PREVIEW_SPEED,
  SHELF_PREVIEW_PULL_END,
  SHELF_PREVIEW_ROTATION_START,
  SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS,
} from "~/game/bookInspectionTuning";
import {TRASH_CAN_PROP_ID} from "~/game/discardBin";
import {
  BOOK_UNDER_SHELF_RECOVERY_Y,
  BOOK_VOID_RECOVERY_Y,
} from "~/game/bookTuning";
import {createWorldSave} from "~/game/worldSaveSnapshot";
import {physicalBookWidth} from "~/game/bookDimensions";
import {
  INSPECTION_ACTION_CLOSE_SPEED,
  INSPECTION_COVER_ANIMATION_SPEED,
  INSPECTION_FRAME_FILL,
  INSPECTION_OPEN_ANGLE,
  INSPECTION_PAGE_GUTTER,
} from "~/game/bookInspectionTuning";
import {hashString} from "~/game/mathHelpers";
import {clampUnit, dotWithPhysicsQuaternion} from "~/game/mathHelpers";
import {bookDropPosition} from "~/game/bookDropPlacement";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {
  ARCADE_CABINET_HEIGHT,
  ShopArcadeCabinet,
  type ArcadeSessionStatus,
} from "~/game/ShopArcadeCabinet";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader.js";
import {RectAreaLightUniformsLib} from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {DEV} from "solid-js";
import {ShopAudioManager} from "~/game/ShopAudioManager";
import {FpsHud} from "~/game/FpsHud";
import {
  faceDisplayShelfId,
  faceDisplayShelfOffset,
  type BookRecord,
  createBook,
  type RetainedBookGameplay,
} from "~/game/bookFactory";
import {createBookExteriorMaterial} from "~/game/bookExteriorMaterial";
import {INSPECTION_TRANSITION_SPEED} from "~/game/bookInspectionTuning";
import type {ShopArcadePlayRequest} from "~/game/ShopArcadeCabinet";
import {disposeObject} from "~/game/threeDisposal";
import type {
  MovablePropRegistration,
  PropMaterialSwap,
} from "~/game/propRegistration";
import {
  GameStateEmitter,
  type GameSnapshotInput,
} from "~/game/gameStateEmitter";
import type {ShopSignKind} from "~/game/signs/ShopSignSystem";
import {shopSignKey} from "~/game/signs/ShopSignSystem";
import type {DigitalArtFramePasteTarget} from "~/game/artFrameSystem";
import {addInteriorBox} from "~/game/interior/interiorPrimitives";
import {createPosterSurface as createPosterSurfaceTarget} from "~/game/interior/interiorPrimitives";
import type {ReadingFurnitureMaterials} from "~/game/propRegistration";
import {createReadingChairInstance} from "~/game/interior/readingFurniture";
import {createDeskLamps} from "~/game/interior/lightingProps";
import {createFaceOutDisplay} from "~/game/interior/shelfFixtures";
import {buildShopInterior} from "~/game/interior/shopComposition";
import {InspectionController} from "~/game/inspection/InspectionController";
import {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import {DiscardBin} from "~/game/discardBin";
import {DoorSystem} from "~/game/interior/doors";
import {PosterSystem} from "~/game/posters/PosterSystem";
import {ArtFrameSystem} from "~/game/artFrameSystem";
import {TvVideoImporter} from "~/game/tvVideoImporter";
import {ArtFrameTextureCache} from "~/game/artFrameTextureCache";
import {BookTextureRuntime} from "~/game/bookTextureRuntime";
import {BookCarryActions, type BookCarryHost} from "~/game/bookCarryActions";
import {
  InteractionScanner,
  type InteractionScannerHost,
} from "~/game/interactionScanner";
import {
  MovablePropLifecycle,
  type MovablePropLifecycleHost,
} from "~/game/movablePropSystem";
import {ShopInputController} from "~/game/shopInputController";

import type {CatalogAtlases, CatalogIdentity, CatalogItem} from "~/catalog";
import type {ArtFrameImage} from "~/artFrames/protocol";
import {artFrameChannelId} from "~/artFrames/protocol";
import type {ShopSignEditRequest} from "~/game/signs/ShopSignSystem";
import {type UiMode} from "~/game/uiMode";

import {
  DEFAULT_PITCH_LIMIT,
  getPlanarMovement,
  isPointInsideShopObstacle,
  resolvePlayerGrounded,
  resolveShopMovement,
  type PlanarMovementInput,
  type PlanarPoint,
  type ShopCollisionWorld,
} from "~/game/shopGameplay";
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
import {findArcadeSystem} from "~/arcade/systems";
import {type InteractionPromptToken} from "~/game/input/hints";
import {SHOP_TV_CAVE, SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";

import {
  spineShelfBookNormalOffset,
  ShelfPresentation,
  type SpineShelfPlacement,
} from "~/game/shelfPlacement";
import {
  READING_FURNITURE_BOXES,
  SHOP_BOUNDS,
  FACE_DISPLAY_COLUMNS,
  FACE_DISPLAY_ROWS,
  FACE_SHELF_ID,
  SHOP_INTERIOR_FOOTPRINTS,
} from "~/game/shopLayout";
import {
  ShopPhysicsWorld,
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  type BookPhysicsPose,
  type MutableBookPhysicsTransform,
  type MutablePlayerMovement,
} from "~/game/ShopPhysicsWorld";
import {
  ShopTelevision,
  type ShopTelevisionInteraction,
} from "~/game/ShopTelevision";
import type {ShopMediaCatalog} from "~/game/shopMediaCatalog";
import type {ModelAsset} from "~/models/protocol";
import {
  INITIAL_WORLD_SEEDING_VERSION,
  worldSaveCanReconcileCatalog,
  worldSaveMatchesCatalog,
  worldSaveSeedingVersion,
  type WorldBookSave,
  type WorldModelPropSave,
  type WorldSaveV1,
  type WorldTelevisionChannels,
  type WorldTelevisionVolumes,
} from "~/game/worldSave";
import {
  getWideReaderPageIndices,
  readerPageSourceUrl,
  subscribeToWideReaderPages,
} from "~/reader/pageSpreadDetection";
import {getReaderSpread, type ReaderNavigation} from "~/reader/pagination";
import {
  DEFAULT_TV_CHANNEL_ID,
  type TvChannel,
  tvChannelId,
  tvVideoImportUrl,
  type TvVideo,
} from "~/tv/protocol";
import type {PosterAsset} from "~/posters/protocol";

const FACE_SHELF_SLOT_COUNT = FACE_DISPLAY_COLUMNS * FACE_DISPLAY_ROWS;
const SHOP_PLAYER_START_X = 0;
const SHOP_PLAYER_START_Z = 25;
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
const SHOP_MEDIA_CATALOG_REFRESH_INTERVAL_MS = 10_000;
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
/** Extra reach margin so culling never drops a bank the ray could graze. */
const DISCARD_TARGETED_EMISSIVE = new Color("#ff3524");
const DISCARD_TARGETED_EMISSIVE_INTENSITY = 0.95;
const PROP_PLACEMENT_GRID_SIZE = 0.25;
const PROP_PLACEMENT_HEIGHT_STEP = 0.125;
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

export type SpineShelfDefinition = {
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

export type ModelTemplate = {
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

export type InspectionCloseAction = "drop" | "return" | "throw";

export type InspectionMode = "closing" | "none" | "spread";

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
  readonly #inspection: InspectionController;
  readonly #snapshotInput: GameSnapshotInput;
  readonly #input: InputManager;
  readonly #inputController: ShopInputController;
  readonly #getShortcuts: () => ShortcutsConfig;
  readonly #getPadMappingOverrides: () => ArcadePadMappingOverrides;
  readonly #onPauseRequest: (() => void) | undefined;
  readonly #onResumeRequest: (() => void) | undefined;
  readonly #movementDelta: PlanarPoint = {x: 0, z: 0};
  readonly #movementInput: PlanarMovementInput = {forward: 0, right: 0};
  readonly #movementPosition: PlanarPoint = {x: 0, z: 0};
  // Every placed cabinet runs its own session; the "active" one is the
  // cabinet whose UI (picker or game) the player is currently driving.
  readonly #arcadeCabinets: ShopArcadeCabinet[] = [];
  #targetedArcadeCabinet: ShopArcadeCabinet | undefined;
  #activeArcadeCabinet: ShopArcadeCabinet | undefined;
  readonly #arcadeAimTarget = new Vector3();
  readonly #mouseSensitivity: () => number;
  readonly #gamepadLookSensitivity: () => number;
  readonly #newPublicationIds: () => readonly string[];
  readonly #tvScreenLighting: () => boolean;
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
  readonly #raycaster = new Raycaster();
  /** Frame timestamp from the animation loop; one time source per frame. */
  #frameNowMs = 0;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #spineShelfDefinitions = new Map<string, SpineShelfDefinition>();
  readonly #selectedPublicationId: () => string | null | undefined;
  readonly #shelfTargetMeshes: Mesh[] = [];
  readonly #shelfPreviewBaseRotation = new Quaternion();
  readonly #shelfPreviewTargetRotation = new Quaternion();
  readonly #textureLoader = new TextureLoader();
  /**
   * Lazily initialized because support detection needs the renderer. Serves
   * the basis transcoder from the committed public/basis/ directory.
   */
  #ktx2Loader: KTX2Loader | undefined;
  readonly #televisions: ShopTelevision[] = [];
  readonly #throwVelocity = new Vector3();
  readonly #upAxis = new Vector3(0, 1, 0);
  readonly #viewDirection = new Vector3();

  readonly #carriedPublicationIds: string[] = [];
  #carriedPublicationId: string | undefined;
  readonly #bookActions: BookCarryActions;
  readonly #scanner: InteractionScanner;
  readonly #props: MovablePropLifecycle;
  #disposed = false;
  #stagedBootStarted = false;
  #frameHandle: number | undefined;
  #hoveredPublicationId: string | undefined;

  #interactiveMeshes: Mesh[] = [];
  #lastFrameTime = 0;
  #lastItems: readonly CatalogItem[] | undefined;
  #lastNewPublicationIds: readonly string[] | undefined;
  #lastPixelRatio = 0;
  #lastSelectedPublicationId: string | null | undefined;
  #moonEnvironment: Texture | undefined;
  #onReady: (() => void) | undefined;
  #inputSuspended = false;
  #lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
  #playerGrounded = false;
  #playerVerticalVelocity = 0;
  #mediaCatalogRefreshHandle: number | undefined;
  #lateShaderPrecompileHandle: number | undefined;
  #mediaCatalogRequestPending = false;
  #pendingWorldSave: WorldSaveV1 | undefined;
  #ready = false;
  #resizeDirty = true;
  #resizeObserver: ResizeObserver | undefined;
  #shelfPresentation: ShelfPresentation = "spine";
  readonly #shelfHoverMeshesByShelf = new Map<string, Mesh[]>();
  readonly #ungroupedShelfHoverMeshes: Mesh[] = [];
  #channelEditorDigitalArtFrameId: string | undefined;
  #channelEditorTelevision: ShopTelevision | undefined;
  #targetedProp: MovablePropRecord | undefined;
  #televisionInteraction: ShopTelevisionInteraction | undefined;
  #televisionTargeted = false;
  #targetedTelevision: ShopTelevision | undefined;
  #tvChannels: readonly TvChannel[] = [];
  #televisionTableMaterial: MeshStandardMaterial | undefined;
  #savedTelevisionChannels: WorldTelevisionChannels = {};
  #savedTelevisionVolumes: WorldTelevisionVolumes = {};
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
        if (phase === "up") return this.#inputController.handleActionUp(action);
        return this.#inputController.handleActionDown(action);
      },
      // While menus or dialogs own the page, bound keys must not swallow
      // typing or scrolling.
      isActive: () => !this.#paused(),
      onMenuToggle: () => {
        if (this.#paused()) this.#onResumeRequest?.();
        else this.#onPauseRequest?.();
      },
      onKeyEvent: (event) => this.#inputController.observeKeyboardEvent(event),
    });
    this.#input.setKeyboardInterceptor((event) =>
      this.#inputController.forwardArcadeKey(event),
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
      releasePointerLock: () => this.#inputController.releasePointerLock(),
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
        publicationId === this.#inspection.inspectionPublicationId ||
        publicationId === this.#bookActions.discardAnimation?.publicationId ||
        publicationId === this.#bookActions.shelveAnimation?.publicationId,
      isPinnedOrInFlight: (publicationId) =>
        publicationId === this.#hoveredPublicationId ||
        publicationId === this.#lastSelectedPublicationId ||
        this.#carriedPublicationIds.includes(publicationId) ||
        publicationId === this.#inspection.inspectionPublicationId ||
        publicationId === this.#bookActions.discardAnimation?.publicationId,
      maxAnisotropy: () => this.#renderer.capabilities.getMaxAnisotropy(),
      nextFrame: () => ShopScene.nextFrame(),
      renderer: this.#renderer,
      scene: this.#scene,
      textureLoader: this.#textureLoader,
    });
    this.#inspection = new InspectionController({
      booksById: () => this.#booksById,
      emitGameState: () => this.#emitGameState(),
      scene: () => this.#scene,
      carriedPublicationId: () => this.#carriedPublicationId,
      physicsWorld: () => this.#physicsWorld,
      camera: () => this.#camera,
      catalogItems: () => this.#catalogItems(),
      bookTextures: () => this.#bookTextures,
      onPageIndexChange: (publicationId, pageIndex) =>
        this.#onPageIndexChange?.(publicationId, pageIndex),
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsPoseRotation: () => this.#physicsPoseRotation,
      physicsPose: () => this.#physicsPose,
      physicsPoseEuler: () => this.#physicsPoseEuler,
      canvas: () => this.#canvas,
      horizontalFieldOfView: () => this.#horizontalFieldOfView(),
      disposed: () => this.#disposed,
      physicsTransform: () => this.#physicsTransform,
      setHoveredPublicationId: (publicationId) =>
        this.#setHoveredPublicationId(publicationId),
      onSelectPublication: this.#onSelectPublication,
      initialPageIndex: (publicationId) =>
        this.#initialPageIndex(publicationId),
      applyBookStates: () => this.#applyBookStates(),
      releasePointerLock: () => this.#inputController.releasePointerLock(),
      requestPointerLock: () => this.#inputController.requestPointerLock(),
      dropCarriedBook: (fromCurrentPose, throwBook, charge, override) =>
        this.#bookActions.dropCarriedBook(
          fromCurrentPose,
          throwBook,
          charge,
          override,
        ),
      raycaster: () => this.#raycaster,
      viewportWidth: () => this.#viewportWidth,
      textureLoader: () => this.#textureLoader,
      renderer: () => this.#renderer,
      spreadDistance: () => this.#spreadDistance(),
      heldTargetPose: () => this.#heldTargetPose,
    });
    this.#props = new MovablePropLifecycle(
      this.#createMovablePropLifecycleHost(),
    );
    this.#bookActions = new BookCarryActions(this.#createBookCarryHost());
    this.#scanner = new InteractionScanner(this.#createScannerHost());
    this.#inputController = new ShopInputController({
      abortSignal: this.#abortController.signal,
      activeArcadeCabinet: () => this.#activeArcadeCabinet,
      arcadeStatusForUi: () => this.#arcadeStatusForUi(),
      artFrames: () => this.#artFrames,
      bookActions: () => this.#bookActions,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      canvas: () => this.#canvas,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      cycleCarriedBook: (direction) => this.#cycleCarriedBook(direction),
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      gamepadLookSensitivity: () => this.#gamepadLookSensitivity(),
      handleImagePaste: this.#handleImagePaste,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      input: () => this.#input,
      interact: (allowNonBookPropPickup) =>
        this.#interact(allowNonBookPropPickup),
      inspection: () => this.#inspection,
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      mouseSensitivity: () => this.#mouseSensitivity(),
      onMediaChannelCreateRequest: () => this.#onMediaChannelCreateRequest,
      paused: () => this.#paused(),
      physicsWorld: () => this.#physicsWorld,
      posters: () => this.#posters,
      props: () => this.#props,
      refreshMediaCatalogIfActive: () => this.#refreshMediaCatalogIfActive(),
      scanner: () => this.#scanner,
      setArcadeTargeted: (cabinet) => this.#setArcadeTargeted(cabinet),
      setChannelEditorDigitalArtFrameId: (id) => {
        this.#channelEditorDigitalArtFrameId = id;
      },
      setChannelEditorTelevision: (television) => {
        this.#channelEditorTelevision = television;
      },
      setHoveredPublicationId: (publicationId) =>
        this.#setHoveredPublicationId(publicationId),
      setPropTargeted: (record) => this.#setPropTargeted(record),
      setShelfPresentation: (presentation) => {
        this.#shelfPresentation = presentation;
      },
      setTelevisionTargeted: (targeted, interaction, television) =>
        this.#setTelevisionTargeted(targeted, interaction, television),
      setTrashTargeted: (targeted) => this.#setTrashTargeted(targeted),
      signs: () => this.#signs,
      shelfPresentation: () => this.#shelfPresentation,
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionTargeted: () => this.#televisionTargeted,
      stepAwayFromArcade: () => this.stepAwayFromArcade(),
      turnInspectionPage: (navigation) => this.turnInspectionPage(navigation),
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
      quitActiveArcadeGame: () => this.quitActiveArcadeGame(),
    });
    this.#snapshotInput = {
      activeArcadeCabinet: () => this.#activeArcadeCabinet,
      arcadeProps: () => this.#props.arcadeProps,
      arcadeStatusForUi: () => this.#arcadeStatusForUi(),
      arcadeSystemIdForUi: () => this.#arcadeSystemIdForUi(),
      artFrames: () => this.#artFrames,
      booksById: () => this.#booksById,
      carriedProp: () => this.#props.carriedProp,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      discardBusy: () => this.#bookActions.discardBusy,
      discardError: () => this.#bookActions.discardError,
      discardedPublicationIds: () => this.#bookActions.discardedPublicationIds,
      getShortcuts: () => this.#getShortcuts(),
      hoveredPublicationId: () => this.#hoveredPublicationId,
      input: () => this.#input,
      inspectionCloseAction: () => this.#inspection.inspectionCloseAction,
      inspectionMode: () => this.#inspection.inspectionMode,
      inspectionOpenAngleTarget: () =>
        this.#inspection.inspectionOpenAngleTarget,
      inspectionPageIndex: () => this.#inspection.inspectionPageIndex,
      inspectionPageLoadCount: () => this.#inspection.inspectionPageLoadCount,
      inspectionPublication: () => this.#inspection.inspectionPublication(),
      keyboardLayout: () => this.#inputController.state.keyboardLayout,
      mode: () => this.#mode,
      modelAnimationLabel: (record) =>
        this.#props.modelAnimationLabel(record) ?? "",
      modelImportError: () => this.#props.modelImportError,
      modelPlacement: () => this.#props.modelPlacement,
      onGameStateChange: () => this.#onGameStateChange,
      physicsWorld: () => this.#physicsWorld,
      pointerLocked: () => this.#inputController.state.pointerLocked,
      posters: () => this.#posters,
      propPlacementDistance: () => this.#props.propPlacementDistance,
      propPlacementSnapping: () => this.#props.propPlacementSnapping,
      shelfPresentation: () => this.#shelfPresentation,
      shelfTargetSelection: () => this.#scanner.shelfTargetSelection,
      shelfTargeted: () => this.#scanner.shelfTargeted,
      shelveAnimation: () => this.#bookActions.shelveAnimation,
      signs: () => this.#signs,
      spawnablePropAssets: () => this.#props.spawnablePropAssets,
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionProps: () => this.#props.televisionProps,
      televisionTargeted: () => this.#televisionTargeted,
      throwChargeActive: () => this.#bookActions.throwChargeActive,
      throwChargeProgress: () => this.#bookActions.throwChargeProgress(),
      trashTargeted: () => this.#scanner.trashTargeted,
      tvVideos: () => this.#tvVideos,
    };
    this.#posters = new PosterSystem({
      abortSignal: this.#abortController.signal,
      camera: this.#camera,
      emitGameState: () => this.#emitGameState(),
      importPoster: options.importPoster,
      isDisposed: () => this.#disposed,
      isPointerLocked: () => this.#inputController.state.pointerLocked,
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
        isPointerLocked: () => this.#inputController.state.pointerLocked,
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
      ghostObject: (object) => this.#props.ghostObject(object),
      getMovableProp: (id) => this.#props.records.get(id),
      isCarried: (record) =>
        this.#props.carriedProp === (record as unknown as MovablePropRecord),
      isDisposed: () => this.#disposed,
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      modelMixers: this.#props.modelMixers,
      needsSeedPass: (version) => this.#props.needsSeedPass(version),
      registerMovableProp: (registration) =>
        this.#props.registerMovableProp(
          registration as MovablePropRegistration,
        ),
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

    this.#inputController.bind();
    void this.#inputController.loadKeyboardLayout();
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
    buildShopInterior({
      addBox: (p, size, pos, mat, castShadow) =>
        this.#addBox(p, size, pos, mat, castShadow),
      artFrames: this.#artFrames,
      cacheBuiltinPropTemplate: (registration) =>
        this.#props.cacheBuiltinPropTemplate(registration),
      cloneFloorMaterial: (material, repeatX, repeatY) =>
        this.#cloneFloorMaterial(material, repeatX, repeatY),
      createFloorMaterial: () => this.#createFloorMaterial(),
      createPosterSurface: (p, id, w, h, pos, rot) =>
        this.#createPosterSurface(p, id, w, h, pos, rot),
      createFaceOutDisplay: (p, wood, backing, deps) =>
        createFaceOutDisplay(p, wood, backing, deps),
      createSpawnedCrtTelevision: (asset, id, scale, pose) =>
        this.#props.createSpawnedCrtTelevision(asset, id, scale, pose),
      createUpperReadingFurniture: (p, wood, furnitureMaterials) =>
        this.#createUpperReadingFurniture(p, wood, furnitureMaterials),
      discardBin: this.#discardBin,
      disposed: this.#disposed,
      doors: this.#doors,
      modelMixers: this.#props.modelMixers,
      needsSeedPass: (version) => this.#props.needsSeedPass(version),
      pendingWorldSave: this.#pendingWorldSave,
      registerMovableProp: (registration) =>
        this.#props.registerMovableProp(registration),
      registerPropPlacementSupport: (object) =>
        this.#props.registerPropPlacementSupport(object),
      registerTelevision: (saveId, television) =>
        this.#props.registerTelevision(saveId, television),
      renderer: this.#renderer,
      scene: this.#scene,
      seedDefaultProps: () => this.#props.seedDefaultProps(),
      sharedTelevisionOptions: (channelId, volume) =>
        this.#props.sharedTelevisionOptions(channelId, volume),
      shelfSnapMesh: this.#scanner.shelfSnapMesh,
      shelfTargetMeshes: this.#shelfTargetMeshes,
      signs: this.#signs,
      spineShelfDefinitions: this.#spineShelfDefinitions,
      setTelevisionTableMaterial: (material) => {
        this.#televisionTableMaterial = material;
      },
      textureLoader: this.#textureLoader,
    });
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
    if (this.#inspection.inspectionMode === "spread") return;
    this.#inputController.requestPointerLock();
  }

  releasePointerLock() {
    if (this.#disposed) return;
    if (this.#inputSuspended) return;
    this.#inputSuspended = true;
    this.#inputController.suspendInput();
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
    this.#inputController.state.jumpQueued = false;
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
    if (!this.#paused()) this.#inputController.requestPointerLock();
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
    if (!this.#paused()) this.#inputController.requestPointerLock();
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
      this.#inputController.releasePointerLock();
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
    this.#inputController.state.lookTarget.yaw = Math.atan2(-deltaX, -deltaZ);
    this.#inputController.state.lookTarget.pitch = MathUtils.clamp(
      Math.atan2(deltaY, horizontal),
      -DEFAULT_PITCH_LIMIT,
      DEFAULT_PITCH_LIMIT,
    );
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
      if (this.#props.carriedProp)
        this.#scene.attach(this.#props.carriedProp.object);
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
    if (this.#props.carriedProp)
      this.#props.restoreGhostedObject(
        this.#props.carriedProp.ghostMaterialSwaps,
      );
    this.#inputController.releasePointerLock();
    this.#abortController.abort();
    this.#tvVideos.clearMessageTimer();
    for (const mixer of this.#props.modelMixers) mixer.stopAllAction();
    this.#props.modelMixers.clear();
    this.#physicsWorld.dispose();
    for (const television of this.#televisions) television.dispose();
    this.#televisions.length = 0;
    this.#props.televisionsBySaveId.clear();
    for (const cabinet of this.#arcadeCabinets) cabinet.dispose();
    this.#arcadeCabinets.length = 0;
    this.#props.arcadeProps.clear();
    this.#targetedArcadeCabinet = undefined;
    this.#activeArcadeCabinet = undefined;
    this.#props.carriedProp = undefined;
    this.#targetedTelevision = undefined;
    this.#props.televisionProps.clear();
    this.#audioManager.dispose();
    for (const record of this.#artFrames.records.values())
      record.frame.dispose();
    this.#artFrames.clearRecords();
    this.#artFrames.preview?.dispose();
    this.#artFrames.preview = undefined;
    this.#inspection.inspectionPageTextureCache.dispose();
    this.#inspection.inspectionTurningBackTexture?.dispose();
    this.#inspection.inspectionTurningBackTexture = undefined;
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
        this.#inputController.suspendInput();
      }
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }
    // While an arcade session is active the world holds still around the
    // player (no movement, targeting, or physics) but keeps rendering so
    // every cabinet's attract mode and live screens stay animated.
    const arcadeActive = this.#arcadeStatusForUi() !== undefined;
    if (arcadeActive) {
      this.#inputController.updateCameraLook(deltaSeconds);
      this.#renderer.render(this.#scene, this.#camera);
      this.#frameHandle = requestAnimationFrame(this.#animate);
      return;
    }
    this.#inputSuspended = false;

    this.#inputController.consumePointerMovement(deltaSeconds);
    this.#inputController.updateCameraLook(deltaSeconds);
    this.#bookActions.updateThrowCharge(deltaSeconds);
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
    this.#scanner.update();
    this.#inspection.inspectionZoom = MathUtils.damp(
      this.#inspection.inspectionZoom,
      this.#inspection.inspectionZoomTarget,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#inspection.inspectionZoomOffsetX = MathUtils.damp(
      this.#inspection.inspectionZoomOffsetX,
      this.#inspection.inspectionZoomOffsetTargetX,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#inspection.inspectionZoomOffsetY = MathUtils.damp(
      this.#inspection.inspectionZoomOffsetY,
      this.#inspection.inspectionZoomOffsetTargetY,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    this.#updateHeldPhysicsTarget();
    this.#physicsWorld.step(deltaSeconds);
    this.#syncMovablePropPhysics();
    for (const record of this.#artFrames.records.values())
      record.frame.update(deltaSeconds);
    this.#animateBooks(deltaSeconds);
    this.#bookActions.animateShelve(deltaSeconds);
    this.#bookTextures.syncBookAtlasBatches();
    this.#bookActions.animateDiscard(deltaSeconds);
    for (const mixer of this.#props.modelMixers) mixer.update(deltaSeconds);
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

  /**
   * Rides an invisible discard volume inside every trash can prop so any
   * spawned, saved, or seeded bin accepts discards.
   */
  #createMoonEnvironment() {
    const environment = this.#textureLoader.load(moonriseSkyUrl);
    environment.colorSpace = SRGBColorSpace;
    environment.mapping = EquirectangularReflectionMapping;
    return environment;
  }

  /** Builds the upper-floor reading tables and chairs. */
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
              this.#props.cacheBuiltinPropTemplate(registration),
            createDeskLamps: async (parent2) => {
              await createDeskLamps(parent2, {
                cacheBuiltinPropTemplate: (registration) =>
                  this.#props.cacheBuiltinPropTemplate(registration),
                isDisposed: () => this.#disposed,
                modelMixers: this.#props.modelMixers,
                needsSeedPass: (version) => this.#props.needsSeedPass(version),
                registerMovableProp: (registration) =>
                  this.#props.registerMovableProp(registration),
              });
            },
            needsSeedPass: (version) => this.#props.needsSeedPass(version),
            registerMovableProp: (registration) =>
              this.#props.registerMovableProp(registration),
          },
          [x, chairCenterY, z],
          z < 23 ? -Math.PI / 2 : Math.PI / 2,
        );
      }
    }
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
      this.#props.applyModelCatalog(catalog.models.models);
      await this.#props.restoreSavedModelProps();
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

  turnInspectionPage(navigation: ReaderNavigation) {
    this.#inspection.turnInspectionPage(navigation);
  }

  seekInspectionPage(pageIndex: number) {
    this.#inspection.seekInspectionPage(pageIndex);
  }

  #emitGameState() {
    this.#gameStateEmitter.emit(this.#snapshotInput);
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
      this.#inputController.state.tvWheelScrubDirection = undefined;
      this.#inputController.state.tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
      this.#inputController.state.tvWheelScrubStepIndex = 0;
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
    if (targeted === this.#scanner.trashTargeted) return;
    this.#scanner.trashTargeted = targeted;
    this.#applyBookStates();
    this.#emitGameState();
  }

  #setPropTargeted(record: MovablePropRecord | undefined) {
    if (record === this.#targetedProp) return;
    this.#targetedProp = record;
    this.#emitGameState();
  }

  #setHoveredPublicationId(publicationId: string | undefined) {
    if (publicationId === undefined)
      this.#scanner.shelfBrowsePublicationId = undefined;
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
        previousItem.id === this.#bookActions.pendingDiscardPublicationId;
      if (
        !discardPending &&
        !this.#bookActions.discardedPublicationIds.has(previousItem.id)
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
    this.#props.pendingPropSaves = new Map(
      savedProps
        .filter((savedProp) => !savedProp.id.startsWith("tv-cave-"))
        .map((savedProp) => [savedProp.id, savedProp]),
    );
    for (const [id, record] of this.#props.records) {
      const savedProp = this.#props.pendingPropSaves.get(id);
      if (!savedProp) continue;
      this.#props.applySavedPropPose(record, savedProp);
      this.#props.pendingPropSaves.delete(id);
    }
    this.#posters.pendingSaves = save.posters ?? [];
    this.#artFrames.pendingSaves = save.digitalArtFrames ?? [];
    // Saved model props whose ids already exist (registered during boot)
    // adopt their saved pose, scale, and lock here; only genuinely missing
    // ids remain for #restoreSavedModelProps to spawn.
    const adoptedModelPropSaves: WorldModelPropSave[] = [];
    for (const savedProp of save.modelProps ?? []) {
      const record = this.#props.records.get(savedProp.id);
      if (!record) {
        adoptedModelPropSaves.push(savedProp);
        continue;
      }
      this.#props.applySavedPropPose(record, savedProp);
      // Boot-registered defaults spawn at seed scale; without this, a
      // player-scaled default would silently revert and the next save
      // would overwrite the stored scale with the reverted value.
      if (savedProp.scale !== record.modelScale)
        this.#props.setModelPropScale(record, savedProp.scale);
      if (savedProp.locked && !record.locked) {
        record.locked = true;
        this.#physicsWorld.setPropLocked(record.id, true);
      }
    }
    this.#props.pendingModelPropSaves = adoptedModelPropSaves;
    void this.#props.restoreSavedModelProps();
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
    this.#inputController.state.lookAngles.pitch = this.#physicsPoseEuler.x;
    this.#inputController.state.lookAngles.yaw = this.#physicsPoseEuler.y;
    this.#inputController.state.lookTarget.pitch =
      this.#inputController.state.lookAngles.pitch;
    this.#inputController.state.lookTarget.yaw =
      this.#inputController.state.lookAngles.yaw;
    this.#camera.rotation.set(
      this.#inputController.state.lookAngles.pitch,
      this.#inputController.state.lookAngles.yaw,
      0,
      "YXZ",
    );
    this.#physicsWorld.setPlayerPosition(this.#camera.position);
    return new Map(
      save.books
        .filter(
          (book) =>
            !this.#bookActions.discardedPublicationIds.has(book.publicationId),
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
      ...(this.#bookActions.discardAnimation
        ? [this.#bookActions.discardAnimation.publicationId]
        : []),
      ...(this.#bookActions.shelveAnimation
        ? [this.#bookActions.shelveAnimation.publicationId]
        : []),
    ]);
    const displayItems = items.filter(
      (item) => !this.#bookActions.discardedPublicationIds.has(item.id),
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
      if (this.#inspection.inspectionPublicationId === publicationId)
        this.#inspection.endInspection();
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
            publicationId !== this.#bookActions.discardAnimation?.publicationId,
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
    this.#scanner.markDirty();
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
    this.#inspection.setInspectionTurningBackTexture(record, null);
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
        publicationId === this.#inspection.inspectionPublicationId;
      const hovered = publicationId === this.#hoveredPublicationId;
      const shelfHovered = hovered && record.state.status === "shelved";
      let targetScale = 1;
      if (hovered && !shelfHovered) targetScale = 1.08;
      else if (selected) targetScale = 1.025;
      record.targetScale = targetScale;
      record.targetLift = hovered && !shelfHovered ? 0.08 : 0;
      const discardTargeted =
        publicationId === this.#carriedPublicationId &&
        this.#scanner.trashTargeted;
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
      this.#inspection.applyInspectionLighting(record);
    }
  }

  #movePlayer(deltaSeconds: number) {
    if (
      !this.#inputController.state.pointerLocked ||
      this.#inspection.inspectionMode === "spread"
    ) {
      this.#playerVelocity.set(0, 0, 0);
      this.#playerVerticalVelocity = 0;
      this.#inputController.state.jumpQueued = false;
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
      this.#inputController.state.lookAngles.yaw,
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
        this.#inputController.state.jumpQueued &&
        movementTime - this.#inputController.state.jumpQueuedAt <=
          PLAYER_JUMP_BUFFER_MS;
      if (jumpBuffered && canJump) {
        this.#playerVerticalVelocity = PLAYER_JUMP_SPEED;
        this.#playerGrounded = false;
        this.#lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
      } else
        this.#playerVerticalVelocity = Math.max(
          PLAYER_TERMINAL_VELOCITY,
          this.#playerVerticalVelocity + PLAYER_GRAVITY * deltaSeconds,
        );
      this.#inputController.state.jumpQueued = jumpBuffered && !canJump;
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
      this.#inputController.state.jumpQueued = false;
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

  #handleDetectedWidePage(url: string) {
    const publication = this.#inspection.inspectionPublication();
    if (
      this.#disposed ||
      this.#inspection.inspectionMode !== "spread" ||
      !publication
    )
      return;
    const pageIndex = publication.pages.findIndex(
      (page) => readerPageSourceUrl(page) === url,
    );
    if (pageIndex <= 0) return;
    const record = this.#booksById.get(publication.id);
    if (!record) return;
    this.#inspection.cancelInspectionPageTurn(record, publication);
    this.#inspection.inspectionTextureRevision += 1;
    this.#inspection.inspectionPageIndex = getReaderSpread(
      this.#inspection.inspectionPageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    this.#inspection.configureInspectionPages(record, publication);
    void this.#inspection.syncInspectionPageTextures(publication);
    this.#onPageIndexChange?.(
      publication.id,
      this.#inspection.inspectionPageIndex,
    );
    this.#emitGameState();
  }

  #horizontalFieldOfView() {
    const verticalFov = MathUtils.degToRad(this.#camera.fov);
    return 2 * Math.atan(Math.tan(verticalFov / 2) * this.#camera.aspect);
  }

  #spreadDistance() {
    const publication = this.#inspection.inspectionPublication();
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

  #animateInspectedBook(record: BookRecord, deltaSeconds: number) {
    const returningToHand = this.#inspection.inspectionMode === "closing";
    const returningToShelf =
      returningToHand && record.state.status === "shelved";
    if (returningToShelf) {
      this.#inspection.animateInspectionShelfReturn(record, deltaSeconds);
      return;
    }
    if (
      !returningToHand &&
      record.state.status === "shelved" &&
      this.#inspection.inspectionShelfFocusPending
    ) {
      if (!this.#animateShelfPreview(record, true, deltaSeconds)) return;
      this.#inspection.inspectionShelfFocusPending = false;
      return;
    }
    if (returningToHand) {
      const publicationId = this.#inspection.inspectionPublicationId;
      if (
        this.#inspection.inspectionPhysicsReturnActive ||
        (publicationId &&
          this.#inspection.beginInspectionPhysicsReturn(record, publicationId))
      ) {
        this.#inspection.animateInspectionPhysicsReturn(record, deltaSeconds);
        return;
      }
    }
    if (!returningToHand) this.#inspection.updateInspectionLocalTarget();
    let targetPosition = this.#inspection.inspectionLocalPosition;
    let targetRotation = this.#inspection.inspectionLocalRotation;
    if (returningToHand) {
      const publicationId = this.#inspection.inspectionPublicationId;
      const carriedIndex = publicationId
        ? this.#carriedPublicationIds.indexOf(publicationId)
        : -1;
      if (carriedIndex >= 0) {
        this.#writeHeldBookLocalPosition(
          carriedIndex,
          this.#inspection.inspectionLocalPosition,
        );
        this.#writeHeldBookLocalRotation(
          carriedIndex,
          this.#inspection.inspectionLocalRotation,
        );
      } else {
        this.#inspection.inspectionLocalPosition.copy(this.#heldLocalPosition);
        this.#inspection.inspectionLocalRotation.copy(this.#heldLocalRotation);
      }
      targetPosition = this.#inspection.inspectionLocalPosition;
      targetRotation = this.#inspection.inspectionLocalRotation;
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
    const closeAction = this.#inspection.inspectionCloseAction;
    const coverAnimationSpeed =
      returningToHand && (closeAction === "drop" || closeAction === "throw")
        ? INSPECTION_ACTION_CLOSE_SPEED
        : INSPECTION_COVER_ANIMATION_SPEED;
    this.#inspection.animateInspectionOpening(
      record,
      deltaSeconds,
      coverAnimationSpeed,
    );
    if (
      this.#inspection.inspectionMode === "closing" &&
      this.#inspection.inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.inspectionGroup.visible
    )
      this.#inspection.showCompactInspectionBook(record);
    this.#inspection.animateInspectionPageTurn(record, deltaSeconds);
    if (
      this.#inspection.inspectionMode === "closing" &&
      this.#inspection.inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.mesh.position.distanceToSquared(targetPosition) <
        INSPECTION_TRANSITION_POSITION_EPSILON_SQ &&
      1 - Math.abs(record.mesh.quaternion.dot(targetRotation)) <
        INSPECTION_TRANSITION_ROTATION_EPSILON
    ) {
      record.mesh.position.copy(targetPosition);
      record.mesh.quaternion.copy(targetRotation);
      this.#inspection.finishInspectionClose();
    }
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
        publicationId === this.#inspection.inspectionPublicationId &&
        this.#inspection.inspectionMode !== "none"
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
      this.#inspection.inspectionMode === "spread" &&
      publicationId === this.#inspection.inspectionPublicationId;
    if (inspecting) {
      this.#inspection.updateInspectionLocalTarget();
      this.#heldTargetPosition.copy(this.#inspection.inspectionLocalPosition);
    } else this.#writeHeldBookLocalPosition(index, this.#heldTargetPosition);
    this.#heldTargetPosition.applyMatrix4(this.#camera.matrixWorld);
    this.#camera.getWorldQuaternion(this.#heldTargetRotation);
    if (!inspecting) {
      this.#writeHeldBookLocalRotation(index, this.#heldBookLocalPoseRotation);
      this.#heldTargetRotation.multiply(this.#heldBookLocalPoseRotation);
    }
  }

  #updateHeldPhysicsTarget() {
    const prop = this.#props.carriedProp;
    if (prop) {
      this.#camera.updateMatrixWorld();
      this.#heldTargetPosition
        .copy(prop.heldLocalPosition)
        .setZ(-this.#props.propPlacementDistance)
        .applyMatrix4(this.#camera.matrixWorld);
      if (this.#props.propPlacementSnapping) {
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
      const yaw = this.#props.resolvedPropPlacementYaw(prop.rotationSnapStep);
      const halfHeight = prop.halfHeight;
      this.#heldTargetPosition.y = Math.max(
        halfHeight,
        this.#heldTargetPosition.y,
      );
      this.#props.snapHeldPropToSupport(
        prop,
        prop.halfWidth,
        halfHeight,
        prop.halfDepth,
        yaw,
      );
      this.#heldTargetRotation.setFromAxisAngle(this.#upAxis, yaw);
      if (this.#props.propPlacementSnapping)
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

  #cycleCarriedBook(direction: number) {
    if (
      direction === 0 ||
      this.#bookActions.discardBusy ||
      this.#bookActions.throwChargeActive ||
      this.#inspection.inspectionMode !== "none" ||
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
    this.#scanner.update();
    this.#emitGameState();
    return true;
  }

  #interact(allowNonBookPropPickup = true) {
    if (this.#bookActions.discardBusy || this.#bookActions.shelveAnimation)
      return;
    if (this.#artFrames.placement) {
      this.#artFrames.placeDigitalArtFrame();
      return;
    }
    if (this.#posters.placement) {
      this.#posters.placePoster();
      return;
    }
    if (this.#props.carriedProp) {
      this.#props.dropCarriedProp();
      return;
    }
    if (this.#carriedPublicationId) {
      if (this.#hoveredPublicationId) {
        this.#bookActions.pickUpBook(this.#hoveredPublicationId);
      } else if (this.#scanner.trashTargeted)
        void this.#bookActions.discardCarriedBook();
      else if (this.#scanner.shelfTargeted)
        this.#bookActions.shelveCarriedBook();
      return;
    }
    if (this.#targetedArcadeCabinet) {
      this.#targetedArcadeCabinet.interact();
      return;
    }
    if (this.#televisionTargeted) {
      const targetedTelevision = this.#targetedTelevision;
      const televisionProp = targetedTelevision
        ? this.#props.televisionProps.get(targetedTelevision)
        : undefined;
      if (this.#televisionInteraction === "body" && televisionProp) {
        if (allowNonBookPropPickup) this.#props.pickUpProp(televisionProp);
        return;
      }
      targetedTelevision?.interactTargeted();
      return;
    }
    if (this.#targetedProp) {
      if (allowNonBookPropPickup) this.#props.pickUpProp(this.#targetedProp);
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
    this.#bookActions.pickUpBook(this.#hoveredPublicationId);
  }

  #createMovablePropLifecycleHost(): MovablePropLifecycleHost {
    return {
      activeArcadeCabinet: () => this.#activeArcadeCabinet,
      arcadeCabinets: () => this.#arcadeCabinets,
      audioManager: () => this.#audioManager,
      camera: () => this.#camera,
      carriedPublicationId: () => this.#carriedPublicationId,
      discardBin: () => this.#discardBin,
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      enterArcadeBrowsing: (cabinet) => this.#enterArcadeBrowsing(cabinet),
      heldTargetPosition: () => this.#heldTargetPosition,
      markTelevisionSettingChanged: () => {
        this.#worldStateDirty = true;
      },
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      pendingWorldSave: () => this.#pendingWorldSave,
      physicsPose: () => this.#physicsPose,
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsWorld: () => this.#physicsWorld,
      playerVelocity: () => this.#playerVelocity,
      savedTelevisionChannels: () => this.#savedTelevisionChannels,
      savedTelevisionVolumes: () => this.#savedTelevisionVolumes,
      scene: () => this.#scene,
      setActiveArcadeCabinet: (cabinet) => {
        this.#activeArcadeCabinet = cabinet;
      },
      setArcadeTargeted: (cabinet) => this.#setArcadeTargeted(cabinet),
      setHoveredPublicationId: (publicationId) =>
        this.#setHoveredPublicationId(publicationId),
      setPropTargeted: (record) => this.#setPropTargeted(record),
      setTelevisionTargeted: (targeted) =>
        this.#setTelevisionTargeted(targeted),
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionTableMaterial: () => this.#televisionTableMaterial,
      televisions: () => this.#televisions,
      throwVelocity: () => this.#throwVelocity,
      tvChannels: () => this.#tvChannels,
      tvScreenLighting: () => this.#tvScreenLighting,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
      upAxis: () => this.#upAxis,
      viewDirection: () => this.#viewDirection,
    };
  }

  #createScannerHost(): InteractionScannerHost {
    return {
      arcadeCabinets: () => this.#arcadeCabinets,
      arcadeProps: () => this.#props.arcadeProps,
      arcadeStatusForUi: () => this.#arcadeStatusForUi(),
      artFrames: () => this.#artFrames,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      carriedProp: () => this.#props.carriedProp,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      discardBinVolumeMeshes: () => this.#discardBin.volumeMeshes,
      emitGameState: () => this.#emitGameState(),
      frameNowMs: () => this.#frameNowMs,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      inspectionMode: () => this.#inspection.inspectionMode,
      interactiveMeshes: () => this.#interactiveMeshes,
      movableProps: () => this.#props.records,
      movablePropTargetMeshes: () => this.#props.targetMeshes,
      pointerLocked: () => this.#inputController.state.pointerLocked,
      posters: () => this.#posters,
      raycaster: () => this.#raycaster,
      setArcadeTargeted: (cabinet) => this.#setArcadeTargeted(cabinet),
      setHoveredPublicationId: (publicationId) =>
        this.#setHoveredPublicationId(publicationId),
      setPropTargeted: (record) => this.#setPropTargeted(record),
      setTelevisionTargeted: (targeted, interaction, television) =>
        this.#setTelevisionTargeted(targeted, interaction, television),
      setTrashTargeted: (targeted) => this.#setTrashTargeted(targeted),
      shelfHoverMeshesByShelf: () => this.#shelfHoverMeshesByShelf,
      shelfPresentation: () => this.#shelfPresentation,
      shelfTargetMeshes: () => this.#shelfTargetMeshes,
      shelveAnimation: () => this.#bookActions.shelveAnimation,
      signs: () => this.#signs,
      spineShelfDefinitions: () => this.#spineShelfDefinitions,
      targetedProp: () => this.#targetedProp,
      televisionTargeted: () => this.#televisionTargeted,
      televisions: () => this.#televisions,
      ungroupedShelfHoverMeshes: () => this.#ungroupedShelfHoverMeshes,
    };
  }

  #createBookCarryHost(): BookCarryHost {
    return {
      applyBookStates: () => this.#applyBookStates(),
      bookTextures: () => this.#bookTextures,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      carriedProp: () => this.#props.carriedProp,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      clearShelfTargetSelection: () => {
        this.#scanner.shelfTargeted = false;
        this.#scanner.shelfTargetSelection = undefined;
      },
      discardBinGroup: () => this.#discardBin.group,
      disposeBookRecord: (record) => this.#disposeBookRecord(record),
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      flushWorldSave: () => this.#flushWorldSave(),
      heldTargetPose: () => this.#heldTargetPose,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      inspectionMode: () => this.#inspection.inspectionMode,
      lookYaw: () => this.#inputController.state.lookAngles.yaw,
      markWorldStateDirty: () => {
        this.#worldStateDirty = true;
      },
      movableProps: () => this.#props.records,
      onDiscardPublication: () => this.#onDiscardPublication,
      physicsPose: () => this.#physicsPose,
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsPoseRotation: () => this.#physicsPoseRotation,
      physicsWorld: () => this.#physicsWorld,
      playerVelocity: () => this.#playerVelocity,
      removeCarriedPublication: (publicationId) =>
        this.#removeCarriedPublication(publicationId),
      scene: () => this.#scene,
      setCarriedPublicationId: (publicationId) => {
        this.#carriedPublicationId = publicationId;
      },
      setHoveredPublicationId: (publicationId) =>
        this.#setHoveredPublicationId(publicationId),
      setPhysicsPose: (position, rotation) =>
        this.#setPhysicsPose(position, rotation),
      setShelfPosition: (record) => this.#setShelfPosition(record),
      setShelfRotation: (record, publicationId) =>
        this.#setShelfRotation(record, publicationId),
      setShelfPresentation: (presentation) => {
        this.#shelfPresentation = presentation;
      },
      setTrashTargeted: (targeted) => this.#setTrashTargeted(targeted),
      shelfTargetSelection: () => this.#scanner.shelfTargetSelection,
      spineShelfDefinitions: () => this.#spineShelfDefinitions,
      syncCarriedBookPresentation: () => this.#syncCarriedBookPresentation(),
      syncInteractiveMeshes: () => this.#syncInteractiveMeshes(),
      targetedTrashBinId: () => this.#scanner.targetedTrashBinId,
      throwVelocity: () => this.#throwVelocity,
      trashTargeted: () => this.#scanner.trashTargeted,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
      updateShelfTargetVisuals: () => this.#scanner.updateShelfTargetVisuals(),
      viewDirection: () => this.#viewDirection,
      writeHeldBookTargetPose: (index, publicationId) =>
        this.#writeHeldBookTargetPose(index, publicationId),
      writeHeldBookLocalPosition: (index, output) =>
        this.#writeHeldBookLocalPosition(index, output),
      writeHeldBookLocalRotation: (index, output) =>
        this.#writeHeldBookLocalRotation(index, output),
    };
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
          discardedPublicationIds: this.#bookActions.discardedPublicationIds,
          discardBin: this.#discardBin,
          movableProps: this.#props.records,
          pendingModelPropSaves: this.#props.pendingModelPropSaves,
          pendingPropSaves: this.#props.pendingPropSaves,
          posters: this.#posters,
          signs: this.#signs,
          televisionsBySaveId: this.#props.televisionsBySaveId,
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

  #syncMovablePropPhysics() {
    for (const record of this.#props.records.values()) {
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
      if (this.#bookActions.shelveAnimation?.publicationId === publicationId)
        continue;
      const inspectionFocused =
        publicationId === this.#inspection.inspectionPublicationId &&
        this.#inspection.inspectionMode === "spread";
      if (inspectionFocused || record.inspectionLightingBlend > 0)
        this.#inspection.animateInspectionLighting(
          record,
          inspectionFocused,
          deltaSeconds,
        );
      if (
        publicationId === this.#inspection.inspectionPublicationId &&
        this.#inspection.inspectionMode !== "none"
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
          this.#scanner.markDirty();
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
