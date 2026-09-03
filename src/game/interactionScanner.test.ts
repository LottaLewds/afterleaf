import {describe, expect, test} from "bun:test";
import {Mesh, Object3D, PerspectiveCamera, type Raycaster, Vector3} from "three";

import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import {InteractionScanner, type InteractionScannerHost} from "~/game/interactionScanner";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import type {MovablePropRecord, SpineShelfDefinition} from "~/game/shopTypes";
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

  test("does not target a shelved book on the far side of its shelf", () => {
    const shelfBookTarget = new Mesh();
    shelfBookTarget.userData.publicationId = "hidden-book";
    const shelf: SpineShelfDefinition = {
      axis: new Vector3(0, 0, 1),
      backInset: 0.5,
      faceInset: 0.1,
      faceTilt: 0,
      frontCenter: new Vector3(0, 1, 0.5),
      halfWidth: 1,
      id: "gondola:east:0:0",
      normal: new Vector3(1, 0, 0),
    };
    const {host, state} = createHost(undefined);
    const booksById = new Map<string, BookRecord>([
      ["hidden-book", {state: {shelfId: shelf.id, status: "shelved"}} as unknown as BookRecord],
    ]);
    const raycaster = host.raycaster() as Raycaster;
    raycaster.intersectObjects = ((objects: readonly Object3D[]) =>
      objects.includes(shelfBookTarget)
        ? [{distance: 1, object: shelfBookTarget, point: new Vector3()}]
        : []) as Raycaster["intersectObjects"];
    host.booksById = () => booksById;
    host.shelfHoverMeshesByShelf = () => new Map([[shelf.id, [shelfBookTarget]]]);
    host.spineShelfDefinitions = () => new Map([[shelf.id, shelf]]);
    host.camera().position.set(-1, 1, 0);

    new InteractionScanner(host).update();

    expect(state.hoveredPublicationId).toBeUndefined();
  });
});
