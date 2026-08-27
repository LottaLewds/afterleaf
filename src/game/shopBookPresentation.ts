import {MathUtils, Quaternion, Vector3, type PerspectiveCamera, type Scene} from "three";

import {
  INSPECTION_ACTION_CLOSE_SPEED,
  INSPECTION_COVER_ANIMATION_SPEED,
  INSPECTION_OPEN_ANGLE,
  INSPECTION_TRANSITION_POSITION_EPSILON_SQ,
  INSPECTION_TRANSITION_ROTATION_EPSILON,
  INSPECTION_TRANSITION_SPEED,
  SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS,
  SHELF_PREVIEW_PULL_END,
  SHELF_PREVIEW_ROTATION_START,
  SHELF_PREVIEW_SPEED,
} from "~/game/bookInspectionTuning";
import {BOOK_UNDER_SHELF_RECOVERY_Y, BOOK_VOID_RECOVERY_Y} from "~/game/bookTuning";
import type {BookRecord} from "~/game/bookFactory";
import type {BookCarryActions} from "~/game/bookCarryActions";
import {hashString} from "~/game/mathHelpers";
import {dotWithPhysicsQuaternion} from "~/game/mathHelpers";
import type {InspectionController} from "~/game/inspection/InspectionController";
import type {InputManager} from "~/game/input/inputManager";
import type {ShopBookLifecycle} from "~/game/shopBookLifecycle";
import type {SpineShelfDefinition} from "~/game/shopTypes";
import {isPointInsideShopObstacle} from "~/game/shopGameplay";
import {SHOP_INTERIOR_FOOTPRINTS} from "~/game/shopLayout";
import {type BookPhysicsPose, type MutableBookPhysicsTransform, type ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";

const HELD_BOOK_STACK_GAP = 0.012;
const HELD_BOOK_FAN_X_SPACING = 0.105;
const HELD_BOOK_FAN_Y_SPACING = 0.008;
const HELD_BOOK_FAN_ANGLE = 0.1;

export type ShopBookPresentationHost = {
  bookActions: () => BookCarryActions;
  bookLifecycle: () => ShopBookLifecycle;
  booksById: () => Map<string, BookRecord>;
  camera: () => PerspectiveCamera;
  carriedPublicationIds: () => readonly string[];
  emitGameState: () => void;
  heldLocalPosition: () => Vector3;
  heldLocalRotation: () => Quaternion;
  heldTargetPose: () => BookPhysicsPose;
  heldTargetPosition: () => Vector3;
  heldTargetRotation: () => Quaternion;
  hoveredPublicationId: () => string | undefined;
  input: () => InputManager;
  inspection: () => InspectionController;
  lastSelectedPublicationId: () => string | null | undefined;
  markScannerDirty: () => void;
  markWorldStateDirty: () => void;
  physicsPoseEuler: () => import("three").Euler;
  physicsTransform: () => MutableBookPhysicsTransform;
  physicsWorld: () => ShopPhysicsWorld;
  scene: () => Scene;
  setInteractiveMeshes: () => void;
  setPhysicsPose: (position: Vector3, rotation: Vector3) => BookPhysicsPose;
  spineShelfDefinitions: () => ReadonlyMap<string, SpineShelfDefinition>;
};

/** Owns the visual and physics presentation of books after their lifecycle state is set. */
export class ShopBookPresentation {
  readonly #activeVisualPublicationIds = new Set<string>();
  readonly #animatedPublicationIds = new Set<string>();
  readonly #host: ShopBookPresentationHost;
  readonly #heldBookFanAxis = new Vector3(0, 0, 1);
  readonly #heldBookFanRotation = new Quaternion();
  readonly #heldBookLocalPoseRotation = new Quaternion();
  readonly #shelfPreviewBaseRotation = new Quaternion();
  readonly #shelfPreviewTargetRotation = new Quaternion();

  constructor(host: ShopBookPresentationHost) {
    this.#host = host;
  }

  get updatedPublicationIds(): ReadonlySet<string> {
    return this.#animatedPublicationIds;
  }

  #queueActiveVisualPublications() {
    const host = this.#host;
    const inspectionPublicationId = host.inspection().inspectionPublicationId;
    if (inspectionPublicationId) this.#activeVisualPublicationIds.add(inspectionPublicationId);
    const shelvePublicationId = host.bookActions().shelveAnimation?.publicationId;
    if (shelvePublicationId) this.#activeVisualPublicationIds.add(shelvePublicationId);
    const discardPublicationId = host.bookActions().discardAnimation?.publicationId;
    if (discardPublicationId) this.#activeVisualPublicationIds.add(discardPublicationId);
    const lastSelectedPublicationId = host.lastSelectedPublicationId();
    if (lastSelectedPublicationId) this.#activeVisualPublicationIds.add(lastSelectedPublicationId);
    const hoveredPublicationId = host.hoveredPublicationId();
    if (hoveredPublicationId && host.booksById().get(hoveredPublicationId)?.state.status === "shelved")
      this.#activeVisualPublicationIds.add(hoveredPublicationId);
  }

  #isVisualPublicationActive(publicationId: string, record: BookRecord) {
    const host = this.#host;
    if (record.inspectionLightingBlend > 0) return true;
    if (publicationId === host.inspection().inspectionPublicationId && host.inspection().inspectionMode !== "none")
      return true;
    if (publicationId === host.bookActions().shelveAnimation?.publicationId) return true;
    if (record.state.status !== "shelved") return false;
    return (
      record.shelfPreview > 0 || (publicationId === host.hoveredPublicationId() && host.input().isActionDown("throw"))
    );
  }

  #animateVisualPublication(publicationId: string, deltaSeconds: number) {
    const record = this.#host.booksById().get(publicationId);
    if (!record) {
      this.#activeVisualPublicationIds.delete(publicationId);
      return false;
    }
    const interactionStateChanged = this.#animateBook(publicationId, record, deltaSeconds);
    this.#animatedPublicationIds.add(publicationId);
    if (!this.#isVisualPublicationActive(publicationId, record)) this.#activeVisualPublicationIds.delete(publicationId);
    return interactionStateChanged;
  }

  #isEscapedPhysicsBook(publicationId: string, physicsState: string | undefined) {
    const host = this.#host;
    const trappedUnderShelf =
      physicsState === "dynamic" &&
      host.physicsTransform().position.y < BOOK_UNDER_SHELF_RECOVERY_Y &&
      SHOP_INTERIOR_FOOTPRINTS.some((footprint) =>
        isPointInsideShopObstacle(host.physicsTransform().position, footprint),
      );
    return (
      !host.carriedPublicationIds().includes(publicationId) &&
      (host.physicsTransform().position.y < BOOK_VOID_RECOVERY_Y || trappedUnderShelf)
    );
  }

  #syncPhysicsBookPose(record: BookRecord) {
    const host = this.#host;
    // Batch-rendered books stay detached; their instance matrix picks
    // up any real pose change in syncActiveBookAtlasBatches.
    if (!record.atlasPlacement?.visible && record.mesh.parent !== host.scene()) host.scene().attach(record.mesh);
    record.mesh.position.copy(host.physicsTransform().position);
    record.mesh.quaternion.copy(host.physicsTransform().rotation);
    record.mesh.scale.setScalar(1);
    record.basePosition.copy(host.physicsTransform().position);
    host.physicsPoseEuler().setFromQuaternion(record.mesh.quaternion, "XYZ");
    record.baseRotation.set(host.physicsPoseEuler().x, host.physicsPoseEuler().y, host.physicsPoseEuler().z);
  }

  #animatePhysicsBook(publicationId: string, record: BookRecord, deltaSeconds: number): boolean {
    const host = this.#host;
    const physicsState = host.physicsWorld().getBookState(publicationId);
    if (this.#isEscapedPhysicsBook(publicationId, physicsState)) {
      const interactionStateChanged = record.state.status !== "floor";
      this.#respawnEscapedBook(publicationId, record);
      return interactionStateChanged;
    }
    let interactionStateChanged = false;
    if (record.state.status === "shelved" && physicsState === "dynamic") {
      record.state = {status: "floor"};
      interactionStateChanged = true;
    }
    const shelfIsStationary = record.state.status === "shelved";
    const positionChanged =
      !shelfIsStationary && record.basePosition.distanceToSquared(host.physicsTransform().position) > 1e-8;
    const rotationChanged =
      !shelfIsStationary &&
      1 - Math.abs(dotWithPhysicsQuaternion(record.mesh.quaternion, host.physicsTransform().rotation)) > 1e-7;
    this.#syncPhysicsBookPose(record);
    if (record.state.status === "shelved")
      this.#animateShelfPreview(
        record,
        publicationId === host.hoveredPublicationId() && host.input().isActionDown("throw"),
        deltaSeconds,
      );
    if (positionChanged || rotationChanged) {
      host.markWorldStateDirty();
      // A moving prop can enter or leave the reticle; re-sweep.
      host.markScannerDirty();
    }
    return interactionStateChanged;
  }

  #animateLooseBook(record: BookRecord, deltaSeconds: number) {
    const scale = MathUtils.damp(record.mesh.scale.x, record.targetScale, 13, deltaSeconds);
    record.mesh.scale.setScalar(scale);
    record.mesh.position.x = MathUtils.damp(record.mesh.position.x, record.basePosition.x, 12, deltaSeconds);
    record.mesh.position.y = MathUtils.damp(
      record.mesh.position.y,
      record.basePosition.y + record.targetLift,
      12,
      deltaSeconds,
    );
    record.mesh.position.z = MathUtils.damp(record.mesh.position.z, record.basePosition.z, 12, deltaSeconds);
    record.mesh.rotation.x = MathUtils.damp(record.mesh.rotation.x, record.baseRotation.x, 12, deltaSeconds);
    record.mesh.rotation.y = MathUtils.damp(record.mesh.rotation.y, record.baseRotation.y, 12, deltaSeconds);
    record.mesh.rotation.z = MathUtils.damp(record.mesh.rotation.z, record.baseRotation.z, 12, deltaSeconds);
  }

  #animateBook(publicationId: string, record: BookRecord, deltaSeconds: number): boolean {
    const host = this.#host;
    if (host.bookActions().shelveAnimation?.publicationId === publicationId) return false;
    const inspectionFocused =
      publicationId === host.inspection().inspectionPublicationId && host.inspection().inspectionMode === "spread";
    if (inspectionFocused || record.inspectionLightingBlend > 0)
      host.inspection().animateInspectionLighting(record, inspectionFocused, deltaSeconds);
    if (this.#animateInspectedBookIfNeeded(publicationId, record, deltaSeconds)) return false;
    const physicsResult = this.#animatePhysicsBookIfReady(publicationId, record, deltaSeconds);
    if (physicsResult !== undefined) return physicsResult;
    return this.#animateBookWithoutPhysics(publicationId, record, deltaSeconds);
  }

  #animateBookWithoutPhysics(publicationId: string, record: BookRecord, deltaSeconds: number) {
    const host = this.#host;
    if (record.state.status === "carried") return false;
    if (record.state.status === "shelved") {
      this.#animateShelfPreview(
        record,
        publicationId === host.hoveredPublicationId() && host.input().isActionDown("throw"),
        deltaSeconds,
      );
      return false;
    }
    this.#animateLooseBook(record, deltaSeconds);
    return false;
  }

  #animateInspectedBookIfNeeded(publicationId: string, record: BookRecord, deltaSeconds: number) {
    const inspection = this.#host.inspection();
    if (publicationId !== inspection.inspectionPublicationId || inspection.inspectionMode === "none") return false;
    this.#animateInspectedBook(record, deltaSeconds);
    return true;
  }

  #animatePhysicsBookIfReady(publicationId: string, record: BookRecord, deltaSeconds: number) {
    const host = this.#host;
    if (!host.physicsWorld().isReady) return;
    if (!host.physicsWorld().sampleInterpolatedBookTransform(publicationId, host.physicsTransform())) return;
    return this.#animatePhysicsBook(publicationId, record, deltaSeconds);
  }

  animate(deltaSeconds: number) {
    const host = this.#host;
    this.#queueActiveVisualPublications();
    this.#animatedPublicationIds.clear();
    let interactionStateChanged = false;
    for (const publicationId of this.#activeVisualPublicationIds)
      interactionStateChanged = this.#animateVisualPublication(publicationId, deltaSeconds) || interactionStateChanged;
    for (const publicationId of host.physicsWorld().activeBookPublicationIds) {
      if (this.#animatedPublicationIds.has(publicationId)) continue;
      const record = host.booksById().get(publicationId);
      if (!record) continue;
      this.#animatedPublicationIds.add(publicationId);
      interactionStateChanged = this.#animateBook(publicationId, record, deltaSeconds) || interactionStateChanged;
    }
    if (!interactionStateChanged) return;
    host.setInteractiveMeshes();
    host.markWorldStateDirty();
    host.emitGameState();
  }

  syncCarriedBookPresentation() {
    const host = this.#host;
    if (host.physicsWorld().isReady) return;
    for (const [index, publicationId] of host.carriedPublicationIds().entries()) {
      if (publicationId === host.inspection().inspectionPublicationId && host.inspection().inspectionMode !== "none")
        continue;
      const record = host.booksById().get(publicationId);
      if (!record) continue;
      if (record.mesh.parent !== host.camera()) host.camera().add(record.mesh);
      this.writeHeldBookLocalPosition(index, host.heldTargetPosition());
      record.mesh.position.copy(host.heldTargetPosition());
      this.writeHeldBookLocalRotation(index, record.mesh.quaternion);
      record.mesh.scale.setScalar(1);
    }
  }

  writeHeldBookLocalPosition(index: number, output: Vector3) {
    const host = this.#host;
    let offset = 0;
    for (let stackIndex = 1; stackIndex <= index; stackIndex += 1) {
      const previous = host.booksById().get(host.carriedPublicationIds()[stackIndex - 1] ?? "");
      const current = host.booksById().get(host.carriedPublicationIds()[stackIndex] ?? "");
      if (!previous || !current) continue;
      offset += (previous.thickness + current.thickness) / 2;
      offset += HELD_BOOK_STACK_GAP;
    }
    output.copy(host.heldLocalPosition());
    output.x += index * HELD_BOOK_FAN_X_SPACING;
    output.y += index * HELD_BOOK_FAN_Y_SPACING;
    output.z -= offset;
  }

  writeHeldBookLocalRotation(index: number, output: Quaternion) {
    this.#heldBookFanRotation.setFromAxisAngle(this.#heldBookFanAxis, index * HELD_BOOK_FAN_ANGLE);
    output.copy(this.#host.heldLocalRotation()).multiply(this.#heldBookFanRotation);
  }

  writeHeldBookTargetPose(index: number, publicationId: string) {
    const host = this.#host;
    const inspecting =
      host.inspection().inspectionMode === "spread" && publicationId === host.inspection().inspectionPublicationId;
    if (inspecting) {
      host.inspection().updateInspectionLocalTarget();
      host.heldTargetPosition().copy(host.inspection().inspectionLocalPosition);
    } else this.writeHeldBookLocalPosition(index, host.heldTargetPosition());
    host.heldTargetPosition().applyMatrix4(host.camera().matrixWorld);
    host.camera().getWorldQuaternion(host.heldTargetRotation());
    if (!inspecting) {
      this.writeHeldBookLocalRotation(index, this.#heldBookLocalPoseRotation);
      host.heldTargetRotation().multiply(this.#heldBookLocalPoseRotation);
    }
  }

  updateHeldPhysicsTarget() {
    const host = this.#host;
    if (host.carriedPublicationIds().length === 0) return;
    host.camera().updateMatrixWorld();
    for (const [index, publicationId] of host.carriedPublicationIds().entries()) {
      this.writeHeldBookTargetPose(index, publicationId);
      host.physicsWorld().setHeldTarget(publicationId, host.heldTargetPose());
    }
  }

  #writeInspectionTransitionTarget(returningToHand: boolean) {
    const host = this.#host;
    if (!returningToHand) host.inspection().updateInspectionLocalTarget();
    if (!returningToHand) return;
    const publicationId = host.inspection().inspectionPublicationId;
    const carriedIndex = publicationId ? host.carriedPublicationIds().indexOf(publicationId) : -1;
    if (carriedIndex >= 0) {
      this.writeHeldBookLocalPosition(carriedIndex, host.inspection().inspectionLocalPosition);
      this.writeHeldBookLocalRotation(carriedIndex, host.inspection().inspectionLocalRotation);
      return;
    }
    host.inspection().inspectionLocalPosition.copy(host.heldLocalPosition());
    host.inspection().inspectionLocalRotation.copy(host.heldLocalRotation());
  }

  #animateInspectionMesh(record: BookRecord, deltaSeconds: number, returningToHand: boolean) {
    const host = this.#host;
    this.#writeInspectionTransitionTarget(returningToHand);
    const targetPosition = host.inspection().inspectionLocalPosition;
    const targetRotation = host.inspection().inspectionLocalRotation;
    if (record.mesh.parent !== host.camera()) host.camera().attach(record.mesh);
    record.mesh.position.x = MathUtils.damp(
      record.mesh.position.x,
      targetPosition.x,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.y = MathUtils.damp(
      record.mesh.position.y,
      targetPosition.y,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.position.z = MathUtils.damp(
      record.mesh.position.z,
      targetPosition.z,
      INSPECTION_TRANSITION_SPEED,
      deltaSeconds,
    );
    record.mesh.quaternion.slerp(targetRotation, 1 - Math.exp(-INSPECTION_TRANSITION_SPEED * deltaSeconds));
    record.mesh.scale.setScalar(1);
    const coverAnimationSpeed = this.#inspectionCoverAnimationSpeed(returningToHand);
    host.inspection().animateInspectionOpening(record, deltaSeconds, coverAnimationSpeed);
    this.#showCompactInspectionBookIfReady(record);
    host.inspection().animateInspectionPageTurn(record, deltaSeconds);
    this.#finishInspectionMeshIfReady(record, targetPosition, targetRotation);
  }

  #inspectionCoverAnimationSpeed(returningToHand: boolean) {
    const closeAction = this.#host.inspection().inspectionCloseAction;
    return returningToHand && (closeAction === "drop" || closeAction === "throw")
      ? INSPECTION_ACTION_CLOSE_SPEED
      : INSPECTION_COVER_ANIMATION_SPEED;
  }

  #showCompactInspectionBookIfReady(record: BookRecord) {
    const inspection = this.#host.inspection();
    if (
      inspection.inspectionMode === "closing" &&
      inspection.inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.inspectionGroup.visible
    )
      inspection.showCompactInspectionBook(record);
  }

  #finishInspectionMeshIfReady(record: BookRecord, targetPosition: Vector3, targetRotation: Quaternion) {
    const inspection = this.#host.inspection();
    if (
      inspection.inspectionMode === "closing" &&
      inspection.inspectionOpenAngle === INSPECTION_OPEN_ANGLE &&
      record.mesh.position.distanceToSquared(targetPosition) < INSPECTION_TRANSITION_POSITION_EPSILON_SQ &&
      1 - Math.abs(record.mesh.quaternion.dot(targetRotation)) < INSPECTION_TRANSITION_ROTATION_EPSILON
    ) {
      record.mesh.position.copy(targetPosition);
      record.mesh.quaternion.copy(targetRotation);
      inspection.finishInspectionClose();
    }
  }

  #animateInspectedBook(record: BookRecord, deltaSeconds: number) {
    const host = this.#host;
    const returningToHand = host.inspection().inspectionMode === "closing";
    if (returningToHand && record.state.status === "shelved") {
      host.inspection().animateInspectionShelfReturn(record, deltaSeconds);
      return;
    }
    if (!returningToHand && record.state.status === "shelved" && host.inspection().inspectionShelfFocusPending) {
      if (!this.#animateShelfPreview(record, true, deltaSeconds)) return;
      host.inspection().inspectionShelfFocusPending = false;
      return;
    }
    if (returningToHand && this.#animateInspectionPhysicsReturnIfReady(record, deltaSeconds)) return;
    this.#animateInspectionMesh(record, deltaSeconds, returningToHand);
  }

  #animateInspectionPhysicsReturnIfReady(record: BookRecord, deltaSeconds: number) {
    const inspection = this.#host.inspection();
    const publicationId = inspection.inspectionPublicationId;
    const returnReady =
      inspection.inspectionPhysicsReturnActive ||
      (publicationId !== undefined && inspection.beginInspectionPhysicsReturn(record, publicationId));
    if (!returnReady) return false;
    inspection.animateInspectionPhysicsReturn(record, deltaSeconds);
    return true;
  }

  #animateShelfPreview(record: BookRecord, targeted: boolean, deltaSeconds: number) {
    const host = this.#host;
    const shelf =
      record.state.status === "shelved" ? host.spineShelfDefinitions().get(record.state.shelfId) : undefined;
    if (!shelf) return false;
    record.shelfPreview = MathUtils.damp(record.shelfPreview, targeted ? 1 : 0, SHELF_PREVIEW_SPEED, deltaSeconds);
    if (!targeted && record.shelfPreview < 0.001) record.shelfPreview = 0;
    const pullProgress = MathUtils.smoothstep(record.shelfPreview, 0, SHELF_PREVIEW_PULL_END);
    const rotationProgress = MathUtils.smoothstep(record.shelfPreview, SHELF_PREVIEW_ROTATION_START, 1);
    const outwardDistance = record.shelfPresentation === "face" ? 0.14 : record.width * 0.72 + 0.1;
    record.mesh.position.copy(record.basePosition).addScaledVector(shelf.normal, outwardDistance * pullProgress);
    this.#shelfPreviewBaseRotation.setFromEuler(
      host.physicsPoseEuler().set(record.baseRotation.x, record.baseRotation.y, record.baseRotation.z, "XYZ"),
    );
    record.mesh.quaternion.copy(this.#shelfPreviewBaseRotation);
    this.#applyShelfPreviewRotation(record, rotationProgress);
    const scaleProgress = record.shelfPresentation === "spine" ? rotationProgress : pullProgress;
    record.mesh.scale.setScalar(1 + scaleProgress * 0.025);
    return targeted ? rotationProgress >= SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS : record.shelfPreview === 0;
  }

  #applyShelfPreviewRotation(record: BookRecord, rotationProgress: number) {
    if (record.shelfPresentation !== "spine" || rotationProgress <= 0) return;
    const host = this.#host;
    this.#shelfPreviewTargetRotation.setFromEuler(
      host
        .physicsPoseEuler()
        .set(
          0,
          Math.atan2(
            host.camera().position.x - record.mesh.position.x,
            host.camera().position.z - record.mesh.position.z,
          ),
          0,
          "XYZ",
        ),
    );
    record.mesh.quaternion.slerp(this.#shelfPreviewTargetRotation, rotationProgress);
  }

  #respawnEscapedBook(publicationId: string, record: BookRecord) {
    const host = this.#host;
    const seed = hashString(`${publicationId}:void-recovery`);
    record.state = {status: "floor"};
    record.basePosition.set(
      (((seed >>> 5) % 1_000) / 999 - 0.5) * 3.2,
      5.5 + ((seed >>> 15) % 100) * 0.012,
      21 + ((seed >>> 23) % 100) * 0.025,
    );
    record.baseRotation.set(
      -Math.PI / 2,
      ((seed >>> 11) % 1_000) * (Math.PI / 500),
      (((seed >>> 26) % 64) / 63 - 0.5) * 0.32,
    );
    record.mesh.position.copy(record.basePosition);
    record.mesh.rotation.set(record.baseRotation.x, record.baseRotation.y, record.baseRotation.z, "XYZ");
    record.mesh.scale.setScalar(1);
    host
      .physicsWorld()
      .respawnBook(publicationId, host.bookLifecycle().setPhysicsPose(record.basePosition, record.baseRotation));
    host.markWorldStateDirty();
  }
}
