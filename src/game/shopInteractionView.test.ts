import {describe, expect, test} from "bun:test";

import type {CatalogItem} from "~/catalog";
import {SpotLight} from "three";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import {
  resolveShopInteractionMode,
  resolveShopInteractionView,
  type InteractionUiState,
  type ShopInteractionMode,
} from "~/game/shopInteractionView";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {MovablePropRecord} from "~/game/shopTypes";

const book = (status: "floor" | "shelved" = "floor") =>
  ({
    publicationTitle: "Test book",
    state: {status},
  }) as unknown as BookRecord;

const createState = (overrides: Partial<InteractionUiState> = {}): InteractionUiState =>
  ({
    activeArcadeCabinet: undefined,
    arcadeProps: new Map(),
    arcadeStatusForUi: undefined,
    artFrames: {
      placement: undefined,
      targetedId: undefined,
    } as unknown as ArtFrameSystem,
    carriedProp: undefined,
    carriedPublicationId: undefined,
    carriedPublicationIds: [],
    carriedRecord: undefined,
    discardBusy: false,
    discardError: undefined,
    hoveredRecord: undefined,
    inspectionCloseAction: undefined,
    inspectionMode: "none",
    inspectionOpenAngleTarget: 0,
    inspectionPublication: undefined,
    modelAnimationLabel: () => "",
    modelPlacement: undefined,
    pointerLocked: false,
    posters: {
      placement: undefined,
      targetedId: undefined,
    } as unknown as PosterSystem,
    propPlacementDistance: 1,
    propPlacementSnapping: false,
    shelfPresentation: "spine",
    shelfTargetSelection: undefined,
    shelfTargeted: false,
    shelveAnimation: undefined,
    signs: {
      slots: new Map(),
      targetedKey: undefined,
    } as unknown as ShopSignSystem,
    spawnablePropAssets: [],
    targetedArcadeCabinet: undefined,
    targetedProp: undefined,
    targetedTelevision: undefined,
    televisionProps: new Map(),
    televisionTargeted: false,
    throwChargeActive: false,
    throwChargeProgress: 0,
    trashTargeted: false,
    ...overrides,
  }) as unknown as InteractionUiState;

describe("shop interaction view", () => {
  test("uses one precedence order for interaction modes", () => {
    const prop = {} as unknown as MovablePropRecord;
    const state = createState({
      arcadeStatusForUi: "playing",
      carriedProp: prop,
      carriedRecord: book(),
      hoveredRecord: book(),
      modelPlacement: {assetIndex: 0, id: "model", revision: 1},
      targetedArcadeCabinet: {} as unknown as ShopArcadeCabinet,
      targetedProp: prop,
      televisionTargeted: true,
    });

    expect(resolveShopInteractionMode(state)).toBe("carried-prop");
    state.carriedProp = undefined;
    state.modelPlacement = undefined;
    expect(resolveShopInteractionMode(state)).toBe("carried-book");
    state.carriedRecord = undefined;
    expect(resolveShopInteractionMode(state)).toBe("arcade-session");
  });

  test("keeps inspection prompts and actions in the same view", () => {
    const state = createState({
      inspectionMode: "spread",
      inspectionPublication: {
        direction: "LTR",
        id: "shelf-book",
      } as CatalogItem,
    });

    const view = resolveShopInteractionView(state);

    expect(view.mode).toBe("inspection-spread");
    expect(view.prompt).toContain("return to shelf");
    expect(view.interactions.map(({label}) => label)).toEqual(["Turn page", "Zoom", "Return to shelf"]);
  });

  test("includes default actions only when the player owns pointer input", () => {
    const state = createState({pointerLocked: true});
    const view = resolveShopInteractionView(state);

    expect(view.mode).toBe("none");
    expect(view.interactions.map(({key}) => key)).toEqual(["M", "P", "V", "Space", "C"]);
  });

  test("keeps carried-book prompt and rows aligned with shelf targeting", () => {
    const state = createState({
      carriedPublicationIds: ["book"],
      carriedRecord: book(),
      shelfTargeted: true,
    });

    const view = resolveShopInteractionView(state);

    expect(view.mode satisfies ShopInteractionMode).toBe("carried-book");
    expect(view.prompt).toContain("E shelve");
    expect(view.interactions[0]?.label).toBe("Shelve book");
  });

  test("shows the current ceiling-light lumen value in the interaction menu", () => {
    const light = new SpotLight();
    light.power = 840;
    const prop = {
      adjustableLight: {light},
      label: "ceiling light",
      spawned: true,
    } as unknown as MovablePropRecord;

    const view = resolveShopInteractionView(createState({targetedProp: prop}));

    expect(view.interactions[0]).toEqual({
      key: "Ctrl+wheel",
      label: "Light intensity (840 lm)",
    });
  });
});
