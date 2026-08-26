import {Color, MathUtils, Vector3} from "three";
import type {Euler, Mesh, PerspectiveCamera, Quaternion, Scene} from "three";
import type {CatalogItem} from "~/catalog";
import {
  createBook,
  faceDisplayShelfId,
  faceDisplayShelfOffset,
} from "~/game/bookFactory";
import type {BookRecord, RetainedBookGameplay} from "~/game/bookFactory";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import type {BookCarryActions} from "~/game/bookCarryActions";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {bookDropPosition} from "~/game/bookDropPlacement";
import {hashString} from "~/game/mathHelpers";
import type {InspectionController} from "~/game/inspection/InspectionController";
import {spineShelfBookNormalOffset} from "~/game/shelfPlacement";
import type {SpineShelfDefinition} from "~/game/shopTypes";
import type {ShopPhysicsWorld, BookPhysicsPose} from "~/game/ShopPhysicsWorld";
import type {WorldBookSave} from "~/game/worldSave";
import {
  FACE_DISPLAY_COLUMNS,
  FACE_DISPLAY_ROWS,
  FACE_SHELF_ID,
} from "~/game/shopLayout";
import type {InteractionScanner} from "~/game/interactionScanner";

const FACE_SHELF_SLOT_COUNT = FACE_DISPLAY_COLUMNS * FACE_DISPLAY_ROWS;
const DISCARD_TARGETED_EMISSIVE = new Color("#ff3524");
const DISCARD_TARGETED_EMISSIVE_INTENSITY = 0.95;

export type ShopBookLifecycleHost = {
  bookActions: () => BookCarryActions;
  bookSignature: (item: CatalogItem) => string;
  bookTextures: () => BookTextureRuntime;
  booksById: () => Map<string, BookRecord>;
  camera: () => PerspectiveCamera;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => string[];
  emitGameState: () => void;
  heldLocalPosition: () => Vector3;
  heldLocalRotation: () => Quaternion;
  hoveredPublicationId: () => string | undefined;
  inspection: () => InspectionController;
  lastSelectedPublicationId: () => string | null | undefined;
  markWorldStateDirty: () => void;
  newPublicationIds: () => readonly string[];
  observedArrivalIds: Set<string>;
  physicsPose: () => BookPhysicsPose;
  physicsPoseEuler: () => Euler;
  physicsPosePosition: () => Vector3;
  physicsPoseRotation: () => Quaternion;
  physicsWorld: () => ShopPhysicsWorld;
  scene: () => Scene;
  scanner: () => InteractionScanner;
  setCarriedPublicationId: (publicationId: string | undefined) => void;
  setInteractiveMeshes: (meshes: Mesh[]) => void;
  shelfHoverMeshesByShelf: Map<string, Mesh[]>;
  spineShelfDefinitions: () => ReadonlyMap<string, SpineShelfDefinition>;
  syncCarriedBookPresentation: () => void;
  takeCompatibleWorldSave: () => Map<string, WorldBookSave> | undefined;
  ungroupedShelfHoverMeshes: Mesh[];
  updateHeldPhysicsTarget: () => void;
};

export class ShopBookLifecycle {
  readonly #host: ShopBookLifecycleHost;

  constructor(host: ShopBookLifecycleHost) {
    this.#host = host;
  }

