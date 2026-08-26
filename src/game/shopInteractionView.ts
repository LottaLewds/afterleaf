import {MathUtils} from "three";

import type {CatalogItem} from "~/catalog";
import {findArcadeSystem} from "~/arcade/systems";
import type {ArcadeSessionStatus, ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import {MAX_CARRIED_BOOKS} from "~/game/worldSave";
import type {
  InspectionCloseAction,
  InspectionMode,
  ModelPlacementSession,
  MovablePropRecord,
  ShelfTargetSelection,
  ShopInteraction,
} from "~/game/shopTypes";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShelfPresentation} from "~/game/shelfPlacement";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {ShopTelevision} from "~/game/ShopTelevision";
import type {ShelveAnimation} from "~/game/bookCarryActions";
import type {SpawnablePropAsset} from "~/game/propTemplates";

export type ShopInteractionMode =
  | "arcade-session"
  | "arcade-target"
  | "art-frame"
  | "art-frame-placement"
  | "book"
  | "carried-book"
  | "carried-prop"
  | "inspection-closing"
  | "inspection-spread"
  | "model-placement"
  | "none"
  | "poster"
  | "poster-placement"
  | "prop"
  | "shelving"
  | "sign"
  | "television";

export type InteractionUiState = {
  activeArcadeCabinet: ShopArcadeCabinet | undefined;
  arcadeProps: ReadonlyMap<ShopArcadeCabinet, MovablePropRecord>;
  arcadeStatusForUi: ArcadeSessionStatus | undefined;
  artFrames: ArtFrameSystem;
  carriedProp: MovablePropRecord | undefined;
  carriedPublicationId: string | undefined;
  carriedPublicationIds: readonly string[];
  carriedRecord: BookRecord | undefined;
  discardBusy: boolean;
  discardError: string | undefined;
  hoveredRecord: BookRecord | undefined;
  inspectionCloseAction: InspectionCloseAction | undefined;
  inspectionMode: InspectionMode;
  inspectionOpenAngleTarget: number;
  inspectionPublication: CatalogItem | undefined;
  modelAnimationLabel: (record: MovablePropRecord) => string;
  modelPlacement: ModelPlacementSession | undefined;
  pointerLocked: boolean;
  posters: PosterSystem;
  propPlacementDistance: number;
  propPlacementSnapping: boolean;
  shelfPresentation: ShelfPresentation;
  shelfTargetSelection: ShelfTargetSelection | undefined;
  shelfTargeted: boolean;
  shelveAnimation: ShelveAnimation | undefined;
  signs: ShopSignSystem;
  spawnablePropAssets: readonly SpawnablePropAsset[];
  targetedArcadeCabinet: ShopArcadeCabinet | undefined;
  targetedProp: MovablePropRecord | undefined;
  targetedTelevision: ShopTelevision | undefined;
  televisionProps: ReadonlyMap<ShopTelevision, MovablePropRecord>;
  televisionTargeted: boolean;
  throwChargeActive: boolean;
  throwChargeProgress: number;
  trashTargeted: boolean;
};

export type InteractionView = {
  context: string | undefined;
  mode: ShopInteractionMode;
  prompt: string | undefined;
  interactions: ShopInteraction[];
};

export const resolveShopInteractionMode = (state: InteractionUiState): ShopInteractionMode => {
  if (state.inspectionMode === "spread") return "inspection-spread";
  if (state.inspectionMode === "closing") return "inspection-closing";
  if (state.shelveAnimation) return "shelving";
  if (state.artFrames.placement) return "art-frame-placement";
  if (state.posters.placement) return "poster-placement";
  if (state.modelPlacement && !state.carriedProp) return "model-placement";
  if (state.carriedProp) return "carried-prop";
  if (state.carriedRecord) return "carried-book";
  if (state.arcadeStatusForUi === "playing") return "arcade-session";
  if (state.targetedArcadeCabinet) return "arcade-target";
  if (state.televisionTargeted) return "television";
  if (state.targetedProp) return "prop";
  if (state.signs.targetedKey !== undefined) return "sign";
  if (state.artFrames.targetedId) return "art-frame";
  if (state.posters.targetedId) return "poster";
  if (state.hoveredRecord) return "book";
  return "none";
};

