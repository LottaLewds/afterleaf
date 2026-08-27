import {LinearFilter, MathUtils, SRGBColorSpace, Vector2, Vector3, Quaternion} from "three";
import {
  type PerspectiveCamera,
  type Raycaster,
  type Scene,
  type Texture,
  type TextureLoader,
  type WebGLRenderer,
} from "three";
import {
  detectWideReaderPage,
  readerPageTextureUrl,
  getWideReaderPageIndices,
  mirrorReaderPageHorizontalRange,
  readerPageHalf,
} from "~/reader/pageSpreadDetection";
import {
  getAdjacentSpreadStart,
  getReaderSpread,
  getReaderSpreadSides,
  type ReaderNavigation,
  clampPageIndex,
  READER_PAGE_TEXTURE_CACHE_SIZE,
} from "~/reader/pagination";
import {physicalBookWidth} from "~/game/bookDimensions";
import type {CatalogItem} from "~/catalog";
import type {BookRecord} from "~/game/bookFactory";
import type {ActiveLeafDeformationTarget, ActiveLeafVertex} from "~/game/PageTurnGeometry";
import {getPageBlockSplit, writeActiveLeafDeformation, writeActiveLeafPositions} from "~/game/PageTurnGeometry";
import {PageTextureCache} from "~/game/PageTextureCache";
import {ReaderPagePreloader} from "~/reader/ReaderPagePreloader";
import {createReaderPagePreloadPlan} from "~/reader/pagePreloadPlan";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {
  INSPECTION_ACTION_CLOSE_SPEED,
  INSPECTION_COVER_ANIMATION_SPEED,
  INSPECTION_LIGHTING_BLEND_SPEED,
  INSPECTION_OPEN_ANGLE,
  INSPECTION_OPENING_DELAY_SECONDS,
  INSPECTION_PAGE_DEFORMATION,
  INSPECTION_PAGE_DRAG_FOLLOW_SPEED,
  INSPECTION_PAGE_GUTTER,
  invertPageTurnEasing,
  INSPECTION_PAGE_TURN_SPEED,
  INSPECTION_READER_EMISSIVE,
  INSPECTION_READER_EMISSIVE_INTENSITY,
  INSPECTION_SURFACE_GAP,
  INSPECTION_TRANSITION_POSITION_EPSILON_SQ,
} from "~/game/bookInspectionTuning";
import {
  SHELF_PREVIEW_ROTATION_SPEED,
  SHELF_PREVIEW_TRANSLATION_SPEED,
  SHELF_RETURN_CLOSE_HANDOFF_ANGLE,
  SHELF_RETURN_ROTATION_HANDOFF_EPSILON,
} from "~/game/bookInspectionTuning";
import type {InspectionCloseAction, InspectionMode} from "~/game/shopTypes";

export type InspectionShelfReturnPhase = "close" | "rotate" | "translate";

type InspectionPageUrls = {
  left: string | undefined;
  right: string | undefined;
};

/** Live accessors into the owning scene. */
export type InspectionHost = {
  booksById: () => ReadonlyMap<string, BookRecord>;
  emitGameState: () => void;
  scene: () => Scene;
  carriedPublicationId: () => string | undefined;
  physicsWorld: () => import("~/game/ShopPhysicsWorld").ShopPhysicsWorld;
  camera: () => PerspectiveCamera;
  catalogItems: () => readonly CatalogItem[];
  bookTextures: () => import("~/game/bookTextureRuntime").BookTextureRuntime;
  onPageIndexChange: (publicationId: string, pageIndex: number) => void;
  physicsPosePosition: () => Vector3;
  physicsPoseRotation: () => Quaternion;
  physicsPose: () => import("~/game/ShopPhysicsWorld").BookPhysicsPose;
  physicsPoseEuler: () => import("three").Euler;
  canvas: () => HTMLCanvasElement;
  horizontalFieldOfView: () => number;
  disposed: () => boolean;
  physicsTransform: () => import("~/game/ShopPhysicsWorld").MutableBookPhysicsTransform;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  onSelectPublication: ((publicationId: string) => void) | undefined;
  initialPageIndex: (publicationId: string) => number;
  applyBookStates: () => void;
  releasePointerLock: () => void;
  requestPointerLock: () => void;
  dropCarriedBook: (
    fromCurrentPose?: boolean,
    throwBook?: boolean,
    throwCharge?: number,
    publicationIdOverride?: string,
  ) => void;
  raycaster: () => Raycaster;
  viewportWidth: () => number;
  textureLoader: () => TextureLoader;
  renderer: () => WebGLRenderer;
  spreadDistance: () => number;
  heldTargetPose: () => import("~/game/ShopPhysicsWorld").BookPhysicsPose;
};

/**
 * Owns the book inspection reader: open/close state machine, page turns,
 * zoom/drag, and page-texture lifecycle.
 */
export class InspectionController {
  readonly #host: InspectionHost;

  constructor(host: InspectionHost) {
    this.#host = host;
  }