  applySavedBook(record: BookRecord, savedBook: WorldBookSave) {
    record.basePosition.copy(savedBook.pose.position);
    record.mesh.quaternion.copy(savedBook.pose.quaternion);
    this.#host
      .physicsPoseEuler()
      .setFromQuaternion(record.mesh.quaternion, "XYZ");
    record.baseRotation.set(
      this.#host.physicsPoseEuler().x,
      this.#host.physicsPoseEuler().y,
      this.#host.physicsPoseEuler().z,
    );
    if (savedBook.state === "shelved") {
      const requestedShelfId = savedBook.shelf.shelfId;
      const legacySlotIndex = savedBook.shelf.slotIndex % FACE_SHELF_SLOT_COUNT;
      const requestedShelf = this.#host
        .spineShelfDefinitions()
        .get(requestedShelfId);
      const useFaceDisplayFallback =
        requestedShelfId === FACE_SHELF_ID || !requestedShelf;
      const shelfId = useFaceDisplayFallback
        ? faceDisplayShelfId(Math.floor(legacySlotIndex / FACE_DISPLAY_COLUMNS))
        : requestedShelfId;
      const shelf = this.#host.spineShelfDefinitions().get(shelfId);
      const slotIndex = useFaceDisplayFallback
        ? legacySlotIndex % FACE_DISPLAY_COLUMNS
        : savedBook.shelf.slotIndex;
      record.slotIndex = slotIndex;
      record.shelfPresentation = useFaceDisplayFallback
        ? "face"
        : (savedBook.shelf.presentation ?? "spine");
      record.shelfOffset = useFaceDisplayFallback
        ? faceDisplayShelfOffset(legacySlotIndex)
        : shelf
          ? this.#host
              .physicsPosePosition()
              .copy(savedBook.pose.position)
              .sub(shelf.frontCenter)
              .dot(shelf.axis)
          : 0;
      record.state = {
        shelfId,
        slotIndex,
        status: "shelved",
      };
      this.setShelfPosition(record);
      record.basePosition.copy(record.shelfPosition);
      this.setShelfRotation(record, savedBook.publicationId);
    } else record.state = {status: savedBook.state};
  }

