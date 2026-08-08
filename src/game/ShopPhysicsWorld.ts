import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  RigidBodyDesc,
  World,
} from "@dimforge/rapier3d-compat";

import {SHOP_COLLISION_BOXES} from "~/game/shopLayout";
import {SHOP_EXPANSION_COLLISION_BOXES} from "~/game/shopExpansionLayout";

export const SHOP_PHYSICS_BOOK_WIDTH = 0.5;
export const SHOP_PHYSICS_BOOK_HEIGHT = 0.74;
/** Overall collision-capsule height from the feet to the top of the head. */
export const SHOP_PHYSICS_PLAYER_BODY_HEIGHT = 1.64;
export const SHOP_PHYSICS_PLAYER_RADIUS = 0.3;
/** Camera/eye height above the feet at the default grounded pose. */
export const SHOP_PHYSICS_PLAYER_EYE_HEIGHT = 1.66;
/** Subtract this from public eye Y to obtain Rapier's capsule-center Y. */
export const SHOP_PHYSICS_PLAYER_EYE_TO_CENTER =
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT - SHOP_PHYSICS_PLAYER_BODY_HEIGHT * 0.5;
export const SHOP_PHYSICS_TRASH_POSITION_X = -4.25;
export const SHOP_PHYSICS_TRASH_POSITION_Z = 1;
export const SHOP_PHYSICS_TRASH_HALF_EXTENT = 0.56;

const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_SUBSTEPS = 4;
const DEFAULT_GRAVITY = -9.81;
const DYNAMIC_LINEAR_DAMPING = 0.24;
const DYNAMIC_ANGULAR_DAMPING = 0.38;
const HELD_LINEAR_DAMPING = 4.5;
const HELD_ANGULAR_DAMPING = 5.5;
const HELD_LINEAR_STIFFNESS = 112;
const HELD_LINEAR_DAMPING_GAIN = 18;
const HELD_ANGULAR_STIFFNESS = 68;
const HELD_ANGULAR_DAMPING_GAIN = 14;
const HELD_MAX_LINEAR_SPEED = 12;
const HELD_MAX_ANGULAR_SPEED = 12;
const MIN_BOOK_THICKNESS = 0.01;
const DEFAULT_BOOK_DENSITY = 6;
const MIN_BODY_DIMENSION = 0.01;
const PHYSICS_PROP_PREFIX = "prop:";
const WORLD_COLLISION_GROUP = 0x0001;
const BOOK_COLLISION_GROUP = 0x0002;
const PLAYER_COLLISION_GROUP = 0x0004;
const ALL_COLLISION_GROUPS = 0xffff;
const interactionGroups = (membership: number, filter: number) =>
  ((membership << 16) | filter) >>> 0;
const WORLD_COLLISION_GROUPS = interactionGroups(
  WORLD_COLLISION_GROUP,
  ALL_COLLISION_GROUPS,
);
const DYNAMIC_BOOK_COLLISION_GROUPS = interactionGroups(
  BOOK_COLLISION_GROUP,
  ALL_COLLISION_GROUPS,
);
const HELD_BOOK_COLLISION_GROUPS = interactionGroups(
  BOOK_COLLISION_GROUP,
  BOOK_COLLISION_GROUP,
);
const GHOST_PROP_COLLISION_GROUPS = interactionGroups(BOOK_COLLISION_GROUP, 0);
const PLAYER_COLLISION_GROUPS = interactionGroups(
  PLAYER_COLLISION_GROUP,
  WORLD_COLLISION_GROUP | BOOK_COLLISION_GROUP,
);
const PLAYER_CAPSULE_HALF_HEIGHT =
  (SHOP_PHYSICS_PLAYER_BODY_HEIGHT - SHOP_PHYSICS_PLAYER_RADIUS * 2) * 0.5;
const PLAYER_CONTROLLER_OFFSET = 0.01;
const PLAYER_CHARACTER_MASS = 70;

type RapierModule = typeof import("@dimforge/rapier3d-compat");

let rapierImportPromise: Promise<RapierModule> | undefined;
let initializedRapierPromise: Promise<RapierModule> | undefined;

const importRapier = () => {
  rapierImportPromise ??= import("@dimforge/rapier3d-compat");
  return rapierImportPromise;
};

const importInitializedRapier = () => {
  initializedRapierPromise ??= importRapier().then(async (rapier) => {
    await rapier.init();
    return rapier;
  });
  return initializedRapierPromise;
};

export type PhysicsVector3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PhysicsQuaternion = PhysicsVector3 & {
  readonly w: number;
};

export type BookPhysicsPose = {
  readonly position: PhysicsVector3;
  readonly rotation: PhysicsQuaternion;
};

export type MutableBookPhysicsTransform = {
  position: {x: number; y: number; z: number};
  rotation: {w: number; x: number; y: number; z: number};
};

export type MutablePhysicsVector3 = {x: number; y: number; z: number};

/**
 * `eyePosition` is ready to copy into a Three camera. Rapier owns a capsule
 * centered `SHOP_PHYSICS_PLAYER_EYE_TO_CENTER` below that point.
 */
export type MutablePlayerMovement = {
  ceilingHit: boolean;
  collisionCount: number;
  correctedDisplacement: MutablePhysicsVector3;
  eyePosition: MutablePhysicsVector3;
  grounded: boolean;
};

