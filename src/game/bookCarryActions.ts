import {
  Euler,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  type Scene,
  Vector3,
} from "three";
import {MathUtils} from "three";
import type {BookRecord} from "~/game/bookFactory";
import type {BookTextureRuntime} from "~/game/bookTextureRuntime";
import {BOOK_HEIGHT} from "~/game/bookTuning";
import {TRASH_CAN_HEIGHT, TRASH_CAN_PROP_ID} from "~/game/discardBin";
import type {
  MovablePropRecord,
  ShelfTargetSelection,
  SpineShelfDefinition,
} from "~/game/shopTypes";
import type {ShopPhysicsWorld, BookPhysicsPose} from "~/game/ShopPhysicsWorld";
import type {
  ShelfPresentation,
  SpineShelfPlacement,
} from "~/game/shelfPlacement";
import {transitionBookInteraction} from "~/game/shopGameplay";
import {SHOP_BOUNDS} from "~/game/shopLayout";
import {MAX_CARRIED_BOOKS} from "~/game/worldSave";

const THROW_CHARGE_SECONDS = 1.8;
const THROW_MIN_SPEED = 8.5;
const THROW_MAX_SPEED = 13.5;
const THROW_MIN_LIFT = 1.4;
const THROW_MAX_LIFT = 15;
const DISCARD_TOSS_DURATION_SECONDS = 0.52;
const SHELVE_BOOK_DURATION_SECONDS = 0.34;

export type ShelveAnimation = {
  elapsedSeconds: number;
  placements: readonly SpineShelfPlacement[] | undefined;
  publicationId: string;
  shelfId: string;
  startPosition: Vector3;
  startRotation: Quaternion;
  targetPosition: Vector3;
  targetRotation: Quaternion;
};

export type DiscardAnimation = {
  elapsedSeconds: number;
  publicationId: string;
  startPosition: Vector3;
  startRotation: Quaternion;
};

/**
 * Everything the carried-book action controller touches on its host scene,
 * as live accessors so every read stays current.
 */
export type BookCarryHost = {
  applyBookStates: () => void;
  bookTextures: () => BookTextureRuntime;
  booksById: () => Map<string, BookRecord>;
  camera: () => PerspectiveCamera;
  carriedProp: () => MovablePropRecord | undefined;
  carriedPublicationId: () => string | undefined;
  carriedPublicationIds: () => string[];
  clearShelfTargetSelection: () => void;
  discardBinGroup: () => Object3D;
  disposeBookRecord: (record: BookRecord) => void;
  disposed: () => boolean;
  emitGameState: () => void;
  flushWorldSave: () => void;
  heldTargetPose: () => BookPhysicsPose;
  hoveredPublicationId: () => string | undefined;
  inspectionMode: () => "closing" | "none" | "spread";
  lookYaw: () => number;
  markWorldStateDirty: () => void;
  movableProps: () => ReadonlyMap<string, MovablePropRecord>;
  onDiscardPublication:
    | (() => ((publicationId: string) => Promise<boolean>) | undefined)
    | undefined;
  physicsPose: () => BookPhysicsPose;
  physicsPosePosition: () => Vector3;
  physicsPoseRotation: () => Quaternion;
  physicsWorld: () => ShopPhysicsWorld;
  playerVelocity: () => Vector3;
  removeCarriedPublication: (publicationId: string) => void;
  scene: () => Scene;
  setCarriedPublicationId: (publicationId: string | undefined) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  setPhysicsPose: (position: Vector3, rotation: Vector3) => BookPhysicsPose;
  setShelfPosition: (record: BookRecord) => void;
  setShelfRotation: (record: BookRecord, publicationId: string) => void;
  setShelfPresentation: (presentation: ShelfPresentation) => void;
  setTrashTargeted: (targeted: boolean) => void;
  shelfTargetSelection: () => ShelfTargetSelection | undefined;
  spineShelfDefinitions: () => ReadonlyMap<string, SpineShelfDefinition>;
  syncCarriedBookPresentation: () => void;
  syncInteractiveMeshes: () => void;
  targetedTrashBinId: () => string | undefined;
  throwVelocity: () => Vector3;
  trashTargeted: () => boolean;
  updateHeldPhysicsTarget: () => void;
  updateShelfTargetVisuals: () => void;
  viewDirection: () => Vector3;
  writeHeldBookTargetPose: (index: number, publicationId: string) => void;
  writeHeldBookLocalPosition: (index: number, output: Vector3) => void;
  writeHeldBookLocalRotation: (index: number, output: Quaternion) => void;
};