  #syncBookItem(
    item: CatalogItem,
    index: number,
    savedBooks: Map<string, WorldBookSave> | undefined,
    arrivalIds: ReadonlySet<string>,
    retainedIds: Set<string>,
  ) {
    if (retainedIds.has(item.id)) return;
    retainedIds.add(item.id);
    const signature = this.#host.bookSignature(item);
    let record = this.#host.booksById().get(item.id);
    let recordCreated = false;
    if (record?.signature !== signature) {
      const retainedGameplay: RetainedBookGameplay | undefined = record
        ? {
            basePosition: record.basePosition.clone(),
            baseRotation: record.baseRotation.clone(),
            shelfOffset: record.shelfOffset,
            shelfPresentation: record.shelfPresentation,
            slotIndex: record.slotIndex,
            state: record.state,
            taskBook: record.taskBook,
          }
        : undefined;
      const initialSlotIndex = retainedGameplay?.slotIndex ?? index;
      if (record) {
        this.#host.physicsWorld().removeBook(item.id);
        this.disposeBookRecord(record);
      }
      record = createBook(
        item,
        signature,
        initialSlotIndex,
        true,
        retainedGameplay,
        this.#placeBookOnFloor.bind(this) as (
          record: BookRecord,
          floorIndex: number,
          seedValue: string,
        ) => void,
      );
      this.#host.booksById().set(item.id, record);
      recordCreated = true;
    }

    const restoredFromSave = arrivalIds.has(item.id)
      ? undefined
      : savedBooks?.get(item.id);
    if (restoredFromSave) this.applySavedBook(record, restoredFromSave);
    else if (recordCreated && arrivalIds.has(item.id))
      this.#placeNewArrivalAboveFloor(record, item.id);
    if (!record.taskBook) record.slotIndex = index;
    this.setShelfPosition(record);
    if (record.state.status === "shelved" && !restoredFromSave) {
      record.basePosition.copy(record.shelfPosition);
      this.setShelfRotation(record, item.id);
    }
    if (record.state.status === "carried") {
      this.#host.bookTextures().promoteBookCoverTexture(item.id, record);
      if (this.#host.physicsWorld().isReady)
        this.#host.scene().add(record.mesh);
      else {
        this.#host.camera().add(record.mesh);
        record.mesh.position.copy(this.#host.heldLocalPosition());
        record.mesh.quaternion.copy(this.#host.heldLocalRotation());
      }
    } else if (record.mesh.parent === null) {
      record.mesh.position.copy(record.basePosition);
      record.mesh.rotation.set(
        record.baseRotation.x,
        record.baseRotation.y,
        record.baseRotation.z,
        "XYZ",
      );
      this.#host.scene().add(record.mesh);
    }
    this.#syncBookPhysics(item.id, record);
  }

  syncBooks(
    items: readonly CatalogItem[],
    newPublicationIds: readonly string[] = this.#host.newPublicationIds(),
  ) {
    const atlasRevision = this.#host.bookTextures().bumpRevision();
    this.#host.bookTextures().disposeBookAtlasBatches();
    const savedBooks = this.#host.takeCompatibleWorldSave();
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const unobservedArrivalIds = newPublicationIds.filter((publicationId) => {
      if (
        !itemsById.has(publicationId) ||
        this.#host.observedArrivalIds.has(publicationId)
      )
        return false;
      this.#host.observedArrivalIds.add(publicationId);
      return true;
    });
    const arrivalIds = new Set(unobservedArrivalIds);
    const discardAnimation = this.#host.bookActions().discardAnimation;
    const shelveAnimation = this.#host.bookActions().shelveAnimation;
    const retainedIds = new Set<string>([
      ...(discardAnimation ? [discardAnimation.publicationId] : []),
      ...(shelveAnimation ? [shelveAnimation.publicationId] : []),
    ]);
    const displayItems = items.filter(
      (item) => !this.#host.bookActions().discardedPublicationIds.has(item.id),
    );
    for (const [index, item] of displayItems.entries())
      this.#syncBookItem(item, index, savedBooks, arrivalIds, retainedIds);

    for (const [publicationId, record] of this.#host.booksById()) {
      if (retainedIds.has(publicationId)) continue;
      if (this.#host.inspection().inspectionPublicationId === publicationId)
        this.#host.inspection().endInspection();
      if (this.#host.carriedPublicationIds().includes(publicationId))
        this.removeCarriedPublication(publicationId);
      this.#host.physicsWorld().removeBook(publicationId);
      this.disposeBookRecord(record);
      this.#host.booksById().delete(publicationId);
    }
    this.#syncCarriedPublicationIds();
    this.#host.syncCarriedBookPresentation();
    this.syncInteractiveMeshes();
    this.applyBookStates();
    this.#host.updateHeldPhysicsTarget();
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
    // Book textures stream into the scene as batches finish; readiness does
    // not wait on them.
    void this.#host
      .bookTextures()
      .initializeBookAtlasBatches(items, atlasRevision);
  }

  /**
   * Loads a shelf atlas texture, transparently using basis-compressed KTX2
   * for catalogs that ship it. Compressed textures cannot be flipped at
   * upload time; the pipeline bakes the vertical flip in instead.
   */

  #placeBookOnFloor(record: BookRecord, floorIndex: number, seedValue: string) {
    const seed = hashString(`${seedValue}:${floorIndex}`);
    const position = bookDropPosition(seed);
    record.basePosition.set(
      position.x,
      record.thickness / 2 + 0.014,
      position.z,
    );
    record.baseRotation.set(
      -Math.PI / 2,
      ((seed >>> 20) % 1_000) * (Math.PI / 500),
      (((seed >>> 27) % 32) / 31 - 0.5) * 0.24,
    );
  }

  #placeNewArrivalAboveFloor(record: BookRecord, seedValue: string) {
    const seed = hashString(`${seedValue}:arrival`);
    const position = bookDropPosition(seed);
    record.basePosition.set(
      position.x,
      2.7 + ((seed >>> 11) % 100) * 0.012,
      position.z,
    );
    record.baseRotation.set(
      -Math.PI / 2 + (((seed >>> 8) % 100) / 100 - 0.5) * 0.7,
      ((seed >>> 15) % 100) * (Math.PI / 50),
      (((seed >>> 24) % 100) / 100 - 0.5) * 0.6,
    );
  }

  setShelfPosition(record: BookRecord) {
    const state = record.state;
    if (state.status !== "shelved") return;

    const shelf = this.#host.spineShelfDefinitions().get(state.shelfId);
    if (!shelf) return;
    const shelfWidth =
      record.shelfPresentation === "face" ? record.width : record.thickness;
    record.shelfOffset = MathUtils.clamp(
      record.shelfOffset,
      -shelf.halfWidth + shelfWidth / 2,
      shelf.halfWidth - shelfWidth / 2,
    );
    const normalOffset =
      record.shelfPresentation === "face"
        ? -record.thickness / 2 - shelf.faceInset
        : spineShelfBookNormalOffset(record.width, shelf.backInset);
    record.shelfPosition
      .copy(shelf.frontCenter)
      .addScaledVector(shelf.axis, record.shelfOffset)
      .addScaledVector(shelf.normal, normalOffset);
  }

  setShelfRotation(record: BookRecord, publicationId: string) {
    if (record.state.status !== "shelved") return;
    const shelf = this.#host.spineShelfDefinitions().get(record.state.shelfId);
    if (!shelf) return;
    if (record.shelfPresentation === "face") {
      record.baseRotation.set(
        shelf.faceTilt,
        Math.atan2(shelf.normal.x, shelf.normal.z),
        ((hashString(publicationId) % 100) / 100 - 0.5) * 0.035,
      );
      this.#syncShelfHoverTarget(record);
      return;
    }
    const sign = record.spineNormalSign;
    record.baseRotation.set(
      0,
      Math.atan2(-shelf.normal.z * sign, shelf.normal.x * sign),
      0,
    );
    this.#syncShelfHoverTarget(record);
  }

  #syncShelfHoverTarget(record: BookRecord) {
    if (record.state.status !== "shelved") return;
    record.hoverTarget.position.copy(record.shelfPosition);
    record.hoverTarget.rotation.set(
      record.baseRotation.x,
      record.baseRotation.y,
      record.baseRotation.z,
      "XYZ",
    );
    record.hoverTarget.scale.set(record.width, BOOK_HEIGHT, record.thickness);
    record.hoverTarget.updateMatrixWorld(true);
  }

  setPhysicsPose(position: Vector3, rotation: Vector3) {
    this.#host.physicsPosePosition().copy(position);
    this.#host
      .physicsPoseEuler()
      .set(rotation.x, rotation.y, rotation.z, "XYZ");
    this.#host
      .physicsPoseRotation()
      .setFromEuler(this.#host.physicsPoseEuler());
    return this.#host.physicsPose();
  }

  #syncBookPhysics(publicationId: string, record: BookRecord) {
    const pose = this.setPhysicsPose(record.basePosition, record.baseRotation);
    if (!record.physicsRegistered) {
      record.physicsRegistered = this.#host.physicsWorld().addBook({
        ...(record.state.status === "shelved"
          ? {initialState: "shelved" as const}
          : {}),
        pose,
        publicationId,
        thickness: record.thickness,
        width: record.width,
      });
      if (record.physicsRegistered && record.state.status === "carried")
        this.#host.physicsWorld().holdBook(publicationId);
      return;
    }

    this.#host.physicsWorld().updateBook(publicationId, {
      ...(record.state.status === "shelved" ? {pose} : {}),
      thickness: record.thickness,
      width: record.width,
    });
  }

  #syncCarriedPublicationIds() {
    const carriedIds = new Set(
      [...this.#host.booksById().entries()]
        .filter(
          ([publicationId, record]) =>
            record.state.status === "carried" &&
            publicationId !==
              this.#host.bookActions().discardAnimation?.publicationId,
        )
        .map(([publicationId]) => publicationId),
    );
    const nextIds = this.#host
      .carriedPublicationIds()
      .filter((id) => carriedIds.has(id));
    for (const publicationId of this.#host.booksById().keys())
      if (carriedIds.has(publicationId) && !nextIds.includes(publicationId))
        nextIds.push(publicationId);
    this.#host
      .carriedPublicationIds()
      .splice(0, this.#host.carriedPublicationIds().length, ...nextIds);
    this.#host.setCarriedPublicationId(this.#host.carriedPublicationIds()[0]);
  }

  removeCarriedPublication(publicationId: string) {
    const index = this.#host.carriedPublicationIds().indexOf(publicationId);
    if (index < 0) return;
    this.#host.carriedPublicationIds().splice(index, 1);
    this.#host.setCarriedPublicationId(this.#host.carriedPublicationIds()[0]);
  }

  syncInteractiveMeshes() {
    this.#host.setInteractiveMeshes(
      [...this.#host.booksById().values()]
        .filter((record) => record.state.status === "floor")
        .map((record) => record.mesh),
    );
    // Group shelved proxies per shelf so the reticle sweep can cull whole
    // banks by camera distance instead of raycasting every book in the shop.
    this.#host.shelfHoverMeshesByShelf.clear();
    this.#host.ungroupedShelfHoverMeshes.length = 0;
    for (const record of this.#host.booksById().values()) {
      if (record.state.status !== "shelved") continue;
      const {shelfId} = record.state;
      const knownShelf =
        typeof shelfId === "string"
          ? this.#host.spineShelfDefinitions().get(shelfId)
          : undefined;
      if (!knownShelf || typeof shelfId !== "string") {
        this.#host.ungroupedShelfHoverMeshes.push(record.hoverTarget);
        continue;
      }
      let bucket = this.#host.shelfHoverMeshesByShelf.get(shelfId);
      if (!bucket) {
        bucket = [];
        this.#host.shelfHoverMeshesByShelf.set(shelfId, bucket);
      }
      bucket.push(record.hoverTarget);
    }
    this.#host.scanner().markDirty();
  }

  disposeBookRecord(record: BookRecord) {
    const publicationId = record.mesh.userData.publicationId;
    if (typeof publicationId === "string")
      this.#host.bookTextures().forgetStandaloneId(publicationId);
    if (record.atlasPlacement)
      record.atlasPlacement.batch.mesh.setVisibleAt(
        record.atlasPlacement.instanceId,
        false,
      );
    record.atlasPlacement = undefined;
    record.hoverTarget.removeFromParent();
    record.hoverTarget.geometry.dispose();
    record.hoverTarget.material.dispose();
    record.mesh.removeFromParent();
    record.inspectionLeftMaterial.map = null;
    record.inspectionRightMaterial.map = null;
    record.inspectionTurningFrontMaterial.map = null;
    this.#host.inspection().setInspectionTurningBackTexture(record, null);
    record.inspectionTurningPage.visible = false;
    record.inspectionLeftPage.geometry.dispose();
    record.inspectionRightPage.geometry.dispose();
    record.inspectionLeftBlock.geometry.dispose();
    record.inspectionRightBlock.geometry.dispose();
    record.inspectionBackCover.geometry.dispose();
    record.inspectionFrontCover.geometry.dispose();
    record.inspectionTurningPage.geometry.dispose();
    record.inspectionLeftMaterial.dispose();
    record.inspectionRightMaterial.dispose();
    record.inspectionPaperMaterial.dispose();
    record.inspectionBackCoverMaterial.dispose();
    record.inspectionFrontCoverMaterial.dispose();
    record.inspectionTurningFrontMaterial.dispose();
    record.inspectionTurningBackMaterial.dispose();
    record.texture?.dispose();
    record.detailTexture?.dispose();
    record.backTexture?.dispose();
    record.spineTexture?.dispose();
    record.mesh.geometry.dispose();
    record.exteriorMaterial.dispose();
  }

  applyBookStates() {
    for (const [publicationId, record] of this.#host.booksById()) {
      const selected =
        publicationId === this.#host.lastSelectedPublicationId() ||
        publicationId === this.#host.inspection().inspectionPublicationId;
      const hovered = publicationId === this.#host.hoveredPublicationId();
      const shelfHovered = hovered && record.state.status === "shelved";
      let targetScale = 1;
      if (hovered && !shelfHovered) targetScale = 1.08;
      else if (selected) targetScale = 1.025;
      record.targetScale = targetScale;
      record.targetLift = hovered && !shelfHovered ? 0.08 : 0;
      const discardTargeted =
        publicationId === this.#host.carriedPublicationId() &&
        this.#host.scanner().trashTargeted;
      record.sceneEmissive.set(
        discardTargeted
          ? DISCARD_TARGETED_EMISSIVE
          : hovered
            ? "#a34437"
            : selected
              ? "#49231f"
              : "#000000",
      );
      record.sceneEmissiveIntensity = discardTargeted
        ? DISCARD_TARGETED_EMISSIVE_INTENSITY
        : hovered
          ? 0.55
          : 0.2;
      record.exteriorMaterial.emissive.copy(record.sceneEmissive);
      record.exteriorMaterial.emissiveIntensity = record.sceneEmissiveIntensity;
      this.#host.inspection().applyInspectionLighting(record);
    }
  }
}
