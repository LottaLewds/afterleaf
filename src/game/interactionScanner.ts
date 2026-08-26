import {
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import {MathUtils, MeshBasicMaterial} from "three";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {
  FACE_DISPLAY_COLUMNS,
  FACE_DISPLAY_COLUMN_SPACING,
  FACE_SHELF_ID,
} from "~/game/shopLayout";
import {
  findAdjacentShelfBook,
  insertSpineShelfBook,
  spineShelfBookNormalOffset,
  type ShelfPresentation,
} from "~/game/shelfPlacement";
import type {ShelveAnimation} from "~/game/bookCarryActions";
import {shopSignKey} from "~/game/signs/ShopSignSystem";
import {POSTER_INTERACTION_DISTANCE} from "~/game/wallDecorTuning";
import {MAX_CARRIED_BOOKS} from "~/game/worldSave";
import type {BookRecord} from "~/game/bookFactory";
import type {
  MovablePropRecord,
  ShelfTargetSelection,
  SpineShelfDefinition,
} from "~/game/ShopScene";
import type {
  ArcadeSessionStatus,
  ShopArcadeCabinet,
} from "~/game/ShopArcadeCabinet";
import type {
  ShopTelevision,
  ShopTelevisionInteraction,
} from "~/game/ShopTelevision";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";

const SPINE_SHELF_GAP = 0.018;
const SHELF_INTERACTION_DISTANCE = 2.75;
const INTERACTION_DISTANCE = SHELF_INTERACTION_DISTANCE;
const TRASH_INTERACTION_DISTANCE = 2.65;
const SIGN_INTERACTION_DISTANCE = 3.4;
const TELEVISION_INTERACTION_DISTANCE = 3.6;
const ARCADE_INTERACTION_DISTANCE = 3.4;
const MOVABLE_PROP_INTERACTION_DISTANCE = 4;
const AIM_SWEEP_MIN_INTERVAL_MS = 1000 / 60;
const SHELF_HOVER_CULL_MARGIN = 1.5;

/**
 * Everything the interaction-targeting scanner reads from or writes to its
 * host scene, as live accessors so every read stays current.
 */
export type InteractionScannerHost = {
  arcadeCabinets: () => readonly ShopArcadeCabinet[];
  arcadeProps: () => ReadonlyMap<ShopArcadeCabinet, MovablePropRecord>;
  arcadeStatusForUi: () => ArcadeSessionStatus | undefined;
  artFrames: () => ArtFrameSystem;
  booksById: () => ReadonlyMap<string, BookRecord>;
  camera: () => PerspectiveCamera;
  carriedProp: () => MovablePropRecord | undefined;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => string[];
  discardBinVolumeMeshes: () => Mesh[];
  emitGameState: () => void;
  frameNowMs: () => number;
  hoveredPublicationId: () => string | undefined;
  inspectionMode: () => "closing" | "none" | "spread";
  interactiveMeshes: () => Mesh[];
  movableProps: () => ReadonlyMap<string, MovablePropRecord>;
  movablePropTargetMeshes: () => Mesh[];
  pointerLocked: () => boolean;
  posters: () => PosterSystem;
  raycaster: () => Raycaster;
  setArcadeTargeted: (cabinet: ShopArcadeCabinet | undefined) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  setPropTargeted: (record: MovablePropRecord | undefined) => void;
  setTelevisionTargeted: (
    targeted: boolean,
    interaction?: ShopTelevisionInteraction,
    television?: ShopTelevision,
  ) => void;
  setTrashTargeted: (targeted: boolean) => void;
  shelfHoverMeshesByShelf: () => ReadonlyMap<string, Mesh[]>;
  shelfPresentation: () => ShelfPresentation;
  shelfTargetMeshes: () => Mesh[];
  shelveAnimation: () => ShelveAnimation | undefined;
  signs: () => ShopSignSystem;
  spineShelfDefinitions: () => ReadonlyMap<string, SpineShelfDefinition>;
  targetedProp: () => MovablePropRecord | undefined;
  televisionTargeted: () => boolean;
  televisions: () => readonly ShopTelevision[];
  ungroupedShelfHoverMeshes: () => readonly Mesh[];
};

/** Reticle targeting: sweeps the shop and updates what the player is aiming at. */
export class InteractionScanner {
  readonly #host: InteractionScannerHost;
  readonly #reticle = new Vector2();
  #lastAimSweepTimeMs = -Infinity;
  readonly #lastSweepPosition = new Vector3();
  readonly #lastSweepQuaternion = new Quaternion();
  #interactionTargetsDirty = true;
  readonly #shelfTargetOffset = new Vector3();
  readonly #shelfHoverSweepScratch: Mesh[] = [];
  readonly shelfSnapMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: "#78b594",
      depthWrite: false,
      opacity: 0.42,
      transparent: true,
    }),
  );
  readonly #televisionTargetPosition = new Vector3();
  readonly #televisionTargetScale = new Vector3();

  /** What the reticle is currently aimed at. */
  shelfTargeted = false;
  shelfTargetSelection: ShelfTargetSelection | undefined;
  trashTargeted = false;
  targetedTrashBinId: string | undefined;
  shelfBrowsePublicationId: string | undefined;

  constructor(host: InteractionScannerHost) {
    this.#host = host;
  }

  /** Forces the next reticle sweep even if the camera has not moved. */
  markDirty(): void {
    this.#interactionTargetsDirty = true;
  }

  #createShelfTargetSelection(
    target: Object3D,
    point: Vector3,
    publicationId: string | undefined,
  ): ShelfTargetSelection | undefined {
    const host = this.#host;
    const shelfId = target.userData.shelfId;
    if (typeof shelfId !== "string") return undefined;
    const shelf = host.spineShelfDefinitions().get(shelfId);
    const carriedRecord =
      publicationId !== undefined
        ? host.booksById().get(publicationId)
        : undefined;
    if (!shelf || !carriedRecord || publicationId === undefined)
      return undefined;
    const offset = this.#shelfTargetOffset
      .copy(point)
      .sub(shelf.frontCenter)
      .dot(shelf.axis);
    const presentation = host.shelfPresentation();
    const shelfBooks = [...host.booksById().entries()].flatMap(([id, record]) =>
      record.state.status === "shelved" && record.state.shelfId === shelfId
        ? [
            {
              center: record.shelfOffset,
              id,
              width:
                record.shelfPresentation === "face"
                  ? record.width
                  : record.thickness,
            },
          ]
        : [],
    );
    const insertionWidth =
      presentation === "face" ? carriedRecord.width : carriedRecord.thickness;
    const placements = insertSpineShelfBook(
      shelfBooks,
      {center: offset, id: publicationId, width: insertionWidth},
      {max: shelf.halfWidth, min: -shelf.halfWidth},
      SPINE_SHELF_GAP,
    );
    const insertion = placements?.find(
      (placement) => placement.id === publicationId,
    );
    if (!placements || !insertion) return undefined;
    return {
      offset: insertion.center,
      placements,
      presentation,
      shelfId,
      slotIndex: insertion.slotIndex,
    };
  }

  #shelfSignKeyForTarget(shelfId: string, offset?: number) {
    const host = this.#host;
    const shelf = host.spineShelfDefinitions().get(shelfId);
    if (!shelf) return undefined;
    if (shelf.signKey) return shelf.signKey;
    if (!shelfId.startsWith(`${FACE_SHELF_ID}:`) || offset === undefined)
      return undefined;
    const column = MathUtils.clamp(
      Math.round(
        offset / FACE_DISPLAY_COLUMN_SPACING + (FACE_DISPLAY_COLUMNS - 1) / 2,
      ),
      0,
      FACE_DISPLAY_COLUMNS - 1,
    );
    const key = shopSignKey("shelf", String(column));
    return host.signs().has(key) ? key : undefined;
  }

  browseShelf(direction: number) {
    const host = this.#host;
    if (direction === 0 || host.carriedPublicationId() || host.carriedProp())
      return false;
    const publicationId = host.hoveredPublicationId();
    const record = publicationId
      ? host.booksById().get(publicationId)
      : undefined;
    if (!publicationId || record?.state.status !== "shelved") return false;
    const shelfId = record.state.shelfId;
    const shelfBooks = [...host.booksById().entries()].flatMap(
      ([id, shelfRecord]) =>
        shelfRecord.state.status === "shelved" &&
        shelfRecord.state.shelfId === shelfId
          ? [
              {
                center: shelfRecord.shelfOffset,
                id,
                width:
                  shelfRecord.shelfPresentation === "face"
                    ? shelfRecord.width
                    : shelfRecord.thickness,
              },
            ]
          : [],
    );
    const adjacentBook = findAdjacentShelfBook(
      shelfBooks,
      publicationId,
      direction < 0 ? -1 : 1,
    );
    if (!adjacentBook) return true;
    this.shelfBrowsePublicationId = adjacentBook.id;
    host.setHoveredPublicationId(adjacentBook.id);
    return true;
  }

  #findShelfHoverTargetPublicationId() {
    const host = this.#host;
    // Whole-shelf cull: shelves farther than the interaction reach cannot
    // contain a hit, so only nearby banks' proxies are raycast. Ungrouped
    // proxies (shelf definition missing) always stay in the candidate set.
    const scratch = this.#shelfHoverSweepScratch;
    scratch.length = 0;
    for (const [shelfId, meshes] of host.shelfHoverMeshesByShelf()) {
      const shelf = host.spineShelfDefinitions().get(shelfId);
      if (!shelf) continue;
      const cullDistance =
        INTERACTION_DISTANCE + shelf.halfWidth + SHELF_HOVER_CULL_MARGIN;
      if (
        host.camera().position.distanceToSquared(shelf.frontCenter) >
        cullDistance * cullDistance
      )
        continue;
      for (const mesh of meshes) scratch.push(mesh);
    }
    for (const mesh of host.ungroupedShelfHoverMeshes()) scratch.push(mesh);
    if (scratch.length === 0) return undefined;
    const intersections = host.raycaster().intersectObjects(scratch, false);
    for (const intersection of intersections) {
      if (intersection.distance > INTERACTION_DISTANCE) break;
      const candidateId = intersection.object.userData.publicationId;
      if (typeof candidateId === "string") return candidateId;
    }
    return undefined;
  }

  update() {
    const host = this.#host;
    // An arcade session owns the screen; retargeting would fight its UI.
    if (host.arcadeStatusForUi()) {
      host.signs().clearShelfSignPreview();
      return;
    }
    if (host.inspectionMode() !== "none") {
      host.setHoveredPublicationId(undefined);
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      host.signs().clearShelfSignPreview();
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.setTelevisionTargeted(false);
      this.updateShelfTargetVisuals();
      return;
    }
    if (host.shelveAnimation()) {
      host.setHoveredPublicationId(undefined);
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      host.signs().clearShelfSignPreview();
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.setTelevisionTargeted(false);
      this.updateShelfTargetVisuals();
      host.signs().updateTargetVisuals();
      return;
    }
    if (!host.pointerLocked()) {
      host.signs().clearShelfSignPreview();
      host.posters().updatePosterPlacementTarget();
      host.artFrames().updateDigitalArtFramePlacementTarget();
      host.setHoveredPublicationId(undefined);
      if (
        this.shelfTargeted ||
        this.trashTargeted ||
        host.televisionTargeted() ||
        host.targetedProp() !== undefined ||
        host.artFrames().targetedId !== undefined ||
        host.posters().targetedId !== undefined ||
        host.signs().targetedKey !== undefined
      ) {
        this.shelfTargeted = false;
        this.shelfTargetSelection = undefined;
        host.signs().targetedKey = undefined;
        host.posters().targetedId = undefined;
        host.artFrames().setDigitalArtFrameTargeted();
        host.setPropTargeted(undefined);
        host.setTrashTargeted(false);
        host.setTelevisionTargeted(false);
        host.setArcadeTargeted(undefined);
        this.updateShelfTargetVisuals();
        host.signs().updateTargetVisuals();
        host.emitGameState();
      }
      return;
    }

    // Aiming results feed highlight prompts and clicks, which tolerate a
    // frame or two of latency - so the full-shop reticle sweep runs on a
    // fixed-rate budget instead of every tick, capping its cost while the
    // player whips the view around.
    if (
      host.frameNowMs() - this.#lastAimSweepTimeMs <
      AIM_SWEEP_MIN_INTERVAL_MS
    )
      return;
    // The reticle is screen-center, so the sweep result only changes when
    // the camera moves or targetable content changed; skip otherwise.
    if (
      !this.#interactionTargetsDirty &&
      host.camera().position.equals(this.#lastSweepPosition) &&
      host.camera().quaternion.equals(this.#lastSweepQuaternion)
    )
      return;
    this.#interactionTargetsDirty = false;
    this.#lastSweepPosition.copy(host.camera().position);
    this.#lastSweepQuaternion.copy(host.camera().quaternion);
    this.#lastAimSweepTimeMs = host.frameNowMs();
    host.camera().updateMatrixWorld();
    host.raycaster().setFromCamera(this.#reticle, host.camera());
    if (host.artFrames().placement) {
      host.setHoveredPublicationId(undefined);
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      host.signs().clearShelfSignPreview();
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.setTelevisionTargeted(false);
      this.updateShelfTargetVisuals();
      host.signs().updateTargetVisuals();
      host.artFrames().updateDigitalArtFramePlacementTarget();
      return;
    }
    if (host.posters().placement) {
      host.setHoveredPublicationId(undefined);
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      host.signs().clearShelfSignPreview();
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.setTelevisionTargeted(false);
      host.setArcadeTargeted(undefined);
      this.updateShelfTargetVisuals();
      host.signs().updateTargetVisuals();
      host.posters().updatePosterPlacementTarget();
      return;
    }
    if (host.carriedProp()) {
      host.setHoveredPublicationId(undefined);
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      host.signs().clearShelfSignPreview();
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.setTelevisionTargeted(false);
      host.setArcadeTargeted(undefined);
      this.updateShelfTargetVisuals();
      host.signs().updateTargetVisuals();
      return;
    }
    if (host.carriedPublicationId()) {
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setPropTargeted(undefined);
      host.setTelevisionTargeted(false);
      const trashIntersection = host
        .raycaster()
        .intersectObjects(host.discardBinVolumeMeshes(), false)[0];
      const trashTargeted =
        trashIntersection !== undefined &&
        trashIntersection.distance <= TRASH_INTERACTION_DISTANCE;
      this.targetedTrashBinId = trashTargeted
        ? (trashIntersection?.object.userData.propId as string | undefined)
        : undefined;
      let pickupPublicationId: string | undefined;
      if (
        !trashTargeted &&
        host.carriedPublicationIds().length < MAX_CARRIED_BOOKS
      ) {
        const directBookIntersection = host
          .raycaster()
          .intersectObjects(host.interactiveMeshes(), false)[0];
        const directPublicationId =
          directBookIntersection &&
          directBookIntersection.distance <= INTERACTION_DISTANCE
            ? directBookIntersection.object.userData.publicationId
            : undefined;
        const directRecord =
          typeof directPublicationId === "string"
            ? host.booksById().get(directPublicationId)
            : undefined;
        if (directRecord?.state.status === "floor")
          pickupPublicationId = directPublicationId;
        else {
          const shelfPublicationId = this.#findShelfHoverTargetPublicationId();
          const shelfRecord = shelfPublicationId
            ? host.booksById().get(shelfPublicationId)
            : undefined;
          if (shelfRecord?.state.status === "shelved")
            pickupPublicationId = shelfPublicationId;
        }
      }
      if (pickupPublicationId) {
        host.setHoveredPublicationId(pickupPublicationId);
        this.shelfTargeted = false;
        this.shelfTargetSelection = undefined;
        host.signs().clearShelfSignPreview();
        host.setTrashTargeted(false);
        this.updateShelfTargetVisuals();
        host.signs().updateTargetVisuals();
        return;
      }
      host.setHoveredPublicationId(undefined);
      let selection: ShelfTargetSelection | undefined;
      if (!trashTargeted) {
        const intersections = host
          .raycaster()
          .intersectObjects(host.shelfTargetMeshes(), false);
        for (const intersection of intersections) {
          if (intersection.distance > SHELF_INTERACTION_DISTANCE) break;
          selection = this.#createShelfTargetSelection(
            intersection.object,
            intersection.point,
            host.carriedPublicationId(),
          );
          if (selection) break;
        }
      }
      this.shelfTargeted = selection !== undefined;
      this.shelfTargetSelection = selection;
      host.signs().previewKey = selection
        ? this.#shelfSignKeyForTarget(selection.shelfId, selection.offset)
        : undefined;
      host.setTrashTargeted(trashTargeted);
      this.updateShelfTargetVisuals();
      host.signs().updateTargetVisuals();
      host.emitGameState();
      return;
    }

    if (this.shelfTargeted) {
      this.shelfTargeted = false;
      this.shelfTargetSelection = undefined;
      this.updateShelfTargetVisuals();
    }
    let arcadeCabinet: ShopArcadeCabinet | undefined;
    let arcadeIntersection:
      | ReturnType<Raycaster["intersectObjects"]>[number]
      | undefined;
    for (const candidate of host.arcadeCabinets()) {
      candidate.object.getWorldPosition(this.#televisionTargetPosition);
      // Scale the cull radius with the cabinet so resized units stay
      // targetable even when their center sits far above or beside the eye.
      const cabinetProp = host.arcadeProps().get(candidate);
      const cabinetRadius = cabinetProp
        ? Math.max(
            cabinetProp.halfWidth,
            cabinetProp.halfHeight,
            cabinetProp.halfDepth,
          )
        : 0;
      const cabinetCullDistance =
        ARCADE_INTERACTION_DISTANCE + 1.2 + cabinetRadius * 2;
      if (
        host
          .camera()
          .position.distanceToSquared(this.#televisionTargetPosition) >
        cabinetCullDistance * cabinetCullDistance
      )
        continue;
      const candidateIntersection = host
        .raycaster()
        .intersectObjects(candidate.interactionTargets, false)[0];
      if (
        !candidateIntersection ||
        (arcadeIntersection &&
          candidateIntersection.distance >= arcadeIntersection.distance)
      )
        continue;
      arcadeCabinet = candidate;
      arcadeIntersection = candidateIntersection;
    }
    const arcadeTargeted =
      arcadeCabinet !== undefined &&
      arcadeIntersection !== undefined &&
      arcadeIntersection.distance <= ARCADE_INTERACTION_DISTANCE;
    host.setArcadeTargeted(arcadeTargeted ? arcadeCabinet : undefined);
    if (arcadeTargeted) {
      host.signs().clearShelfSignPreview();
      host.setTelevisionTargeted(false);
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.signs().updateTargetVisuals();
      host.setHoveredPublicationId(undefined);
      return;
    }
    let television: ShopTelevision | undefined;
    let televisionIntersection:
      | ReturnType<Raycaster["intersectObjects"]>[number]
      | undefined;
    for (const candidate of host.televisions()) {
      candidate.object.getWorldPosition(this.#televisionTargetPosition);
      candidate.object.getWorldScale(this.#televisionTargetScale);
      const televisionScale = Math.max(
        this.#televisionTargetScale.x,
        this.#televisionTargetScale.y,
        this.#televisionTargetScale.z,
      );
      const televisionCullDistance =
        TELEVISION_INTERACTION_DISTANCE +
        candidate.interactionBoundsRadius * televisionScale;
      if (
        host
          .camera()
          .position.distanceToSquared(this.#televisionTargetPosition) >
        televisionCullDistance * televisionCullDistance
      )
        continue;
      const candidateIntersection = host.raycaster().intersectObjects(
        // Raycaster only reads the input list, so bypass the readonly getter.
        candidate.interactionTargets as Mesh[],
        false,
      )[0];
      if (
        !candidateIntersection ||
        (televisionIntersection &&
          candidateIntersection.distance >= televisionIntersection.distance)
      )
        continue;
      television = candidate;
      televisionIntersection = candidateIntersection;
    }
    const televisionInteraction = televisionIntersection
      ? television?.resolveInteractionTarget(televisionIntersection.object)
      : undefined;
    const televisionTargeted =
      televisionInteraction !== undefined &&
      televisionIntersection !== undefined &&
      televisionIntersection.distance <= TELEVISION_INTERACTION_DISTANCE;
    host.setTelevisionTargeted(
      televisionTargeted,
      televisionInteraction,
      television,
    );
    if (televisionTargeted) {
      host.signs().clearShelfSignPreview();
      host.setPropTargeted(undefined);
      host.setTrashTargeted(false);
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.signs().updateTargetVisuals();
      host.setHoveredPublicationId(undefined);
      return;
    }
    const directBookIntersection = host
      .raycaster()
      .intersectObjects(host.interactiveMeshes(), false)[0];
    const propIntersection = host
      .raycaster()
      .intersectObjects(host.movablePropTargetMeshes(), false)[0];
    const propId = propIntersection?.object.userData.movablePropId;
    const targetedProp =
      propIntersection &&
      propIntersection.distance <= MOVABLE_PROP_INTERACTION_DISTANCE &&
      (!directBookIntersection ||
        directBookIntersection.distance > INTERACTION_DISTANCE ||
        propIntersection.distance < directBookIntersection.distance) &&
      typeof propId === "string"
        ? host.movableProps().get(propId)
        : undefined;
    host.setPropTargeted(targetedProp);
    if (targetedProp) {
      host.signs().clearShelfSignPreview();
      host.setTrashTargeted(false);
      host.signs().targetedKey = undefined;
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.signs().updateTargetVisuals();
      host.setHoveredPublicationId(undefined);
      return;
    }
    host.setTrashTargeted(false);
    const shelfIntersection = host
      .raycaster()
      .intersectObjects(host.signs().previewTargetMeshes, false)
      .find((candidate) => candidate.distance <= SHELF_INTERACTION_DISTANCE);
    const shelfId = shelfIntersection?.object.userData.shelfId;
    const shelf =
      typeof shelfId === "string"
        ? host.spineShelfDefinitions().get(shelfId)
        : undefined;
    const shelfOffset =
      shelf && shelfIntersection
        ? this.#shelfTargetOffset
            .copy(shelfIntersection.point)
            .sub(shelf.frontCenter)
            .dot(shelf.axis)
        : undefined;
    const shelfSignPreviewKey =
      typeof shelfId === "string"
        ? this.#shelfSignKeyForTarget(shelfId, shelfOffset)
        : undefined;
    const signIntersection = host
      .raycaster()
      .intersectObjects(host.signs().targetMeshes, false)
      .find((candidate) => candidate.distance <= SIGN_INTERACTION_DISTANCE);
    const signKey = signIntersection?.object.userData.signKey;
    const targetedSignKey = typeof signKey === "string" ? signKey : undefined;
    const nextShelfSignPreviewKey =
      signIntersection === undefined ? shelfSignPreviewKey : undefined;
    const shelfSignPreviewChanged =
      nextShelfSignPreviewKey !== host.signs().previewKey;
    host.signs().previewKey = nextShelfSignPreviewKey;
    const targetedSignChanged = targetedSignKey !== host.signs().targetedKey;
    if (targetedSignChanged || shelfSignPreviewChanged) {
      host.signs().targetedKey = targetedSignKey;
      host.signs().updateTargetVisuals();
      if (targetedSignChanged) host.emitGameState();
    }
    if (targetedSignKey !== undefined) {
      host.posters().targetedId = undefined;
      host.artFrames().setDigitalArtFrameTargeted();
      host.setHoveredPublicationId(undefined);
      return;
    }
    const artFrameIntersection = host
      .raycaster()
      .intersectObjects(host.artFrames().targetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const artFrameId = artFrameIntersection?.object.userData.digitalArtFrameId;
    const targetedArtFrameId =
      typeof artFrameId === "string" ? artFrameId : undefined;
    host.artFrames().setDigitalArtFrameTargeted(targetedArtFrameId);
    if (targetedArtFrameId) {
      host.posters().targetedId = undefined;
      host.setHoveredPublicationId(undefined);
      return;
    }
    const posterIntersection = host
      .raycaster()
      .intersectObjects(host.posters().targetMeshes, false)
      .find((candidate) => candidate.distance <= POSTER_INTERACTION_DISTANCE);
    const posterId = posterIntersection?.object.userData.posterId;
    const targetedPosterId =
      typeof posterId === "string" ? posterId : undefined;
    if (targetedPosterId !== host.posters().targetedId) {
      host.posters().targetedId = targetedPosterId;
      host.emitGameState();
    }
    if (targetedPosterId) {
      host.artFrames().setDigitalArtFrameTargeted();
      host.setHoveredPublicationId(undefined);
      return;
    }
    const directPublicationId =
      directBookIntersection &&
      directBookIntersection.distance <= INTERACTION_DISTANCE
        ? directBookIntersection.object.userData.publicationId
        : undefined;
    const directRecord =
      typeof directPublicationId === "string"
        ? host.booksById().get(directPublicationId)
        : undefined;
    const shelfPublicationId = this.#findShelfHoverTargetPublicationId();
    let publicationId =
      directRecord?.state.status === "floor"
        ? directPublicationId
        : (shelfPublicationId ?? directPublicationId);
    const browsedRecord = this.shelfBrowsePublicationId
      ? host.booksById().get(this.shelfBrowsePublicationId)
      : undefined;
    const naturallyTargetedRecord =
      typeof publicationId === "string"
        ? host.booksById().get(publicationId)
        : undefined;
    if (
      browsedRecord?.state.status === "shelved" &&
      naturallyTargetedRecord?.state.status === "shelved" &&
      browsedRecord.state.shelfId === naturallyTargetedRecord.state.shelfId
    )
      publicationId = this.shelfBrowsePublicationId;
    else this.shelfBrowsePublicationId = undefined;
    host.setHoveredPublicationId(
      typeof publicationId === "string" ? publicationId : undefined,
    );
  }

  updateShelfTargetVisuals() {
    const host = this.#host;
    const selection = this.shelfTargetSelection;
    for (const target of host.shelfTargetMeshes()) {
      const material = target.material;
      if (!(material instanceof MeshBasicMaterial)) continue;
      const selectedShelf = selection?.shelfId === target.userData.shelfId;
      material.opacity = selectedShelf ? 0.13 : 0;
      material.color.set("#78b594");
    }
    const carriedPublicationId = host.carriedPublicationId();
    const carriedRecord = carriedPublicationId
      ? host.booksById().get(carriedPublicationId)
      : undefined;
    if (!selection || !carriedRecord) {
      this.shelfSnapMesh.visible = false;
      return;
    }
    this.shelfSnapMesh.visible = true;
    const shelf = host.spineShelfDefinitions().get(selection.shelfId);
    if (!shelf) {
      this.shelfSnapMesh.visible = false;
      return;
    }
    const normalOffset =
      selection.presentation === "face"
        ? -shelf.faceInset
        : spineShelfBookNormalOffset(carriedRecord.width, shelf.backInset) +
          carriedRecord.width / 2 +
          0.012;
    this.shelfSnapMesh.position
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, selection.offset)
      .addScaledVector(shelf.normal, normalOffset);
    this.shelfSnapMesh.rotation.set(
      selection.presentation === "face" ? shelf.faceTilt : 0,
      Math.atan2(shelf.normal.x, shelf.normal.z),
      0,
    );
    this.shelfSnapMesh.scale.set(
      selection.presentation === "face"
        ? carriedRecord.width
        : carriedRecord.thickness,
      BOOK_HEIGHT,
      1,
    );
  }
}