const resolveInspectionPrompt = (state: InteractionUiState) => {
  if (state.inspectionMode === "closing")
    return state.inspectionCloseAction === "drop"
      ? "Closing book before dropping…"
      : state.inspectionCloseAction === "throw"
        ? "Closing book before throwing…"
        : "Closing book…";
  const shelfInspection = state.inspectionPublication?.id !== state.carriedPublicationId;
  const openInspectionKey = state.inspectionPublication?.direction === "RTL" ? "A" : "D";
  if (state.inspectionOpenAngleTarget > 0)
    return shelfInspection
      ? `Click the cover or press ${openInspectionKey} to open · R return to shelf`
      : `Click the cover or press ${openInspectionKey} to open · F throw · G drop · R return`;
  return shelfInspection
    ? "Click or drag a page · A/D turn pages · Wheel zooms · R return to shelf"
    : "Click or drag a page · A/D turn pages · Wheel zooms · F throw · G drop · R return";
};

const resolveArtFramePlacementPrompt = (state: InteractionUiState) => {
  const placement = state.artFrames.placement;
  if (!placement) return undefined;
  const asset = state.artFrames.assets[placement.assetIndex];
  if (!asset) return `Paste the first digital art image · N channel (${placement.channelId}) · T exit`;
  const size = state.artFrames.placementSelection?.height;
  const rotation = Math.round(MathUtils.radToDeg(placement.rotation));
  const sizePrompt = size ? ` (${size.toFixed(2)} m)` : "";
  const timerPrompt = placement.intervalSeconds === 0 ? "timer off" : `${placement.intervalSeconds}s timer`;
  return state.artFrames.placementSelection
    ? `Click to place ${asset.label} · Q/E channel · F/G image · Wheel resize${sizePrompt} · Shift+wheel rotate (${rotation}°) · R ${placement.fit} · I ${timerPrompt} · N channel (${placement.channelId}) · Paste image · T exit`
    : `Aim ${asset.label} at a wall or shelf end · Q/E channel · F/G image · Wheel resize · R ${placement.fit} · I ${timerPrompt} · N channel (${placement.channelId}) · Paste image · T exit`;
};

const resolvePosterPlacementPrompt = (state: InteractionUiState) => {
  const placement = state.posters.placement;
  if (!placement) return undefined;
  const asset = state.posters.assets[placement.assetIndex];
  if (!asset) return "Paste an image to add the first poster · T exit";
  const size = state.posters.placementSelection?.height;
  const sizePrompt = size ? ` (${size.toFixed(2)} m)` : "";
  const rotation = Math.round(MathUtils.radToDeg(placement.rotation));
  return state.posters.placementSelection
    ? `Click to place ${asset.label} · Q/E previous/next · Wheel resize${sizePrompt} · Shift+wheel rotate (${rotation}°) · Paste image · T exit`
    : `Aim ${asset.label} at a wall or shelf end · Q/E previous/next · Wheel resize · Shift+wheel rotate · Paste image · T exit`;
};