export type BookPhysicsState = "dynamic" | "held" | "shelved";

export type BookPhysicsDefinition = {
  collisionlessWhileHeld?: boolean;
  density?: number;
  height?: number;
  initialState?: Exclude<BookPhysicsState, "held">;
  pose: BookPhysicsPose;
  publicationId: string;
  thickness: number;
  width?: number;
};

export type PhysicsPropDefinition = {
  colliderParts?: readonly PhysicsPropColliderDefinition[];
  density?: number;
  depth: number;
  staticWhenPlaced?: boolean;
  height: number;
  id: string;
  pose: BookPhysicsPose;
  width: number;
};

export type PhysicsPropColliderDefinition = {
  halfExtents: PhysicsVector3;
  position: PhysicsVector3;
};

export type BookPhysicsUpdate = {
  pose?: BookPhysicsPose;
  thickness?: number;
  width?: number;
};

export type BookPhysicsDrop = {
  angularVelocity?: PhysicsVector3;
  linearVelocity?: PhysicsVector3;
  pose: BookPhysicsPose;
};

export type ShopPhysicsWorldOptions = {
  fixedStepSeconds?: number;
  gravity?: PhysicsVector3;
  /** Override intended for hosts that already own Rapier initialization/tests. */
  initializeRapier?: () => Promise<void>;
  maxSubsteps?: number;
  playerEyePosition?: PhysicsVector3;
};

type MutableVector3 = MutablePhysicsVector3;
type MutableQuaternion = MutableVector3 & {w: number};
type MutablePose = {position: MutableVector3; rotation: MutableQuaternion};

type BookPhysicsRecord = {
  angularScratch: MutableVector3;
  body: RigidBody | undefined;
  colliderParts: readonly PhysicsPropColliderDefinition[] | undefined;
  colliders: Collider[];
  collisionlessWhileHeld: boolean;
  density: number;
  staticWhenPlaced: boolean;
  height: number;
  linearScratch: MutableVector3;
  mode: BookPhysicsState;
  previousPose: MutablePose;
  pose: MutablePose;
  publicationId: string;
  target: MutablePose;
  thickness: number;
  width: number;
};

const ZERO_VECTOR: PhysicsVector3 = Object.freeze({x: 0, y: 0, z: 0});
const DEFAULT_PLAYER_EYE_POSITION: PhysicsVector3 = Object.freeze({
  x: 0,
  y: SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  z: 25,
});

const isFiniteVector = (value: PhysicsVector3) =>
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Number.isFinite(value.z);

const isValidQuaternion = (value: PhysicsQuaternion) =>
  isFiniteVector(value) &&
  Number.isFinite(value.w) &&
  value.x * value.x +
    value.y * value.y +
    value.z * value.z +
    value.w * value.w >
    Number.EPSILON;

const isValidPose = (pose: BookPhysicsPose) =>
  isFiniteVector(pose.position) && isValidQuaternion(pose.rotation);

const isValidThickness = (thickness: number) =>
  Number.isFinite(thickness) && thickness >= MIN_BOOK_THICKNESS;

const isValidBodyDimension = (dimension: number) =>
  Number.isFinite(dimension) && dimension >= MIN_BODY_DIMENSION;

const physicsPropId = (id: string) => `${PHYSICS_PROP_PREFIX}${id}`;

const copyVector = (output: MutableVector3, value: PhysicsVector3) => {
  output.x = value.x;
  output.y = value.y;
  output.z = value.z;
};

const copyNormalizedQuaternion = (
  output: MutableQuaternion,
  value: PhysicsQuaternion,
) => {
  const inverseLength =
    1 /
    Math.sqrt(
      value.x * value.x +
        value.y * value.y +
        value.z * value.z +
        value.w * value.w,
    );
  output.x = value.x * inverseLength;
  output.y = value.y * inverseLength;
  output.z = value.z * inverseLength;
  output.w = value.w * inverseLength;
};

const copyPose = (output: MutablePose, pose: BookPhysicsPose) => {
  copyVector(output.position, pose.position);
  copyNormalizedQuaternion(output.rotation, pose.rotation);
};

const createMutablePose = (pose: BookPhysicsPose): MutablePose => {
  const output: MutablePose = {
    position: {x: 0, y: 0, z: 0},
    rotation: {w: 1, x: 0, y: 0, z: 0},
  };
  copyPose(output, pose);
  return output;
};

