import {describe, expect, test} from "bun:test";
import {Mesh, Object3D, PerspectiveCamera, type Raycaster} from "three";

import type {ArtFrameSystem} from "~/game/artFrameSystem";
import {InteractionScanner, type InteractionScannerHost} from "~/game/interactionScanner";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {MovablePropRecord} from "~/game/shopTypes";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";

const createHost = (arcade: ShopArcadeCabinet | undefined) => {
  const arcadeTargets = arcade?.interactionTargets;
  const camera = new PerspectiveCamera();
  const state = {
    arcadeTargeted: undefined as ShopArcadeCabinet | undefined,
    hoveredPublicationId: undefined as string | undefined,
    propTargeted: undefined as MovablePropRecord | undefined,
    televisionTargeted: false,
    trashTargeted: false,
  };
  const artFrames = {
    placement: undefined,
    targetedId: undefined,
    setDigitalArtFrameTargeted: () => undefined,
    targetMeshes: [],
    updateDigitalArtFramePlacementTarget: () => undefined,
  } as unknown as ArtFrameSystem;
  const posters = {
    placement: undefined,
    targetedId: undefined,
    targetMeshes: [],
    updatePosterPlacementTarget: () => undefined,
  } as unknown as PosterSystem;
  const signs = {
    clearShelfSignPreview: () => undefined,
    has: () => false,
    previewKey: undefined,
    previewTargetMeshes: [],
    slots: new Map(),
    targetMeshes: [],
    targetedKey: undefined,
    updateTargetVisuals: () => undefined,
  } as unknown as ShopSignSystem;
  const raycaster = {
    intersectObjects: (objects: readonly Object3D[]) =>
      objects === arcadeTargets ? [{distance: 1, object: objects[0]}] : [],
    setFromCamera: () => undefined,
  } as unknown as Raycaster;
  const host = {
    arcadeCabinets: () => (arcade ? [arcade] : []),
    arcadeProps: () => new Map(),
    arcadeStatusForUi: () => undefined,
    artFrames: () => artFrames,
    booksById: () => new Map(),
    camera: () => camera,
    carriedProp: () => undefined,
    carriedPublicationId: () => undefined,
    carriedPublicationIds: () => [],
    discardBinVolumeMeshes: () => [],
    emitGameState: () => undefined,
    frameNowMs: () => 1_000,
    hoveredPublicationId: () => state.hoveredPublicationId,
    inspectionMode: () => "none" as const,
    interactiveMeshes: () => [],
    movableProps: () => new Map(),
    movablePropTargetMeshes: () => [],
    pointerLocked: () => true,
    posters: () => posters,
    raycaster: () => raycaster,
    setArcadeTargeted: (targeted: ShopArcadeCabinet | undefined) => {
      state.arcadeTargeted = targeted;
    },
    setHoveredPublicationId: (publicationId: string | undefined) => {
      state.hoveredPublicationId = publicationId;
    },
    setPropTargeted: (targeted: MovablePropRecord | undefined) => {
      state.propTargeted = targeted;
    },
    setTelevisionTargeted: (targeted: boolean) => {
      state.televisionTargeted = targeted;
    },
    setTrashTargeted: (targeted: boolean) => {
      state.trashTargeted = targeted;
    },
    shelfHoverMeshesByShelf: () => new Map(),
    shelfPresentation: () => "spine" as const,
    shelfTargetMeshes: () => [],
    shelveAnimation: () => undefined,
    signs: () => signs,
    spineShelfDefinitions: () => new Map(),
    targetedProp: () => state.propTargeted,
    televisionTargeted: () => state.televisionTargeted,
    televisions: () => [],
    ungroupedShelfHoverMeshes: () => [],
  } as unknown as InteractionScannerHost;
  return {host, state};
};

describe("interaction scanner", () => {
  test("keeps arcade targeting ahead of every ordinary target", () => {
    const interactionTarget = new Mesh();
    const arcade = {
      interactionTargets: [interactionTarget],
      object: new Object3D(),
    } as unknown as ShopArcadeCabinet;
    const {host, state} = createHost(arcade);
    const scanner = new InteractionScanner(host);

    scanner.update();

    expect(state.arcadeTargeted).toBe(arcade);
    expect(state.televisionTargeted).toBe(false);
    expect(state.propTargeted).toBeUndefined();
    expect(state.hoveredPublicationId).toBeUndefined();
  });

  test("clears stale targets while inspection owns the reticle", () => {
    const {host, state} = createHost(undefined);
    let inspectionMode: "closing" | "none" | "spread" = "spread";
    const staleProp = {} as MovablePropRecord;
    state.propTargeted = staleProp;
    state.televisionTargeted = true;
    state.hoveredPublicationId = "old-book";
    host.inspectionMode = () => inspectionMode;
    host.targetedProp = () => state.propTargeted;
    host.televisionTargeted = () => state.televisionTargeted;
    const scanner = new InteractionScanner(host);
    scanner.shelfTargeted = true;

    scanner.update();

    expect(scanner.shelfTargeted).toBe(false);
    expect(state.hoveredPublicationId).toBeUndefined();
    expect(state.propTargeted).toBeUndefined();
    expect(state.televisionTargeted).toBe(false);
    inspectionMode = "none";
  });
});