const resolveCarriedBookPrompt = (state: InteractionUiState) => {
  const record = state.carriedRecord;
  if (!record) return undefined;
  if (state.hoveredRecord && !state.discardBusy && !state.throwChargeActive)
    return `E pick up ${state.hoveredRecord.publicationTitle} · ${state.carriedPublicationIds.length}/${MAX_CARRIED_BOOKS} carried${state.carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
  if (state.throwChargeActive)
    return `Throw charged ${Math.round(state.throwChargeProgress * 100)}% · Release F to launch upstairs`;
  if (state.discardBusy) return `Discarding ${record.publicationTitle}…`;
  if (state.trashTargeted && state.discardError)
    return `Discard failed · E retry · Hold F charge throw · G keep ${record.publicationTitle}`;
  if (state.trashTargeted) return `E discard ${record.publicationTitle} · Hold F charge throw · G keep`;
  if (state.shelfTargeted)
    return `E shelve ${state.shelfTargetSelection?.presentation ?? state.shelfPresentation}-out · Q switch shelf presentation · Hold F charge throw · G drop · R inspect${state.carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
  return `Q ${state.shelfPresentation}-out · Aim at a shelf · Hold F charge throw · G drop · R inspect${state.carriedPublicationIds.length > 1 ? " · Wheel cycle books" : ""}`;
};

const resolveCarriedPropPrompt = (state: InteractionUiState) => {
  const prop = state.carriedProp;
  if (!prop) return undefined;
  const scalePrompt = prop.modelScale === undefined ? "" : ` · Shift+wheel scale (${prop.modelScale.toFixed(2)}×)`;
  const selectionPrompt = state.modelPlacement
    ? " · Q/E previous/next"
    : ` · Q grid snap ${state.propPlacementSnapping ? "on" : "off"}`;
  return `Click/E place ${prop.label} · T cancel · G drop · F throw · Wheel project (${state.propPlacementDistance.toFixed(1)} m) · Ctrl+wheel rotate${scalePrompt}${selectionPrompt}`;
};

const resolveArcadeTargetPrompt = (state: InteractionUiState) => {
  const cabinet = state.targetedArcadeCabinet;
  if (!cabinet) return undefined;
  const cabinetProp = state.arcadeProps.get(cabinet);
  const lockPrompt = cabinetProp?.locked ? "L unlock" : "L lock";
  if (cabinet.sessionStatus === "playing") {
    const romLabel = cabinet.sessionRomName?.replace(/\.[^.]+$/u, "") ?? "the game";
    return `E resume ${romLabel} · T move cabinet · ${lockPrompt}`;
  }
  if (cabinet.sessionStatus === undefined) return `E play the arcade · T move cabinet · ${lockPrompt}`;
  return undefined;
};

const resolveTelevisionPrompt = (state: InteractionUiState) => {
  const television = state.targetedTelevision;
  const televisionProp = television ? state.televisionProps.get(television) : undefined;
  const prompts = [
    television?.prompt,
    television ? "Paste video URL · N new channel" : undefined,
    televisionProp ? (televisionProp.locked ? "L unlock" : "L lock") : undefined,
    televisionProp?.spawned ? "Del remove" : undefined,
  ];
  return prompts.filter((prompt): prompt is string => Boolean(prompt)).join(" · ");
};

const resolvePropPrompt = (state: InteractionUiState) => {
  const prop = state.targetedProp;
  if (!prop) return undefined;
  const animationLabel = state.modelAnimationLabel(prop);
  return `T project ${prop.label} for placement${animationLabel ? ` · Q/E animation (${animationLabel})` : ""}${prop.locked ? " · L unlock" : " · L lock"}${prop.spawned ? " · Del remove" : ""}`;
};

const resolveArtFramePrompt = (state: InteractionUiState) => {
  const frame = state.artFrames.targetedId ? state.artFrames.records.get(state.artFrames.targetedId)?.frame : undefined;
  const interval = frame?.intervalSeconds() ?? 0;
  const pendingChannel = state.artFrames.targetImportChannel;
  const pasteChannel =
    pendingChannel !== undefined && pendingChannel.frameId === state.artFrames.targetedId
      ? pendingChannel.channelId
      : (frame?.channelLabel() ?? "unavailable");
  return `Paste → ${pasteChannel} · N new channel · T move · Del remove · Q/E channel · F shuffle · R ${frame?.fit() ?? "contain"} · I ${interval === 0 ? "timer off" : `${interval}s timer`}`;
};

const resolvePosterPrompt = (state: InteractionUiState) => {
  const poster = state.posters.targetedId ? state.posters.records.get(state.posters.targetedId) : undefined;
  return `T move ${poster?.asset.label ?? "poster"} · Del remove`;
};

const resolveBookPrompt = (state: InteractionUiState) => {
  if (state.hoveredRecord?.state.status === "shelved")
    return `Hold F + wheel browse · E pick up ${state.hoveredRecord.publicationTitle} · R read in place`;
  return state.hoveredRecord ? `E pick up ${state.hoveredRecord.publicationTitle} · then R inspect` : undefined;
};

const promptResolvers: Record<ShopInteractionMode, (state: InteractionUiState) => string | undefined> = {
  "arcade-session": (state) =>
    state.targetedArcadeCabinet?.sessionStatus === "playing" ? resolveArcadeTargetPrompt(state) : undefined,
  "arcade-target": resolveArcadeTargetPrompt,
  "art-frame": resolveArtFramePrompt,
  "art-frame-placement": resolveArtFramePlacementPrompt,
  book: resolveBookPrompt,
  "carried-book": resolveCarriedBookPrompt,
  "carried-prop": resolveCarriedPropPrompt,
  "inspection-closing": resolveInspectionPrompt,
  "inspection-spread": resolveInspectionPrompt,
  "model-placement": (state) =>
    `Loading ${state.spawnablePropAssets[state.modelPlacement?.assetIndex ?? -1]?.label ?? "prop"}… · Q/E previous/next · T cancel`,
  none: () => undefined,
  poster: resolvePosterPrompt,
  "poster-placement": resolvePosterPlacementPrompt,
  prop: resolvePropPrompt,
  shelving: () => "Shelving book…",
  sign: (state) => `E customize ${state.signs.slots.get(state.signs.targetedKey ?? "")?.label ?? "shop sign"}`,
  television: resolveTelevisionPrompt,
};

const resolvePrompt = (mode: ShopInteractionMode, state: InteractionUiState): string | undefined =>
  promptResolvers[mode](state);

const inspectionInteractions = (state: InteractionUiState): ShopInteraction[] => {
  const shelfInspection = state.inspectionPublication?.id !== state.carriedPublicationId;
  return [
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
          {key: "G", label: "Drop book", actions: ["inspectionDrop"] as const},
          {
            key: "R",
            label: "Return to hand",
            actions: ["inspectionReturn"] as const,
          },
        ]),
  ];
};