const interpolatePose = (
  previous: MutablePose,
  current: MutablePose,
  alpha: number,
  output: MutableBookPhysicsTransform,
) => {
  const t = Math.min(Math.max(alpha, 0), 1);
  output.position.x =
    previous.position.x + (current.position.x - previous.position.x) * t;
  output.position.y =
    previous.position.y + (current.position.y - previous.position.y) * t;
  output.position.z =
    previous.position.z + (current.position.z - previous.position.z) * t;

  const previousRotation = previous.rotation;
  const currentRotation = current.rotation;
  let currentX = currentRotation.x;
  let currentY = currentRotation.y;
  let currentZ = currentRotation.z;
  let currentW = currentRotation.w;
  let dot =
    previousRotation.x * currentX +
    previousRotation.y * currentY +
    previousRotation.z * currentZ +
    previousRotation.w * currentW;
  if (dot < 0) {
    dot = -dot;
    currentX = -currentX;
    currentY = -currentY;
    currentZ = -currentZ;
    currentW = -currentW;
  }

  let previousWeight = 1 - t;
  let currentWeight = t;
  if (dot < 0.9995) {
    const angle = Math.acos(Math.min(Math.max(dot, -1), 1));
    const inverseSinAngle = 1 / Math.sin(angle);
    previousWeight = Math.sin((1 - t) * angle) * inverseSinAngle;
    currentWeight = Math.sin(t * angle) * inverseSinAngle;
  }
  const interpolatedX =
    previousRotation.x * previousWeight + currentX * currentWeight;
  const interpolatedY =
    previousRotation.y * previousWeight + currentY * currentWeight;
  const interpolatedZ =
    previousRotation.z * previousWeight + currentZ * currentWeight;
  const interpolatedW =
    previousRotation.w * previousWeight + currentW * currentWeight;
  const inverseLength =
    1 /
    Math.sqrt(
      interpolatedX * interpolatedX +
        interpolatedY * interpolatedY +
        interpolatedZ * interpolatedZ +
        interpolatedW * interpolatedW,
    );
  output.rotation.x = interpolatedX * inverseLength;
  output.rotation.y = interpolatedY * inverseLength;
  output.rotation.z = interpolatedZ * inverseLength;
  output.rotation.w = interpolatedW * inverseLength;
};

const capVectorLength = (vector: MutableVector3, maxLength: number) => {
  const lengthSquared =
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
  if (lengthSquared <= maxLength * maxLength) return;
  const scale = maxLength / Math.sqrt(lengthSquared);
  vector.x *= scale;
  vector.y *= scale;
  vector.z *= scale;
};

/**
 * Owns the small Rapier simulation used by the shop. Definitions can be queued
 * before `initialize`; disposal is final and wins over a late async init.
 */
