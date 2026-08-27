import {MathUtils} from "three";
import type {PerspectiveCamera} from "three";
import {DEV} from "solid-js";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookCarryActions} from "~/game/bookCarryActions";
import type {ShopArcadeCabinet, ArcadeSessionStatus} from "~/game/ShopArcadeCabinet";
import type {ShortcutAction} from "~/game/input/bindings";
import type {InputManager} from "~/game/input/inputManager";
import type {InspectionController} from "~/game/inspection/InspectionController";
import type {InteractionScanner} from "~/game/interactionScanner";
import type {MovablePropLifecycle} from "~/game/movablePropSystem";
import type {MovablePropRecord} from "~/game/shopTypes";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShelfPresentation} from "~/game/shelfPlacement";
import type {ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {ShopTelevision} from "~/game/ShopTelevision";
import {
  clampLookDeltaMagnitude,
  dampLookAngles,
  isPlausiblePointerMovement,
  updateLookAngles,
  type LookAngles,
} from "~/game/shopGameplay";
import {
  DIGITAL_ART_FRAME_INTERVALS,
  MAX_POSTER_HEIGHT,
  MIN_POSTER_HEIGHT,
  POSTER_WHEEL_ROTATION_STEP,
} from "~/game/wallDecorTuning";
import {SHELF_BROWSE_INTERVAL_MS} from "~/game/bookInspectionTuning";
import {DEFAULT_MODEL_SCALE, PROP_MAX_PROJECTION_DISTANCE, PROP_MIN_PROJECTION_DISTANCE} from "~/game/propTuning";
import {describeKeyboardEvent} from "~/arcade/emulatorHost";
import {getArrowNavigation} from "~/reader/pagination";
import {keyboardLayoutEntry, readKeyboardLayout} from "~/game/keyboardLayout";
import {normalizePosterRotation} from "~/game/wallDecorTuning";

const TV_WHEEL_SCRUB_RESET_MS = 900;
const TV_WHEEL_SCRUB_STEPS_SECONDS = [3, 5, 10, 15, 30] as const;
const LOOK_SENSITIVITY = 0.0021;
const GAMEPAD_LOOK_SPEED = 700;
const LOOK_SMOOTHING = 32;
const MAX_LOOK_DELTA_PER_FRAME = (Math.PI / 180) * 10;
const PROP_WHEEL_ROTATION_STEP = MathUtils.degToRad(5);

const dominantWheelDelta = (event: WheelEvent) =>
  Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

export type ShopInputState = {
  anomalousPointerMovementCount: number;
  didWarnPointerMovement: boolean;
  ignoreNextLockedPointerMove: boolean;
  jumpQueued: boolean;
  jumpQueuedAt: number;
  keyboardLayout: Map<string, string>;
  lookAngles: LookAngles;
  lookDelta: LookAngles;
  lookTarget: LookAngles;
  nextLookAngles: LookAngles;
  pendingPointerMovementX: number;
  pendingPointerMovementY: number;
  pointerLockReleasePending: boolean;
  pointerLocked: boolean;
  resumePointerLockAfterRelease: boolean;
  shelfBrowseReadyAt: number;
  tvWheelScrubDirection: -1 | 1 | undefined;
  tvWheelScrubLastAt: number;
  tvWheelScrubStepIndex: number;
};

export type ShopInputHost = {
  abortSignal: AbortSignal;
  activeArcadeCabinet: () => ShopArcadeCabinet | undefined;
  arcadeStatusForUi: () => ArcadeSessionStatus | undefined;
  artFrames: () => ArtFrameSystem;
  bookActions: () => BookCarryActions;
  booksById: () => ReadonlyMap<string, {state: {status: string}}>;
  camera: () => PerspectiveCamera;
  canvas: () => HTMLCanvasElement;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => readonly string[];
  cycleCarriedBook: (direction: number) => boolean;
  disposed: () => boolean;
  emitGameState: () => void;
  gamepadLookSensitivity: () => number;
  handleImagePaste: (event: ClipboardEvent) => void;
  hoveredPublicationId: () => string | undefined;
  input: () => InputManager;
  interact: (allowNonBookPropPickup?: boolean) => void;
  inspection: () => InspectionController;
  markWorldStateDirty: () => void;
  mouseSensitivity: () => number;
  onMediaChannelCreateRequest: ((kind: "art-frame" | "tv") => void) | undefined;
  paused: () => boolean;
  physicsWorld: () => ShopPhysicsWorld;
  posters: () => PosterSystem;
  props: () => MovablePropLifecycle;
  refreshMediaCatalogIfActive: () => void;
  scanner: () => InteractionScanner;
  quitActiveArcadeGame: () => void;
  setArcadeTargeted: (cabinet: ShopArcadeCabinet | undefined) => void;
  setChannelEditorDigitalArtFrameId: (id: string | undefined) => void;
  setChannelEditorTelevision: (television: ShopTelevision | undefined) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  setPropTargeted: (record: MovablePropRecord | undefined) => void;
  setShelfPresentation: (presentation: ShelfPresentation) => void;
  setTelevisionTargeted: (targeted: boolean, interaction?: "screen" | "body", television?: ShopTelevision) => void;
  setTrashTargeted: (targeted: boolean) => void;
  signs: () => ShopSignSystem;
  shelfPresentation: () => ShelfPresentation;
  targetedArcadeCabinet: () => ShopArcadeCabinet | undefined;
  targetedProp: () => MovablePropRecord | undefined;
  targetedTelevision: () => ShopTelevision | undefined;
  televisionTargeted: () => boolean;
  stepAwayFromArcade: () => void;
  turnInspectionPage: (navigation: import("~/reader/pagination").ReaderNavigation) => void;
  updateHeldPhysicsTarget: () => void;
};

const createShopInputState = (): ShopInputState => ({
  anomalousPointerMovementCount: 0,
  didWarnPointerMovement: false,
  ignoreNextLockedPointerMove: false,
  jumpQueued: false,
  jumpQueuedAt: Number.NEGATIVE_INFINITY,
  keyboardLayout: new Map(),
  lookAngles: {pitch: 0, yaw: 0},
  lookDelta: {pitch: 0, yaw: 0},
  lookTarget: {pitch: 0, yaw: 0},
  nextLookAngles: {pitch: 0, yaw: 0},
  pendingPointerMovementX: 0,
  pendingPointerMovementY: 0,
  pointerLockReleasePending: false,
  pointerLocked: false,
  resumePointerLockAfterRelease: false,
  shelfBrowseReadyAt: 0,
  tvWheelScrubDirection: undefined,
  tvWheelScrubLastAt: Number.NEGATIVE_INFINITY,
  tvWheelScrubStepIndex: 0,
});

export class ShopInputController {
  readonly state = createShopInputState();
  readonly #host: ShopInputHost;

  constructor(host: ShopInputHost) {
    this.#host = host;
  }

  bind() {
    const passiveOptions = {
      passive: true,
      signal: this.#host.abortSignal,
    } as const;
    this.#host.canvas().addEventListener("pointerdown", this.#handleCanvasPointerDown, passiveOptions);
    document.addEventListener("pointermove", this.#handlePointerMove, passiveOptions);
    window.addEventListener("paste", this.#host.handleImagePaste, {
      signal: this.#host.abortSignal,
    });
    this.#host.canvas().addEventListener("wheel", this.#handleWheel, {
      passive: false,
      signal: this.#host.abortSignal,
    });
    document.addEventListener("pointerup", this.#handleInspectionPointerUp, {
      signal: this.#host.abortSignal,
    });
    document.addEventListener("pointercancel", this.#handleInspectionPointerUp, {signal: this.#host.abortSignal});
    document.addEventListener("pointerlockchange", this.#handlePointerLockChange, passiveOptions);
    this.#host.input().attach(this.#host.abortSignal);
    window.addEventListener("blur", this.#handleWindowBlur, passiveOptions);
    window.addEventListener("focus", this.#host.refreshMediaCatalogIfActive, {
      signal: this.#host.abortSignal,
    });
    document.addEventListener("visibilitychange", this.#host.refreshMediaCatalogIfActive, {
      signal: this.#host.abortSignal,
    });
  }

  async loadKeyboardLayout() {
    const layout = await readKeyboardLayout();
    if (!layout || this.#host.disposed()) return;
    let changed = false;
    for (const [code, label] of layout) {
      const normalizedLabel = label.toLowerCase();
      if (!normalizedLabel || this.state.keyboardLayout.get(code) === normalizedLabel) continue;
      this.state.keyboardLayout.set(code, normalizedLabel);
      changed = true;
    }
    if (changed) this.#host.emitGameState();
  }

  observeKeyboardEvent(event: KeyboardEvent) {
    const entry = keyboardLayoutEntry(event);
    if (!entry) return;
    const [code, label] = entry;
    if (this.state.keyboardLayout.get(code) === label) return;
    this.state.keyboardLayout.set(code, label);
    this.#host.emitGameState();
  }

  readonly #handleCanvasPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.#host.paused()) return;
    // An arcade session owns the pointer; clicking must not re-lock it.
    if (this.#host.arcadeStatusForUi()) return;
    if (this.#host.inspection().inspectionMode === "spread") {
      if (this.#host.inspection().inspectionOpenAngleTarget > 0) {
        this.#host.inspection().openInspectionBook();
        return;
      }
      this.#host.inspection().beginInspectionPointerTurn(event);
      return;
    }
    if (this.#host.inspection().inspectionMode === "closing") return;
    if (this.state.pointerLocked) {
      this.#host.interact(false);
      return;
    }
    this.requestPointerLock();
  };

  readonly #handlePointerMove = (event: PointerEvent) => {
    if (this.#host.paused()) return;
    if (this.#host.inspection().inspectionDragging) {
      this.#host.inspection().inspectionDragCurrentX = event.clientX;
      if (Math.abs(this.#host.inspection().inspectionDragCurrentX - this.#host.inspection().inspectionDragStartX) > 4)
        this.#host.inspection().inspectionDragMoved = true;
      this.#host.inspection().updateInspectionDragProgress();
      return;
    }
    if (this.#host.inspection().inspectionMode === "spread") {
      if (event.target instanceof HTMLInputElement) return;
      this.#host.inspection().setInspectionPointer(event.clientX, event.clientY);
      this.#host.inspection().updateInspectionZoomPanTarget();
      return;
    }
    if (!this.state.pointerLocked) return;
    if (this.state.ignoreNextLockedPointerMove) {
      this.state.ignoreNextLockedPointerMove = false;
      return;
    }
    if (!isPlausiblePointerMovement(event.movementX, event.movementY)) this.state.anomalousPointerMovementCount += 1;
    if (!Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return;
    if (event.movementX === 0 && event.movementY === 0) return;
    this.#host.scanner().shelfBrowsePublicationId = undefined;
    this.state.pendingPointerMovementX += event.movementX;
    this.state.pendingPointerMovementY += event.movementY;
  };

  consumePointerMovement(deltaSeconds: number) {
    // Gamepad look rides the same smoothed pointer-delta path as the mouse.
    const padLook = this.#host.input().gamepad.look;
    if (this.state.pointerLocked && (padLook.yaw !== 0 || padLook.pitch !== 0)) {
      const padSensitivity = this.#host.gamepadLookSensitivity();
      const padMultiplier = Number.isFinite(padSensitivity) && padSensitivity > 0 ? padSensitivity : 1;
      this.state.pendingPointerMovementX += padLook.yaw * GAMEPAD_LOOK_SPEED * padMultiplier * deltaSeconds;
      this.state.pendingPointerMovementY += padLook.pitch * GAMEPAD_LOOK_SPEED * padMultiplier * deltaSeconds;
    }
    const movementX = this.state.pendingPointerMovementX;
    const movementY = this.state.pendingPointerMovementY;
    const anomalousEventCount = this.state.anomalousPointerMovementCount;
    this.state.pendingPointerMovementX = 0;
    this.state.pendingPointerMovementY = 0;
    this.state.anomalousPointerMovementCount = 0;

    if (anomalousEventCount > 0 && DEV && !this.state.didWarnPointerMovement) {
      this.state.didWarnPointerMovement = true;
      console.warn("Afterleaf bounded an anomalous pointer-lock movement burst.", {
        eventCount: anomalousEventCount,
        frameDeltaMs: deltaSeconds * 1000,
        movementX,
        movementY,
      });
    }
    if (movementX === 0 && movementY === 0) return;

    const sensitivity = this.#host.mouseSensitivity();
    const sensitivityMultiplier = Number.isFinite(sensitivity) ? Math.max(0, sensitivity) : 1;
    clampLookDeltaMagnitude(
      -movementX * LOOK_SENSITIVITY * sensitivityMultiplier,
      -movementY * LOOK_SENSITIVITY * sensitivityMultiplier,
      MAX_LOOK_DELTA_PER_FRAME,
      this.state.lookDelta,
    );
    updateLookAngles(
      this.state.lookTarget,
      this.state.lookDelta.yaw,
      this.state.lookDelta.pitch,
      this.state.nextLookAngles,
      Math.PI * 0.46,
    );
    this.state.lookTarget.yaw = this.state.nextLookAngles.yaw;
    this.state.lookTarget.pitch = this.state.nextLookAngles.pitch;
    this.#host.markWorldStateDirty();
  }

  #handleInspectionWheel(event: WheelEvent): boolean {
    if (this.#host.inspection().inspectionMode !== "spread") return false;
    if (event.deltaY === 0) return true;
    event.preventDefault();
    this.#host.inspection().zoomInspectionAtPointer(event);
    return true;
  }

  #handleWallPlacementWheel(
    event: WheelEvent,
    placement: NonNullable<ArtFrameSystem["placement"]> | NonNullable<PosterSystem["placement"]> | undefined,
    updateTarget: () => void,
  ): boolean {
    if (!this.state.pointerLocked || !placement || event.deltaY === 0) return false;
    event.preventDefault();
    if (event.shiftKey)
      placement.rotation = normalizePosterRotation(
        placement.rotation - Math.sign(event.deltaY) * POSTER_WHEEL_ROTATION_STEP,
      );
    else
      placement.desiredHeight = MathUtils.clamp(
        placement.desiredHeight * Math.exp(-event.deltaY * 0.0015),
        MIN_POSTER_HEIGHT,
        MAX_POSTER_HEIGHT,
      );
    updateTarget();
    this.#host.emitGameState();
    return true;
  }

  #handlePlacementWheel(event: WheelEvent): boolean {
    if (
      this.#handleWallPlacementWheel(event, this.#host.artFrames().placement, () =>
        this.#host.artFrames().updateDigitalArtFramePlacementTarget(),
      )
    )
      return true;
    return this.#handleWallPlacementWheel(event, this.#host.posters().placement, () =>
      this.#host.posters().updatePosterPlacementTarget(),
    );
  }

  #handleCarriedPropWheel(event: WheelEvent): boolean {
    const carriedProp = this.#host.props().carriedProp;
    if (!this.state.pointerLocked || !carriedProp) return false;
    if (carriedProp.modelBaseSize && event.shiftKey && event.deltaY !== 0) {
      event.preventDefault();
      this.#host
        .props()
        .setModelPropScale(
          carriedProp,
          (carriedProp.modelScale ?? DEFAULT_MODEL_SCALE) * Math.exp(-event.deltaY * 0.0015),
        );
      return true;
    }
    if (event.ctrlKey && event.deltaY !== 0) {
      event.preventDefault();
      const rotationStep = this.#host.props().propPlacementSnapping
        ? carriedProp.rotationSnapStep
        : PROP_WHEEL_ROTATION_STEP;
      this.#host.props().propPlacementYaw = normalizePosterRotation(
        this.#host.props().propPlacementYaw - Math.sign(event.deltaY) * rotationStep,
      );
      this.#host.updateHeldPhysicsTarget();
      this.#host.markWorldStateDirty();
      this.#host.emitGameState();
      return true;
    }
    const wheelDelta = dominantWheelDelta(event);
    if (Math.abs(wheelDelta) < 1) return true;
    event.preventDefault();
    this.#host.props().propPlacementDistance = MathUtils.clamp(
      this.#host.props().propPlacementDistance - wheelDelta * 0.0025,
      PROP_MIN_PROJECTION_DISTANCE,
      PROP_MAX_PROJECTION_DISTANCE,
    );
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
    return true;
  }

  #handleCarriedBookWheel(event: WheelEvent): boolean {
    if (!this.state.pointerLocked || this.#host.carriedPublicationIds().length <= 1) return false;
    const wheelDelta = dominantWheelDelta(event);
    if (Math.abs(wheelDelta) < 1) return true;
    if (!this.#host.cycleCarriedBook(Math.sign(wheelDelta))) return true;
    event.preventDefault();
    return true;
  }

  #handleTelevisionWheel(event: WheelEvent): boolean {
    if (!this.state.pointerLocked || !this.#host.televisionTargeted() || event.deltaY === 0) return false;
    const direction = Math.sign(event.deltaY) as -1 | 1;
    if (event.ctrlKey) {
      event.preventDefault();
      this.#host.targetedTelevision()?.adjustVolume(direction === 1 ? -1 : 1);
      this.state.tvWheelScrubDirection = undefined;
      this.state.tvWheelScrubLastAt = Number.NEGATIVE_INFINITY;
      this.state.tvWheelScrubStepIndex = 0;
      return true;
    }
    const continuesScrub =
      direction === this.state.tvWheelScrubDirection &&
      event.timeStamp >= this.state.tvWheelScrubLastAt &&
      event.timeStamp - this.state.tvWheelScrubLastAt <= TV_WHEEL_SCRUB_RESET_MS;
    const stepIndex = continuesScrub
      ? Math.min(this.state.tvWheelScrubStepIndex + 1, TV_WHEEL_SCRUB_STEPS_SECONDS.length - 1)
      : 0;
    const stepSeconds = TV_WHEEL_SCRUB_STEPS_SECONDS[stepIndex];
    if (!stepSeconds || !this.#host.targetedTelevision()?.scrub(direction * stepSeconds)) return true;
    event.preventDefault();
    this.state.tvWheelScrubDirection = direction;
    this.state.tvWheelScrubLastAt = event.timeStamp;
    this.state.tvWheelScrubStepIndex = stepIndex;
    return true;
  }

  #handleArcadeVolumeWheel(event: WheelEvent): boolean {
    // Cabinet volume: the actively-attached session wins (reticle targeting
    // is not how an attached session is tracked, and pointer lock may be
    // released right after booting from the picker); otherwise a targeted,
    // still-running cabinet responds while the player is stepped away.
    const arcadeVolumeCabinet =
      this.#host.activeArcadeCabinet()?.sessionStatus === "playing"
        ? this.#host.activeArcadeCabinet()
        : this.#host.targetedArcadeCabinet()?.sessionStatus === "playing"
          ? this.#host.targetedArcadeCabinet()
          : undefined;
    if (!arcadeVolumeCabinet || !event.ctrlKey || event.deltaY === 0) return false;
    event.preventDefault();
    // Same convention as the TV: wheel up raises the cabinet's volume.
    arcadeVolumeCabinet.adjustArcadeVolume(Math.sign(event.deltaY) === 1 ? -1 : 1);
    return true;
  }

  #handleShelfBrowseWheel(event: WheelEvent) {
    if (
      !this.state.pointerLocked ||
      !this.#host.input().isActionDown("throw") ||
      event.timeStamp < this.state.shelfBrowseReadyAt
    )
      return;
    const wheelDelta = dominantWheelDelta(event);
    if (Math.abs(wheelDelta) < 4 || !this.#host.scanner().browseShelf(Math.sign(wheelDelta))) return;
    event.preventDefault();
    this.state.shelfBrowseReadyAt = event.timeStamp + SHELF_BROWSE_INTERVAL_MS;
  }

  readonly #handleWheel = (event: WheelEvent) => {
    if (this.#host.paused() || this.#host.bookActions().shelveAnimation) return;
    if (this.#handleInspectionWheel(event)) return;
    if (this.#handlePlacementWheel(event)) return;
    if (this.#handleCarriedPropWheel(event)) return;
    if (this.#handleCarriedBookWheel(event)) return;
    if (this.#handleTelevisionWheel(event)) return;
    if (this.#handleArcadeVolumeWheel(event)) return;
    this.#handleShelfBrowseWheel(event);
  };

  readonly #handleInspectionPointerUp = () => {
    if (!this.#host.inspection().inspectionDragging) return;
    this.#host.inspection().inspectionDragging = false;
    const decision =
      !this.#host.inspection().inspectionDragMoved || this.#host.inspection().inspectionDragCompletion() >= 0.5
        ? "commit"
        : "cancel";
    this.#host.inspection().inspectionDragReleaseDecision = decision;
    if (this.#host.inspection().inspectionTurnPage !== undefined)
      this.#host.inspection().resolveInspectionDragDecision(decision);
    this.#host.inspection().inspectionDragNavigation = undefined;
  };

  updateCameraLook(deltaSeconds: number) {
    if (this.#host.inspection().inspectionMode === "spread") return;
    dampLookAngles(
      this.state.lookAngles,
      this.state.lookTarget,
      LOOK_SMOOTHING,
      deltaSeconds,
      this.state.nextLookAngles,
    );
    this.state.lookAngles.yaw = this.state.nextLookAngles.yaw;
    this.state.lookAngles.pitch = this.state.nextLookAngles.pitch;
    this.#host.camera().rotation.set(this.state.lookAngles.pitch, this.state.lookAngles.yaw, 0);
  }

  readonly #handlePointerLockChange = () => {
    const wasPointerLocked = this.state.pointerLocked;
    this.state.pointerLocked = document.pointerLockElement === this.#host.canvas();
    const releaseCompleted = !this.state.pointerLocked && this.state.pointerLockReleasePending;
    const resumePointerLock = releaseCompleted && this.state.resumePointerLockAfterRelease;
    if (releaseCompleted) {
      this.state.pointerLockReleasePending = false;
      this.state.resumePointerLockAfterRelease = false;
    }
    this.#resetPointerMovement();
    this.state.ignoreNextLockedPointerMove = this.state.pointerLocked && !wasPointerLocked;
    if (!this.state.pointerLocked) {
      this.#host.input().suspend();
      this.#host.bookActions().cancelThrowCharge();
      this.state.jumpQueued = false;
    }
    this.#host.canvas().style.cursor = this.state.pointerLocked ? "none" : "pointer";
    this.#host.emitGameState();
    // Pointer lock state is orthogonal to menus: unlocks never open the
    // pause menu. Escape routing owns that (modal stack, then the armed
    // fallback), so programmatic releases and browser lock teardowns around
    // mode changes cannot summon it.
    if (
      resumePointerLock &&
      !this.#host.paused() &&
      this.#host.inspection().inspectionMode !== "spread" &&
      !this.#host.arcadeStatusForUi() &&
      !this.#host.disposed()
    )
      this.requestPointerLock();
  };

  #handleInspectionAction(action: ShortcutAction): boolean {
    switch (action) {
      case "inspectionTurnLeft":
      case "inspectionTurnRight": {
        const publication = this.#host.inspection().inspectionPublication();
        if (!publication) return true;
        const navigation = getArrowNavigation(
          action === "inspectionTurnLeft" ? "ArrowLeft" : "ArrowRight",
          publication.direction,
        );
        this.#host.inspection().inspectionHeldNavigation = navigation;
        this.#host.turnInspectionPage(navigation);
        return true;
      }
      case "inspectionThrow":
        if (this.#host.inspection().inspectionPublicationId !== this.#host.carriedPublicationId()) return true;
        this.#host.inspection().startInspectionClose("throw");
        return true;
      case "inspectionDrop":
        if (this.#host.inspection().inspectionPublicationId !== this.#host.carriedPublicationId()) return true;
        this.#host.inspection().startInspectionClose("drop");
        return true;
      case "inspectionReturn":
        this.#host.inspection().startInspectionClose("return");
        return true;
      default:
        // A spread owns all other actions while it is open.
        return true;
    }
  }

  #handleMovementAction(action: ShortcutAction): boolean {
    if (action === "jump") {
      this.state.jumpQueued = true;
      this.state.jumpQueuedAt = performance.now();
      return true;
    }
    if (
      action === "moveForward" ||
      action === "moveBackward" ||
      action === "moveLeft" ||
      action === "moveRight" ||
      action === "sprint"
    ) {
      // Held-state actions are queried per frame via isActionDown.
      return true;
    }
    return false;
  }

  #placementBlocked() {
    return (
      this.#host.artFrames().placement ||
      this.#host.posters().placement ||
      this.#host.carriedPublicationId() !== undefined ||
      this.#host.props().carriedProp !== undefined
    );
  }

  #toggleModelPlacement() {
    if (this.#host.televisionTargeted()) return false;
    if (this.#host.props().modelPlacement) {
      this.#host.props().cancelModelPlacement();
      return true;
    }
    if (!this.#placementBlocked())
      void this.#host.props().startModelPlacement(this.#host.props().spawnablePropAssetIndex);
    return true;
  }

  #toggleArtFramePlacement() {
    if (this.#host.artFrames().placement) {
      this.#host.artFrames().cancelDigitalArtFramePlacement();
      return true;
    }
    if (!this.#placementBlocked()) {
      if (this.#host.artFrames().assets.length > 0)
        this.#host.artFrames().startDigitalArtFramePlacement(this.#host.artFrames().assetIndex);
      else this.#host.artFrames().startEmptyDigitalArtFramePlacement();
    }
    return true;
  }

  #openChannelEditor() {
    const onMediaChannelCreateRequest = this.#host.onMediaChannelCreateRequest;
    if (
      !(this.#host.artFrames().placement || this.#host.artFrames().targetedId || this.#host.televisionTargeted()) ||
      !onMediaChannelCreateRequest
    )
      return false;
    const kind = this.#host.televisionTargeted() ? "tv" : "art-frame";
    this.#host.setChannelEditorTelevision(kind === "tv" ? this.#host.targetedTelevision() : undefined);
    this.#host.setChannelEditorDigitalArtFrameId(kind === "art-frame" ? this.#host.artFrames().targetedId : undefined);
    this.releasePointerLock();
    onMediaChannelCreateRequest(kind);
    return true;
  }

  #togglePosterPlacement() {
    if (this.#host.posters().placement) {
      this.#host.posters().cancelPosterPlacement();
      return true;
    }
    if (!this.#placementBlocked()) {
      if (this.#host.posters().assets.length > 0)
        void this.#host.posters().startPosterPlacement(this.#host.posters().assetIndex);
      else this.#host.posters().startEmptyPosterPlacement();
    }
    return true;
  }

  #handlePlacementToggleAction(action: ShortcutAction): boolean {
    switch (action) {
      case "toggleModelPlacement":
        return this.#toggleModelPlacement();
      case "toggleArtFramePlacement":
        return this.#toggleArtFramePlacement();
      case "channelEditorOpen":
        return this.#openChannelEditor();
      case "togglePosterPlacement":
        return this.#togglePosterPlacement();
      default:
        return false;
    }
  }

  #cyclePlacement(direction: -1 | 1): boolean {
    if (this.#host.props().modelPlacement) {
      this.#host.props().cycleModelPlacement(direction);
      return true;
    }
    if (this.#host.posters().placement) {
      this.#host.posters().cyclePoster(direction);
      return true;
    }
    return false;
  }

  #handlePlacementCycleAction(action: ShortcutAction): boolean {
    switch (action) {
      case "placementCycleLeft":
        return this.#cyclePlacement(-1);
      case "placementCycleRight":
        return this.#cyclePlacement(1);
      case "placementCycleChannelLeft":
      case "placementCycleChannelRight": {
        if (!this.#host.artFrames().placement) return false;
        this.#host.artFrames().cycleDigitalArtFramePlacementChannel(action === "placementCycleChannelLeft" ? -1 : 1);
        return true;
      }
      case "placementCycleImageLeft":
      case "placementCycleImageRight": {
        if (!this.#host.artFrames().placement) return false;
        this.#host.artFrames().cycleDigitalArtFramePlacementImage(action === "placementCycleImageLeft" ? -1 : 1);
        return true;
      }
      case "placementToggleFit": {
        const placement = this.#host.artFrames().placement;
        if (!placement) return false;
        placement.fit = placement.fit === "contain" ? "cover" : "contain";
        this.#host.artFrames().preview?.setFit(placement.fit);
        this.#host.emitGameState();
        return true;
      }
      case "placementToggleInterval": {
        const placement = this.#host.artFrames().placement;
        if (!placement) return false;
        const intervalIndex = DIGITAL_ART_FRAME_INTERVALS.indexOf(
          placement.intervalSeconds as (typeof DIGITAL_ART_FRAME_INTERVALS)[number],
        );
        const interval =
          DIGITAL_ART_FRAME_INTERVALS[(Math.max(0, intervalIndex) + 1) % DIGITAL_ART_FRAME_INTERVALS.length];
        if (interval !== undefined) placement.intervalSeconds = interval;
        this.#host.emitGameState();
        return true;
      }
      case "placementToggleGridSnap": {
        if (!this.#host.artFrames().placement && !this.#host.posters().placement) return false;
        const placement = this.#host.artFrames().placement ?? this.#host.posters().placement;
        if (placement) placement.gridSnap = !placement.gridSnap;
        this.#host.artFrames().updateDigitalArtFramePlacementTarget();
        this.#host.posters().updatePosterPlacementTarget();
        this.#host.emitGameState();
        return true;
      }
      default:
        return false;
    }
  }

  #handlePropPlacementAction(action: ShortcutAction): boolean {
    switch (action) {
      case "propToggleSnap": {
        const carriedProp = this.#host.props().carriedProp;
        if (!carriedProp) return false;
        this.#host.props().propPlacementSnapping = !this.#host.props().propPlacementSnapping;
        this.#host.emitGameState();
        return true;
      }
      case "propCycleAnimationLeft":
      case "propCycleAnimationRight": {
        const targetedProp = this.#host.targetedProp();
        if (!targetedProp?.modelAnimations?.length) return false;
        this.#host.props().cycleModelAnimation(targetedProp, action === "propCycleAnimationLeft" ? -1 : 1);
        return true;
      }
      default:
        return false;
    }
  }

  #handleRemovalAction(action: ShortcutAction): boolean {
    if (action !== "removeTargeted") return false;
    const targetedTelevision = this.#host.targetedTelevision();
    const targetedTelevisionProp = targetedTelevision
      ? this.#host.props().televisionProps.get(targetedTelevision)
      : undefined;
    const targetedArcadeCabinet = this.#host.targetedArcadeCabinet();
    const targetedArcadeProp = targetedArcadeCabinet
      ? this.#host.props().arcadeProps.get(targetedArcadeCabinet)
      : undefined;
    if (targetedTelevisionProp?.spawned) {
      this.#host.props().removeSpawnedProp(targetedTelevisionProp);
      return true;
    }
    if (targetedArcadeProp?.spawned) {
      this.#host.props().removeSpawnedProp(targetedArcadeProp);
      return true;
    }
    const targetedProp = this.#host.targetedProp();
    if (targetedProp?.spawned) {
      this.#host.props().removeSpawnedProp(targetedProp);
      return true;
    }
    if (this.#host.artFrames().targetedId) {
      this.#host.artFrames().removeTargetedDigitalArtFrame();
      return true;
    }
    if (this.#host.posters().targetedId) {
      this.#host.posters().removeTargetedPoster();
      return true;
    }
    // Nothing targeted: let later candidates use the same binding.
    return false;
  }

  #handlePickupAction(action: ShortcutAction): boolean {
    if (action !== "pickUpCancel") return false;
    const props = this.#host.props();
    if (props.modelPlacement) {
      props.cancelModelPlacement();
      return true;
    }
    if (this.#host.artFrames().placement) {
      this.#host.artFrames().cancelDigitalArtFramePlacement();
      return true;
    }
    if (this.#host.posters().placement) {
      this.#host.posters().cancelPosterPlacement();
      return true;
    }
    if (props.carriedProp) {
      props.cancelCarriedProp();
      return true;
    }
    const targetedArcadeCabinet = this.#host.targetedArcadeCabinet();
    if (targetedArcadeCabinet) {
      const cabinetProp = props.arcadeProps.get(targetedArcadeCabinet);
      if (cabinetProp) props.pickUpProp(cabinetProp);
      return true;
    }
    if (this.#host.televisionTargeted()) {
      const targetedTelevision = this.#host.targetedTelevision();
      const televisionProp = targetedTelevision ? props.televisionProps.get(targetedTelevision) : undefined;
      if (televisionProp) props.pickUpProp(televisionProp);
      return true;
    }
    const targetedProp = this.#host.targetedProp();
    if (targetedProp) {
      props.pickUpProp(targetedProp);
      return true;
    }
    if (this.#host.artFrames().targetedId || this.#host.posters().targetedId) {
      this.#host.interact();
      return true;
    }
    return false;
  }

  #handleTargetMediaAction(action: ShortcutAction): boolean {
    if (action === "artFramePreviousChannel" || action === "artFrameNextChannel") {
      const targetedId = this.#host.artFrames().targetedId;
      if (!targetedId) return false;
      this.#host
        .artFrames()
        .records.get(targetedId)
        ?.frame.changeChannel(action === "artFramePreviousChannel" ? -1 : 1);
      this.#host.markWorldStateDirty();
      this.#host.emitGameState();
      return true;
    }
    switch (action) {
      case "artFrameInterval":
        if (!this.#host.artFrames().targetedId) return false;
        this.#host.artFrames().cycleTargetedDigitalArtFrameInterval();
        return true;
      case "artFrameFit":
        if (!this.#host.artFrames().targetedId) return false;
        this.#host.artFrames().cycleTargetedDigitalArtFrameFit();
        return true;
      case "tvPreviousChannel":
        if (!this.#host.televisionTargeted()) return false;
        this.#host.targetedTelevision()?.previousChannel();
        return true;
      case "tvMute":
        if (!this.#host.televisionTargeted()) return false;
        this.#host.targetedTelevision()?.toggleMuted();
        return true;
      default:
        return false;
    }
  }

  #handleTargetPropertyAction(action: ShortcutAction): boolean {
    if (action === "toggleShelfPresentation") {
      if (!this.#host.carriedPublicationId()) return false;
      this.#host.setShelfPresentation(this.#host.shelfPresentation() === "spine" ? "face" : "spine");
      this.#host.scanner().update();
      return true;
    }
    if (action !== "propPinToggle") return false;
    // Pin or release whatever movable prop is under the reticle: a
    // locked prop keeps a fixed body that still blocks the player,
    // books, and other props, but nothing can bump it around.
    const targetedTelevision = this.#host.targetedTelevision();
    const targetedArcadeCabinet = this.#host.targetedArcadeCabinet();
    const lockableProp =
      this.#host.targetedProp() ??
      (targetedTelevision ? this.#host.props().televisionProps.get(targetedTelevision) : undefined) ??
      (targetedArcadeCabinet ? this.#host.props().arcadeProps.get(targetedArcadeCabinet) : undefined);
    if (!lockableProp || this.#host.props().carriedProp === lockableProp) return false;
    const locked = !lockableProp.locked;
    lockableProp.locked = locked;
    this.#host.physicsWorld().setPropLocked(lockableProp.id, locked);
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
    return true;
  }

  #handleThrowAction() {
    if (this.#host.televisionTargeted()) this.#host.targetedTelevision()?.skip();
    else {
      const targetedId = this.#host.artFrames().targetedId;
      if (targetedId) this.#host.artFrames().records.get(targetedId)?.frame.skip();
      else if (this.#host.props().carriedProp) this.#host.props().dropCarriedProp(true);
      else if (this.#host.carriedPublicationId()) this.#host.bookActions().startThrowCharge();
    }
    // Held throw state drives shelf browsing; isActionDown covers it.
  }

  #handleDropAction() {
    if (this.#host.artFrames().placement || this.#host.posters().placement) return;
    if (this.#host.artFrames().targetedId) this.#host.artFrames().removeTargetedDigitalArtFrame();
    else if (this.#host.posters().targetedId) this.#host.posters().removeTargetedPoster();
    else if (this.#host.props().carriedProp) this.#host.props().dropCarriedProp();
    else this.#host.bookActions().dropCarriedBook();
  }

  #handleInspectionReturnAction() {
    const hoveredPublicationId = this.#host.hoveredPublicationId();
    const carriedPublicationId = this.#host.carriedPublicationId();
    const hoveredRecord = hoveredPublicationId ? this.#host.booksById().get(hoveredPublicationId) : undefined;
    if (carriedPublicationId) this.#host.inspection().advanceInspectionMode(carriedPublicationId);
    else if (hoveredPublicationId && hoveredRecord?.state.status === "shelved")
      this.#host.inspection().advanceInspectionMode(hoveredPublicationId);
  }

  #handleGameplayAction(action: ShortcutAction): boolean {
    switch (action) {
      case "interact":
        this.#triggerInteraction();
        return true;
      case "throw":
        this.#handleThrowAction();
        return true;
      case "drop":
        this.#handleDropAction();
        return true;
      case "inspectionReturn": {
        this.#handleInspectionReturnAction();
        return true;
      }
      default:
        return false;
    }
  }

  #handleWorldAction(action: ShortcutAction): boolean {
    return (
      this.#handleMovementAction(action) ||
      this.#handlePlacementToggleAction(action) ||
      this.#handlePlacementCycleAction(action) ||
      this.#handlePropPlacementAction(action) ||
      this.#handleRemovalAction(action) ||
      this.#handlePickupAction(action) ||
      this.#handleTargetMediaAction(action) ||
      this.#handleTargetPropertyAction(action) ||
      this.#handleGameplayAction(action)
    );
  }

  /**
   * Single action dispatcher for every input device. Candidates arrive in
   * `ACTION_DISPATCH_ORDER`; each case checks its own context and returns
   * false when the action does not apply, letting the next candidate run.
   */
  readonly handleActionDown = (action: ShortcutAction): boolean => {
    if (this.#host.paused()) return true;
    if (this.#host.inspection().inspectionMode === "spread") return this.#handleInspectionAction(action);
    if (!this.state.pointerLocked) return false;
    return this.#handleWorldAction(action);
  };

  readonly handleActionUp = (action: ShortcutAction): boolean => {
    if (this.#host.paused()) return true;
    switch (action) {
      case "throw":
        if (this.#host.bookActions().throwChargeActive) this.#host.bookActions().releaseThrowCharge();
        else if (this.#host.inspection().inspectionMode === "none") {
          this.#host.scanner().shelfBrowsePublicationId = undefined;
          this.#host.scanner().update();
        }
        return true;
      case "inspectionTurnLeft":
      case "inspectionTurnRight": {
        const direction = this.#host.inspection().inspectionPublication()?.direction ?? "LTR";
        const navigation = getArrowNavigation(action === "inspectionTurnLeft" ? "ArrowLeft" : "ArrowRight", direction);
        if (this.#host.inspection().inspectionHeldNavigation === navigation)
          this.#host.inspection().inspectionHeldNavigation = undefined;
        return true;
      }
      default:
        // Decline so lower-priority candidates sharing the binding still
        // receive the release - throwing must see its own key-up.
        return false;
    }
  };

  #triggerInteraction() {
    if (this.#host.televisionTargeted()) {
      const targetedTelevision = this.#host.targetedTelevision();
      if (targetedTelevision?.powered()) targetedTelevision.nextChannel();
      else targetedTelevision?.togglePower();
      return;
    }
    if (this.#host.props().carriedProp) {
      this.#host.props().dropCarriedProp();
      return;
    }
    if (this.#host.targetedProp() || this.#host.posters().targetedId) return;
    this.#host.interact();
  }

  /** Raw-key interceptor: while an arcade session plays, keys feed it. */
  forwardArcadeKey(event: KeyboardEvent): boolean {
    if (this.#host.paused()) return false;
    if (this.#host.activeArcadeCabinet()?.sessionStatus !== "playing") return false;
    // Tab owns the menus and must never reach the game; the global modal
    // stack handles it. Escape stays browser-reserved for pointer lock.
    if (event.type === "keydown" && event.code === "Tab") return true;
    if (event.type === "keydown" && event.code === "KeyR") {
      event.preventDefault();
      this.#host.stepAwayFromArcade();
      return true;
    }
    if (event.type === "keydown" && event.code === "KeyP") {
      event.preventDefault();
      this.#host.quitActiveArcadeGame();
      return true;
    }
    event.preventDefault();
    const activeArcadeCabinet = this.#host.activeArcadeCabinet();
    if (!activeArcadeCabinet) return false;
    activeArcadeCabinet.forwardKey(event.type === "keydown", describeKeyboardEvent(event));
    return true;
  }

  readonly #handleWindowBlur = () => {
    this.#host.input().suspend();
    this.#host.inspection().inspectionHeldNavigation = undefined;
    this.#host.bookActions().cancelThrowCharge();
    this.state.jumpQueued = false;
    this.#host.scanner().shelfBrowsePublicationId = undefined;
    this.#resetPointerMovement();
  };

  #resetPointerMovement() {
    this.state.pendingPointerMovementX = 0;
    this.state.pendingPointerMovementY = 0;
    this.state.anomalousPointerMovementCount = 0;
    this.state.lookTarget.yaw = this.state.lookAngles.yaw;
    this.state.lookTarget.pitch = this.state.lookAngles.pitch;
  }

  requestPointerLock() {
    if (this.#host.disposed() || document.pointerLockElement === this.#host.canvas()) return;
    if (this.state.pointerLockReleasePending) {
      this.state.resumePointerLockAfterRelease = true;
      return;
    }
    this.state.resumePointerLockAfterRelease = false;
    void this.#host
      .canvas()
      .requestPointerLock()
      .catch((cause) => {
        if (DEV) console.warn("Afterleaf could not acquire pointer lock.", cause);
      });
  }

  releasePointerLock() {
    this.state.resumePointerLockAfterRelease = false;
    if (this.state.pointerLockReleasePending || document.pointerLockElement !== this.#host.canvas()) return;
    this.state.pointerLockReleasePending = true;
    document.exitPointerLock();
  }

  suspendInput() {
    this.#host.input().suspend();
    this.#host.bookActions().cancelThrowCharge();
    this.state.jumpQueued = false;
    this.#resetPointerMovement();
    this.releasePointerLock();
    this.#host.setHoveredPublicationId(undefined);
    this.#host.scanner().shelfTargeted = false;
    this.#host.scanner().shelfTargetSelection = undefined;
    this.#host.signs().previewKey = undefined;
    this.#host.signs().targetedKey = undefined;
    this.#host.signs().updateTargetVisuals();
    this.#host.setPropTargeted(undefined);
    this.#host.setTelevisionTargeted(false);
    this.#host.setArcadeTargeted(undefined);
    this.#host.setTrashTargeted(false);
    this.#host.emitGameState();
  }
}