const carriedBookInteractions = (state: InteractionUiState): ShopInteraction[] => {
  const interactions: ShopInteraction[] = [
    ...(state.hoveredRecord ? [{key: "E", label: "Pick up book", actions: ["interact"] as const}] : []),
    {key: "F", label: "Throw book", actions: ["throw"] as const},
    {key: "G", label: "Drop book", actions: ["drop"] as const},
    {key: "R", label: "Inspect book", actions: ["inspectionReturn"] as const},
    {
      key: "Q",
      label: "Switch shelf presentation",
      actions: ["toggleShelfPresentation"] as const,
    },
  ];
  if (state.carriedPublicationIds.length > 1) interactions.push({key: "Wheel", label: "Cycle carried books"});
  if (state.shelfTargeted) interactions.push({key: "Hold F + Wheel", label: "Browse shelf"});
  if (state.shelfTargeted)
    interactions.unshift({
      key: "E",
      label: "Shelve book",
      actions: ["interact"] as const,
    });
  if (state.trashTargeted)
    interactions.unshift({
      key: "E",
      label: "Discard book",
      actions: ["interact"] as const,
    });
  return interactions;
};

const arcadeTargetInteractions = (state: InteractionUiState): ShopInteraction[] => {
  const cabinet = state.targetedArcadeCabinet;
  if (!cabinet) return [];
  const cabinetProp = state.arcadeProps.get(cabinet);
  const propRows: ShopInteraction[] = [
    {key: "T", label: "Move cabinet", actions: ["pickUpCancel"] as const},
    {
      key: "L",
      label: cabinetProp?.locked ? "Unlock cabinet" : "Lock cabinet",
      actions: ["propPinToggle"] as const,
    },
    ...(cabinetProp?.spawned ? [{key: "Del", label: "Remove", actions: ["removeTargeted"] as const}] : []),
  ];
  if (cabinet.sessionStatus === "playing")
    return [
      {key: "E", label: "Resume the game", actions: ["interact"] as const},
      {key: "Ctrl + Wheel", label: `Volume: ${cabinet.arcadeVolumePercent}%`},
      ...propRows,
    ];
  if (cabinet.sessionStatus) return [{key: "Esc", label: "Back out"}];
  return [{key: "E", label: "Play the arcade", actions: ["interact"] as const}, ...propRows];
};

