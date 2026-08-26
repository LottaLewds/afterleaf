import type {ShopGameSnapshot} from "~/game/ShopScene";
import {
  ShopArcadeCabinet,
  type ArcadeSessionStatus,
} from "~/game/ShopArcadeCabinet";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import type {CatalogItem} from "~/catalog";
import {getAdjacentSpreadStart} from "~/reader/pagination";
import {getWideReaderPageIndices} from "~/reader/pageSpreadDetection";
import {MathUtils} from "three";
import {DEV} from "solid-js";
import {MAX_CARRIED_BOOKS} from "~/game/worldSave";
import {findArcadeSystem} from "~/arcade/systems";
import {formatKeyboardCode} from "~/game/input/bindings";
import {
  buildInteractionPrompts,
  formatInteractionRowKey,
} from "~/game/input/hints";
import {formatInteractionKey} from "~/game/keyboardLayout";
import type {ShopInteraction} from "~/game/ShopScene";
import type {ShortcutsConfig} from "~/game/input/bindings";
import type {InputManager} from "~/game/input/inputManager";
import type {ShelfPresentation} from "~/game/shelfPlacement";
import type {
  InspectionCloseAction,
  InspectionMode,
  ModelPlacementSession,
  MovablePropRecord,
  ShelfTargetSelection,
} from "~/game/ShopScene";
import type {ShelveAnimation} from "~/game/bookCarryActions";
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
    let taskBookCount = 0;
    let shelvedCount = 0;
    for (const [publicationId, record] of booksById) {
      if (discardedPublicationIds.has(publicationId)) continue;
      if (!record.taskBook) continue;
      taskBookCount += 1;
      if (record.state.status === "shelved") shelvedCount += 1;
    }
    const looseCount = taskBookCount - shelvedCount;
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
    let prompt: string | undefined;
    let interactionContext: string | undefined;
    let interactions: ShopInteraction[] = [];
    if (inspectionMode === "spread") {
      const shelfInspection =
        inspectionPublication?.id !== carriedPublicationId;
      const openInspectionKey =
        inspectionPublication?.direction === "RTL" ? "A" : "D";
      if (inspectionOpenAngleTarget > 0)
        prompt = shelfInspection
          ? `Click the cover or press ${openInspectionKey} to open · R return to shelf`
          : `Click the cover or press ${openInspectionKey} to open · F throw · G drop · R return`;
      else
        prompt = shelfInspection
          ? "Click or drag a page · A/D turn pages · Wheel zooms · R return to shelf"
          : "Click or drag a page · A/D turn pages · Wheel zooms · F throw · G drop · R return";
    } else if (inspectionMode === "closing")
      prompt =
        inspectionCloseAction === "drop"
          ? "Closing book before dropping…"
          : inspectionCloseAction === "throw"
            ? "Closing book before throwing…"
            : "Closing book…";
    else if (shelveAnimation) prompt = "Shelving book…";
    else if (artFrames.placement) {
      const asset = artFrames.assets[artFrames.placement.assetIndex];
      const size = artFrames.placementSelection?.height;
      const rotation = Math.round(
        MathUtils.radToDeg(artFrames.placement.rotation),
      );
      const interval = artFrames.placement.intervalSeconds;
      if (!asset)
        prompt = `Paste the first digital art image · N channel (${artFrames.placement.channelId}) · T exit`;
      else
        prompt = artFrames.placementSelection
          ? `Click to place ${asset.label} · Q/E channel · F/G image · Wheel resize${size ? ` (${size.toFixed(2)} m)` : ""} · Shift+wheel rotate (${rotation}°) · R ${artFrames.placement.fit} · I ${interval === 0 ? "timer off" : `${interval}s timer`} · N channel (${artFrames.placement.channelId}) · Paste image · T exit`
          : `Aim ${asset.label} at a wall or shelf end · Q/E channel · F/G image · Wheel resize · R ${artFrames.placement.fit} · I ${interval === 0 ? "timer off" : `${interval}s timer`} · N channel (${artFrames.placement.channelId}) · Paste image · T exit`;
    } else if (posters.placement) {
      const asset = posters.assets[posters.placement.assetIndex];
      const size = posters.placementSelection?.height;
      const rotation = Math.round(
        MathUtils.radToDeg(posters.placement.rotation),
      );
      if (!asset) prompt = "Paste an image to add the first poster · T exit";
      else
        prompt = posters.placementSelection
          ? `Click to place ${asset.label} · Q/E previous/next · Wheel resize${size ? ` (${size.toFixed(2)} m)` : ""} · Shift+wheel rotate (${rotation}°) · Paste image · T exit`
          : `Aim ${asset.label} at a wall or shelf end · Q/E previous/next · Wheel resize · Shift+wheel rotate · Paste image · T exit`;
    } else if (modelPlacement && !carriedProp) {
      const asset = spawnablePropAssets[modelPlacement.assetIndex];
      prompt = `Loading ${asset?.label ?? "prop"}… · Q/E previous/next · T cancel`;
    } else if (carriedProp) {
      const modelScale = carriedProp.modelScale;
      prompt = `Click/E place ${carriedProp.label} · T cancel · G drop · F throw · Wheel project (${propPlacementDistance.toFixed(1)} m) · Ctrl+wheel rotate${modelScale === undefined ? "" : ` · Shift+wheel scale (${modelScale.toFixed(2)}×)`}${modelPlacement ? " · Q/E previous/next" : ` · Q grid snap ${propPlacementSnapping ? "on" : "off"}`}`;
    } else if (
      carriedRecord &&
      hoveredRecord &&
      !discardBusy &&
      !throwChargeActive
    )
      prompt = `E pick up ${hoveredRecord.publicationTitle} · ${carriedPublicationIds.length}/${MAX_CARRIED_BOOKS} carried${carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
    else if (carriedRecord && throwChargeActive)
      prompt = `Throw charged ${Math.round(throwChargeProgress * 100)}% · Release F to launch upstairs`;
    else if (carriedRecord && discardBusy)
      prompt = `Discarding ${carriedRecord.publicationTitle}…`;
    else if (carriedRecord && trashTargeted && discardError)
      prompt = `Discard failed · E retry · Hold F charge throw · G keep ${carriedRecord.publicationTitle}`;
    else if (carriedRecord && trashTargeted)
      prompt = `E discard ${carriedRecord.publicationTitle} · Hold F charge throw · G keep`;
    else if (carriedRecord && shelfTargeted)
      prompt = `E shelve ${shelfTargetSelection?.presentation ?? shelfPresentation}-out · Q switch shelf presentation · Hold F charge throw · G drop · R inspect${carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
    else if (carriedRecord)
      prompt = `Q ${shelfPresentation}-out · Aim at a shelf · Hold F charge throw · G drop · R inspect${carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
    else if (
      targetedArcadeCabinet &&
      targetedArcadeCabinet.sessionStatus === "playing"
    ) {
      const cabinetProp = arcadeProps.get(targetedArcadeCabinet);
      const romLabel =
        targetedArcadeCabinet.sessionRomName?.replace(/\.[^.]+$/u, "") ??
        "the game";
      prompt = `E resume ${romLabel} · T move cabinet${cabinetProp?.locked ? " · L unlock" : " · L lock"}`;
    } else if (
      targetedArcadeCabinet &&
      targetedArcadeCabinet.sessionStatus === undefined
    ) {
      const cabinetProp = arcadeProps.get(targetedArcadeCabinet);
      prompt = `E play the arcade · T move cabinet${cabinetProp?.locked ? " · L unlock" : " · L lock"}`;
    } else if (televisionTargeted) {
      const televisionPrompt = targetedTelevision?.prompt;
      const televisionProp = targetedTelevision
        ? televisionProps.get(targetedTelevision)
        : undefined;
      const pastePrompt = targetedTelevision
        ? "Paste video URL · N new channel"
        : undefined;
      const removePrompt = televisionProp?.spawned ? "Del remove" : undefined;
      const lockPrompt = televisionProp
        ? televisionProp.locked
          ? "L unlock"
          : "L lock"
        : undefined;
      prompt = [televisionPrompt, pastePrompt, lockPrompt, removePrompt]
        .filter(Boolean)
        .join(" · ");
    } else if (targetedProp) {
      const animationLabel = modelAnimationLabel(targetedProp);
      prompt = `T project ${targetedProp.label} for placement${animationLabel ? ` · Q/E animation (${animationLabel})` : ""}${targetedProp.locked ? " · L unlock" : " · L lock"}${targetedProp.spawned ? " · Del remove" : ""}`;
    } else if (signs.targetedKey !== undefined)
      prompt = `E customize ${signs.slots.get(signs.targetedKey)?.label ?? "shop sign"}`;
    else if (artFrames.targetedId) {
      const frame = artFrames.records.get(artFrames.targetedId)?.frame;
      const interval = frame?.intervalSeconds() ?? 0;
      const pendingChannel = artFrames.targetImportChannel;
      const pasteChannel =
        pendingChannel?.frameId === artFrames.targetedId
          ? pendingChannel.channelId
          : (frame?.channelLabel() ?? "unavailable");
      prompt = `Paste → ${pasteChannel} · N new channel · T move · Del remove · Q/E channel · F shuffle · R ${frame?.fit() ?? "contain"} · I ${interval === 0 ? "timer off" : `${interval}s timer`}`;
    } else if (posters.targetedId) {
      const poster = posters.records.get(posters.targetedId);
      prompt = `T move ${poster?.asset.label ?? "poster"} · Del remove`;
    } else if (hoveredRecord)
      prompt =
        hoveredRecord.state.status === "shelved"
          ? `Hold F + wheel browse · E pick up ${hoveredRecord.publicationTitle} · R read in place`
          : `E pick up ${hoveredRecord.publicationTitle} · then R inspect`;

    if (inspectionMode === "spread") {
      const shelfInspection =
        inspectionPublication?.id !== carriedPublicationId;
      interactions = [
        {
          key: "A / D",
          label: "Turn page",
          actions: ["inspectionTurnLeft", "inspectionTurnRight"] as const,
        },
        {key: "Wheel", label: "Zoom"},
        ...(shelfInspection
          ? [
              {
                key: "R",
                label: "Return to shelf",
                actions: ["inspectionReturn"] as const,
              },
            ]
          : [
              {
                key: "F",
                label: "Throw book",
                actions: ["inspectionThrow"] as const,
              },
              {
                key: "G",
                label: "Drop book",
                actions: ["inspectionDrop"] as const,
              },
              {
                key: "R",
                label: "Return to hand",
                actions: ["inspectionReturn"] as const,
              },
            ]),
      ];
    } else if (shelveAnimation) interactions = [];
    else if (artFrames.placement) {
      interactionContext = artFrames.placement.channelId;
      interactions = [
        {key: "Click", label: "Place frame", actions: ["interact"]},
        {
          key: "Q / E",
          label: "Previous / next channel",
          actions: ["placementCycleChannelLeft", "placementCycleChannelRight"],
        },
        {
          key: "F / G",
          label: "Previous / next image",
          actions: ["placementCycleImageLeft", "placementCycleImageRight"],
        },
        {
          key: "R",
          label: `Fit: ${artFrames.placement.fit}`,
          actions: ["placementToggleFit"],
        },
        {
          key: "I",
          label: `Timing: ${artFrames.placement.intervalSeconds === 0 ? "Off" : `${artFrames.placement.intervalSeconds}s`}`,
          actions: ["placementToggleInterval"],
        },
        {key: "N", label: "New channel", actions: ["channelEditorOpen"]},
        {key: "T", label: "Cancel placement", actions: ["pickUpCancel"]},
        {
          key: "V",
          label: "Cancel placement",
          actions: ["toggleArtFramePlacement"],
        },
        {
          key: "X",
          label: `Grid snap: ${artFrames.placement.gridSnap ? "On" : "Off"}`,
          actions: ["placementToggleGridSnap"],
        },
        {key: "Wheel", label: "Resize"},
        {key: "Shift + Wheel", label: "Rotate"},
      ];
    } else if (posters.placement)
      interactions = [
        {key: "Click", label: "Place poster", actions: ["interact"]},
        {
          key: "Q / E",
          label: "Change image",
          actions: ["placementCycleLeft", "placementCycleRight"],
        },
        {key: "T", label: "Cancel placement", actions: ["pickUpCancel"]},
        {
          key: "X",
          label: `Grid snap: ${posters.placement.gridSnap ? "On" : "Off"}`,
          actions: ["placementToggleGridSnap"],
        },
        {key: "Wheel", label: "Resize"},
        {key: "Shift + Wheel", label: "Rotate"},
      ];
    else if (modelPlacement && !carriedProp) {
      interactionContext =
        spawnablePropAssets[modelPlacement.assetIndex]?.label;
      interactions = [
        {
          key: "Q / E",
          label: "Previous / next prop",
          actions: ["placementCycleLeft", "placementCycleRight"],
        },
        {key: "T", label: "Cancel placement", actions: ["pickUpCancel"]},
      ];
    } else if (carriedProp) {
      interactionContext = carriedProp.spawned ? carriedProp.label : undefined;
      interactions = [
        {
          key: "Click / E",
          label: "Place prop",
          actions: ["interact", "interact"] as const,
        },
        {key: "G", label: "Drop prop", actions: ["drop"] as const},
        {
          key: "T",
          label: "Cancel placement",
          actions: ["pickUpCancel"] as const,
        },
        {key: "F", label: "Throw prop", actions: ["throw"] as const},
        ...(modelPlacement
          ? [
              {
                key: "Q / E",
                label: "Previous / next prop",
                actions: [
                  "propCycleAnimationLeft",
                  "propCycleAnimationRight",
                ] as const,
              },
            ]
          : [
              {
                key: "Q",
                label: `Grid snap: ${propPlacementSnapping ? "On" : "Off"}`,
                actions: ["propToggleSnap"] as const,
              },
            ]),
        {key: "Wheel", label: "Adjust distance"},
        {key: "Ctrl + Wheel", label: "Rotate prop"},
        ...(carriedProp.modelBaseSize
          ? [{key: "Shift + Wheel", label: "Scale prop"}]
          : []),
      ];
    } else if (carriedRecord) {
      interactions = [
        ...(hoveredRecord
          ? [{key: "E", label: "Pick up book", actions: ["interact"] as const}]
          : []),
        {key: "F", label: "Throw book", actions: ["throw"] as const},
        {key: "G", label: "Drop book", actions: ["drop"] as const},
        {
          key: "R",
          label: "Inspect book",
          actions: ["inspectionReturn"] as const,
        },
        {
          key: "Q",
          label: "Switch shelf presentation",
          actions: ["toggleShelfPresentation"],
        },
      ];
      if (carriedPublicationIds.length > 1)
        interactions.push({key: "Wheel", label: "Cycle carried books"});
      if (shelfTargeted)
        interactions.push({key: "Hold F + Wheel", label: "Browse shelf"});
      if (shelfTargeted)
        interactions.unshift({
          key: "E",
          label: "Shelve book",
          actions: ["interact"],
        });
      if (trashTargeted)
        interactions.unshift({
          key: "E",
          label: "Discard book",
          actions: ["interact"],
        });
    } else if (arcadeStatusForUi === "playing") {
      // The emulator owns the keyboard; surface its control layout in the
      // standard interactions panel. Checked before targeting rows so an
      // attached session always swaps to these hints immediately — even
      // while the reticle still rests on its own cabinet — making a
      // reattach visibly take hold.
      const system = findArcadeSystem(
        activeArcadeCabinet?.sessionSystemId ?? "",
      );
      interactionContext = activeArcadeCabinet?.sessionRomName;
      interactions = [
        ...(system?.controlHints.map((hint) => ({
          key: hint.keys,
          label: hint.action,
        })) ?? []),
        {
          key: "Ctrl + Wheel",
          label: `Volume: ${activeArcadeCabinet?.arcadeVolumePercent ?? 100}%`,
        },
        {key: "P", label: "Pick game"},
        {key: "R", label: "Step away"},
      ];
    } else if (targetedArcadeCabinet) {
      const cabinet = targetedArcadeCabinet;
      const cabinetProp = arcadeProps.get(cabinet);
      const propRows: ShopInteraction[] = [
        {key: "T", label: "Move cabinet", actions: ["pickUpCancel"]},
        {
          key: "L",
          label: cabinetProp?.locked ? "Unlock cabinet" : "Lock cabinet",
          actions: ["propPinToggle"],
        },
        ...(cabinetProp?.spawned
          ? [
              {
                key: "Del",
                label: "Remove",
                actions: ["removeTargeted"] as const,
              },
            ]
          : []),
      ];
      if (cabinet.sessionStatus === "playing") {
        // A stepped-away game keeps emulating; targeting its cabinet offers
        // to take the controls back. Volume stays adjustable here too - the
        // positional audio keeps playing while stepped away.
        interactionContext = `Arcade · ${cabinet.sessionRomName ?? "cabinet"}`;
        interactions = [
          {
            key: "E",
            label: "Resume the game",
            actions: ["interact"] as const,
          },
          {
            key: "Ctrl + Wheel",
            label: `Volume: ${cabinet.arcadeVolumePercent}%`,
          },
          ...propRows,
        ];
      } else {
        interactionContext = cabinet.sessionStatus
          ? `Arcade · ${cabinet.sessionRomName ?? "cabinet"}`
          : "Arcade cabinet";
        interactions = cabinet.sessionStatus
          ? [{key: "Esc", label: "Back out"}]
          : [
              {
                key: "E",
                label: "Play the arcade",
                actions: ["interact"] as const,
              },
              ...propRows,
            ];
      }
    } else if (televisionTargeted) {
      const televisionProp = targetedTelevision
        ? televisionProps.get(targetedTelevision)
        : undefined;
      interactionContext =
        targetedTelevision?.selectedChannelLabel() ??
        targetedTelevision?.selectedChannelId() ??
        (targetedTelevision ? "Afterleaf TV" : undefined);
      interactions = [
        {
          key: "E",
          label: targetedTelevision?.powered() ? "Next channel" : "Turn on",
          actions: ["interact"],
        },
        {key: "T", label: "Move TV", actions: ["pickUpCancel"]},
        {
          key: "L",
          label: televisionProp?.locked ? "Unlock TV" : "Lock TV",
          actions: ["propPinToggle"],
        },
        {key: "Q", label: "Previous channel", actions: ["tvPreviousChannel"]},
        {key: "F", label: "Skip", actions: ["throw"]},
        {key: "N", label: "New channel", actions: ["channelEditorOpen"]},
        {
          key: "M",
          label: `Mute (${targetedTelevision?.volumePercent() ?? 0}%)`,
          actions: ["tvMute"],
        },
        {key: "Wheel", label: "Scrub video"},
        {
          key: "Ctrl + Wheel",
          label: `Volume: ${targetedTelevision?.volumePercent() ?? 0}%`,
        },
        ...(televisionProp?.spawned
          ? [
              {
                key: "Del",
                label: "Remove prop",
                actions: ["removeTargeted"] as const,
              },
            ]
          : []),
      ];
    } else if (targetedProp) {
      const animationLabel = modelAnimationLabel(targetedProp);
      interactionContext = animationLabel
        ? `${targetedProp.label} · ${animationLabel}`
        : targetedProp.label;
      interactions = [
        {key: "T", label: "Move prop", actions: ["pickUpCancel"]},
        {
          key: "L",
          label: targetedProp.locked ? "Unlock prop" : "Lock prop",
          actions: ["propPinToggle"],
        },
        ...(animationLabel
          ? [
              {
                key: "Q / E",
                label: "Previous / next animation",
                actions: [
                  "propCycleAnimationLeft",
                  "propCycleAnimationRight",
                ] as const,
              },
            ]
          : []),
        ...(targetedProp.spawned
          ? [
              {
                key: "Del",
                label: "Remove prop",
                actions: ["removeTargeted"] as const,
              },
            ]
          : []),
      ];
    } else if (posters.targetedId)
      interactions = [
        {key: "T", label: "Move poster", actions: ["pickUpCancel"]},
        {key: "Del", label: "Remove poster", actions: ["removeTargeted"]},
      ];
    else if (artFrames.targetedId) {
      const frame = artFrames.records.get(artFrames.targetedId)?.frame;
      const interval = frame?.intervalSeconds() ?? 0;
      interactionContext = frame?.channelLabel();
      interactions = [
        {key: "T", label: "Move frame", actions: ["pickUpCancel"]},
        {key: "Del", label: "Remove frame", actions: ["removeTargeted"]},
        {
          key: "Q / E",
          label: "Previous / next channel",
          actions: ["artFramePreviousChannel", "artFrameNextChannel"],
        },
        {key: "F", label: "Next image", actions: ["throw"]},
        {
          key: "I",
          label: `Timing: ${interval === 0 ? "Off" : `${interval}s`}`,
          actions: ["artFrameInterval"],
        },
        {
          key: "R",
          label: `Fit: ${frame?.fit() ?? "contain"}`,
          actions: ["artFrameFit"],
        },
        {key: "N", label: "New channel", actions: ["channelEditorOpen"]},
      ];
    } else if (signs.targetedKey !== undefined)
      interactions = [
        {key: "E", label: "Customize sign", actions: ["interact"]},
      ];
    else if (hoveredRecord)
      interactions =
        hoveredRecord.state.status === "shelved"
          ? [
              {
                key: "E",
                label: "Pick up book",
                actions: ["interact"] as const,
              },
              {
                key: "R",
                label: "Read book",
                actions: ["inspectionReturn"] as const,
              },
              {key: "Hold F + Wheel", label: "Browse shelf"},
            ]
          : [{key: "E", label: "Pick up book", actions: ["interact"] as const}];

    if (
      interactions.length === 0 &&
      pointerLocked &&
      inspectionMode === "none" &&
      !shelveAnimation
    )
      interactions = [
        {key: "M", label: "Movable props", actions: ["toggleModelPlacement"]},
        {key: "P", label: "Posters", actions: ["togglePosterPlacement"]},
        {
          key: "V",
          label: "Digital art frames",
          actions: ["toggleArtFramePlacement"],
        },
        {key: "Space", label: "Jump", actions: ["jump"]},
      ];

    // Interaction affordances exist only while an owning surface holds
    // input; every other mode drops rows and context before they reach any
    // consumer, keeping snapshots consistent with the viewport's gate.
    const activeMode = inp.mode()?.();
    if (activeMode !== undefined && !INTERACTION_ROW_MODES.has(activeMode)) {
      interactionContext = undefined;
      interactions = [];
    }

    const padStyle = input.gamepad.connected ? input.gamepad.style : undefined;
    const shortcutsConfig = getShortcuts;
    // Keyboard labels come from the live bindings (layout-aware) so hints
    // track rebinds; rows without action refs keep their literal strings.
    const resolveKeyboardLabel = (code: string): string => {
      const layoutLabel = keyboardLayout.get(code);
      return layoutLabel ? layoutLabel.toUpperCase() : formatKeyboardCode(code);
    };
    const displayedInteractions = interactions.map((interaction) => {
      // Dev guard: a plain-key hint without action refs means the row was
      // never wired to the bindings table and will never show pad glyphs.
      // Only single capital letters ("R", "Q / E") count - words like
      // "Wheel" or "Esc" are intentionally literal.
      if (
        DEV &&
        !interaction.actions &&
        /^[A-Z](?: \/ [A-Z])*$/u.test(interaction.key)
      )
        console.warn(
          `[afterleaf] Interaction row ${JSON.stringify(interaction.key)} (${interaction.label}) has no action refs; controller prompts will not render.`,
        );
      const row = {
        ...interaction,
        key:
          formatInteractionRowKey(
            interaction.actions,
            shortcutsConfig,
            resolveKeyboardLabel,
          ) ?? formatInteractionKey(interaction.key, keyboardLayout),
      };
      // Pad-active rows carry prompt tokens so the viewport can draw real
      // controller button icons; keyboard rows keep plain keycap strings.
      if (!padStyle) return row;
      const prompts = buildInteractionPrompts(
        row.key,
        interaction.actions,
        shortcutsConfig,
        padStyle,
      );
      return prompts ? {...row, prompts} : row;
    });
    // Read once so the conditional spread below gets a narrowed value.
    const arcadeStatus = arcadeStatusForUi;
    const arcadeSystemId = arcadeSystemIdForUi;
    const snapshot: ShopGameSnapshot = {
      ...(interactionContext ? {interactionContext} : {}),
      ...(displayedInteractions.length > 0
        ? {interactions: displayedInteractions}
        : {}),
      ...(carriedPublicationId
        ? {
            carriedBookCount: carriedPublicationIds.length,
            carriedPublicationId: carriedPublicationId,
          }
        : {}),
      discardBusy: discardBusy,
      ...(discardError ? {discardError: discardError} : {}),
      ...(inspectionMode === "spread" && inspectionPublication
        ? {
            inspectionBookOpen: inspectionOpenAngleTarget === 0,
            inspectionCanTurnBackward:
              getAdjacentSpreadStart(
                inspectionPageIndex,
                inspectionPublication.pages.length,
                "spread",
                "backward",
                inspectionWidePages,
              ) !== inspectionPageIndex,
            inspectionCanTurnForward:
              getAdjacentSpreadStart(
                inspectionPageIndex,
                inspectionPublication.pages.length,
                "spread",
                "forward",
                inspectionWidePages,
              ) !== inspectionPageIndex,
            inspectionPageCount: inspectionPublication.pages.length,
            inspectionPageIndex: inspectionPageIndex,
            inspectionPagesLoading: inspectionPageLoadCount > 0,
          }
        : {}),
      inspectionMode: inspectionMode,
      looseCount,
      modelCount: spawnablePropAssets.length,
      ...(modelImportError ? {modelImportError: modelImportError} : {}),
      ...(modelPlacement ? {modelPlacementActive: true} : {}),
      physicsReady: physicsWorld.isReady,
      pointerLocked: pointerLocked,
      digitalArtFrameCount: artFrames.records.size,
      ...(artFrames.importError
        ? {digitalArtFrameImportError: artFrames.importError}
        : {}),
      ...(artFrames.importCount > 0 ? {digitalArtFrameImporting: true} : {}),
      ...(artFrames.placement ? {digitalArtFramePlacementActive: true} : {}),
      posterCount: posters.assets.length,
      ...(posters.importError ? {posterImportError: posters.importError} : {}),
      ...(posters.importCount > 0 ? {posterImporting: true} : {}),
      ...(posters.placement ? {posterPlacementActive: true} : {}),
      ...(tvVideos.error ? {tvVideoImportError: tvVideos.error} : {}),
      ...(tvVideos.count > 0 ? {tvVideoImporting: true} : {}),
      ...(tvVideos.message ? {tvVideoImportMessage: tvVideos.message} : {}),
      ...(arcadeStatus
        ? {
            arcadeStatus,
            ...(activeArcadeCabinet
              ? {arcadeCabinetId: activeArcadeCabinet.id}
              : {}),
            ...(arcadeSystemId ? {arcadeSystemId} : {}),
            ...(activeArcadeCabinet?.sessionDetail
              ? {
                  arcadeDetail: activeArcadeCabinet.sessionDetail,
                }
              : {}),
            ...(activeArcadeCabinet?.sessionRomName
              ? {arcadeRomName: activeArcadeCabinet.sessionRomName}
              : {}),
          }
        : {}),
      ...(prompt ? {prompt} : {}),
      shelvedCount,
      ...(throwChargeActive ? {throwCharge: throwChargeProgress} : {}),
    };
    const signature = JSON.stringify(snapshot);
    if (signature === this.#lastSignature) return;
    this.#lastSignature = signature;
    onStateChange(snapshot);
  }
}
