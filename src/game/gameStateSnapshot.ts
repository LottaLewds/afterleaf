import {getAdjacentSpreadStart} from "~/reader/pagination";
import type {CatalogItem} from "~/catalog";
import {formatKeyboardCode, type GamepadStyle, type ShortcutsConfig} from "~/game/input/bindings";
import {buildInteractionPrompts, formatInteractionRowKey, type InteractionPromptToken} from "~/game/input/hints";
import {formatInteractionKey} from "~/game/keyboardLayout";
import type {ArcadeSessionStatus, ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {InspectionMode, ShopGameSnapshot, ShopInteraction} from "~/game/shopTypes";

type DisplayedInteraction = ShopInteraction & {
  prompts?: readonly InteractionPromptToken[];
};

type InteractionRowsInput = {
  interactions: readonly ShopInteraction[];
  keyboardLayout: ReadonlyMap<string, string>;
  padStyle: GamepadStyle | undefined;
  shortcutsConfig: ShortcutsConfig;
};

export const formatDisplayedInteractions = ({
  interactions,
  keyboardLayout,
  padStyle,
  shortcutsConfig,
}: InteractionRowsInput): DisplayedInteraction[] => {
  const resolveKeyboardLabel = (code: string): string => {
    const layoutLabel = keyboardLayout.get(code);
    return layoutLabel ? layoutLabel.toUpperCase() : formatKeyboardCode(code);
  };
  return interactions.map((interaction) => {
    // Dev guard: a plain-key hint without action refs means the row was
    // never wired to the bindings table and will never show pad glyphs.
    // Only single capital letters ("R", "Q / E") count - words like
    // "Wheel" or "Esc" are intentionally literal.
    if (import.meta.env.DEV && !interaction.actions && /^[A-Z](?: \/ [A-Z])*$/u.test(interaction.key))
      console.warn(
        `[afterleaf] Interaction row ${JSON.stringify(interaction.key)} (${interaction.label}) has no action refs; controller prompts will not render.`,
      );
    const row = {
      ...interaction,
      key:
        formatInteractionRowKey(interaction.actions, shortcutsConfig, resolveKeyboardLabel) ??
        formatInteractionKey(interaction.key, keyboardLayout),
    };
    // Pad-active rows carry prompt tokens so the viewport can draw real
    // controller button icons; keyboard rows keep plain keycap strings.
    if (!padStyle) return row;
    const prompts = buildInteractionPrompts(row.key, interaction.actions, shortcutsConfig, padStyle);
    return prompts ? {...row, prompts} : row;
  });
};

type SnapshotInput = {
  activeArcadeCabinet: ShopArcadeCabinet | undefined;
  arcadeStatus: ArcadeSessionStatus | undefined;
  arcadeSystemId: string | undefined;
  artFrameImportError: string | undefined;
  artFrameImporting: boolean;
  artFramePlacement: boolean;
  carriedBookCount: number;
  carriedPublicationId: string | undefined;
  discardBusy: boolean;
  discardError: string | undefined;
  digitalArtFrameCount: number;
  inspectionMode: InspectionMode;
  inspectionOpenAngleTarget: number;
  inspectionPageIndex: number;
  inspectionPageLoadCount: number;
  inspectionPublication: CatalogItem | undefined;
  inspectionWidePages: ReadonlySet<number> | undefined;
  interactionContext: string | undefined;
  interactions: readonly ShopInteraction[];
  looseCount: number;
  modelCount: number;
  modelImportError: string | undefined;
  modelPlacement: boolean;
  physicsReady: boolean;
  pointerLocked: boolean;
  posterCount: number;
  posterImportError: string | undefined;
  posterImporting: boolean;
  posterPlacement: boolean;
  prompt: string | undefined;
  shelvedCount: number;
  throwChargeActive: boolean;
  throwChargeProgress: number;
  tvVideoImportError: string | undefined;
  tvVideoImporting: boolean;
  tvVideoImportMessage: string | undefined;
};

const when = <T extends object>(condition: boolean, value: T): T | object => (condition ? value : {});

const whenDefined = <T>(value: T | undefined, create: (value: T) => object): object =>
  value === undefined ? {} : create(value);

const inspectionSnapshot = (input: SnapshotInput): Partial<ShopGameSnapshot> => {
  const publication = input.inspectionPublication;
  if (input.inspectionMode !== "spread" || !publication) return {};
  return {
    inspectionBookOpen: input.inspectionOpenAngleTarget === 0,
    inspectionCanTurnBackward:
      getAdjacentSpreadStart(
        input.inspectionPageIndex,
        publication.pages.length,
        "spread",
        "backward",
        input.inspectionWidePages,
      ) !== input.inspectionPageIndex,
    inspectionCanTurnForward:
      getAdjacentSpreadStart(
        input.inspectionPageIndex,
        publication.pages.length,
        "spread",
        "forward",
        input.inspectionWidePages,
      ) !== input.inspectionPageIndex,
    inspectionPageCount: publication.pages.length,
    inspectionPageIndex: input.inspectionPageIndex,
    inspectionPagesLoading: input.inspectionPageLoadCount > 0,
  };
};

const arcadeSnapshot = (input: SnapshotInput): Partial<ShopGameSnapshot> => {
  if (!input.arcadeStatus) return {};
  const cabinet = input.activeArcadeCabinet;
  return {
    arcadeStatus: input.arcadeStatus,
    ...whenDefined(cabinet, (activeCabinet) => ({arcadeCabinetId: activeCabinet.id})),
    ...whenDefined(input.arcadeSystemId, (arcadeSystemId) => ({
      arcadeSystemId,
    })),
    ...whenDefined(cabinet?.sessionDetail, (arcadeDetail) => ({
      arcadeDetail,
    })),
    ...whenDefined(cabinet?.sessionRomName, (arcadeRomName) => ({
      arcadeRomName,
    })),
  };
};

export const createShopGameSnapshot = (input: SnapshotInput): ShopGameSnapshot => ({
  ...whenDefined(input.interactionContext, (interactionContext) => ({
    interactionContext,
  })),
  ...when(input.interactions.length > 0, {interactions: input.interactions}),
  ...whenDefined(input.carriedPublicationId, (carriedPublicationId) => ({
    carriedBookCount: input.carriedBookCount,
    carriedPublicationId,
  })),
  discardBusy: input.discardBusy,
  ...whenDefined(input.discardError, (discardError) => ({discardError})),
  ...inspectionSnapshot(input),
  inspectionMode: input.inspectionMode,
  looseCount: input.looseCount,
  modelCount: input.modelCount,
  ...whenDefined(input.modelImportError, (modelImportError) => ({
    modelImportError,
  })),
  ...when(input.modelPlacement, {modelPlacementActive: true}),
  physicsReady: input.physicsReady,
  pointerLocked: input.pointerLocked,
  digitalArtFrameCount: input.digitalArtFrameCount,
  ...whenDefined(input.artFrameImportError, (digitalArtFrameImportError) => ({
    digitalArtFrameImportError,
  })),
  ...when(input.artFrameImporting, {digitalArtFrameImporting: true}),
  ...when(input.artFramePlacement, {digitalArtFramePlacementActive: true}),
  posterCount: input.posterCount,
  ...whenDefined(input.posterImportError, (posterImportError) => ({
    posterImportError,
  })),
  ...when(input.posterImporting, {posterImporting: true}),
  ...when(input.posterPlacement, {posterPlacementActive: true}),
  ...whenDefined(input.tvVideoImportError, (tvVideoImportError) => ({
    tvVideoImportError,
  })),
  ...when(input.tvVideoImporting, {tvVideoImporting: true}),
  ...whenDefined(input.tvVideoImportMessage, (tvVideoImportMessage) => ({
    tvVideoImportMessage,
  })),
  ...arcadeSnapshot(input),
  ...whenDefined(input.prompt, (prompt) => ({prompt})),
  shelvedCount: input.shelvedCount,
  ...when(input.throwChargeActive, {throwCharge: input.throwChargeProgress}),
});