type InteractionResult = {
  context: string | undefined;
  interactions: ShopInteraction[];
};

const noInteractions = (): InteractionResult => ({
  context: undefined,
  interactions: [],
});

const artFramePlacementInteractions = (state: InteractionUiState): InteractionResult => {
  const placement = state.artFrames.placement;
  if (!placement) return noInteractions();
  return {
    context: placement.channelId,
    interactions: [
      {key: "Click", label: "Place frame", actions: ["interact"] as const},
      {
        key: "Q / E",
        label: "Previous / next channel",
        actions: ["placementCycleChannelLeft", "placementCycleChannelRight"] as const,
      },
      {
        key: "F / G",
        label: "Previous / next image",
        actions: ["placementCycleImageLeft", "placementCycleImageRight"] as const,
      },
      {
        key: "R",
        label: `Fit: ${placement.fit}`,
        actions: ["placementToggleFit"] as const,
      },
      {
        key: "I",
        label: `Timing: ${placement.intervalSeconds === 0 ? "Off" : `${placement.intervalSeconds}s`}`,
        actions: ["placementToggleInterval"] as const,
      },
      {key: "N", label: "New channel", actions: ["channelEditorOpen"] as const},
      {key: "T", label: "Cancel placement", actions: ["pickUpCancel"] as const},
      {
        key: "V",
        label: "Cancel placement",
        actions: ["toggleArtFramePlacement"] as const,
      },
      {
        key: "X",
        label: `Grid snap: ${placement.gridSnap ? "On" : "Off"}`,
        actions: ["placementToggleGridSnap"] as const,
      },
      {key: "Wheel", label: "Resize"},
      {key: "Shift + Wheel", label: "Rotate"},
    ],
  };
};

const posterPlacementInteractions = (state: InteractionUiState): InteractionResult => {
  const placement = state.posters.placement;
  if (!placement) return noInteractions();
  return {
    context: undefined,
    interactions: [
      {key: "Click", label: "Place poster", actions: ["interact"] as const},
      {
        key: "Q / E",
        label: "Change image",
        actions: ["placementCycleLeft", "placementCycleRight"] as const,
      },
      {key: "T", label: "Cancel placement", actions: ["pickUpCancel"] as const},
      {
        key: "X",
        label: `Grid snap: ${placement.gridSnap ? "On" : "Off"}`,
        actions: ["placementToggleGridSnap"] as const,
      },
      {key: "Wheel", label: "Resize"},
      {key: "Shift + Wheel", label: "Rotate"},
    ],
  };
};

const modelPlacementInteractions = (state: InteractionUiState): InteractionResult => ({
  context: state.spawnablePropAssets[state.modelPlacement?.assetIndex ?? -1]?.label,
  interactions: [
    {
      key: "Q / E",
      label: "Previous / next prop",
      actions: ["placementCycleLeft", "placementCycleRight"] as const,
    },
    {key: "T", label: "Cancel placement", actions: ["pickUpCancel"] as const},
  ],
});

const carriedPropInteractions = (state: InteractionUiState): InteractionResult => {
  const prop = state.carriedProp;
  if (!prop) return noInteractions();
  return {
    context: prop.spawned ? prop.label : undefined,
    interactions: [
      {
        key: "Click / E",
        label: "Place prop",
        actions: ["interact", "interact"] as const,
      },
      {key: "G", label: "Drop prop", actions: ["drop"] as const},
      {key: "T", label: "Cancel placement", actions: ["pickUpCancel"] as const},
      {key: "F", label: "Throw prop", actions: ["throw"] as const},
      ...(state.modelPlacement
        ? [
            {
              key: "Q / E",
              label: "Previous / next prop",
              actions: ["propCycleAnimationLeft", "propCycleAnimationRight"] as const,
            },
          ]
        : [
            {
              key: "Q",
              label: `Grid snap: ${state.propPlacementSnapping ? "On" : "Off"}`,
              actions: ["propToggleSnap"] as const,
            },
          ]),
      {key: "Wheel", label: "Adjust distance"},
      {key: "Ctrl + Wheel", label: "Rotate prop"},
      ...(prop.modelBaseSize ? [{key: "Shift + Wheel", label: "Scale prop"}] : []),
    ],
  };
};