  readonly inspectionPointerNdc = new Vector2();
  readonly inspectionLocalPosition = new Vector3();
  readonly inspectionLocalRotation = new Quaternion();
  readonly inspectionShelfWorldRotation = new Quaternion();
  readonly inspectionPageTextureCache = new PageTextureCache<Texture>({
    load: (url) => this.loadInspectionPageTexture(url),
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
    onLoadingChange: (count) => {
      this.inspectionPageLoadCount = count;
      if (!this.#host.disposed()) this.#host.emitGameState();
    },
  });
  readonly inspectionPagePreloader = new ReaderPagePreloader({
    maxEntries: READER_PAGE_TEXTURE_CACHE_SIZE,
  });
  readonly inspectionLeafDeformation: ActiveLeafDeformationTarget = {
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
  readonly inspectionLeafVertex: ActiveLeafVertex = {x: 0, y: 0, z: 0};
  inspectionMode: InspectionMode = "none";
  inspectionDragCurrentX = 0;
  inspectionDragMoved = false;
  inspectionDragging = false;
  inspectionOpenAngleTarget = 0;
  inspectionOpeningDelay = 0;
  inspectionOpeningHalf: "left" | "right" = "left";
  inspectionPageIndex = 0;
  inspectionPageLoadCount = 0;
  inspectionPhysicsReturnActive = false;
  inspectionShelfFocusPending = false;
  inspectionPointerY = 0;
  inspectionTextureRevision = 0;
  inspectionTextureUrls = new Set<string>();
  inspectionTurnOpeningFromBack = false;
  inspectionTurnNavigation: ReaderNavigation = "forward";
  inspectionTurnPreparing = false;
  inspectionTurnProgress = 0;
  inspectionTurnProgressTarget = 0;
  inspectionTurnRevision = 0;
  inspectionTurnTextureUrls = new Set<string>();
  inspectionTurnToSingle = false;
  inspectionTurnDestinationTexture: Texture | null = null;
  inspectionTurnDestinationPreviousTexture: Texture | null = null;
  inspectionTurnAnchorX = 1;
  inspectionTurnAnchorY = 0.5;
  inspectionTurnSourceSide: "left" | "right" = "left";
  inspectionTurnSourceDestinationTexture: Texture | null = null;
  inspectionTurnSourceTexture: Texture | null = null;
  inspectionTurnBackSourceRevealed = false;
  inspectionTurnTargetPageIndex = 0;
  inspectionTurnWillCommit = true;
  inspectionZoomOffsetX = 0;
  inspectionZoomOffsetY = 0;
  inspectionZoomOffsetTargetX = 0;
  inspectionZoomOffsetTargetY = 0;
  inspectionZoom = 1;
  inspectionZoomTarget = 1;
  inspectionDragNavigation: ReaderNavigation | undefined;
  inspectionDragReleaseDecision: "cancel" | "commit" | undefined;
  inspectionDragStartX = 0;
  inspectionOpenAngle = 0;
  inspectionResumePageIndex = 0;
  inspectionPointerX = 0;
  inspectionTurnFromSingle = false;
  inspectionHeldNavigation: ReaderNavigation | undefined;
  inspectionTurningBackTexture: Texture | undefined;
  inspectionCloseAction: InspectionCloseAction | undefined;
  inspectionPublicationId: string | undefined;
  inspectionShelfReturnPhase: InspectionShelfReturnPhase | undefined;
  inspectionTurnPage: "left" | "right" | undefined;
  inspectionQueuedTurn: ReaderNavigation | undefined;

  advanceInspectionMode(publicationId = this.#host.carriedPublicationId()) {
    if (!publicationId) return;
    const publication = this.#host.catalogItems().find((item) => item.id === publicationId);
    if (!publication || publication.pages.length === 0) return;
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;

    if (this.inspectionMode === "none") {
      const inspectableFromShelf = record.state.status === "shelved";
      if (publication.id !== this.#host.carriedPublicationId() && !inspectableFromShelf) return;
      this.inspectionPublicationId = publication.id;
      const bookmarkedPage = clampPageIndex(this.#host.initialPageIndex(publication.id), publication.pages.length);
      const firstInteriorPage = publication.pages.length > 1 ? 1 : 0;
      this.inspectionResumePageIndex = getReaderSpread(
        bookmarkedPage === 0 ? firstInteriorPage : bookmarkedPage,
        publication.pages.length,
        "spread",
        getWideReaderPageIndices(publication.pages),
      ).start;
      this.inspectionPageIndex = 0;
      this.inspectionMode = "spread";
      this.inspectionShelfFocusPending = inspectableFromShelf && record.shelfPresentation === "spine";
      this.inspectionOpeningHalf = publication.direction === "LTR" ? "left" : "right";
      this.inspectionCloseAction = undefined;
      this.inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.inspectionOpeningDelay = INSPECTION_OPENING_DELAY_SECONDS;
      this.applyInspectionOpenAngle(record);
      this.resetInspectionZoom();
      this.#host.bookTextures().promoteBookCoverTexture(publication.id, record);
      this.#host.setHoveredPublicationId(undefined);
      this.#host.onSelectPublication?.(publication.id);
      this.#host.applyBookStates();
      this.#host.releasePointerLock();
    } else {
      this.startInspectionClose("return");
      return;
    }

    this.configureInspectionPages(record, publication);
    if (this.inspectionOpeningDelay > 0) {
      record.inspectionGroup.visible = false;
      record.exteriorMaterial.visible = true;
    }
    void this.syncInspectionPageTextures(publication);
    this.#host.emitGameState();
  }

  animateInspectionLighting(record: BookRecord, focused: boolean, deltaSeconds: number) {
    const target = focused ? 1 : 0;
    if (record.inspectionLightingBlend === target) return;
    const nextBlend = MathUtils.damp(
      record.inspectionLightingBlend,
      target,
      INSPECTION_LIGHTING_BLEND_SPEED,
      deltaSeconds,
    );
    if (Math.abs(nextBlend - target) < 0.001) record.inspectionLightingBlend = target;
    else record.inspectionLightingBlend = nextBlend;
    this.applyInspectionLighting(record);
  }

  animateInspectionOpening(record: BookRecord, deltaSeconds: number, speed = INSPECTION_COVER_ANIMATION_SPEED) {
    if (this.inspectionOpeningDelay > 0) {
      this.inspectionOpeningDelay = Math.max(0, this.inspectionOpeningDelay - deltaSeconds);
      if (this.inspectionOpeningDelay > 0) return;
      record.inspectionGroup.visible = true;
      record.exteriorMaterial.visible = false;
    }
    if (this.inspectionOpenAngle === this.inspectionOpenAngleTarget) return;
    this.inspectionOpenAngle = MathUtils.damp(
      this.inspectionOpenAngle,
      this.inspectionOpenAngleTarget,
      speed,
      deltaSeconds,
    );
    if (Math.abs(this.inspectionOpenAngle - this.inspectionOpenAngleTarget) < 0.001)
      this.inspectionOpenAngle = this.inspectionOpenAngleTarget;
    this.applyInspectionOpenAngle(record);
    if (record.inspectionBackCover.visible) {
      const backPage =
        record.inspectionBackCover.parent === record.inspectionLeftAssembly
          ? record.inspectionLeftPage
          : record.inspectionRightPage;
      backPage.visible = this.inspectionOpenAngle < INSPECTION_OPEN_ANGLE / 2;
    }
  }

  animateInspectionPageTurn(record: BookRecord, deltaSeconds: number) {
    this.updateHeldInspectionTurn();
    if (this.inspectionTurnPage === undefined) return;
    const turningPage = record.inspectionTurningPage;
    this.inspectionTurnProgress = MathUtils.damp(
      this.inspectionTurnProgress,
      this.inspectionTurnProgressTarget,
      this.inspectionDragging ? INSPECTION_PAGE_DRAG_FOLLOW_SPEED : INSPECTION_PAGE_TURN_SPEED,
      deltaSeconds,
    );
    const publication = this.inspectionPublication();
    if (!publication) return;
    this.updateInspectionTurningPageGeometry(record, publication, deltaSeconds);
    if (this.inspectionDragging) return;
    if (Math.abs(this.inspectionTurnProgress - this.inspectionTurnProgressTarget) > 0.002) return;
    this.inspectionTurnProgress = this.inspectionTurnProgressTarget;
    if (this.inspectionTurnWillCommit) {
      const destinationMaterial =
        this.inspectionTurnPage === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
      destinationMaterial.map = this.inspectionTurnDestinationTexture;
      destinationMaterial.needsUpdate = true;
      this.inspectionPageIndex = this.inspectionTurnTargetPageIndex;
    } else {
      const sourceMaterial =
        this.inspectionTurnSourceSide === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
      sourceMaterial.map = this.inspectionTurnSourceTexture;
      sourceMaterial.needsUpdate = true;
      const destinationMaterial =
        this.inspectionTurnPage === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
      destinationMaterial.map = this.inspectionTurnDestinationPreviousTexture;
      destinationMaterial.needsUpdate = true;
    }
    turningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.setInspectionTurningBackTexture(record, null);
    this.inspectionTurnPage = undefined;
    this.inspectionTurnFromSingle = false;
    this.inspectionTurnOpeningFromBack = false;
    this.inspectionTurnToSingle = false;
    this.configureInspectionPages(record, publication);
    if (!this.inspectionTurnWillCommit) {
      // Flush first so a queued prepare re-holds the restored spread
      // textures before this release drops the finished turn's holds.
      this.flushQueuedInspectionTurn();
      this.releaseInspectionTurnTextures();
      return;
    }
    this.#host.onPageIndexChange?.(publication.id, this.inspectionPageIndex);
    this.#host.emitGameState();
    // Re-acquire order matters here: the sync below re-holds the newly
    // displayed spread, and a queued prepare re-holds current+target, both
    // synchronously within this task. Releasing the finished turn's holds
    // must also happen in this task — deferring it lets a stale sync run
    // after a newer prepare swapped the turn-texture set, releasing the
    // textures still assigned to materials and flashing them white.
    void this.syncInspectionPageTextures(publication);
    this.flushQueuedInspectionTurn();
    this.releaseInspectionTurnTextures();
  }

  animateInspectionPhysicsReturn(record: BookRecord, deltaSeconds: number) {
    const publicationId = this.inspectionPublicationId;
    if (!publicationId) return;
    const closeAction = this.inspectionCloseAction;
    const actionClosingSpeed =
      closeAction === "drop" || closeAction === "throw"
        ? INSPECTION_ACTION_CLOSE_SPEED
        : INSPECTION_COVER_ANIMATION_SPEED;
    this.animateInspectionOpening(record, deltaSeconds, actionClosingSpeed);
    if (this.inspectionOpenAngle === INSPECTION_OPEN_ANGLE && record.inspectionGroup.visible)
      this.showCompactInspectionBook(record);
    this.animateInspectionPageTurn(record, deltaSeconds);
    if (!this.#host.physicsWorld().sampleInterpolatedBookTransform(publicationId, this.#host.physicsTransform()))
      return;
    if (record.mesh.parent !== this.#host.scene()) this.#host.scene().attach(record.mesh);
    record.mesh.position.copy(this.#host.physicsTransform().position);
    record.mesh.quaternion.copy(this.#host.physicsTransform().rotation);
    record.mesh.scale.setScalar(1);
    if (this.inspectionOpenAngle !== INSPECTION_OPEN_ANGLE) return;
    this.finishInspectionClose();
  }

  animateInspectionShelfReturn(record: BookRecord, deltaSeconds: number) {
    let phase = this.inspectionShelfReturnPhase;
    if (!phase) return;
    if (record.mesh.parent !== this.#host.scene()) this.#host.scene().attach(record.mesh);
    record.mesh.scale.setScalar(1);
    this.animateInspectionOpening(record, deltaSeconds);
    this.animateInspectionPageTurn(record, deltaSeconds);

    if (phase === "close") {
      if (INSPECTION_OPEN_ANGLE - this.inspectionOpenAngle > SHELF_RETURN_CLOSE_HANDOFF_ANGLE) return;
      this.inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.applyInspectionOpenAngle(record);
      this.showCompactInspectionBook(record);
      phase = "rotate";
      this.inspectionShelfReturnPhase = phase;
    }

    if (phase === "rotate") {
      record.mesh.quaternion.slerp(
        this.inspectionShelfWorldRotation,
        1 - Math.exp(-SHELF_PREVIEW_ROTATION_SPEED * deltaSeconds),
      );
      if (
        1 - Math.abs(record.mesh.quaternion.dot(this.inspectionShelfWorldRotation)) >=
        SHELF_RETURN_ROTATION_HANDOFF_EPSILON
      )
        return;
      record.mesh.quaternion.copy(this.inspectionShelfWorldRotation);
      phase = "translate";
      this.inspectionShelfReturnPhase = phase;
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
    if (record.mesh.position.distanceToSquared(record.shelfPosition) >= INSPECTION_TRANSITION_POSITION_EPSILON_SQ)
      return;
    this.finishInspectionClose();
  }

  applyInspectionLighting(record: BookRecord) {
    record.exteriorMaterial.emissive
      .copy(record.sceneEmissive)
      .lerp(INSPECTION_READER_EMISSIVE, record.inspectionLightingBlend);
    record.exteriorMaterial.emissiveIntensity = MathUtils.lerp(
      record.sceneEmissiveIntensity,
      INSPECTION_READER_EMISSIVE_INTENSITY,
      record.inspectionLightingBlend,
    );
    record.inspectionFrontCoverMaterial.emissive.copy(record.exteriorMaterial.emissive);
    record.inspectionFrontCoverMaterial.emissiveIntensity = record.exteriorMaterial.emissiveIntensity;
    record.inspectionBackCoverMaterial.emissive.copy(record.exteriorMaterial.emissive);
    record.inspectionBackCoverMaterial.emissiveIntensity = record.exteriorMaterial.emissiveIntensity;
  }

  applyInspectionOpenAngle(record: BookRecord) {
    record.inspectionLeftAssembly.rotation.y = this.inspectionOpeningHalf === "left" ? this.inspectionOpenAngle : 0;
    record.inspectionRightAssembly.rotation.y = this.inspectionOpeningHalf === "right" ? -this.inspectionOpenAngle : 0;
    const closedRatio = this.inspectionOpenAngle / INSPECTION_OPEN_ANGLE;
    const closedOffset = record.width / 2 + INSPECTION_PAGE_GUTTER / 2;
    record.inspectionGroup.position.x = (this.inspectionOpeningHalf === "left" ? -1 : 1) * closedOffset * closedRatio;
  }

  beginInspectionPhysicsReturn(record: BookRecord, publicationId: string) {
    if (!this.#host.physicsWorld().isReady) return false;
    record.mesh.updateMatrixWorld(true);
    record.mesh.getWorldPosition(this.#host.physicsPosePosition());
    record.mesh.getWorldQuaternion(this.#host.physicsPoseRotation());
    if (!this.#host.physicsWorld().snapHeldBook(publicationId, this.#host.physicsPose())) return false;
    if (!this.#host.physicsWorld().sampleInterpolatedBookTransform(publicationId, this.#host.physicsTransform()))
      return false;
    this.#host.physicsWorld().setHeldTarget(publicationId, this.#host.heldTargetPose());
    if (record.mesh.parent !== this.#host.scene()) this.#host.scene().attach(record.mesh);
    this.inspectionPhysicsReturnActive = true;
    return true;
  }

  #findInspectionPointerHit(event: PointerEvent, record: BookRecord) {
    const bounds = this.#host.canvas().getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const pointerY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.inspectionPointerNdc.set(pointerX, pointerY);
    this.#host.raycaster().setFromCamera(this.inspectionPointerNdc, this.#host.camera());
    const intersections = this.#host.raycaster().intersectObjects(
      [record.inspectionLeftPage, record.inspectionRightPage].filter((page) => page.visible),
      false,
    );
    const intersection = intersections[0];
    const page = intersection?.object;
    if (!page) return;
    const clickedSide: "left" | "right" =
      record.inspectionLeftPage.visible && record.inspectionRightPage.visible
        ? page === record.inspectionLeftPage
          ? "left"
          : "right"
        : pointerX < 0
          ? "left"
          : "right";
    return {clickedSide, intersection};
  }

  #beginInspectionPointerDrag(
    event: PointerEvent,
    publication: CatalogItem,
    clickedSide: "left" | "right",
    textureU: number | undefined,
    textureV: number | undefined,
  ) {
    const forwardSide = publication.direction === "LTR" ? "right" : "left";
    const navigation = clickedSide === forwardSide ? "forward" : "backward";
    this.inspectionDragging = true;
    this.inspectionDragMoved = false;
    this.inspectionDragNavigation = navigation;
    this.inspectionDragReleaseDecision = undefined;
    this.inspectionDragStartX = event.clientX;
    this.inspectionDragCurrentX = event.clientX;
    const resolvedTextureU = textureU ?? 1;
    this.inspectionTurnAnchorX = MathUtils.clamp(
      clickedSide === "right" ? resolvedTextureU : 1 - resolvedTextureU,
      0.08,
      1,
    );
    this.inspectionTurnAnchorY = textureV ?? 0.5;
    this.turnInspectionPages(navigation);
  }

  beginInspectionPointerTurn(event: PointerEvent) {
    const publication = this.inspectionPublication();
    if (
      !publication ||
      this.inspectionMode !== "spread" ||
      this.inspectionOpeningDelay > 0 ||
      this.inspectionOpenAngle > 0.08 ||
      this.inspectionTurnPage !== undefined
    )
      return;
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;
    const pointerHit = this.#findInspectionPointerHit(event, record);
    if (!pointerHit) return;
    this.#beginInspectionPointerDrag(
      event,
      publication,
      pointerHit.clickedSide,
      pointerHit.intersection?.uv?.x,
      pointerHit.intersection?.uv?.y,
    );
  }

  cancelInspectionPageTurn(record: BookRecord, publication: CatalogItem) {
    this.inspectionTurnRevision += 1;
    this.inspectionTurnPreparing = false;
    this.inspectionDragging = false;
    this.inspectionDragNavigation = undefined;
    this.inspectionDragReleaseDecision = undefined;
    this.inspectionQueuedTurn = undefined;
    this.inspectionHeldNavigation = undefined;
    if (this.inspectionTurnPage !== undefined) {
      const sourceMaterial =
        this.inspectionTurnSourceSide === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
      sourceMaterial.map = this.inspectionTurnSourceTexture;
      sourceMaterial.needsUpdate = true;
      const destinationMaterial =
        this.inspectionTurnPage === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
      destinationMaterial.map = this.inspectionTurnDestinationPreviousTexture;
      destinationMaterial.needsUpdate = true;
    }
    this.inspectionTurnPage = undefined;
    this.inspectionTurnFromSingle = false;
    this.inspectionTurnOpeningFromBack = false;
    this.inspectionTurnToSingle = false;
    record.inspectionTurningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.setInspectionTurningBackTexture(record, null);
    this.releaseInspectionTurnTextures();
    this.configureInspectionPages(record, publication);
  }

  configureInspectionPages(record: BookRecord, publication: CatalogItem) {
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
    if (this.inspectionTurnPage === undefined) {
      record.inspectionTurningPage.visible = false;
      record.inspectionTurningFrontMaterial.map = null;
      this.setInspectionTurningBackTexture(record, null);
    }
    const widePages = getWideReaderPageIndices(publication.pages);
    const spread = getReaderSpread(this.inspectionPageIndex, publication.pages.length, "spread", widePages);
    const isWideSpread = widePages.has(spread.start);
    const isTerminalBackSide = spread.start > 0 && spread.start === publication.pages.length - 1 && !isWideSpread;
    const openingFromBack = this.inspectionOpenAngleTarget === 0 && isTerminalBackSide;
    record.inspectionFrontCover.visible = !openingFromBack;
    record.inspectionBackCover.visible = openingFromBack;
    const paperDepth = Math.max(0.012, record.thickness);
    const pageBlocks = getPageBlockSplit({
      committedPageIndex: this.inspectionPageIndex,
      direction: publication.direction,
      totalDepth: paperDepth,
      totalPages: publication.pages.length,
    });
    record.inspectionLeftBlock.scale.z = pageBlocks.left.fraction;
    record.inspectionRightBlock.scale.z = pageBlocks.right.fraction;
    record.inspectionLeftBlock.position.z = record.thickness / 2 - pageBlocks.left.depth / 2;
    record.inspectionRightBlock.position.z = record.thickness / 2 - pageBlocks.right.depth / 2;
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
      this.inspectionPageIndex,
      publication.pages.length,
      publication.direction,
      widePages,
    );
    const singlePageIsLeft = spreadSides.left !== undefined;
    const singlePageVisible = !openingFromBack || this.inspectionOpenAngle < INSPECTION_OPEN_ANGLE / 2;
    record.inspectionLeftPage.visible = singlePageIsLeft && singlePageVisible;
    record.inspectionRightPage.visible = !singlePageIsLeft && singlePageVisible;
    if (this.inspectionOpenAngleTarget === INSPECTION_OPEN_ANGLE) {
      record.inspectionLeftAssembly.visible = true;
      record.inspectionRightAssembly.visible = true;
      return;
    }
    record.inspectionLeftAssembly.visible = singlePageIsLeft;
    record.inspectionRightAssembly.visible = !singlePageIsLeft;
    if (singlePageIsLeft) record.inspectionLeftAssembly.position.x = pageCenterOffset;
    else record.inspectionRightAssembly.position.x = -pageCenterOffset;
  }

  endInspection() {
    if (this.inspectionMode === "none") return;
    const publicationId = this.inspectionPublicationId;
    const record = publicationId ? this.#host.booksById().get(publicationId) : undefined;
    this.inspectionMode = "none";
    this.inspectionCloseAction = undefined;
    this.inspectionOpenAngle = 0;
    this.inspectionOpenAngleTarget = 0;
    this.inspectionOpeningDelay = 0;
    this.inspectionPhysicsReturnActive = false;
    this.inspectionShelfFocusPending = false;
    this.inspectionShelfReturnPhase = undefined;
    this.resetInspectionZoom();
    this.inspectionTurnRevision += 1;
    this.inspectionTurnPreparing = false;
    this.inspectionDragging = false;
    this.inspectionDragReleaseDecision = undefined;
    this.inspectionQueuedTurn = undefined;
    this.inspectionHeldNavigation = undefined;
    this.inspectionTurnPage = undefined;
    this.inspectionTurnFromSingle = false;
    this.inspectionTurnOpeningFromBack = false;
    this.inspectionTurnToSingle = false;
    this.releaseInspectionTurnTextures();
    this.releaseInspectionPageTextures();
    if (record) {
      this.applyInspectionOpenAngle(record);
      this.showCompactInspectionBook(record);
      if (record.mesh.parent === this.#host.camera()) this.#host.scene().attach(record.mesh);
      if (record.state.status === "shelved") {
        record.mesh.position.copy(record.shelfPosition);
        record.mesh.rotation.set(record.baseRotation.x, record.baseRotation.y, record.baseRotation.z, "XYZ");
        record.mesh.scale.setScalar(1);
        record.shelfPreview = 0;
      }
    }
    this.inspectionPublicationId = undefined;
    this.#host.emitGameState();
  }

  finishInspectionClose() {
    const action = this.inspectionCloseAction;
    const publicationId = this.inspectionPublicationId;
    const record = publicationId ? this.#host.booksById().get(publicationId) : undefined;
    this.endInspection();
    if (action === "return" && publicationId && record) {
      record.mesh.updateMatrixWorld(true);
      record.mesh.getWorldPosition(this.#host.physicsPosePosition());
      record.mesh.getWorldQuaternion(this.#host.physicsPoseRotation());
      this.#host.physicsWorld().snapHeldBook(publicationId, this.#host.physicsPose());
    }
    if (action === "drop") this.#host.dropCarriedBook(true, false, 0, publicationId);
    else if (action === "throw") this.#host.dropCarriedBook(true, true, 0, publicationId);
  }

  flushQueuedInspectionTurn() {
    const navigation = this.inspectionQueuedTurn;
    if (!navigation) return;
    this.inspectionQueuedTurn = undefined;
    this.turnInspectionPage(navigation);
  }

  // Fires the held key's navigation every frame the book can accept a turn,
  // producing continuous page turns while A or D is held down.

  inspectionBaseDistance() {
    return this.#host.spreadDistance();
  }

  inspectionDragCompletion() {
    const navigation = this.inspectionDragNavigation;
    const publication = this.inspectionPublication();
    if (!navigation || !publication) return 0;
    const forward = navigation === "forward";
    const ltr = publication.direction === "LTR";
    const destinationSide = forward === ltr ? "left" : "right";
    const screenDirection = destinationSide === "left" ? -1 : 1;
    const dragDistance = (this.inspectionDragCurrentX - this.inspectionDragStartX) * screenDirection;
    const distance = this.inspectionBaseDistance() / this.inspectionZoom;
    const bookWidth = physicalBookWidth(publication.aspectRatio, BOOK_HEIGHT);
    const pagePixelWidth =
      (bookWidth / (distance * Math.tan(this.#host.horizontalFieldOfView() / 2))) * (this.#host.viewportWidth() / 2);
    const grabRadius = Math.max(1, pagePixelWidth * this.inspectionTurnAnchorX);
    const turnAngle = Math.acos(1 - MathUtils.clamp(dragDistance / grabRadius, 0, 2));
    return invertPageTurnEasing(MathUtils.clamp(turnAngle / Math.PI, 0, 1));
  }

  inspectionPageUrl(publication: CatalogItem, pageIndex: number) {
    return pageIndex === 0 ? (publication.detailCover ?? publication.cover) : publication.pages[pageIndex];
  }

  inspectionPageUrls(publication: CatalogItem, pageIndex: number) {
    const widePages = getWideReaderPageIndices(publication.pages);
    const spreadSides = getReaderSpreadSides(pageIndex, publication.pages.length, publication.direction, widePages);
    const isWideSpread = widePages.has(pageIndex);
    const pageUrl = (index: number | undefined, half: "left" | "right" | undefined) => {
      if (index === undefined) return;
      const url = this.inspectionPageUrl(publication, index);
      return url ? readerPageTextureUrl(url, half) : undefined;
    };
    return {
      left: pageUrl(spreadSides.left, isWideSpread ? "left" : undefined),
      right: pageUrl(spreadSides.right, isWideSpread ? "right" : undefined),
    };
  }

  inspectionPublication() {
    const publicationId = this.inspectionPublicationId ?? this.#host.carriedPublicationId();
    if (!publicationId) return;
    return this.#host.catalogItems().find((item) => item.id === publicationId);
  }

  loadInspectionPageTexture(url: string) {
    return new Promise<Texture>((resolvePromise, rejectPromise) => {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#host.textureLoader().load(
        url,
        (texture) => {
          const image = texture.image;
          const publication = this.inspectionPublication();
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
          texture.anisotropy = Math.min(8, this.#host.renderer().capabilities.getMaxAnisotropy());
          resolvePromise(texture);
        },
        undefined,
        (error) => {
          requestedTexture?.dispose();
          rejectPromise(error instanceof Error ? error : new Error(`Could not load inspection page ${url}`));
        },
      );
    });
  }

  openInspectionBook() {
    const publication = this.inspectionPublication();
    if (!publication || this.inspectionMode !== "spread" || this.inspectionOpenAngleTarget === 0) return;
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;

    this.inspectionPageIndex = this.inspectionResumePageIndex;
    this.inspectionOpenAngleTarget = 0;
    this.configureInspectionPages(record, publication);
    if (this.inspectionOpeningDelay > 0) {
      record.inspectionGroup.visible = false;
      record.exteriorMaterial.visible = true;
    }
    void this.syncInspectionPageTextures(publication);
    this.#host.onPageIndexChange?.(publication.id, this.inspectionPageIndex);
    this.#host.emitGameState();
  }

  async #acquireInspectionTurnTextures(currentUrls: InspectionPageUrls, targetUrls: InspectionPageUrls) {
    const requestedUrls = new Set(
      [currentUrls.left, currentUrls.right, targetUrls.left, targetUrls.right].filter(
        (url): url is string => url !== undefined,
      ),
    );
    const textures = new Map<string, Texture>();
    await Promise.all(
      [...requestedUrls].map(async (url) => {
        try {
          textures.set(url, await this.inspectionPageTextureCache.acquire(url));
        } catch {
          // A missing destination texture still turns as an unprinted leaf.
        }
      }),
    );
    return textures;
  }

  #configureInspectionTurnMode(
    publication: CatalogItem,
    currentSpread: ReturnType<typeof getReaderSpread>,
    targetSpread: ReturnType<typeof getReaderSpread>,
    widePages: ReadonlySet<number>,
    navigation: ReaderNavigation,
  ) {
    const currentIsClosedSide =
      currentSpread.start === 0 ||
      (currentSpread.start === publication.pages.length - 1 && !widePages.has(currentSpread.start));
    const targetIsClosedSide =
      targetSpread.start === 0 ||
      (targetSpread.start === publication.pages.length - 1 && !widePages.has(targetSpread.start));
    this.inspectionTurnFromSingle = currentIsClosedSide && !targetIsClosedSide;
    this.inspectionTurnOpeningFromBack = this.inspectionTurnFromSingle && currentSpread.start > 0;
    this.inspectionTurnBackSourceRevealed = false;
    this.inspectionTurnToSingle = !currentIsClosedSide && targetIsClosedSide;
    this.inspectionTurnNavigation = navigation;
  }

  #resolveInspectionTurnSides(
    record: BookRecord,
    publication: CatalogItem,
    navigation: ReaderNavigation,
    targetUrls: InspectionPageUrls,
    textures: Map<string, Texture>,
  ) {
    const forward = navigation === "forward";
    const sourceSide: "left" | "right" = forward === (publication.direction === "LTR") ? "right" : "left";
    const destinationSide: "left" | "right" = sourceSide === "left" ? "right" : "left";
    const sourceMaterial = sourceSide === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
    const sourceTargetUrl = targetUrls[sourceSide];
    const sourceDestinationTexture = sourceTargetUrl ? (textures.get(sourceTargetUrl) ?? null) : null;
    const destinationTargetUrl = targetUrls[destinationSide];
    const destinationTexture = destinationTargetUrl ? (textures.get(destinationTargetUrl) ?? null) : null;
    const destinationMaterial =
      destinationSide === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
    const sourceAssembly = sourceSide === "left" ? record.inspectionLeftAssembly : record.inspectionRightAssembly;
    const destinationAssembly =
      destinationSide === "left" ? record.inspectionLeftAssembly : record.inspectionRightAssembly;
    return {
      destinationAssembly,
      destinationMaterial,
      destinationSide,
      destinationTexture,
      forward,
      sourceAssembly,
      sourceDestinationTexture,
      sourceSide,
      sourceMaterial,
    };
  }

  #prepareInspectionTurnSides(
    record: BookRecord,
    publication: CatalogItem,
    nextPageIndex: number,
    navigation: ReaderNavigation,
    targetUrls: InspectionPageUrls,
    textures: Map<string, Texture>,
  ) {
    const widePages = getWideReaderPageIndices(publication.pages);
    const currentSpread = getReaderSpread(this.inspectionPageIndex, publication.pages.length, "spread", widePages);
    const targetSpread = getReaderSpread(nextPageIndex, publication.pages.length, "spread", widePages);
    this.#configureInspectionTurnMode(publication, currentSpread, targetSpread, widePages, navigation);
    const sides = this.#resolveInspectionTurnSides(record, publication, navigation, targetUrls, textures);
    const {destinationMaterial, destinationTexture, sourceDestinationTexture, sourceSide, sourceMaterial} = sides;
    this.inspectionTurnSourceSide = sourceSide;
    this.inspectionTurnSourceTexture = sourceMaterial.map;
    this.inspectionTurnTargetPageIndex = nextPageIndex;
    this.inspectionTurnDestinationPreviousTexture = destinationMaterial.map;
    this.inspectionTurnDestinationTexture = destinationTexture;
    this.inspectionTurnSourceDestinationTexture = sourceDestinationTexture;
    return sides;
  }

  #configureInspectionTurn(
    record: BookRecord,
    publication: CatalogItem,
    nextPageIndex: number,
    navigation: ReaderNavigation,
    targetUrls: InspectionPageUrls,
    textures: Map<string, Texture>,
  ) {
    const {
      destinationAssembly,
      destinationMaterial,
      destinationSide,
      destinationTexture,
      forward,
      sourceAssembly,
      sourceDestinationTexture,
      sourceMaterial,
    } = this.#prepareInspectionTurnSides(record, publication, nextPageIndex, navigation, targetUrls, textures);
    if (forward) {
      record.inspectionTurningFrontMaterial.map = sourceMaterial.map;
      this.setInspectionTurningBackTexture(record, destinationTexture);
    } else {
      this.setInspectionTurningBackTexture(record, sourceMaterial.map);
      record.inspectionTurningFrontMaterial.map = destinationTexture;
    }
    if (!this.inspectionTurnOpeningFromBack) {
      sourceMaterial.map = sourceDestinationTexture;
      sourceMaterial.needsUpdate = true;
    }
    record.inspectionTurningFrontMaterial.needsUpdate = true;
    record.inspectionTurningBackMaterial.needsUpdate = true;
    this.inspectionTurnPreparing = false;
    this.inspectionTurnPage = destinationSide;
    this.inspectionTurnProgress = forward ? 0 : 1;
    this.inspectionTurnProgressTarget = forward ? 1 : 0;
    this.inspectionTurnWillCommit = true;
    if (this.inspectionTurnFromSingle) {
      if (this.inspectionTurnOpeningFromBack) destinationAssembly.visible = false;
      else {
        record.inspectionLeftAssembly.visible = true;
        record.inspectionRightAssembly.visible = true;
        destinationMaterial.map = destinationTexture;
        destinationMaterial.needsUpdate = true;
      }
    } else if (this.inspectionTurnToSingle) {
      sourceAssembly.visible = false;
      destinationAssembly.visible = true;
    }
  }

  async prepareInspectionPageTurn(
    record: BookRecord,
    publication: CatalogItem,
    nextPageIndex: number,
    navigation: ReaderNavigation,
  ) {
    const revision = ++this.inspectionTurnRevision;
    this.inspectionTurnPreparing = true;
    this.inspectionTurnTargetPageIndex = nextPageIndex;
    const targetUrls = this.inspectionPageUrls(publication, nextPageIndex);
    // Hold the current spread as well: its textures stay assigned to the
    // surface materials until the turn commits, so they must stay referenced
    // even if a prior texture sync was invalidated and dropped its holds.
    const currentUrls = this.inspectionPageUrls(publication, this.inspectionPageIndex);
    const textures = await this.#acquireInspectionTurnTextures(currentUrls, targetUrls);
    if (
      this.#host.disposed() ||
      revision !== this.inspectionTurnRevision ||
      this.inspectionPublication()?.id !== publication.id
    ) {
      for (const url of textures.keys()) this.inspectionPageTextureCache.release(url);
      return;
    }

    this.releaseInspectionTurnTextures();
    this.inspectionTurnTextureUrls = new Set(textures.keys());
    this.#configureInspectionTurn(record, publication, nextPageIndex, navigation, targetUrls, textures);
    record.inspectionTurningPage.visible = true;
    this.updateInspectionTurningPageGeometry(record, publication, 0, true);
    if (this.inspectionDragging) this.updateInspectionDragProgress();
    else if (this.inspectionDragReleaseDecision) this.resolveInspectionDragDecision(this.inspectionDragReleaseDecision);
  }

  releaseInspectionPageTextures() {
    this.inspectionTextureRevision += 1;
    for (const url of this.inspectionTextureUrls) this.inspectionPageTextureCache.release(url);
    this.inspectionTextureUrls.clear();
    const publicationId = this.inspectionPublicationId ?? this.#host.carriedPublicationId();
    const record = publicationId ? this.#host.booksById().get(publicationId) : undefined;
    if (!record) return;
    record.inspectionLeftMaterial.map = null;
    record.inspectionRightMaterial.map = null;
    record.inspectionTurningFrontMaterial.map = null;
    this.setInspectionTurningBackTexture(record, null);
    record.inspectionTurningPage.visible = false;
    record.inspectionLeftMaterial.needsUpdate = true;
    record.inspectionRightMaterial.needsUpdate = true;
    record.inspectionTurningFrontMaterial.needsUpdate = true;
    record.inspectionTurningBackMaterial.needsUpdate = true;
  }

  releaseInspectionTurnTextures() {
    for (const url of this.inspectionTurnTextureUrls) this.inspectionPageTextureCache.release(url);
    this.inspectionTurnTextureUrls.clear();
    this.inspectionTurnDestinationTexture = null;
    this.inspectionTurnDestinationPreviousTexture = null;
    this.inspectionTurnSourceDestinationTexture = null;
    this.inspectionTurnSourceTexture = null;
    this.inspectionTurnBackSourceRevealed = false;
  }

  resetInspectionZoom() {
    this.inspectionZoom = 1;
    this.inspectionZoomTarget = 1;
    this.inspectionZoomOffsetX = 0;
    this.inspectionZoomOffsetY = 0;
    this.inspectionZoomOffsetTargetX = 0;
    this.inspectionZoomOffsetTargetY = 0;
    this.inspectionPointerX = 0;
    this.inspectionPointerY = 0;
  }

  resolveInspectionDragDecision(decision: "cancel" | "commit") {
    this.inspectionDragReleaseDecision = undefined;
    this.inspectionTurnWillCommit = decision === "commit";
    const forward = this.inspectionTurnNavigation === "forward";
    this.inspectionTurnProgressTarget = decision === "commit" ? (forward ? 1 : 0) : forward ? 0 : 1;
  }

  setInspectionPointer(clientX: number, clientY: number) {
    const bounds = this.#host.canvas().getBoundingClientRect();
    this.inspectionPointerX = MathUtils.clamp(((clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
    this.inspectionPointerY = MathUtils.clamp(-((clientY - bounds.top) / bounds.height) * 2 + 1, -1, 1);
  }

  setInspectionTurningBackTexture(record: BookRecord, texture: Texture | null) {
    this.inspectionTurningBackTexture?.dispose();
    this.inspectionTurningBackTexture = texture?.clone();
    const backTexture = this.inspectionTurningBackTexture;
    if (backTexture) {
      const horizontalRange = mirrorReaderPageHorizontalRange(backTexture.offset.x, backTexture.repeat.x);
      backTexture.offset.x = horizontalRange.offset;
      backTexture.repeat.x = horizontalRange.repeat;
      backTexture.needsUpdate = true;
    }
    record.inspectionTurningBackMaterial.map = backTexture ?? null;
    record.inspectionTurningBackMaterial.needsUpdate = true;
  }

  showCompactInspectionBook(record: BookRecord) {
    this.#host.bookTextures().restoreCompactBookCoverTexture(record);
    record.inspectionGroup.visible = false;
    record.exteriorMaterial.visible = true;
  }

  startInspectionClose(action: InspectionCloseAction) {
    if (this.inspectionMode !== "spread") return;
    const publication = this.inspectionPublication();
    if (!publication) return;
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;
    this.inspectionShelfFocusPending = false;
    this.#host.requestPointerLock();
    if (record.state.status === "shelved") {
      this.#host.scene().attach(record.mesh);
      this.inspectionShelfWorldRotation.setFromEuler(
        this.#host.physicsPoseEuler().set(record.baseRotation.x, record.baseRotation.y, record.baseRotation.z, "XYZ"),
      );
      this.inspectionShelfReturnPhase = "close";
    }
    const widePages = getWideReaderPageIndices(publication.pages);
    const currentSpread = getReaderSpread(this.inspectionPageIndex, publication.pages.length, "spread", widePages);
    const alreadyOnClosedCover =
      currentSpread.start === 0 ||
      (currentSpread.start === publication.pages.length - 1 && !widePages.has(currentSpread.start));
    if (alreadyOnClosedCover) {
      this.cancelInspectionPageTurn(record, publication);
      this.inspectionOpenAngle = INSPECTION_OPEN_ANGLE;
      this.inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.applyInspectionOpenAngle(record);
      this.showCompactInspectionBook(record);
    } else if (this.inspectionOpenAngleTarget !== INSPECTION_OPEN_ANGLE) {
      this.inspectionOpenAngleTarget = INSPECTION_OPEN_ANGLE;
      this.cancelInspectionPageTurn(record, publication);
    }
    this.inspectionMode = "closing";
    this.inspectionCloseAction = action;
    this.inspectionPhysicsReturnActive = false;
    this.inspectionOpeningDelay = 0;
    this.resetInspectionZoom();
    if (this.inspectionOpenAngle === INSPECTION_OPEN_ANGLE) this.showCompactInspectionBook(record);
    this.#host.emitGameState();
  }

  syncInspectionBackOpeningSpread(record: BookRecord, turnCompletion: number) {
    if (!this.inspectionTurnOpeningFromBack) return;
    const sourceRevealed = turnCompletion > 0.5;
    if (sourceRevealed === this.inspectionTurnBackSourceRevealed) return;
    this.inspectionTurnBackSourceRevealed = sourceRevealed;
    const sourceMaterial =
      this.inspectionTurnSourceSide === "left" ? record.inspectionLeftMaterial : record.inspectionRightMaterial;
    sourceMaterial.map = sourceRevealed
      ? this.inspectionTurnSourceDestinationTexture
      : this.inspectionTurnSourceTexture;
    sourceMaterial.needsUpdate = true;
  }

  async syncInspectionPageTextures(publication: CatalogItem) {
    const revision = ++this.inspectionTextureRevision;
    const turnRevision = this.inspectionTurnRevision;
    const pageUrls = this.inspectionPageUrls(publication, this.inspectionPageIndex);
    const requestedUrls = new Set([pageUrls.left, pageUrls.right].filter((url): url is string => url !== undefined));
    const textures = new Map<string, Texture>();
    const preloadPlan = createReaderPagePreloadPlan({
      pageCount: publication.pages.length,
      pageIndex: this.inspectionPageIndex,
      pageUrl: (pageIndex) => this.inspectionPageUrl(publication, pageIndex),
      requestedUrls,
      widePageIndices: getWideReaderPageIndices(publication.pages),
    });
    const requestedTextureLoads = [...requestedUrls].map(async (url) => {
      try {
        textures.set(url, await this.inspectionPageTextureCache.acquire(url));
      } catch {
        // The paper color remains visible when an individual page is absent.
      }
    });
    for (const url of preloadPlan.httpUrls) void this.inspectionPagePreloader.preload(url).catch(() => {});
    await Promise.all(requestedTextureLoads);
    if (
      this.#host.disposed() ||
      revision !== this.inspectionTextureRevision ||
      // A page turn prepared after this sync started owns the surface
      // materials; applying spread textures here would flash mid-turn.
      turnRevision !== this.inspectionTurnRevision ||
      this.inspectionPublication()?.id !== publication.id
    ) {
      for (const url of textures.keys()) this.inspectionPageTextureCache.release(url);
      return;
    }

    for (const url of this.inspectionTextureUrls) this.inspectionPageTextureCache.release(url);
    this.inspectionTextureUrls = new Set(textures.keys());
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;
    record.inspectionLeftMaterial.map = pageUrls.left ? (textures.get(pageUrls.left) ?? null) : null;
    record.inspectionRightMaterial.map = pageUrls.right ? (textures.get(pageUrls.right) ?? null) : null;
    record.inspectionLeftMaterial.needsUpdate = true;
    record.inspectionRightMaterial.needsUpdate = true;

    for (const url of preloadPlan.textureUrls) void this.inspectionPageTextureCache.prefetch(url).catch(() => {});
  }

  turnInspectionPages(navigation: ReaderNavigation) {
    const publication = this.inspectionPublication();
    if (!publication || this.inspectionMode !== "spread" || this.inspectionOpenAngle > 0.08) return;
    const previousPageIndex = this.inspectionPageIndex;
    const nextPageIndex = getAdjacentSpreadStart(
      previousPageIndex,
      publication.pages.length,
      "spread",
      navigation,
      getWideReaderPageIndices(publication.pages),
    );
    if (nextPageIndex === previousPageIndex) return;
    if (this.inspectionTurnPage !== undefined || this.inspectionTurnPreparing) {
      // Accept the next command only once the in-flight turn is past 80%;
      // the damped easing makes early progress look faster than it is, so a
      // high threshold keeps rapid taps from queueing unintended turns.
      const forward = this.inspectionTurnNavigation === "forward";
      const completion = forward ? this.inspectionTurnProgress : 1 - this.inspectionTurnProgress;
      if (completion <= 0.8) return;
      // Buffer the latest intent; it fires once the in-flight turn finishes.
      this.inspectionQueuedTurn = navigation;
      return;
    }
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;
    void this.prepareInspectionPageTurn(record, publication, nextPageIndex, navigation);
  }

  updateHeldInspectionTurn() {
    const navigation = this.inspectionHeldNavigation;
    if (!navigation) return;
    if (
      this.inspectionMode !== "spread" ||
      this.inspectionOpeningDelay > 0 ||
      this.inspectionOpenAngle > 0.08 ||
      this.inspectionTurnPage !== undefined ||
      this.inspectionTurnPreparing ||
      this.inspectionDragging
    )
      return;
    this.turnInspectionPage(navigation);
  }

  updateInspectionDragProgress() {
    const navigation = this.inspectionDragNavigation;
    const publication = this.inspectionPublication();
    if (!navigation || !publication || this.inspectionTurnPage === undefined) return;
    const completion = this.inspectionDragCompletion();
    this.inspectionTurnProgressTarget = navigation === "forward" ? completion : 1 - completion;
  }

  updateInspectionLocalTarget() {
    const distance = this.inspectionBaseDistance() / this.inspectionZoom;
    this.inspectionLocalPosition.set(this.inspectionZoomOffsetX, this.inspectionZoomOffsetY, -distance);
  }

  updateInspectionTurningPageGeometry(
    record: BookRecord,
    publication: CatalogItem,
    deltaSeconds: number,
    resetSimulation = false,
  ) {
    const turningPage = record.inspectionTurningPage;
    const pageZ = record.thickness / 2 + INSPECTION_SURFACE_GAP;
    const pageCenterOffset = record.width / 2 + INSPECTION_PAGE_GUTTER / 2;
    writeActiveLeafDeformation(
      this.inspectionLeafDeformation,
      this.inspectionTurnProgress,
      publication.direction,
      INSPECTION_PAGE_DEFORMATION,
    );
    const turnCompletion =
      this.inspectionTurnNavigation === "forward"
        ? this.inspectionLeafDeformation.eased
        : 1 - this.inspectionLeafDeformation.eased;
    let spineX = 0;
    if (this.inspectionTurnFromSingle || this.inspectionTurnToSingle) {
      const singlePageIndex = this.inspectionTurnFromSingle
        ? this.inspectionPageIndex
        : this.inspectionTurnTargetPageIndex;
      const singlePageSides = getReaderSpreadSides(
        singlePageIndex,
        publication.pages.length,
        publication.direction,
        getWideReaderPageIndices(publication.pages),
      );
      const singlePageIsLeft = singlePageSides.left !== undefined;
      const closedBindingOffset = singlePageIsLeft ? pageCenterOffset : -pageCenterOffset;
      spineX = closedBindingOffset * (this.inspectionTurnFromSingle ? 1 - turnCompletion : turnCompletion);
      const singlePageAssembly = singlePageIsLeft ? record.inspectionLeftAssembly : record.inspectionRightAssembly;
      singlePageAssembly.position.x = spineX;
    }
    this.syncInspectionBackOpeningSpread(record, turnCompletion);
    turningPage.position.set(spineX, 0, pageZ);
    turningPage.rotation.set(0, 0, 0);
    writeActiveLeafPositions(
      record.inspectionTurningUvs,
      record.inspectionTurningTargets,
      record.width,
      BOOK_HEIGHT,
      this.inspectionLeafDeformation,
      this.inspectionLeafVertex,
    );
    if (resetSimulation) record.inspectionPaperSimulation.reset(record.inspectionTurningTargets);
    record.inspectionPaperSimulation.step({
      deltaSeconds,
      dragging: this.inspectionDragging,
      grabU: this.inspectionTurnAnchorX,
      grabV: this.inspectionTurnAnchorY,
      outputPositions: record.inspectionTurningPositions,
      targetPositions: record.inspectionTurningTargets,
    });
    record.inspectionTurningPage.geometry.getAttribute("position").needsUpdate = true;
  }

  updateInspectionZoomPanTarget() {
    const baseDistance = this.inspectionBaseDistance();
    const zoomPanScale = 1 - 1 / this.inspectionZoomTarget;
    this.inspectionZoomOffsetTargetX =
      -this.inspectionPointerX * baseDistance * Math.tan(this.#host.horizontalFieldOfView() / 2) * zoomPanScale;
    this.inspectionZoomOffsetTargetY =
      -this.inspectionPointerY *
      baseDistance *
      Math.tan(MathUtils.degToRad(this.#host.camera().fov) / 2) *
      zoomPanScale;
  }

  zoomInspectionAtPointer(event: WheelEvent) {
    this.setInspectionPointer(event.clientX, event.clientY);
    const nextZoom = MathUtils.clamp(this.inspectionZoomTarget * Math.exp(-event.deltaY * 0.0015), 1, 4);
    if (nextZoom === this.inspectionZoomTarget) return;
    this.inspectionZoomTarget = nextZoom;
    this.updateInspectionZoomPanTarget();
  }
  turnInspectionPage(navigation: ReaderNavigation) {
    const publication = this.inspectionPublication();
    if (!publication || this.inspectionMode !== "spread") return;
    const nextPageIndex = getAdjacentSpreadStart(
      this.inspectionPageIndex,
      publication.pages.length,
      "spread",
      navigation,
      getWideReaderPageIndices(publication.pages),
    );
    if (nextPageIndex === this.inspectionPageIndex) return;
    if (this.inspectionOpenAngleTarget > 0) {
      this.seekInspectionPage(nextPageIndex);
      return;
    }
    this.turnInspectionPages(navigation);
  }

  seekInspectionPage(pageIndex: number) {
    const publication = this.inspectionPublication();
    if (!publication || this.inspectionMode !== "spread") return;
    const record = this.#host.booksById().get(publication.id);
    if (!record) return;
    const clampedPageIndex = clampPageIndex(pageIndex, publication.pages.length);
    const nextPageIndex = getReaderSpread(
      clampedPageIndex,
      publication.pages.length,
      "spread",
      getWideReaderPageIndices(publication.pages),
    ).start;
    if (nextPageIndex === this.inspectionPageIndex) return;
    if (this.inspectionOpenAngleTarget > 0) {
      this.inspectionResumePageIndex = nextPageIndex;
      this.openInspectionBook();
      return;
    }
    this.inspectionTurnRevision += 1;
    this.inspectionTurnPreparing = false;
    this.inspectionDragging = false;
    this.inspectionDragReleaseDecision = undefined;
    this.inspectionQueuedTurn = undefined;
    this.inspectionHeldNavigation = undefined;
    this.releaseInspectionTurnTextures();
    this.inspectionPageIndex = nextPageIndex;
    this.inspectionTurnPage = undefined;
    this.inspectionTurnFromSingle = false;
    this.inspectionTurnOpeningFromBack = false;
    this.inspectionTurnToSingle = false;
    record.inspectionTurningPage.visible = false;
    record.inspectionTurningFrontMaterial.map = null;
    this.setInspectionTurningBackTexture(record, null);
    this.configureInspectionPages(record, publication);
    void this.syncInspectionPageTextures(publication);
    this.#host.onPageIndexChange(publication.id, this.inspectionPageIndex);
    this.#host.emitGameState();
  }
}