/** Carried-book lifecycle: pick up, shelve, throw, drop, and discard. */
export class BookCarryActions {
  readonly discardedPublicationIds = new Set<string>();
  shelveAnimation: ShelveAnimation | undefined;
  discardAnimation: DiscardAnimation | undefined;
  discardBusy = false;
  discardError: string | undefined;
  pendingDiscardPublicationId: string | undefined;
  throwChargeActive = false;

  readonly #host: BookCarryHost;
  #throwChargeBucket = -1;
  #throwChargeSeconds = 0;
  readonly #throwAngularVelocity = new Vector3(2.8, 4.5, 1.9);
  readonly #trashTossTarget = new Vector3();
  readonly #trashTossRotation = new Quaternion().setFromEuler(
    new Euler(-Math.PI / 2, 0.45, Math.PI * 0.5),
  );

  constructor(host: BookCarryHost) {
    this.#host = host;
  }

  #refreshAfterBookMutation(
    clearShelfTarget = true,
    flushWorldSave = false,
  ): void {
    const host = this.#host;
    if (clearShelfTarget) host.clearShelfTargetSelection();
    host.setTrashTargeted(false);
    host.syncCarriedBookPresentation();
    host.updateHeldPhysicsTarget();
    host.syncInteractiveMeshes();
    host.updateShelfTargetVisuals();
    host.markWorldStateDirty();
    host.emitGameState();
    if (flushWorldSave) host.flushWorldSave();
  }

  pickUpBook(publicationId: string): void {
    const host = this.#host;
    if (
      host.carriedPublicationIds().length >= MAX_CARRIED_BOOKS ||
      host.carriedProp?.() !== undefined
    )
      return;
    const record = host.booksById().get(publicationId);
    if (!record) return;
    const previousShelfId =
      record.state.status === "shelved" ? record.state.shelfId : undefined;
    const transition = transitionBookInteraction(record.state, {
      type: "pick-up",
    });
    if (!transition.ok) return;

    record.state = transition.state;
    host.setShelfPresentation(record.shelfPresentation);
    if (previousShelfId) this.renumberSpineShelf(previousShelfId);
    host.bookTextures().promoteBookCoverTexture(publicationId, record);
    host.carriedPublicationIds().unshift(publicationId);
    host.setCarriedPublicationId(publicationId);
    this.discardError = undefined;
    host.setHoveredPublicationId(undefined);
    host.physicsWorld().holdBook(publicationId);
    if (host.physicsWorld().isReady) host.scene().attach(record.mesh);
    else {
      host.camera().add(record.mesh);
      host.writeHeldBookLocalPosition(0, record.mesh.position);
      host.writeHeldBookLocalRotation(0, record.mesh.quaternion);
    }
    record.mesh.scale.setScalar(1);
    record.targetLift = 0;
    record.targetScale = 1;
    host.syncInteractiveMeshes();
    host.updateHeldPhysicsTarget();
    host.updateShelfTargetVisuals();
    host.markWorldStateDirty();
    host.emitGameState();
  }

  shelveCarriedBook(): void {
    const host = this.#host;
    if (this.discardBusy || this.shelveAnimation) return;
    const publicationId = host.carriedPublicationId();
    if (!publicationId) return;
    const record = host.booksById().get(publicationId);
    if (!record) return;
    const selection = host.shelfTargetSelection();
    if (!selection) return;
    const transition = transitionBookInteraction(record.state, {
      shelfId: selection.shelfId,
      slotIndex: selection.slotIndex,
      type: "shelve",
    });
    if (!transition.ok) return;

    record.mesh.updateMatrixWorld(true);
    const startPosition = record.mesh.getWorldPosition(new Vector3());
    const startRotation = record.mesh.getWorldQuaternion(new Quaternion());
    host.scene().attach(record.mesh);
    record.mesh.position.copy(startPosition);
    record.mesh.quaternion.copy(startRotation);
    record.state = transition.state;
    record.shelfPresentation = selection.presentation;
    record.slotIndex = selection.slotIndex;
    record.shelfOffset = selection.offset;
    const insertedPlacement = selection.placements?.find(
      (placement) => placement.id === publicationId,
    );
    if (insertedPlacement) {
      record.slotIndex = insertedPlacement.slotIndex;
      record.shelfOffset = insertedPlacement.center;
    }
    host.setShelfPosition(record);
    host.setShelfRotation(record, publicationId);
    const targetPosition = record.shelfPosition.clone();
    const targetRotation = new Quaternion().setFromEuler(
      new Euler(
        record.baseRotation.x,
        record.baseRotation.y,
        record.baseRotation.z,
        "XYZ",
      ),
    );
    this.shelveAnimation = {
      elapsedSeconds: 0,
      placements: selection.placements,
      publicationId,
      shelfId: selection.shelfId,
      startPosition,
      startRotation,
      targetPosition,
      targetRotation,
    };
    host.removeCarriedPublication(publicationId);
    this.discardError = undefined;
    this.#refreshAfterBookMutation();
  }

  applySpineShelfPlacements(
    shelfId: string,
    placements: readonly SpineShelfPlacement[],
  ): void {
    const host = this.#host;
    for (const placement of placements) {
      const record = host.booksById().get(placement.id);
      if (!record) continue;
      record.slotIndex = placement.slotIndex;
      record.shelfOffset = placement.center;
      record.state = {
        shelfId,
        slotIndex: placement.slotIndex,
        status: "shelved",
      };
      host.setShelfPosition(record);
      record.basePosition.copy(record.shelfPosition);
      host.setShelfRotation(record, placement.id);
      host
        .physicsWorld()
        .shelveBook(
          placement.id,
          host.setPhysicsPose(record.shelfPosition, record.baseRotation),
        );
    }
  }

  renumberSpineShelf(shelfId: string): void {
    const host = this.#host;
    if (!host.spineShelfDefinitions().has(shelfId)) return;
    const records = [...host.booksById().values()]
      .filter(
        (record) =>
          record.state.status === "shelved" && record.state.shelfId === shelfId,
      )
      .sort((first, second) => first.shelfOffset - second.shelfOffset);
    for (const [slotIndex, record] of records.entries()) {
      record.slotIndex = slotIndex;
      record.state = {shelfId, slotIndex, status: "shelved"};
    }
  }

  throwChargeProgress(): number {
    return MathUtils.clamp(
      this.#throwChargeSeconds / THROW_CHARGE_SECONDS,
      0,
      1,
    );
  }

  startThrowCharge(): void {
    if (
      this.throwChargeActive ||
      !this.#host.carriedPublicationId() ||
      this.#host.inspectionMode() !== "none"
    )
      return;
    this.throwChargeActive = true;
    this.#throwChargeBucket = 0;
    this.#throwChargeSeconds = 0;
    this.#host.emitGameState();
  }

  updateThrowCharge(deltaSeconds: number): void {
    if (!this.throwChargeActive) return;
    if (
      !this.#host.carriedPublicationId() ||
      this.#host.inspectionMode() !== "none"
    ) {
      this.cancelThrowCharge();
      return;
    }
    this.#throwChargeSeconds = Math.min(
      THROW_CHARGE_SECONDS,
      this.#throwChargeSeconds + deltaSeconds,
    );
    const bucket = Math.round(this.throwChargeProgress() * 50);
    if (bucket === this.#throwChargeBucket) return;
    this.#throwChargeBucket = bucket;
    this.#host.emitGameState();
  }

  cancelThrowCharge(): void {
    if (!this.throwChargeActive) return;
    this.throwChargeActive = false;
    this.#throwChargeBucket = -1;
    this.#throwChargeSeconds = 0;
    this.#host.emitGameState();
  }

  releaseThrowCharge(): void {
    if (!this.throwChargeActive) return;
    const charge = this.throwChargeProgress();
    this.throwChargeActive = false;
    this.#throwChargeBucket = -1;
    this.#throwChargeSeconds = 0;
    this.dropCarriedBook(false, true, charge);
  }

  dropCarriedBook(
    fromCurrentPose = false,
    throwBook = false,
    throwCharge = 0,
    publicationIdOverride?: string,
  ): void {
    const host = this.#host;
    if (this.discardBusy) return;
    const publicationId = publicationIdOverride ?? host.carriedPublicationId();
    if (!publicationId) return;
    const record = host.booksById().get(publicationId);
    if (!record) return;
    if (this.throwChargeActive) {
      this.throwChargeActive = false;
      this.#throwChargeBucket = -1;
      this.#throwChargeSeconds = 0;
    }
    const transition = transitionBookInteraction(record.state, {type: "drop"});
    if (!transition.ok) return;

    let dropPose = host.heldTargetPose();
    if (fromCurrentPose) {
      record.mesh.updateMatrixWorld(true);
      record.mesh.getWorldPosition(host.physicsPosePosition());
      record.mesh.getWorldQuaternion(host.physicsPoseRotation());
      dropPose = host.physicsPose();
    } else {
      host.updateHeldPhysicsTarget();
      const carriedIndex = host.carriedPublicationIds().indexOf(publicationId);
      if (carriedIndex >= 0)
        host.writeHeldBookTargetPose(carriedIndex, publicationId);
      dropPose = host.heldTargetPose();
    }
    host.scene().attach(record.mesh);
    host.camera().getWorldDirection(host.viewDirection());
    record.state = transition.state;
    host.bookTextures().restoreCompactBookCoverTexture(record);
    const charge = MathUtils.clamp(throwCharge, 0, 1);
    const throwSpeed = MathUtils.lerp(THROW_MIN_SPEED, THROW_MAX_SPEED, charge);
    const throwLift = MathUtils.lerp(THROW_MIN_LIFT, THROW_MAX_LIFT, charge);
    const linearVelocity = throwBook
      ? host
          .throwVelocity()
          .copy(host.viewDirection())
          .multiplyScalar(throwSpeed)
          .add(host.playerVelocity())
          .setY(
            host.viewDirection().y * throwSpeed +
              host.playerVelocity().y +
              throwLift,
          )
      : host.playerVelocity();
    host.physicsWorld().dropBook(publicationId, {
      ...(throwBook ? {angularVelocity: this.#throwAngularVelocity} : {}),
      linearVelocity,
      pose: dropPose,
    });
    host.physicsWorld().setBookCollisionlessWithHeld(publicationId, true);
    record.basePosition.set(
      MathUtils.clamp(
        host.camera().position.x + host.viewDirection().x * 0.95,
        SHOP_BOUNDS.minX + record.width,
        SHOP_BOUNDS.maxX - record.width,
      ),
      record.thickness / 2 + 0.014,
      MathUtils.clamp(
        host.camera().position.z + host.viewDirection().z * 0.95,
        SHOP_BOUNDS.minZ + BOOK_HEIGHT,
        SHOP_BOUNDS.maxZ - BOOK_HEIGHT,
      ),
    );
    record.baseRotation.set(-Math.PI / 2, host.lookYaw(), -0.04);
    host.removeCarriedPublication(publicationId);
    this.discardError = undefined;
    this.#refreshAfterBookMutation();
  }

  async discardCarriedBook(): Promise<void> {
    const host = this.#host;
    const publicationId = host.carriedPublicationId();
    if (!publicationId || this.discardBusy || !host.trashTargeted()) return;
    const record = host.booksById().get(publicationId);
    if (!record) return;

    this.discardBusy = true;
    this.discardError = undefined;
    this.pendingDiscardPublicationId = publicationId;
    host.emitGameState();

    let discarded = false;
    try {
      discarded =
        (await host.onDiscardPublication?.()?.(publicationId)) === true;
    } catch (error) {
      if (!host.disposed())
        this.discardError =
          error instanceof Error && error.message
            ? error.message
            : "The library rejected the discard.";
    }
    if (host.disposed()) return;
    this.discardBusy = false;
    this.pendingDiscardPublicationId = undefined;

    if (!discarded) {
      this.discardError ??= host.onDiscardPublication
        ? "The library rejected the discard."
        : "Discard is unavailable in this library.";
      host.emitGameState();
      return;
    }

    this.discardError = undefined;
    this.discardedPublicationIds.add(publicationId);
    const currentRecord = host.booksById().get(publicationId);
    if (currentRecord !== record) {
      if (currentRecord) {
        host.physicsWorld().removeBook(publicationId);
        host.disposeBookRecord(currentRecord);
        host.booksById().delete(publicationId);
      }
      host.removeCarriedPublication(publicationId);
      this.#refreshAfterBookMutation(false, true);
      return;
    }
    host.scene().attach(record.mesh);
    host.physicsWorld().removeBook(publicationId);
    record.physicsRegistered = false;
    this.discardAnimation = {
      elapsedSeconds: 0,
      publicationId,
      startPosition: record.mesh.position.clone(),
      startRotation: record.mesh.quaternion.clone(),
    };
    host.removeCarriedPublication(publicationId);
    this.#refreshAfterBookMutation(true, true);
  }

  finishShelveAnimation(): void {
    const animation = this.shelveAnimation;
    if (!animation) return;
    const host = this.#host;
    const record = host.booksById().get(animation.publicationId);
    this.shelveAnimation = undefined;
    if (!record) return;

    record.mesh.position.copy(animation.targetPosition);
    record.mesh.quaternion.copy(animation.targetRotation);
    record.mesh.scale.setScalar(1);
    record.shelfPreview = 0;
    host.bookTextures().restoreCompactBookCoverTexture(record);
    if (animation.placements)
      this.applySpineShelfPlacements(animation.shelfId, animation.placements);
    else {
      record.basePosition.copy(record.shelfPosition);
      host
        .physicsWorld()
        .shelveBook(
          animation.publicationId,
          host.setPhysicsPose(record.shelfPosition, record.baseRotation),
        );
    }
    host.syncInteractiveMeshes();
    host.applyBookStates();
    host.updateShelfTargetVisuals();
    host.markWorldStateDirty();
    host.emitGameState();
  }

  animateShelve(deltaSeconds: number): void {
    const animation = this.shelveAnimation;
    if (!animation) return;
    const record = this.#host.booksById().get(animation.publicationId);
    if (!record) {
      this.shelveAnimation = undefined;
      return;
    }
    animation.elapsedSeconds = Math.min(
      SHELVE_BOOK_DURATION_SECONDS,
      animation.elapsedSeconds + deltaSeconds,
    );
    const progress = animation.elapsedSeconds / SHELVE_BOOK_DURATION_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    record.mesh.position.lerpVectors(
      animation.startPosition,
      animation.targetPosition,
      eased,
    );
    record.mesh.quaternion.slerpQuaternions(
      animation.startRotation,
      animation.targetRotation,
      eased,
    );
    record.mesh.scale.setScalar(1);
    if (progress >= 1) this.finishShelveAnimation();
  }

  animateDiscard(deltaSeconds: number): void {
    const animation = this.discardAnimation;
    if (!animation) return;
    const host = this.#host;
    const record = host.booksById().get(animation.publicationId);
    if (!record) {
      this.discardAnimation = undefined;
      return;
    }

    animation.elapsedSeconds = Math.min(
      DISCARD_TOSS_DURATION_SECONDS,
      animation.elapsedSeconds + deltaSeconds,
    );
    const progress = animation.elapsedSeconds / DISCARD_TOSS_DURATION_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    // Aim the toss at whichever bin the player targeted, falling back to
    // the seeded discard bin when that one is gone.
    const targetedTrashBinId = host.targetedTrashBinId();
    const discardBin =
      (targetedTrashBinId !== undefined
        ? host.movableProps().get(targetedTrashBinId)?.object
        : undefined) ??
      host.movableProps().get(TRASH_CAN_PROP_ID)?.object ??
      host.discardBinGroup();
    discardBin.updateWorldMatrix(true, false);
    this.#trashTossTarget.set(0, TRASH_CAN_HEIGHT * 0.35, 0);
    discardBin.localToWorld(this.#trashTossTarget);
    record.mesh.position.lerpVectors(
      animation.startPosition,
      this.#trashTossTarget,
      eased,
    );
    record.mesh.position.y += Math.sin(progress * Math.PI) * 0.72;
    record.mesh.quaternion.slerpQuaternions(
      animation.startRotation,
      this.#trashTossRotation,
      eased,
    );
    record.mesh.scale.setScalar(1 - progress * 0.28);
    if (progress < 1) return;

    this.discardAnimation = undefined;
    host.physicsWorld().removeBook(animation.publicationId);
    host.disposeBookRecord(record);
    host.booksById().delete(animation.publicationId);
    if (host.hoveredPublicationId() === animation.publicationId)
      host.setHoveredPublicationId(undefined);
    host.syncInteractiveMeshes();
    host.applyBookStates();
    host.markWorldStateDirty();
    host.emitGameState();
  }
}