const arcadeSessionInteractions = (state: InteractionUiState): InteractionResult => {
  // The emulator owns the keyboard; surface its control layout in the
  // standard interactions panel. An attached session wins over targeting.
  const system = findArcadeSystem(state.activeArcadeCabinet?.sessionSystemId ?? "");
  return {
    context: state.activeArcadeCabinet?.sessionRomName,
    interactions: [
      ...(system?.controlHints.map((hint) => ({
        key: hint.keys,
        label: hint.action,
      })) ?? []),
      {
        key: "Ctrl + Wheel",
        label: `Volume: ${state.activeArcadeCabinet?.arcadeVolumePercent ?? 100}%`,
      },
      {key: "P", label: "Pick game"},
      {key: "R", label: "Step away"},
    ],
  };
};

const arcadeTargetInteractionsWithContext = (state: InteractionUiState): InteractionResult => {
  const cabinet = state.targetedArcadeCabinet;
  return {
    context: cabinet
      ? cabinet.sessionStatus
        ? `Arcade · ${cabinet.sessionRomName ?? "cabinet"}`
        : "Arcade cabinet"
      : undefined,
    interactions: arcadeTargetInteractions(state),
  };
};

const televisionInteractions = (state: InteractionUiState): InteractionResult => {
  const television = state.targetedTelevision;
  const televisionProp = television ? state.televisionProps.get(television) : undefined;
  return {
    context:
      television?.selectedChannelLabel() ??
      television?.selectedChannelId() ??
      (television ? "Afterleaf TV" : undefined),
    interactions: [
      {
        key: "E",
        label: television?.powered() ? "Next channel" : "Turn on",
        actions: ["interact"] as const,
      },
      {key: "T", label: "Move TV", actions: ["pickUpCancel"] as const},
      {
        key: "L",
        label: televisionProp?.locked ? "Unlock TV" : "Lock TV",
        actions: ["propPinToggle"] as const,
      },
      {
        key: "Q",
        label: "Previous channel",
        actions: ["tvPreviousChannel"] as const,
      },
      {key: "F", label: "Skip", actions: ["throw"] as const},
      {key: "N", label: "New channel", actions: ["channelEditorOpen"] as const},
      {
        key: "M",
        label: `Mute (${television?.volumePercent() ?? 0}%)`,
        actions: ["tvMute"] as const,
      },
      {key: "Wheel", label: "Scrub video"},
      {
        key: "Ctrl + Wheel",
        label: `Volume: ${television?.volumePercent() ?? 0}%`,
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
    ],
  };
};

const propInteractions = (state: InteractionUiState): InteractionResult => {
  const prop = state.targetedProp;
  if (!prop) return noInteractions();
  const animationLabel = state.modelAnimationLabel(prop);
  return {
    context: animationLabel ? `${prop.label} · ${animationLabel}` : prop.label,
    interactions: [
      {key: "T", label: "Move prop", actions: ["pickUpCancel"] as const},
      {
        key: "L",
        label: prop.locked ? "Unlock prop" : "Lock prop",
        actions: ["propPinToggle"] as const,
      },
      ...(animationLabel
        ? [
            {
              key: "Q / E",
              label: "Previous / next animation",
              actions: ["propCycleAnimationLeft", "propCycleAnimationRight"] as const,
            },
          ]
        : []),
      ...(prop.spawned
        ? [
            {
              key: "Del",
              label: "Remove prop",
              actions: ["removeTargeted"] as const,
            },
          ]
        : []),
    ],
  };
};

const posterInteractions = (): InteractionResult => ({
  context: undefined,
  interactions: [
    {key: "T", label: "Move poster", actions: ["pickUpCancel"] as const},
    {key: "Del", label: "Remove poster", actions: ["removeTargeted"] as const},
  ],
});

const artFrameInteractions = (state: InteractionUiState): InteractionResult => {
  const frame = state.artFrames.targetedId ? state.artFrames.records.get(state.artFrames.targetedId)?.frame : undefined;
  const interval = frame?.intervalSeconds() ?? 0;
  return {
    context: frame?.channelLabel(),
    interactions: [
      {key: "T", label: "Move frame", actions: ["pickUpCancel"] as const},
      {key: "Del", label: "Remove frame", actions: ["removeTargeted"] as const},
      {
        key: "Q / E",
        label: "Previous / next channel",
        actions: ["artFramePreviousChannel", "artFrameNextChannel"] as const,
      },
      {key: "F", label: "Next image", actions: ["throw"] as const},
      {
        key: "I",
        label: `Timing: ${interval === 0 ? "Off" : `${interval}s`}`,
        actions: ["artFrameInterval"] as const,
      },
      {
        key: "R",
        label: `Fit: ${frame?.fit() ?? "contain"}`,
        actions: ["artFrameFit"] as const,
      },
      {key: "N", label: "New channel", actions: ["channelEditorOpen"] as const},
    ],
  };
};

const signInteractions = (): InteractionResult => ({
  context: undefined,
  interactions: [{key: "E", label: "Customize sign", actions: ["interact"] as const}],
});

const bookInteractions = (state: InteractionUiState): InteractionResult => ({
  context: undefined,
  interactions:
    state.hoveredRecord?.state.status === "shelved"
      ? [
          {key: "E", label: "Pick up book", actions: ["interact"] as const},
          {
            key: "R",
            label: "Read book",
            actions: ["inspectionReturn"] as const,
          },
          {key: "Hold F + Wheel", label: "Browse shelf"},
        ]
      : state.hoveredRecord
        ? [{key: "E", label: "Pick up book", actions: ["interact"] as const}]
        : [],
});

const defaultInteractions = (state: InteractionUiState): InteractionResult => ({
  context: undefined,
  interactions: state.pointerLocked
    ? [
        {
          key: "M",
          label: "Movable props",
          actions: ["toggleModelPlacement"] as const,
        },
        {
          key: "P",
          label: "Posters",
          actions: ["togglePosterPlacement"] as const,
        },
        {
          key: "V",
          label: "Digital art frames",
          actions: ["toggleArtFramePlacement"] as const,
        },
        {key: "Space", label: "Jump", actions: ["jump"] as const},
      ]
    : [],
});

const interactionResolvers: Record<ShopInteractionMode, (state: InteractionUiState) => InteractionResult> = {
  "arcade-session": arcadeSessionInteractions,
  "arcade-target": arcadeTargetInteractionsWithContext,
  "art-frame": artFrameInteractions,
  "art-frame-placement": artFramePlacementInteractions,
  book: bookInteractions,
  "carried-book": (state) => ({
    context: undefined,
    interactions: carriedBookInteractions(state),
  }),
  "carried-prop": carriedPropInteractions,
  "inspection-closing": noInteractions,
  "inspection-spread": (state) => ({
    context: undefined,
    interactions: inspectionInteractions(state),
  }),
  "model-placement": modelPlacementInteractions,
  none: defaultInteractions,
  poster: posterInteractions,
  "poster-placement": posterPlacementInteractions,
  prop: propInteractions,
  shelving: noInteractions,
  sign: signInteractions,
  television: televisionInteractions,
};

const resolveInteractions = (mode: ShopInteractionMode, state: InteractionUiState): InteractionResult =>
  interactionResolvers[mode](state);

export const resolveShopInteractionView = (state: InteractionUiState): InteractionView => {
  const mode = resolveShopInteractionMode(state);
  const {context, interactions} = resolveInteractions(mode, state);
  return {context, interactions, mode, prompt: resolvePrompt(mode, state)};
};
