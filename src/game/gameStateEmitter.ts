import {
  ShopArcadeCabinet,
  type ArcadeSessionStatus,
} from "~/game/ShopArcadeCabinet";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import type {CatalogItem} from "~/catalog";
import {getWideReaderPageIndices} from "~/reader/pageSpreadDetection";
import type {ShortcutsConfig} from "~/game/input/bindings";
import type {InputManager} from "~/game/input/inputManager";
import type {ShelfPresentation} from "~/game/shelfPlacement";
import type {
  InspectionCloseAction,
  InspectionMode,
  ModelPlacementSession,
  MovablePropRecord,
  ShopGameSnapshot,
  ShelfTargetSelection,
} from "~/game/shopTypes";
import type {ShelveAnimation} from "~/game/bookCarryActions";
import {
  createShopGameSnapshot,
  formatDisplayedInteractions,
} from "~/game/gameStateSnapshot";
import {resolveShopInteractionView} from "~/game/shopInteractionView";
import {INTERACTION_ROW_MODES, type UiMode} from "~/game/uiMode";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import type {ShopTelevision} from "~/game/ShopTelevision";
import type {SpawnablePropAsset} from "~/game/propTemplates";
import type {TvVideoImporter} from "~/game/tvVideoImporter";

/**
 * Everything the game-state snapshot builder reads, as live accessors.
 * The scene constructs this once; closures keep every read current.
 */
export type GameSnapshotInput = {
  activeArcadeCabinet: () => ShopArcadeCabinet | undefined;
  arcadeProps: () => ReadonlyMap<ShopArcadeCabinet, MovablePropRecord>;
  arcadeStatusForUi: () => ArcadeSessionStatus | undefined;
  arcadeSystemIdForUi: () => string | undefined;
  artFrames: () => ArtFrameSystem;
  booksById: () => ReadonlyMap<string, BookRecord>;
  carriedProp: () => MovablePropRecord | undefined;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => readonly string[];
  discardBusy: () => boolean;
  discardError: () => string | undefined;
  discardedPublicationIds: () => ReadonlySet<string>;
  getShortcuts: () => ShortcutsConfig;
  hoveredPublicationId: () => string | undefined;
  input: () => InputManager;
  inspectionCloseAction: () => InspectionCloseAction | undefined;
  inspectionMode: () => InspectionMode;
  inspectionOpenAngleTarget: () => number;
  inspectionPageIndex: () => number;
  inspectionPageLoadCount: () => number;
  inspectionPublication: () => CatalogItem | undefined;
  keyboardLayout: () => ReadonlyMap<string, string>;
  mode: () => (() => UiMode) | undefined;
  modelAnimationLabel: (record: MovablePropRecord) => string;
  modelImportError: () => string | undefined;
  modelPlacement: () => ModelPlacementSession | undefined;
  onGameStateChange: () => ((snapshot: ShopGameSnapshot) => void) | undefined;
  physicsWorld: () => ShopPhysicsWorld;
  pointerLocked: () => boolean;
  posters: () => PosterSystem;
  propPlacementDistance: () => number;
  propPlacementSnapping: () => boolean;
  shelfPresentation: () => ShelfPresentation;
  shelfTargetSelection: () => ShelfTargetSelection | undefined;
  shelfTargeted: () => boolean;
  shelveAnimation: () => ShelveAnimation | undefined;
  signs: () => ShopSignSystem;
  spawnablePropAssets: () => readonly SpawnablePropAsset[];
  targetedArcadeCabinet: () => ShopArcadeCabinet | undefined;
  targetedProp: () => MovablePropRecord | undefined;
  targetedTelevision: () => ShopTelevision | undefined;
  televisionProps: () => ReadonlyMap<ShopTelevision, MovablePropRecord>;
  televisionTargeted: () => boolean;
  throwChargeActive: () => boolean;
  throwChargeProgress: () => number;
  trashTargeted: () => boolean;
  tvVideos: () => TvVideoImporter;
};

const countTaskBooks = (
  booksById: ReadonlyMap<string, BookRecord>,
  discardedPublicationIds: ReadonlySet<string>,
) => {
  let taskBookCount = 0;
  let shelvedCount = 0;
  for (const [publicationId, record] of booksById) {
    if (discardedPublicationIds.has(publicationId) || !record.taskBook)
      continue;
    taskBookCount += 1;
    if (record.state.status === "shelved") shelvedCount += 1;
  }
  return {looseCount: taskBookCount - shelvedCount, shelvedCount};
};

/** Emits deduped UI snapshots whenever the scene asks. */
export class GameStateEmitter {
  #lastSignature = "";

