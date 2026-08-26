import {
  ACESFilmicToneMapping,
  AmbientLight,
  Euler,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import {TRASH_CAN_PROP_ID} from "~/game/discardBin";
import {physicalBookWidth} from "~/game/bookDimensions";
import {
  INSPECTION_FRAME_FILL,
  INSPECTION_PAGE_GUTTER,
} from "~/game/bookInspectionTuning";
import {dotWithPhysicsQuaternion} from "~/game/mathHelpers";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {type ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader.js";
import {RectAreaLightUniformsLib} from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {DEV} from "solid-js";
import {ShopAudioManager} from "~/game/ShopAudioManager";
import {FpsHud} from "~/game/FpsHud";
import type {BookRecord} from "~/game/bookFactory";
import {INSPECTION_TRANSITION_SPEED} from "~/game/bookInspectionTuning";
import type {ShopArcadePlayRequest} from "~/game/ShopArcadeCabinet";
import {disposeObject} from "~/game/threeDisposal";
import type {MovablePropRegistration} from "~/game/propRegistration";
import {
  GameStateEmitter,
  type GameSnapshotInput,
} from "~/game/gameStateEmitter";
import type {ShopSignKind} from "~/game/signs/ShopSignSystem";
import {shopSignKey} from "~/game/signs/ShopSignSystem";
import type {DigitalArtFramePasteTarget} from "~/game/artFrameSystem";
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
import {ShopBookLifecycle} from "~/game/shopBookLifecycle";
import {
  ShopBookPresentation,
  type ShopBookPresentationHost,
} from "~/game/shopBookPresentation";
import {ShopPlayerMovement} from "~/game/shopPlayerMovement";
import {ShopWorldPersistence} from "~/game/shopWorldPersistence";
import {
  cloneFloorMaterial,
  ShopInteriorAssets,
} from "~/game/shopInteriorAssets";
import {ShopMediaController} from "~/game/shopMediaController";
import {
  bookSignature as catalogBookSignature,
  ShopCatalogSync,
} from "~/game/shopCatalogSync";
import {ShopInteractionCoordinator} from "~/game/shopInteractionCoordinator";
import {ShopViewportController} from "~/game/shopViewportController";
import {ShopShaderWarmup} from "~/game/shopShaderWarmup";
import {ShopTargetingController} from "~/game/shopTargetingController";
import {ShopArcadeSessionController} from "~/game/shopArcadeSessionController";

import type {CatalogAtlases, CatalogIdentity, CatalogItem} from "~/catalog";
import type {ArtFrameImage} from "~/artFrames/protocol";
import {artFrameChannelId} from "~/artFrames/protocol";
import type {ShopSignEditRequest} from "~/game/signs/ShopSignSystem";
import {type UiMode} from "~/game/uiMode";

import {type ShopCollisionWorld} from "~/game/shopGameplay";
import {loadShortcuts, type ShortcutsConfig} from "~/game/input/bindings";
import {InputManager, type InputMode} from "~/game/input/inputManager";
import {
  loadPadMappingOverrides,
  padForwardEvent,
  type ArcadePadMappingOverrides,
} from "~/arcade/controllerMappings";
import {findArcadeSystem} from "~/arcade/systems";

import {ShelfPresentation} from "~/game/shelfPlacement";
import {SHOP_BOUNDS, SHOP_INTERIOR_FOOTPRINTS} from "~/game/shopLayout";
import {
  ShopPhysicsWorld,
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  type BookPhysicsPose,
  type MutableBookPhysicsTransform,
} from "~/game/ShopPhysicsWorld";
import {
  ShopTelevision,
  type ShopTelevisionInteraction,
} from "~/game/ShopTelevision";
import type {ShopMediaCatalog} from "~/game/shopMediaCatalog";
import type {WorldSaveV1} from "~/game/worldSave";
import {
  getWideReaderPageIndices,
  readerPageSourceUrl,
  subscribeToWideReaderPages,
} from "~/reader/pageSpreadDetection";
import {getReaderSpread, type ReaderNavigation} from "~/reader/pagination";
import {tvChannelId, tvVideoImportUrl, type TvVideo} from "~/tv/protocol";
import type {PosterAsset} from "~/posters/protocol";
import type {
  MovablePropRecord,
  ShopGameSnapshot,
  SpineShelfDefinition,
} from "~/game/shopTypes";

const SHOP_PLAYER_START_X = 0;
const SHOP_PLAYER_START_Z = 25;
const SHOP_MEDIA_CATALOG_REFRESH_INTERVAL_MS = 10_000;
// While the camera holds still, the aim sweep reuses its previous result
// and refreshes at this interval so dynamic content cannot stale-highlight.
// The full-shop reticle sweep runs on a fixed-rate budget (60 Hz) instead
// of every animation tick; highlight prompts and clicks tolerate a frame
// or two of latency, and the sweep costs real time against many props.
/** Extra reach margin so culling never drops a bank the ray could graze. */
const PROP_PLACEMENT_GRID_SIZE = 0.25;
const PROP_PLACEMENT_HEIGHT_STEP = 0.125;
const SHOP_COLLISION_WORLD: ShopCollisionWorld = {
  bounds: SHOP_BOUNDS,
  obstacles: SHOP_INTERIOR_FOOTPRINTS,
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
  readonly #signs: ShopSignSystem;
  readonly #discardBin: DiscardBin;
  readonly #doors: DoorSystem;
  readonly #posters: PosterSystem;
  readonly #artFrames: ArtFrameSystem;
  readonly #tvVideos: TvVideoImporter;
  readonly #artFrameTextures: ArtFrameTextureCache;
  readonly #interiorAssets: ShopInteriorAssets;
  readonly #mediaController: ShopMediaController;
  readonly #catalogSync: ShopCatalogSync;
  readonly #interactionCoordinator: ShopInteractionCoordinator;
  readonly #targetingController: ShopTargetingController;
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
  // Every placed cabinet runs its own session; the "active" one is the
  // cabinet whose UI (picker or game) the player is currently driving.
  #targetedArcadeCabinet: ShopArcadeCabinet | undefined;
  readonly #arcadeSessionController: ShopArcadeSessionController;
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
  readonly #physicsWorld = new ShopPhysicsWorld();
  readonly #playerVelocity = new Vector3();
  readonly #posterRaycastMeshes: Mesh[] = [];
  readonly #raycaster = new Raycaster();
  /** Frame timestamp from the animation loop; one time source per frame. */
  #frameNowMs = 0;
  readonly #renderer: WebGLRenderer;
  readonly #shaderWarmup: ShopShaderWarmup;
  readonly #viewportController: ShopViewportController;
  readonly #scene = new Scene();
  readonly #spineShelfDefinitions = new Map<string, SpineShelfDefinition>();
  readonly #selectedPublicationId: () => string | null | undefined;
  readonly #shelfTargetMeshes: Mesh[] = [];
  readonly #textureLoader = new TextureLoader();
  /**
   * Lazily initialized because support detection needs the renderer. Serves
   * the basis transcoder from the Afterleaf-managed runtime route.
   */
  #ktx2Loader: KTX2Loader | undefined;
  readonly #televisions: ShopTelevision[] = [];
  readonly #throwVelocity = new Vector3();
  readonly #upAxis = new Vector3(0, 1, 0);
  readonly #viewDirection = new Vector3();

  readonly #carriedPublicationIds: string[] = [];
  #carriedPublicationId: string | undefined;
  readonly #bookActions: BookCarryActions;
  readonly #bookLifecycle: ShopBookLifecycle;
  readonly #bookPresentation: ShopBookPresentation;
  readonly #playerMovementController: ShopPlayerMovement;
  readonly #worldPersistence: ShopWorldPersistence;
  readonly #scanner: InteractionScanner;
  readonly #props: MovablePropLifecycle;
  #disposed = false;
  #stagedBootStarted = false;
  #frameHandle: number | undefined;
  #hoveredPublicationId: string | undefined;

  #interactiveMeshes: Mesh[] = [];
  #lastFrameTime = 0;
  #lastSelectedPublicationId: string | null | undefined;
  #moonEnvironment: Texture | undefined;
  #onReady: (() => void) | undefined;
  #inputSuspended = false;
  #mediaCatalogRefreshHandle: number | undefined;
  #ready = false;
  #shelfPresentation: ShelfPresentation = "spine";
  readonly #shelfHoverMeshesByShelf = new Map<string, Mesh[]>();
  readonly #ungroupedShelfHoverMeshes: Mesh[] = [];
  #channelEditorDigitalArtFrameId: string | undefined;
  #channelEditorTelevision: ShopTelevision | undefined;
  #targetedProp: MovablePropRecord | undefined;
  #televisionInteraction: ShopTelevisionInteraction | undefined;
  #televisionTargeted = false;
  #targetedTelevision: ShopTelevision | undefined;
  #televisionTableMaterial: MeshStandardMaterial | undefined;

  constructor(options: ShopSceneOptions) {
    this.#canvas = options.canvas;
    this.#catalogAtlases = options.catalogAtlases;
    this.#catalogAvailable = options.catalogAvailable;
    this.#catalogIdentity = options.catalogIdentity;
    this.#catalogItems = options.catalogItems;
    this.#newPublicationIds = options.newPublicationIds ?? (() => []);
    this.#initialPageIndex = options.initialPageIndex ?? (() => 0);
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
        this.#arcadeSessionController.activeArcadeCabinet?.sessionStatus ===
        "playing"
          ? this.#arcadeSessionController.activeArcadeCabinet
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
    this.#viewportController = new ShopViewportController({
      camera: this.#camera,
      canvas: this.#canvas,
      renderer: this.#renderer,
    });
    this.#shaderWarmup = new ShopShaderWarmup({
      camera: this.#camera,
      disposed: () => this.#disposed,
      renderer: this.#renderer,
      scene: this.#scene,
      televisions: () => this.#televisions,
      tvScreenLighting: () => this.#tvScreenLighting(),
    });

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
        this.#targetingController.setHoveredPublicationId(publicationId),
      onSelectPublication: this.#onSelectPublication,
      initialPageIndex: (publicationId) =>
        this.#initialPageIndex(publicationId),
      applyBookStates: () => this.#bookLifecycle.applyBookStates(),
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
      viewportWidth: () => this.#viewportController.width(),
      textureLoader: () => this.#textureLoader,
      renderer: () => this.#renderer,
      spreadDistance: () => this.#spreadDistance(),
      heldTargetPose: () => this.#heldTargetPose,
    });
    this.#arcadeSessionController = new ShopArcadeSessionController({
      camera: () => this.#camera,
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      lookTarget: () => this.#inputController.state.lookTarget,
      paused: () => this.#paused(),
      releasePointerLock: () => this.#inputController.releasePointerLock(),
      requestPointerLock: () => this.#inputController.requestPointerLock(),
    });
    this.#props = new MovablePropLifecycle(
      this.#createMovablePropLifecycleHost(),
    );
    this.#bookActions = new BookCarryActions(this.#createBookCarryHost());
    this.#scanner = new InteractionScanner(this.#createScannerHost());
    this.#worldPersistence = new ShopWorldPersistence({
      applyPlayerPose: (position, quaternion) =>
        this.#applyPlayerPose(position, quaternion),
      artFrames: () => this.#artFrames,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      catalogAvailable: () => this.#catalogAvailable(),
      catalogIdentity: () => this.#catalogIdentity(),
      discardedPublicationIds: () => this.#bookActions.discardedPublicationIds,
      discardBin: () => this.#discardBin,
      disposed: () => this.#disposed,
      movableProps: () => this.#props,
      onWorldSave: options.onWorldSave,
      pendingSave: options.initialWorldSave,
      physicsWorld: () => this.#physicsWorld,
      posters: () => this.#posters,
      signs: () => this.#signs,
      worldSaveWritable: () => options.worldSaveWritable(),
    });
    this.#bookLifecycle = new ShopBookLifecycle({
      bookActions: () => this.#bookActions,
      bookSignature: catalogBookSignature,
      bookTextures: () => this.#bookTextures,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      emitGameState: () => this.#emitGameState(),
      heldLocalPosition: () => this.#heldLocalPosition,
      heldLocalRotation: () => this.#heldLocalRotation,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      inspection: () => this.#inspection,
      lastSelectedPublicationId: () => this.#lastSelectedPublicationId,
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      newPublicationIds: () => this.#newPublicationIds(),
      observedArrivalIds: this.#observedArrivalIds,
      physicsPose: () => this.#physicsPose,
      physicsPoseEuler: () => this.#physicsPoseEuler,
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsPoseRotation: () => this.#physicsPoseRotation,
      physicsWorld: () => this.#physicsWorld,
      scanner: () => this.#scanner,
      scene: () => this.#scene,
      setCarriedPublicationId: (publicationId) => {
        this.#carriedPublicationId = publicationId;
      },
      setInteractiveMeshes: (meshes) => {
        this.#interactiveMeshes = meshes;
      },
      shelfHoverMeshesByShelf: this.#shelfHoverMeshesByShelf,
      spineShelfDefinitions: () => this.#spineShelfDefinitions,
      syncCarriedBookPresentation: () =>
        this.#bookPresentation.syncCarriedBookPresentation(),
      takeCompatibleWorldSave: () =>
        this.#worldPersistence.takeCompatibleWorldSave(),
      ungroupedShelfHoverMeshes: this.#ungroupedShelfHoverMeshes,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
    });
    this.#bookPresentation = new ShopBookPresentation(
      this.#createBookPresentationHost(),
    );
    this.#interactionCoordinator = new ShopInteractionCoordinator({
      artFrames: () => this.#artFrames,
      bookActions: () => this.#bookActions,
      bookTextures: () => this.#bookTextures,
      booksById: () => this.#booksById,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      emitGameState: () => this.#emitGameState(),
      hoveredPublicationId: () => this.#hoveredPublicationId,
      inspection: () => this.#inspection,
      posters: () => this.#posters,
      props: () => this.#props,
      scanner: () => this.#scanner,
      setCarriedPublicationId: (publicationId) => {
        this.#carriedPublicationId = publicationId;
      },
      signs: () => this.#signs,
      syncCarriedBookPresentation: () =>
        this.#bookPresentation.syncCarriedBookPresentation(),
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionInteraction: () => this.#televisionInteraction,
      televisionTargeted: () => this.#televisionTargeted,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
    });
    this.#targetingController = new ShopTargetingController({
      bookLifecycle: () => this.#bookLifecycle,
      bookTextures: () => this.#bookTextures,
      booksById: () => this.#booksById,
      currentArcadeCabinet: () => this.#targetedArcadeCabinet,
      currentProp: () => this.#targetedProp,
      currentTelevision: () => this.#targetedTelevision,
      currentTelevisionInteraction: () => this.#televisionInteraction,
      emitGameState: () => this.#emitGameState(),
      hoveredPublicationId: () => this.#hoveredPublicationId,
      resetTelevisionWheel: () => {
        this.#inputController.state.tvWheelScrubDirection = undefined;
        this.#inputController.state.tvWheelScrubLastAt =
          Number.NEGATIVE_INFINITY;
        this.#inputController.state.tvWheelScrubStepIndex = 0;
      },
      scanner: () => this.#scanner,
      setArcadeCabinet: (cabinet) => {
        this.#targetedArcadeCabinet = cabinet;
      },
      setHoveredPublicationId: (publicationId) => {
        this.#hoveredPublicationId = publicationId;
      },
      setProp: (record) => {
        this.#targetedProp = record;
      },
      setTelevisionState: (targeted, interaction, television) => {
        this.#targetedTelevision = television;
        this.#televisionInteraction = interaction;
        this.#televisionTargeted = targeted;
      },
    });
    this.#inputController = new ShopInputController({
      abortSignal: this.#abortController.signal,
      activeArcadeCabinet: () =>
        this.#arcadeSessionController.activeArcadeCabinet,
      arcadeStatusForUi: () =>
        this.#arcadeSessionController.arcadeStatusForUi(),
      artFrames: () => this.#artFrames,
      bookActions: () => this.#bookActions,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      canvas: () => this.#canvas,
      carriedPublicationId: () => this.#carriedPublicationId,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      cycleCarriedBook: (direction) =>
        this.#interactionCoordinator.cycleCarriedBook(direction),
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      gamepadLookSensitivity: () => this.#gamepadLookSensitivity(),
      handleImagePaste: (event) =>
        this.#mediaController.handleImagePaste(event),
      hoveredPublicationId: () => this.#hoveredPublicationId,
      input: () => this.#input,
      interact: (allowNonBookPropPickup) =>
        this.#interactionCoordinator.interact(allowNonBookPropPickup),
      inspection: () => this.#inspection,
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      mouseSensitivity: () => this.#mouseSensitivity(),
      onMediaChannelCreateRequest: this.#onMediaChannelCreateRequest,
      paused: () => this.#paused(),
      physicsWorld: () => this.#physicsWorld,
      posters: () => this.#posters,
      props: () => this.#props,
      refreshMediaCatalogIfActive: () =>
        this.#mediaController.refreshIfActive(),
      scanner: () => this.#scanner,
      setArcadeTargeted: (cabinet) =>
        this.#targetingController.setArcadeTargeted(cabinet),
      setChannelEditorDigitalArtFrameId: (id) => {
        this.#channelEditorDigitalArtFrameId = id;
      },
      setChannelEditorTelevision: (television) => {
        this.#channelEditorTelevision = television;
      },
      setHoveredPublicationId: (publicationId) =>
        this.#targetingController.setHoveredPublicationId(publicationId),
      setPropTargeted: (record) =>
        this.#targetingController.setPropTargeted(record),
      setShelfPresentation: (presentation) => {
        this.#shelfPresentation = presentation;
      },
      setTelevisionTargeted: (targeted, interaction, television) =>
        this.#targetingController.setTelevisionTargeted(
          targeted,
          interaction,
          television,
        ),
      setTrashTargeted: (targeted) =>
        this.#targetingController.setTrashTargeted(targeted),
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
      activeArcadeCabinet: () =>
        this.#arcadeSessionController.activeArcadeCabinet,
      arcadeProps: () => this.#props.arcadeProps,
      arcadeStatusForUi: () =>
        this.#arcadeSessionController.arcadeStatusForUi(),
      arcadeSystemIdForUi: () =>
        this.#arcadeSessionController.arcadeSystemIdForUi(),
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
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
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
        markWorldStateDirty: () => this.#worldPersistence.markDirty(),
        posterRaycastMeshes: this.#posterRaycastMeshes,
        raycaster: this.#raycaster,
        refreshMediaCatalog: () => this.#mediaController.refresh(),
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
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
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
    this.#interiorAssets = new ShopInteriorAssets({
      disposed: () => this.#disposed,
      posterRaycastMeshes: this.#posterRaycastMeshes,
      posterSurfaces: this.#posters.surfaces,
      props: () => this.#props,
      renderer: () => this.#renderer,
      textureLoader: () => this.#textureLoader,
    });
    this.#mediaController = new ShopMediaController({
      abortSignal: this.#abortController.signal,
      artFrames: () => this.#artFrames,
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      importArtFrameImage: options.importArtFrameImage,
      importPoster: options.importPoster,
      loadMediaCatalog:
        options.loadMediaCatalog ??
        (() =>
          Promise.resolve({
            artFrames: {channels: []},
            models: {models: []},
            posters: {posters: []},
            tv: {channels: []},
          })),
      onTextPaste: options.onTextPaste,
      paused: () => this.#paused(),
      posters: () => this.#posters,
      props: () => this.#props,
      targetedTelevision: () => this.#targetedTelevision,
      televisionTargeted: () => this.#televisionTargeted,
      televisions: () => this.#televisions,
      tvVideos: () => this.#tvVideos,
    });
    this.#playerMovementController = new ShopPlayerMovement({
      camera: () => this.#camera,
      collisionWorld: SHOP_COLLISION_WORLD,
      input: () => this.#input,
      inputState: () => this.#inputController.state,
      inspectionSpread: () => this.#inspection.inspectionMode === "spread",
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      physicsWorld: () => this.#physicsWorld,
      playerVelocity: () => this.#playerVelocity,
    });
    this.#catalogSync = new ShopCatalogSync({
      bookActions: () => this.#bookActions,
      bookLifecycle: () => this.#bookLifecycle,
      booksById: () => this.#booksById,
      bookTextures: () => this.#bookTextures,
      catalogAvailable: () => this.#catalogAvailable(),
      catalogItems: () => this.#catalogItems(),
      lastSelectedPublicationId: () => this.#lastSelectedPublicationId,
      newPublicationIds: () => this.#newPublicationIds(),
      observedArrivalIds: this.#observedArrivalIds,
      selectedPublicationId: () => this.#selectedPublicationId(),
      setLastSelectedPublicationId: (publicationId) => {
        this.#lastSelectedPublicationId = publicationId;
      },
    });

    if (DEV)
      (window as ShopPerformanceDebugWindow).__AFTERLEAF_PERFORMANCE_DEBUG__ = {
        camera: this.#camera,
        renderer: this.#renderer,
        scene: this.#scene,
      };

    this.#inputController.bind();
    void this.#inputController.loadKeyboardLayout();
    this.#viewportController.observe();
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
        this.#interiorAssets.addBox(p, size, pos, mat, castShadow),
      artFrames: this.#artFrames,
      cacheBuiltinPropTemplate: (registration) =>
        this.#props.cacheBuiltinPropTemplate(registration),
      cloneFloorMaterial,
      createFloorMaterial: () => this.#interiorAssets.createFloorMaterial(),
      createPosterSurface: (p, id, w, h, pos, rot) =>
        this.#interiorAssets.createPosterSurface(p, id, w, h, pos, rot),
      createFaceOutDisplay: (p, wood, backing, deps) =>
        createFaceOutDisplay(p, wood, backing, deps),
      createSpawnedCrtTelevision: (asset, id, scale, pose) =>
        this.#props.createSpawnedCrtTelevision(asset, id, scale, pose),
      createUpperReadingFurniture: (p, wood, furnitureMaterials) =>
        this.#interiorAssets.createUpperReadingFurniture(
          p,
          wood,
          furnitureMaterials,
        ),
      discardBin: this.#discardBin,
      disposed: this.#disposed,
      doors: this.#doors,
      modelMixers: this.#props.modelMixers,
      needsSeedPass: (version) => this.#props.needsSeedPass(version),
      pendingWorldSave: this.#worldPersistence.pendingWorldSave(),
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
    this.#catalogSync.sync();
    void this.#mediaController.refresh();
    void this.#initializePhysics();
    this.#lastFrameTime = performance.now();
    this.#viewportController.applyResize();
    stage("first-render-start");
    this.#renderer.render(this.#scene, this.#camera);
    this.#worldPersistence.startScheduler();
    this.#mediaCatalogRefreshHandle = window.setInterval(
      this.#mediaController.refreshIfActive,
      SHOP_MEDIA_CATALOG_REFRESH_INTERVAL_MS,
    );
    this.#frameHandle = requestAnimationFrame(this.#animate);
    stage("warm-shaders-start");
    await this.#shaderWarmup.warm();
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
    this.#shaderWarmup.precompile();
    this.#markReady();
  }

  requestPointerLock() {
    // Modes stay exclusive: an arcade session owns the cursor until its
    // ladder exits, so external re-lock requests are ignored meanwhile.
    if (this.#disposed || this.#arcadeSessionController.arcadeStatusForUi())
      return;
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
    this.#playerMovementController.reset();
    this.#worldPersistence.markDirty();
  }

  /** Boots a ROM on the named cabinet; called by the ROM picker UI. */
  playArcadeRom(cabinetId: string, request: ShopArcadePlayRequest) {
    this.#arcadeSessionController.playArcadeRom(cabinetId, request);
  }

  /** Playing → back to the ROM picker of the active session. */
  quitActiveArcadeGame() {
    this.#arcadeSessionController.quitActiveArcadeGame();
  }

  /**
   * Escape ladder for the UI-active session: a running game steps away from
   * its cabinet (emulation keeps running), an open picker or boot overlay
   * exits entirely. Called by the shared modal stack, which owns Escape
   * routing while a session is active.
   */
  backOutOfArcade() {
    this.#arcadeSessionController.backOutOfArcade();
  }

  /**
   * Backs out of any arcade UI: an open picker or a running game closes and
   * the player returns to walking around the shop.
   */
  exitArcadeUi() {
    this.#arcadeSessionController.exitArcadeUi();
  }

  /**
   * Steps away from the active session's UI without stopping emulation: the
   * world unfreezes, keys stop forwarding, and the cabinet keeps playing
   * until the player targets it again (E resumes) or quits through the ROM
   * picker. Pointer lock is held through the whole cycle; if the browser
   * force-released it (Escape), standard click-to-lock recovers.
   */
  stepAwayFromArcade() {
    this.#arcadeSessionController.stepAwayFromArcade();
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
    this.#worldPersistence.stopScheduler();
    this.#worldPersistence.flush();
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
    this.#arcadeSessionController.dispose();
    this.#props.arcadeProps.clear();
    this.#targetedArcadeCabinet = undefined;
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
    this.#viewportController.dispose();
    this.#ktx2Loader?.dispose();
    this.#ktx2Loader = undefined;
    if (this.#frameHandle !== undefined)
      cancelAnimationFrame(this.#frameHandle);
    this.#frameHandle = undefined;
    if (this.#mediaCatalogRefreshHandle !== undefined)
      window.clearInterval(this.#mediaCatalogRefreshHandle);
    this.#mediaCatalogRefreshHandle = undefined;
    this.#shaderWarmup.dispose();

    this.#bookTextures.bumpRevision();
    this.#bookTextures.disposeBookAtlasBatches();
    for (const record of this.#booksById.values())
      this.#bookLifecycle.disposeBookRecord(record);
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

    this.#catalogSync.sync();
    this.#viewportController.syncPixelRatio();
    if (this.#viewportController.resizeDirty())
      this.#viewportController.applyResize();

    const paused = this.#paused();
    // Polling runs in every mode so Start keeps toggling the menu and arcade
    // sessions keep receiving forwarded pad buttons.
    const inputMode: InputMode = paused
      ? "paused"
      : this.#arcadeSessionController.activeArcadeCabinet?.sessionStatus ===
          "playing"
        ? "arcade"
        : "shop";
    this.#input.update(inputMode);
    for (const television of this.#televisions) {
      television.setSuspended(paused);
      television.update(deltaSeconds);
    }
    this.#arcadeSessionController.update(deltaSeconds);
    this.#fpsHud.update(
      deltaSeconds,
      this.#arcadeSessionController.activeArcadeCabinet?.perfSample,
    );
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
    const arcadeActive =
      this.#arcadeSessionController.arcadeStatusForUi() !== undefined;
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
    this.#playerMovementController.update(deltaSeconds);
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
    this.#bookPresentation.animate(deltaSeconds);
    this.#bookActions.animateShelve(deltaSeconds);
    this.#bookTextures.syncBookAtlasBatches();
    this.#bookActions.animateDiscard(deltaSeconds);
    for (const mixer of this.#props.modelMixers) mixer.update(deltaSeconds);
    this.#renderer.render(this.#scene, this.#camera);
    this.#frameHandle = requestAnimationFrame(this.#animate);
  };

  #configureScene() {
    RectAreaLightUniformsLib.init();
    this.#moonEnvironment = this.#interiorAssets.createMoonEnvironment();
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
    this.#worldPersistence.markDirty();
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

  #applyPlayerPose(
    position: WorldSaveV1["player"]["position"],
    quaternion: WorldSaveV1["player"]["quaternion"],
  ) {
    this.#camera.position.set(position.x, position.y, position.z);
    this.#camera.quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
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

    this.#bookPresentation.updateHeldPhysicsTarget();
  }

  #createBookPresentationHost(): ShopBookPresentationHost {
    return {
      bookActions: () => this.#bookActions,
      bookLifecycle: () => this.#bookLifecycle,
      booksById: () => this.#booksById,
      camera: () => this.#camera,
      carriedPublicationIds: () => this.#carriedPublicationIds,
      emitGameState: () => this.#emitGameState(),
      heldLocalPosition: () => this.#heldLocalPosition,
      heldLocalRotation: () => this.#heldLocalRotation,
      heldTargetPose: () => this.#heldTargetPose,
      heldTargetPosition: () => this.#heldTargetPosition,
      heldTargetRotation: () => this.#heldTargetRotation,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      input: () => this.#input,
      inspection: () => this.#inspection,
      markScannerDirty: () => this.#scanner.markDirty(),
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      physicsPoseEuler: () => this.#physicsPoseEuler,
      physicsTransform: () => this.#physicsTransform,
      physicsWorld: () => this.#physicsWorld,
      scene: () => this.#scene,
      setInteractiveMeshes: () => this.#bookLifecycle.syncInteractiveMeshes(),
      setPhysicsPose: (position, rotation) =>
        this.#bookLifecycle.setPhysicsPose(position, rotation),
      spineShelfDefinitions: () => this.#spineShelfDefinitions,
    };
  }

  #createMovablePropLifecycleHost(): MovablePropLifecycleHost {
    return {
      activeArcadeCabinet: () =>
        this.#arcadeSessionController.activeArcadeCabinet,
      arcadeCabinets: () => this.#arcadeSessionController.cabinets,
      audioManager: () => this.#audioManager,
      camera: () => this.#camera,
      carriedPublicationId: () => this.#carriedPublicationId,
      discardBin: () => this.#discardBin,
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      enterArcadeBrowsing: (cabinet) =>
        this.#arcadeSessionController.enterArcadeBrowsing(cabinet),
      heldTargetPosition: () => this.#heldTargetPosition,
      markTelevisionSettingChanged: () => this.#worldPersistence.markDirty(),
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      pendingWorldSave: () => this.#worldPersistence.pendingWorldSave(),
      physicsPose: () => this.#physicsPose,
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsWorld: () => this.#physicsWorld,
      playerVelocity: () => this.#playerVelocity,
      savedTelevisionChannels: () =>
        this.#worldPersistence.savedTelevisionChannels(),
      savedTelevisionVolumes: () =>
        this.#worldPersistence.savedTelevisionVolumes(),
      scene: () => this.#scene,
      setActiveArcadeCabinet: (cabinet) => {
        this.#arcadeSessionController.activeArcadeCabinet = cabinet;
      },
      setArcadeTargeted: (cabinet) =>
        this.#targetingController.setArcadeTargeted(cabinet),
      setHoveredPublicationId: (publicationId) =>
        this.#targetingController.setHoveredPublicationId(publicationId),
      setPropTargeted: (record) =>
        this.#targetingController.setPropTargeted(record),
      setTelevisionTargeted: (targeted) =>
        this.#targetingController.setTelevisionTargeted(targeted),
      targetedArcadeCabinet: () => this.#targetedArcadeCabinet,
      targetedProp: () => this.#targetedProp,
      targetedTelevision: () => this.#targetedTelevision,
      televisionTableMaterial: () => this.#televisionTableMaterial,
      televisions: () => this.#televisions,
      throwVelocity: () => this.#throwVelocity,
      tvChannels: () => this.#mediaController.tvChannels(),
      tvScreenLighting: () => this.#tvScreenLighting,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
      upAxis: () => this.#upAxis,
      viewDirection: () => this.#viewDirection,
    };
  }

  #createScannerHost(): InteractionScannerHost {
    return {
      arcadeCabinets: () => this.#arcadeSessionController.cabinets,
      arcadeProps: () => this.#props.arcadeProps,
      arcadeStatusForUi: () =>
        this.#arcadeSessionController.arcadeStatusForUi(),
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
      setArcadeTargeted: (cabinet) =>
        this.#targetingController.setArcadeTargeted(cabinet),
      setHoveredPublicationId: (publicationId) =>
        this.#targetingController.setHoveredPublicationId(publicationId),
      setPropTargeted: (record) =>
        this.#targetingController.setPropTargeted(record),
      setTelevisionTargeted: (targeted, interaction, television) =>
        this.#targetingController.setTelevisionTargeted(
          targeted,
          interaction,
          television,
        ),
      setTrashTargeted: (targeted) =>
        this.#targetingController.setTrashTargeted(targeted),
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
      applyBookStates: () => this.#bookLifecycle.applyBookStates(),
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
      disposeBookRecord: (record) =>
        this.#bookLifecycle.disposeBookRecord(record),
      disposed: () => this.#disposed,
      emitGameState: () => this.#emitGameState(),
      flushWorldSave: () => this.#worldPersistence.flush(),
      heldTargetPose: () => this.#heldTargetPose,
      hoveredPublicationId: () => this.#hoveredPublicationId,
      inspectionMode: () => this.#inspection.inspectionMode,
      lookYaw: () => this.#inputController.state.lookAngles.yaw,
      markWorldStateDirty: () => this.#worldPersistence.markDirty(),
      movableProps: () => this.#props.records,
      onDiscardPublication: () => this.#onDiscardPublication,
      physicsPose: () => this.#physicsPose,
      physicsPosePosition: () => this.#physicsPosePosition,
      physicsPoseRotation: () => this.#physicsPoseRotation,
      physicsWorld: () => this.#physicsWorld,
      playerVelocity: () => this.#playerVelocity,
      removeCarriedPublication: (publicationId) =>
        this.#bookLifecycle.removeCarriedPublication(publicationId),
      scene: () => this.#scene,
      setCarriedPublicationId: (publicationId) => {
        this.#carriedPublicationId = publicationId;
      },
      setHoveredPublicationId: (publicationId) =>
        this.#targetingController.setHoveredPublicationId(publicationId),
      setPhysicsPose: (position, rotation) =>
        this.#bookLifecycle.setPhysicsPose(position, rotation),
      setShelfPosition: (record) =>
        this.#bookLifecycle.setShelfPosition(record),
      setShelfRotation: (record, publicationId) =>
        this.#bookLifecycle.setShelfRotation(record, publicationId),
      setShelfPresentation: (presentation) => {
        this.#shelfPresentation = presentation;
      },
      setTrashTargeted: (targeted) =>
        this.#targetingController.setTrashTargeted(targeted),
      shelfTargetSelection: () => this.#scanner.shelfTargetSelection,
      spineShelfDefinitions: () => this.#spineShelfDefinitions,
      syncCarriedBookPresentation: () =>
        this.#bookPresentation.syncCarriedBookPresentation(),
      syncInteractiveMeshes: () => this.#bookLifecycle.syncInteractiveMeshes(),
      targetedTrashBinId: () => this.#scanner.targetedTrashBinId,
      throwVelocity: () => this.#throwVelocity,
      trashTargeted: () => this.#scanner.trashTargeted,
      updateHeldPhysicsTarget: () => this.#updateHeldPhysicsTarget(),
      updateShelfTargetVisuals: () => this.#scanner.updateShelfTargetVisuals(),
      viewDirection: () => this.#viewDirection,
      writeHeldBookTargetPose: (index, publicationId) =>
        this.#bookPresentation.writeHeldBookTargetPose(index, publicationId),
      writeHeldBookLocalPosition: (index, output) =>
        this.#bookPresentation.writeHeldBookLocalPosition(index, output),
      writeHeldBookLocalRotation: (index, output) =>
        this.#bookPresentation.writeHeldBookLocalRotation(index, output),
    };
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
      if (positionChanged || rotationChanged)
        this.#worldPersistence.markDirty();
    }
  }

  #markReady() {
    if (this.#ready) return;
    this.#ready = true;
    this.#onReady?.();
    this.#onReady = undefined;
  }
}