export class ShopPhysicsWorld {
  readonly #books = new Map<string, BookPhysicsRecord>();
  readonly #fixedStepSeconds: number;
  readonly #gravity: MutableVector3;
  readonly #loadRapier: () => Promise<RapierModule>;
  readonly #maxSubsteps: number;
  readonly #playerCenterScratch: MutableVector3 = {x: 0, y: 0, z: 0};
  readonly #playerEyePosition: MutableVector3 = {
    x: DEFAULT_PLAYER_EYE_POSITION.x,
    y: DEFAULT_PLAYER_EYE_POSITION.y,
    z: DEFAULT_PLAYER_EYE_POSITION.z,
  };
  #accumulatorSeconds = 0;
  #disposed = false;
  #initializePromise: Promise<boolean> | undefined;
  #playerBody: RigidBody | undefined;
  #playerCollider: Collider | undefined;
  #playerController: KinematicCharacterController | undefined;
  #rapier: RapierModule | undefined;
  #world: World | undefined;

  constructor(options: ShopPhysicsWorldOptions = {}) {
    const fixedStepSeconds = options.fixedStepSeconds;
    this.#fixedStepSeconds =
      fixedStepSeconds && Number.isFinite(fixedStepSeconds)
        ? Math.min(Math.max(fixedStepSeconds, 1 / 240), 1 / 20)
        : DEFAULT_FIXED_STEP_SECONDS;
    const maxSubsteps = options.maxSubsteps;
    this.#maxSubsteps = Number.isFinite(maxSubsteps)
      ? Math.min(
          Math.max(Math.floor(maxSubsteps ?? DEFAULT_MAX_SUBSTEPS), 1),
          12,
        )
      : DEFAULT_MAX_SUBSTEPS;
    const gravity = options.gravity;
    this.#gravity =
      gravity && isFiniteVector(gravity)
        ? {x: gravity.x, y: gravity.y, z: gravity.z}
        : {x: 0, y: DEFAULT_GRAVITY, z: 0};
    const initializeRapier = options.initializeRapier;
    this.#loadRapier = initializeRapier
      ? async () => {
          const [rapier] = await Promise.all([
            importRapier(),
            initializeRapier(),
          ]);
          return rapier;
        }
      : importInitializedRapier;
    if (options.playerEyePosition && isFiniteVector(options.playerEyePosition))
      copyVector(this.#playerEyePosition, options.playerEyePosition);
  }

  get bookCount() {
    let count = 0;
    for (const id of this.#books.keys())
      if (!id.startsWith(PHYSICS_PROP_PREFIX)) count += 1;
    return count;
  }

  get interpolationAlpha() {
    return this.#accumulatorSeconds / this.#fixedStepSeconds;
  }

  get isDisposed() {
    return this.#disposed;
  }

  get isReady() {
    return this.#world !== undefined;
  }

  initialize() {
    if (this.#disposed) return Promise.resolve(false);
    this.#initializePromise ??= this.#initializeWorld();
    return this.#initializePromise;
  }

  async #initializeWorld() {
    const rapier = await this.#loadRapier();
    if (this.#disposed) return false;

    const world = new rapier.World(this.#gravity);
    world.timestep = this.#fixedStepSeconds;
    world.numSolverIterations = 6;
    world.numInternalPgsIterations = 1;
    world.maxCcdSubsteps = 2;

    try {
      this.#createShopColliders(rapier, world);
      for (const record of this.#books.values())
        this.#createBookBody(rapier, world, record);
      this.#createPlayer(rapier, world);
      // Rapier updates its broad phase during a step. Prime it once so the
      // character controller sees walls/books on the first gameplay frame.
      // A zero timestep updates queries without advancing book simulation.
      world.timestep = 0;
      world.step();
      world.timestep = this.#fixedStepSeconds;
      this.#rapier = rapier;
      this.#world = world;
      return true;
    } catch (error) {
      world.free();
      throw error;
    }
  }

  #createShopColliders(rapier: RapierModule, world: World) {
    world.createCollider(
      new rapier.ColliderDesc(new rapier.HalfSpace({x: 0, y: 1, z: 0}))
        .setCollisionGroups(WORLD_COLLISION_GROUPS)
        .setFriction(0.92)
        .setRestitution(0.04),
    );
    for (const box of [
      ...SHOP_COLLISION_BOXES,
      ...SHOP_EXPANSION_COLLISION_BOXES,
    ]) {
      world.createCollider(
        rapier.ColliderDesc.cuboid(
          box.halfExtents.x,
          box.halfExtents.y,
          box.halfExtents.z,
        )
          .setCollisionGroups(WORLD_COLLISION_GROUPS)
          .setTranslation(box.position.x, box.position.y, box.position.z)
          .setFriction(0.92)
          .setRestitution(0.04),
      );
    }
  }

  #createPlayer(rapier: RapierModule, world: World) {
    this.#writePlayerCenter(this.#playerCenterScratch);
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(
          this.#playerCenterScratch.x,
          this.#playerCenterScratch.y,
          this.#playerCenterScratch.z,
        )
        .lockRotations(),
    );
    const collider = world.createCollider(
      rapier.ColliderDesc.capsule(
        PLAYER_CAPSULE_HALF_HEIGHT,
        SHOP_PHYSICS_PLAYER_RADIUS,
      )
        .setCollisionGroups(PLAYER_COLLISION_GROUPS)
        .setFriction(0)
        .setRestitution(0),
      body,
    );
    const controller = world.createCharacterController(
      PLAYER_CONTROLLER_OFFSET,
    );
    controller.setSlideEnabled(true);
    controller.enableAutostep(0.28, 0.18, false);
    controller.enableSnapToGround(0.3);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(PLAYER_CHARACTER_MASS);
    this.#playerBody = body;
    this.#playerCollider = collider;
    this.#playerController = controller;
  }

  #writePlayerCenter(output: MutableVector3) {
    output.x = this.#playerEyePosition.x;
    output.y = this.#playerEyePosition.y - SHOP_PHYSICS_PLAYER_EYE_TO_CENTER;
    output.z = this.#playerEyePosition.z;
  }

  #createBookBody(
    rapier: RapierModule,
    world: World,
    record: BookPhysicsRecord,
  ) {
    const held = record.mode === "held";
    const shelved = record.mode === "shelved";
    const fixed = record.staticWhenPlaced && !held;
    const descriptor: RigidBodyDesc = fixed
      ? rapier.RigidBodyDesc.fixed()
      : rapier.RigidBodyDesc.dynamic()
          .setCanSleep(true)
          .setSleeping(shelved)
          .setCcdEnabled(!shelved)
          .setGravityScale(held ? 0 : 1)
          .setLinearDamping(held ? HELD_LINEAR_DAMPING : DYNAMIC_LINEAR_DAMPING)
          .setAngularDamping(
            held ? HELD_ANGULAR_DAMPING : DYNAMIC_ANGULAR_DAMPING,
          );
    descriptor
      .setTranslation(
        record.pose.position.x,
        record.pose.position.y,
        record.pose.position.z,
      )
      .setRotation(record.pose.rotation);
    const body = world.createRigidBody(descriptor);
    record.body = body;
    record.colliders.length = 0;
    const colliderParts = record.colliderParts;
    if (colliderParts)
      for (const part of colliderParts) {
        const collider = this.#createBookCollider(
          rapier,
          part.halfExtents.z * 2,
          part.halfExtents.x * 2,
          part.halfExtents.y * 2,
          record.density,
          held,
          record.collisionlessWhileHeld,
        ).setTranslation(part.position.x, part.position.y, part.position.z);
        record.colliders.push(world.createCollider(collider, body));
      }
    else
      record.colliders.push(
        world.createCollider(
          this.#createBookCollider(
            rapier,
            record.thickness,
            record.width,
            record.height,
            record.density,
            held,
            record.collisionlessWhileHeld,
          ),
          body,
        ),
      );
    if (record.mode === "shelved") body.setEnabled(false);
  }

  #createBookCollider(
    rapier: RapierModule,
    thickness: number,
    width: number,
    height = SHOP_PHYSICS_BOOK_HEIGHT,
    density = DEFAULT_BOOK_DENSITY,
    held = false,
    collisionlessWhileHeld = false,
  ) {
    return rapier.ColliderDesc.cuboid(
      width * 0.5,
      height * 0.5,
      thickness * 0.5,
    )
      .setCollisionGroups(
        held
          ? collisionlessWhileHeld
            ? GHOST_PROP_COLLISION_GROUPS
            : HELD_BOOK_COLLISION_GROUPS
          : DYNAMIC_BOOK_COLLISION_GROUPS,
      )
      .setDensity(density)
      .setFriction(0.82)
      .setRestitution(0.08);
  }

  #setBookColliderHeld(record: BookPhysicsRecord, held: boolean) {
    const collisionGroups = held
      ? record.collisionlessWhileHeld
        ? GHOST_PROP_COLLISION_GROUPS
        : HELD_BOOK_COLLISION_GROUPS
      : DYNAMIC_BOOK_COLLISION_GROUPS;
    for (const collider of record.colliders)
      collider.setCollisionGroups(collisionGroups);
  }

  /**
   * Sets the camera/eye position. Before initialization this updates the queued
   * player spawn; afterward it immediately relocates the capsule center too.
   */
  setPlayerPosition(eyePosition: PhysicsVector3) {
    if (this.#disposed || !isFiniteVector(eyePosition)) return false;
    copyVector(this.#playerEyePosition, eyePosition);
    const body = this.#playerBody;
    const world = this.#world;
    if (!body || !world) return true;
    this.#writePlayerCenter(this.#playerCenterScratch);
    body.setTranslation(this.#playerCenterScratch, true);
    body.setNextKinematicTranslation(this.#playerCenterScratch);
    world.propagateModifiedBodyPositionsToColliders();
    return true;
  }

  resetPlayer(eyePosition: PhysicsVector3 = DEFAULT_PLAYER_EYE_POSITION) {
    return this.setPlayerPosition(eyePosition);
  }

  /** Samples the public camera/eye position without allocating. */
  getPlayerPosition(output: MutablePhysicsVector3) {
    if (this.#disposed) return false;
    copyVector(output, this.#playerEyePosition);
    return true;
  }

  /**
   * Moves the capsule immediately through Rapier's character controller. The
   * returned eye position can be copied directly to the camera; the corrected
   * displacement is the collision-limited movement actually applied.
   */
  movePlayer(
    desiredDisplacement: PhysicsVector3,
    output: MutablePlayerMovement,
  ) {
    output.ceilingHit = false;
    output.collisionCount = 0;
    output.correctedDisplacement.x = 0;
    output.correctedDisplacement.y = 0;
    output.correctedDisplacement.z = 0;
    copyVector(output.eyePosition, this.#playerEyePosition);
    output.grounded = false;
    if (this.#disposed || !isFiniteVector(desiredDisplacement)) return false;

    const body = this.#playerBody;
    const collider = this.#playerCollider;
    const controller = this.#playerController;
    const world = this.#world;
    if (!body || !collider || !controller || !world) return false;

    controller.computeColliderMovement(collider, desiredDisplacement);
    const corrected = controller.computedMovement();
    const center = body.translation();
    this.#playerCenterScratch.x = center.x + corrected.x;
    this.#playerCenterScratch.y = center.y + corrected.y;
    this.#playerCenterScratch.z = center.z + corrected.z;
    body.setTranslation(this.#playerCenterScratch, true);
    body.setNextKinematicTranslation(this.#playerCenterScratch);
    world.propagateModifiedBodyPositionsToColliders();

    this.#playerEyePosition.x += corrected.x;
    this.#playerEyePosition.y += corrected.y;
    this.#playerEyePosition.z += corrected.z;
    output.correctedDisplacement.x = corrected.x;
    output.correctedDisplacement.y = corrected.y;
    output.correctedDisplacement.z = corrected.z;
    copyVector(output.eyePosition, this.#playerEyePosition);
    output.grounded = controller.computedGrounded();
    output.collisionCount = controller.numComputedCollisions();
    if (desiredDisplacement.y > 0)
      for (let index = 0; index < output.collisionCount; index += 1) {
        const collision = controller.computedCollision(index);
        if (!collision || collision.normal1.y >= -0.5) continue;
        output.ceilingHit = true;
        break;
      }
    return true;
  }

  addBook(definition: BookPhysicsDefinition) {
    return this.#addBook(definition, false);
  }

  #addBook(
    definition: BookPhysicsDefinition,
    staticWhenPlaced: boolean,
    colliderParts?: readonly PhysicsPropColliderDefinition[],
  ) {
    if (
      this.#disposed ||
      !definition.publicationId ||
      this.#books.has(definition.publicationId) ||
      !isValidThickness(definition.thickness) ||
      (definition.width !== undefined &&
        (!Number.isFinite(definition.width) || definition.width <= 0)) ||
      (definition.height !== undefined &&
        !isValidBodyDimension(definition.height)) ||
      (definition.density !== undefined &&
        (!Number.isFinite(definition.density) || definition.density <= 0)) ||
      !isValidPose(definition.pose)
    )
      return false;

    const pose = createMutablePose(definition.pose);
    const record: BookPhysicsRecord = {
      angularScratch: {x: 0, y: 0, z: 0},
      body: undefined,
      colliderParts,
      colliders: [],
      collisionlessWhileHeld: definition.collisionlessWhileHeld ?? false,
      density: definition.density ?? DEFAULT_BOOK_DENSITY,
      staticWhenPlaced,
      height: definition.height ?? SHOP_PHYSICS_BOOK_HEIGHT,
      linearScratch: {x: 0, y: 0, z: 0},
      mode: definition.initialState ?? "dynamic",
      pose,
      previousPose: createMutablePose(pose),
      publicationId: definition.publicationId,
      target: createMutablePose(pose),
      thickness: definition.thickness,
      width: definition.width ?? SHOP_PHYSICS_BOOK_WIDTH,
    };
    this.#books.set(record.publicationId, record);
    const world = this.#world;
    const rapier = this.#rapier;
    if (world && rapier) this.#createBookBody(rapier, world, record);
    return true;
  }

  addProp(definition: PhysicsPropDefinition) {
    if (
      !definition.id ||
      !isValidBodyDimension(definition.depth) ||
      !isValidBodyDimension(definition.height) ||
      !isValidBodyDimension(definition.width) ||
      (definition.colliderParts !== undefined &&
        (definition.colliderParts.length === 0 ||
          definition.colliderParts.some(
            (part) =>
              !isFiniteVector(part.position) ||
              !isValidBodyDimension(part.halfExtents.x * 2) ||
              !isValidBodyDimension(part.halfExtents.y * 2) ||
              !isValidBodyDimension(part.halfExtents.z * 2),
          )))
    )
      return false;
    return this.#addBook(
      {
        collisionlessWhileHeld: true,
        ...(definition.density !== undefined
          ? {density: definition.density}
          : {}),
        height: definition.height,
        pose: definition.pose,
        publicationId: physicsPropId(definition.id),
        thickness: definition.depth,
        width: definition.width,
      },
      definition.staticWhenPlaced ?? false,
      definition.colliderParts,
    );
  }

  holdProp(id: string) {
    return this.holdBook(physicsPropId(id));
  }

  updatePropPose(id: string, pose: BookPhysicsPose) {
    return this.updateBook(physicsPropId(id), {pose});
  }

  setHeldPropTarget(id: string, pose: BookPhysicsPose) {
    return this.setHeldTarget(physicsPropId(id), pose);
  }

  snapHeldProp(id: string, pose: BookPhysicsPose) {
    return this.snapHeldBook(physicsPropId(id), pose);
  }

  dropProp(id: string, drop: BookPhysicsDrop) {
    return this.dropBook(physicsPropId(id), drop);
  }

  getPropState(id: string) {
    return this.getBookState(physicsPropId(id));
  }

  sampleInterpolatedPropTransform(
    id: string,
    output: MutableBookPhysicsTransform,
  ) {
    return this.sampleInterpolatedBookTransform(physicsPropId(id), output);
  }

  updateBook(publicationId: string, update: BookPhysicsUpdate) {
    if (this.#disposed) return false;
    const record = this.#books.get(publicationId);
    if (!record) return false;
    if (update.pose && !isValidPose(update.pose)) return false;
    if (update.thickness !== undefined && !isValidThickness(update.thickness))
      return false;
    if (
      update.width !== undefined &&
      (!Number.isFinite(update.width) || update.width <= 0)
    )
      return false;

    const body = record.body;
    if (update.pose) {
      copyPose(record.pose, update.pose);
      copyPose(record.previousPose, update.pose);
      if (record.mode === "held") copyPose(record.target, update.pose);
      body?.setTranslation(record.pose.position, record.mode !== "shelved");
      body?.setRotation(record.pose.rotation, record.mode !== "shelved");
      if (record.mode === "shelved") body?.setEnabled(false);
    }

    const nextThickness = update.thickness ?? record.thickness;
    const nextWidth = update.width ?? record.width;
    if (
      record.colliderParts &&
      (nextThickness !== record.thickness || nextWidth !== record.width)
    )
      return false;
    if (nextThickness !== record.thickness || nextWidth !== record.width) {
      record.thickness = nextThickness;
      record.width = nextWidth;
      const world = this.#world;
      const rapier = this.#rapier;
      if (world && rapier && body) {
        for (const collider of record.colliders)
          world.removeCollider(collider, false);
        record.colliders.length = 0;
        record.colliders.push(
          world.createCollider(
            this.#createBookCollider(
              rapier,
              record.thickness,
              record.width,
              record.height,
              record.density,
              record.mode === "held",
              record.collisionlessWhileHeld,
            ),
            body,
          ),
        );
      }
    }
    return true;
  }

  removeBook(publicationId: string) {
    if (this.#disposed) return false;
    const record = this.#books.get(publicationId);
    if (!record) return false;
    const world = this.#world;
    if (world && record.body) world.removeRigidBody(record.body);
    this.#books.delete(publicationId);
    return true;
  }

  holdBook(publicationId: string) {
    if (this.#disposed) return false;
    const record = this.#books.get(publicationId);
    if (!record || record.mode === "held") return false;
    record.mode = "held";
    const body = record.body;
    if (!body) {
      copyPose(record.target, record.pose);
      return true;
    }
    const rapier = this.#rapier;
    if (!rapier) return false;

    body.setEnabled(true);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.enableCcd(true);
    body.setGravityScale(0, true);
    body.setLinearDamping(HELD_LINEAR_DAMPING);
    body.setAngularDamping(HELD_ANGULAR_DAMPING);
    body.resetForces(true);
    body.resetTorques(true);
    this.#setBookColliderHeld(record, true);
    const position = body.translation();
    const rotation = body.rotation();
    copyVector(record.pose.position, position);
    copyNormalizedQuaternion(record.pose.rotation, rotation);
    copyPose(record.previousPose, record.pose);
    copyVector(record.target.position, position);
    copyNormalizedQuaternion(record.target.rotation, rotation);
    return true;
  }

  setHeldTarget(publicationId: string, pose: BookPhysicsPose) {
    if (this.#disposed || !isValidPose(pose)) return false;
    const record = this.#books.get(publicationId);
    if (!record || record.mode !== "held") return false;
    copyPose(record.target, pose);
    record.body?.wakeUp();
    return true;
  }

  snapHeldBook(publicationId: string, pose: BookPhysicsPose) {
    if (this.#disposed || !isValidPose(pose)) return false;
    const record = this.#books.get(publicationId);
    if (!record || record.mode !== "held") return false;
    copyPose(record.pose, pose);
    copyPose(record.previousPose, pose);
    copyPose(record.target, pose);
    const body = record.body;
    if (!body) return true;
    body.setTranslation(record.pose.position, true);
    body.setRotation(record.pose.rotation, true);
    body.setLinvel(ZERO_VECTOR, true);
    body.setAngvel(ZERO_VECTOR, true);
    body.resetForces(true);
    body.resetTorques(true);
    return true;
  }

  dropBook(publicationId: string, drop: BookPhysicsDrop) {
    if (
      this.#disposed ||
      !isValidPose(drop.pose) ||
      (drop.linearVelocity && !isFiniteVector(drop.linearVelocity)) ||
      (drop.angularVelocity && !isFiniteVector(drop.angularVelocity))
    )
      return false;
    const record = this.#books.get(publicationId);
    if (!record || record.mode !== "held") return false;
    record.mode = "dynamic";
    copyPose(record.pose, drop.pose);
    copyPose(record.previousPose, drop.pose);

    const body = record.body;
    if (!body) return true;
    const rapier = this.#rapier;
    if (!rapier) return false;
    const fixed = record.staticWhenPlaced && !drop.angularVelocity;
    this.#setBookColliderHeld(record, false);
    body.setBodyType(
      fixed ? rapier.RigidBodyType.Fixed : rapier.RigidBodyType.Dynamic,
      true,
    );
    body.enableCcd(!fixed);
    body.setTranslation(record.pose.position, true);
    body.setRotation(record.pose.rotation, true);
    body.setGravityScale(fixed ? 0 : 1, true);
    body.setLinearDamping(DYNAMIC_LINEAR_DAMPING);
    body.setAngularDamping(DYNAMIC_ANGULAR_DAMPING);
    if (fixed) {
      body.setLinvel(ZERO_VECTOR, true);
      body.setAngvel(ZERO_VECTOR, true);
    } else {
      body.setLinvel(drop.linearVelocity ?? ZERO_VECTOR, true);
      body.setAngvel(drop.angularVelocity ?? ZERO_VECTOR, true);
    }
    return true;
  }

  /** Teleports an escaped book into the world as a stationary dynamic body. */
  respawnBook(publicationId: string, pose: BookPhysicsPose) {
    if (this.#disposed || !isValidPose(pose)) return false;
    const record = this.#books.get(publicationId);
    if (!record || record.mode === "held") return false;
    record.mode = "dynamic";
    copyPose(record.pose, pose);
    copyPose(record.previousPose, pose);

    const body = record.body;
    if (!body) return true;
    const rapier = this.#rapier;
    if (!rapier) return false;
    body.setEnabled(true);
    this.#setBookColliderHeld(record, false);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(record.pose.position, true);
    body.setRotation(record.pose.rotation, true);
    body.setLinvel(ZERO_VECTOR, true);
    body.setAngvel(ZERO_VECTOR, true);
    body.setGravityScale(1, true);
    body.setLinearDamping(DYNAMIC_LINEAR_DAMPING);
    body.setAngularDamping(DYNAMIC_ANGULAR_DAMPING);
    body.enableCcd(true);
    body.wakeUp();
    return true;
  }

  shelveBook(publicationId: string, pose: BookPhysicsPose) {
    if (this.#disposed || !isValidPose(pose)) return false;
    const record = this.#books.get(publicationId);
    if (!record) return false;
    record.mode = "shelved";
    copyPose(record.pose, pose);
    copyPose(record.previousPose, pose);

    const body = record.body;
    if (!body) return true;
    const rapier = this.#rapier;
    if (!rapier) return false;
    body.setEnabled(true);
    this.#setBookColliderHeld(record, false);
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(record.pose.position, true);
    body.setRotation(record.pose.rotation, true);
    body.setLinvel(ZERO_VECTOR, true);
    body.setAngvel(ZERO_VECTOR, true);
    body.setGravityScale(1, false);
    body.setLinearDamping(DYNAMIC_LINEAR_DAMPING);
    body.setAngularDamping(DYNAMIC_ANGULAR_DAMPING);
    body.enableCcd(false);
    body.setEnabled(false);
    return true;
  }

  getBookState(publicationId: string) {
    return this.#books.get(publicationId)?.mode;
  }

  sampleBookTransform(
    publicationId: string,
    output: MutableBookPhysicsTransform,
  ) {
    if (this.#disposed) return false;
    const body = this.#books.get(publicationId)?.body;
    if (!body) return false;
    const position = body.translation();
    const rotation = body.rotation();
    copyVector(output.position, position);
    output.rotation.x = rotation.x;
    output.rotation.y = rotation.y;
    output.rotation.z = rotation.z;
    output.rotation.w = rotation.w;
    return true;
  }

  /** Samples a render pose between the two latest fixed simulation states. */
  sampleInterpolatedBookTransform(
    publicationId: string,
    output: MutableBookPhysicsTransform,
  ) {
    if (this.#disposed) return false;
    const record = this.#books.get(publicationId);
    if (!record?.body) return false;
    interpolatePose(
      record.previousPose,
      record.pose,
      this.interpolationAlpha,
      output,
    );
    return true;
  }

  step(deltaSeconds: number) {
    const world = this.#world;
    if (
      !world ||
      this.#disposed ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds <= 0
    )
      return 0;

    this.#accumulatorSeconds = Math.min(
      this.#accumulatorSeconds + deltaSeconds,
      this.#fixedStepSeconds * this.#maxSubsteps,
    );
    const substeps = Math.min(
      Math.floor(
        (this.#accumulatorSeconds + Number.EPSILON) / this.#fixedStepSeconds,
      ),
      this.#maxSubsteps,
    );
    for (let index = 0; index < substeps; index += 1) {
      for (const record of this.#books.values())
        copyPose(record.previousPose, record.pose);
      this.#applyHeldSprings();
      world.step();
      for (const record of this.#books.values()) {
        const body = record.body;
        if (!body) continue;
        copyVector(record.pose.position, body.translation());
        copyNormalizedQuaternion(record.pose.rotation, body.rotation());
      }
      this.#syncDynamicBookCcd();
    }
    this.#accumulatorSeconds = Math.max(
      0,
      this.#accumulatorSeconds - substeps * this.#fixedStepSeconds,
    );
    return substeps;
  }

  #applyHeldSprings() {
    const deltaSeconds = this.#fixedStepSeconds;
    for (const record of this.#books.values()) {
      const body = record.body;
      if (record.mode !== "held" || !body) continue;

      const position = body.translation();
      const linearVelocity = body.linvel();
      const linear = record.linearScratch;
      linear.x =
        linearVelocity.x +
        (HELD_LINEAR_STIFFNESS * (record.target.position.x - position.x) -
          HELD_LINEAR_DAMPING_GAIN * linearVelocity.x) *
          deltaSeconds;
      linear.y =
        linearVelocity.y +
        (HELD_LINEAR_STIFFNESS * (record.target.position.y - position.y) -
          HELD_LINEAR_DAMPING_GAIN * linearVelocity.y) *
          deltaSeconds;
      linear.z =
        linearVelocity.z +
        (HELD_LINEAR_STIFFNESS * (record.target.position.z - position.z) -
          HELD_LINEAR_DAMPING_GAIN * linearVelocity.z) *
          deltaSeconds;
      capVectorLength(linear, HELD_MAX_LINEAR_SPEED);
      body.setLinvel(linear, true);

      const current = body.rotation();
      const target = record.target.rotation;
      let errorX =
        -target.w * current.x +
        target.x * current.w -
        target.y * current.z +
        target.z * current.y;
      let errorY =
        -target.w * current.y +
        target.x * current.z +
        target.y * current.w -
        target.z * current.x;
      let errorZ =
        -target.w * current.z -
        target.x * current.y +
        target.y * current.x +
        target.z * current.w;
      const errorW =
        target.w * current.w +
        target.x * current.x +
        target.y * current.y +
        target.z * current.z;
      if (errorW < 0) {
        errorX = -errorX;
        errorY = -errorY;
        errorZ = -errorZ;
      }
      const errorLength = Math.sqrt(
        errorX * errorX + errorY * errorY + errorZ * errorZ,
      );
      const angle =
        errorLength > Number.EPSILON
          ? 2 * Math.atan2(errorLength, Math.abs(errorW))
          : 0;
      const angleScale = errorLength > Number.EPSILON ? angle / errorLength : 0;
      const angularVelocity = body.angvel();
      const angular = record.angularScratch;
      angular.x =
        angularVelocity.x +
        (HELD_ANGULAR_STIFFNESS * errorX * angleScale -
          HELD_ANGULAR_DAMPING_GAIN * angularVelocity.x) *
          deltaSeconds;
      angular.y =
        angularVelocity.y +
        (HELD_ANGULAR_STIFFNESS * errorY * angleScale -
          HELD_ANGULAR_DAMPING_GAIN * angularVelocity.y) *
          deltaSeconds;
      angular.z =
        angularVelocity.z +
        (HELD_ANGULAR_STIFFNESS * errorZ * angleScale -
          HELD_ANGULAR_DAMPING_GAIN * angularVelocity.z) *
          deltaSeconds;
      capVectorLength(angular, HELD_MAX_ANGULAR_SPEED);
      body.setAngvel(angular, true);
    }
  }

  #syncDynamicBookCcd() {
    for (const record of this.#books.values()) {
      const body = record.body;
      if (!body || record.mode !== "dynamic") continue;
      if (record.staticWhenPlaced) {
        if (body.isDynamic() && body.isSleeping()) {
          const rapier = this.#rapier;
          if (!rapier) continue;
          body.setBodyType(rapier.RigidBodyType.Fixed, false);
          body.enableCcd(false);
        }
        if (!body.isDynamic()) continue;
      }
      const shouldEnableCcd = !body.isSleeping();
      if (body.isCcdEnabled() !== shouldEnableCcd)
        body.enableCcd(shouldEnableCcd);
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#world?.free();
    this.#world = undefined;
    this.#playerBody = undefined;
    this.#playerCollider = undefined;
    this.#playerController = undefined;
    this.#rapier = undefined;
    this.#accumulatorSeconds = 0;
    for (const record of this.#books.values()) {
      record.body = undefined;
      record.colliders.length = 0;
    }
    this.#books.clear();
  }
}