  emit(inp: GameSnapshotInput): void {
    const activeArcadeCabinet = inp.activeArcadeCabinet();
    const arcadeProps = inp.arcadeProps();
    const arcadeStatusForUi = inp.arcadeStatusForUi();
    const arcadeSystemIdForUi = inp.arcadeSystemIdForUi();
    const artFrames = inp.artFrames();
    const booksById = inp.booksById();
    const carriedProp = inp.carriedProp();
    const carriedPublicationId = inp.carriedPublicationId();
    const carriedPublicationIds = inp.carriedPublicationIds();
    const discardBusy = inp.discardBusy();
    const discardError = inp.discardError();
    const discardedPublicationIds = inp.discardedPublicationIds();
    const getShortcuts = inp.getShortcuts();
    const hoveredPublicationId = inp.hoveredPublicationId();
    const input = inp.input();
    const inspectionCloseAction = inp.inspectionCloseAction();
    const inspectionMode = inp.inspectionMode();
    const inspectionOpenAngleTarget = inp.inspectionOpenAngleTarget();
    const inspectionPageIndex = inp.inspectionPageIndex();
    const inspectionPageLoadCount = inp.inspectionPageLoadCount();
    const keyboardLayout = inp.keyboardLayout();
    const modelImportError = inp.modelImportError();
    const modelAnimationLabel = inp.modelAnimationLabel;
    const modelPlacement = inp.modelPlacement();
    const physicsWorld = inp.physicsWorld();
    const pointerLocked = inp.pointerLocked();
    const posters = inp.posters();
    const propPlacementDistance = inp.propPlacementDistance();
    const propPlacementSnapping = inp.propPlacementSnapping();
    const shelfPresentation = inp.shelfPresentation();
    const shelfTargetSelection = inp.shelfTargetSelection();
    const shelfTargeted = inp.shelfTargeted();
    const shelveAnimation = inp.shelveAnimation();
    const signs = inp.signs();
    const spawnablePropAssets = inp.spawnablePropAssets();
    const targetedArcadeCabinet = inp.targetedArcadeCabinet();
    const targetedProp = inp.targetedProp();
    const targetedTelevision = inp.targetedTelevision();
    const televisionProps = inp.televisionProps();
    const televisionTargeted = inp.televisionTargeted();
    const throwChargeActive = inp.throwChargeActive();
    const throwChargeProgress = inp.throwChargeProgress();
    const trashTargeted = inp.trashTargeted();
    const tvVideos = inp.tvVideos();
    const onStateChange = inp.onGameStateChange();
    if (!onStateChange) return;
    const {looseCount, shelvedCount} = countTaskBooks(
      booksById,
      discardedPublicationIds,
    );
    const carriedRecord = carriedPublicationId
      ? booksById.get(carriedPublicationId)
      : undefined;
    const inspectionPublication = inp.inspectionPublication();
    const inspectionWidePages = inspectionPublication
      ? getWideReaderPageIndices(inspectionPublication.pages)
      : undefined;
    const hoveredRecord = hoveredPublicationId
      ? booksById.get(hoveredPublicationId)
      : undefined;
    const interactionView = resolveShopInteractionView({
      activeArcadeCabinet,
      arcadeProps,
      arcadeStatusForUi,
      artFrames,
      carriedProp,
      carriedPublicationId,
      carriedPublicationIds,
      carriedRecord,
      discardBusy,
      discardError,
      hoveredRecord,
      inspectionCloseAction,
      inspectionMode,
      inspectionOpenAngleTarget,
      inspectionPublication,
      modelAnimationLabel,
      modelPlacement,
      pointerLocked,
      posters,
      propPlacementDistance,
      propPlacementSnapping,
      shelfPresentation,
      shelfTargetSelection,
      shelfTargeted,
      shelveAnimation,
      signs,
      spawnablePropAssets,
      targetedArcadeCabinet,
      targetedProp,
      targetedTelevision,
      televisionProps,
      televisionTargeted,
      throwChargeActive,
      throwChargeProgress,
      trashTargeted,
    });

    let interactionContext = interactionView.context;
    let interactions = interactionView.interactions;
    const prompt = interactionView.prompt;

    // Interaction affordances exist only while an owning surface holds
    // input; every other mode drops rows and context before they reach any
    // consumer, keeping snapshots consistent with the viewport's gate.
    const activeMode = inp.mode()?.();
    if (activeMode !== undefined && !INTERACTION_ROW_MODES.has(activeMode)) {
      interactionContext = undefined;
      interactions = [];
    }

    const displayedInteractions = formatDisplayedInteractions({
      interactions,
      keyboardLayout,
      padStyle: input.gamepad.connected ? input.gamepad.style : undefined,
      shortcutsConfig: getShortcuts,
    });
    const snapshot = createShopGameSnapshot({
      activeArcadeCabinet,
      arcadeStatus: arcadeStatusForUi,
      arcadeSystemId: arcadeSystemIdForUi,
      artFrameImportError: artFrames.importError,
      artFrameImporting: artFrames.importCount > 0,
      artFramePlacement: artFrames.placement !== undefined,
      carriedBookCount: carriedPublicationIds.length,
      carriedPublicationId,
      discardBusy,
      discardError,
      digitalArtFrameCount: artFrames.records.size,
      inspectionMode,
      inspectionOpenAngleTarget,
      inspectionPageIndex,
      inspectionPageLoadCount,
      inspectionPublication,
      inspectionWidePages,
      interactionContext,
      interactions: displayedInteractions,
      looseCount,
      modelCount: spawnablePropAssets.length,
      modelImportError,
      modelPlacement: modelPlacement !== undefined,
      physicsReady: physicsWorld.isReady,
      pointerLocked,
      posterCount: posters.assets.length,
      posterImportError: posters.importError,
      posterImporting: posters.importCount > 0,
      posterPlacement: posters.placement !== undefined,
      prompt,
      shelvedCount,
      throwChargeActive,
      throwChargeProgress,
      tvVideoImportError: tvVideos.error,
      tvVideoImporting: tvVideos.count > 0,
      tvVideoImportMessage: tvVideos.message,
    });
    const signature = JSON.stringify(snapshot);
    if (signature === this.#lastSignature) return;
    this.#lastSignature = signature;
    onStateChange(snapshot);
  }
}
