const TWO_PI = Math.PI * 2;
export const DEFAULT_PITCH_LIMIT = Math.PI * 0.49;
const MAX_POINTER_MOVEMENT_DELTA = 256;

export type PlanarPoint = {
  x: number;
  z: number;
};

export type PlanarMovementInput = {
  forward: number;
  right: number;
};

export type LookAngles = {
  pitch: number;
  yaw: number;
};

export type ShopBounds = {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
};

export type ShopObstacle = ShopBounds;

export type ShopCollisionWorld = {
  bounds: ShopBounds;
  obstacles: readonly ShopObstacle[];
};

export type BookInteractionState =
  | {readonly status: "floor"}
  | {readonly status: "carried"}
  | {
      readonly shelfId: string;
      readonly slotIndex: number;
      readonly status: "shelved";
    };

export type BookInteractionAction =
  | {readonly type: "pick-up"}
  | {readonly type: "drop"}
  | {
      readonly shelfId: string;
      readonly slotIndex: number;
      readonly type: "shelve";
    };

export type BookTransitionError = "book-not-pickable" | "book-not-carried" | "invalid-shelf-slot";

export type BookTransitionResult =
  | {ok: true; state: BookInteractionState}
  | {
      error: BookTransitionError;
      ok: false;
      state: BookInteractionState;
    };

const FLOOR_BOOK_STATE: BookInteractionState = Object.freeze({status: "floor"});
const CARRIED_BOOK_STATE: BookInteractionState = Object.freeze({
  status: "carried",
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Classifies pointer-lock discontinuities without changing ordinary mouse input.
 * A single event above this threshold would rotate the camera by more than 31
 * degrees at the default sensitivity.
 */
export const isPlausiblePointerMovement = (movementX: number, movementY: number) =>
  Number.isFinite(movementX) &&
  Number.isFinite(movementY) &&
  Math.abs(movementX) <= MAX_POINTER_MOVEMENT_DELTA &&
  Math.abs(movementY) <= MAX_POINTER_MOVEMENT_DELTA;

/** Bounds a two-axis angular delta without changing its direction. */
export const clampLookDeltaMagnitude = (
  deltaYaw: number,
  deltaPitch: number,
  maximumMagnitude: number,
  output: LookAngles,
) => {
  if (
    !Number.isFinite(deltaYaw) ||
    !Number.isFinite(deltaPitch) ||
    !Number.isFinite(maximumMagnitude) ||
    maximumMagnitude <= 0
  ) {
    output.yaw = 0;
    output.pitch = 0;
    return output;
  }

  const magnitude = Math.hypot(deltaYaw, deltaPitch);
  const scale = magnitude > maximumMagnitude ? maximumMagnitude / magnitude : 1;
  output.yaw = deltaYaw * scale;
  output.pitch = deltaPitch * scale;
  return output;
};

export const isPointInsideShopObstacle = (
  point: Readonly<PlanarPoint>,
  obstacle: Readonly<ShopObstacle>,
  padding = 0,
) =>
  point.x >= obstacle.minX - padding &&
  point.x <= obstacle.maxX + padding &&
  point.z >= obstacle.minZ - padding &&
  point.z <= obstacle.maxZ + padding;

const clampPlayerAxis = (value: number, min: number, max: number, radius: number) => {
  const centerMin = min + radius;
  const centerMax = max - radius;
  if (centerMin > centerMax) return (min + max) * 0.5;
  return clamp(value, centerMin, centerMax);
};

/** Wraps an angle to the half-open range [-PI, PI). */
export const wrapYaw = (yaw: number) => {
  const wrapped = (yaw + Math.PI) % TWO_PI;
  return (wrapped < 0 ? wrapped + TWO_PI : wrapped) - Math.PI;
};

/**
 * Applies pointer/controller look deltas into a caller-owned object. Reusing the
 * output makes this suitable for the render loop without producing garbage.
 */
export const updateLookAngles = (
  current: Readonly<LookAngles>,
  deltaYaw: number,
  deltaPitch: number,
  output: LookAngles,
  pitchLimit = DEFAULT_PITCH_LIMIT,
) => {
  const safePitchLimit = clamp(Math.abs(pitchLimit), 0, Math.PI * 0.5);
  output.yaw = wrapYaw(current.yaw + deltaYaw);
  output.pitch = clamp(current.pitch + deltaPitch, -safePitchLimit, safePitchLimit);
  return output;
};

/** Smooths camera orientation at render cadence using the shortest yaw arc. */
export const dampLookAngles = (
  current: Readonly<LookAngles>,
  target: Readonly<LookAngles>,
  smoothing: number,
  deltaSeconds: number,
  output: LookAngles,
) => {
  const safeSmoothing = Math.max(0, smoothing);
  const safeDeltaSeconds = Math.max(0, deltaSeconds);
  const alpha = 1 - Math.exp(-safeSmoothing * safeDeltaSeconds);
  output.yaw = wrapYaw(current.yaw + wrapYaw(target.yaw - current.yaw) * alpha);
  output.pitch = current.pitch + (target.pitch - current.pitch) * alpha;
  return output;
};

/**
 * Converts local WASD input into a world-space displacement. Inputs over unit
 * length are normalized so pressing two movement keys is not faster than one.
 * A yaw of zero faces toward negative Z, matching a Three perspective camera.
 */
export const resolvePlayerGrounded = (
  verticalVelocity: number,
  controllerGrounded: boolean,
  supportedWhileFalling: boolean,
) => verticalVelocity <= 0 && (controllerGrounded || supportedWhileFalling);

export const getPlanarMovement = (
  input: Readonly<PlanarMovementInput>,
  yaw: number,
  distance: number,
  output: PlanarPoint,
) => {
  const inputLengthSquared = input.forward * input.forward + input.right * input.right;
  const inputScale = inputLengthSquared > 1 ? 1 / Math.sqrt(inputLengthSquared) : 1;
  const forward = input.forward * inputScale * distance;
  const right = input.right * inputScale * distance;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  output.x = right * cosYaw - forward * sinYaw;
  output.z = -right * sinYaw - forward * cosYaw;
  return output;
};

const resolveX = (startX: number, targetX: number, z: number, radius: number, obstacles: readonly ShopObstacle[]) => {
  if (targetX === startX) return targetX;
  const movingPositive = targetX > startX;

  for (const obstacle of obstacles) {
    const zDistance = z < obstacle.minZ ? obstacle.minZ - z : z > obstacle.maxZ ? z - obstacle.maxZ : 0;
    if (zDistance >= radius) continue;

    const clearance = Math.sqrt(radius * radius - zDistance * zDistance);
    const obstacleMin = obstacle.minX - clearance;
    const obstacleMax = obstacle.maxX + clearance;

    if (movingPositive && startX <= obstacleMin && targetX > obstacleMin) {
      targetX = obstacleMin;
      continue;
    }
    if (!movingPositive && startX >= obstacleMax && targetX < obstacleMax) targetX = obstacleMax;
  }

  return targetX;
};

const resolveZ = (x: number, startZ: number, targetZ: number, radius: number, obstacles: readonly ShopObstacle[]) => {
  if (targetZ === startZ) return targetZ;
  const movingPositive = targetZ > startZ;

  for (const obstacle of obstacles) {
    const xDistance = x < obstacle.minX ? obstacle.minX - x : x > obstacle.maxX ? x - obstacle.maxX : 0;
    if (xDistance >= radius) continue;

    const clearance = Math.sqrt(radius * radius - xDistance * xDistance);
    const obstacleMin = obstacle.minZ - clearance;
    const obstacleMax = obstacle.maxZ + clearance;

    if (movingPositive && startZ <= obstacleMin && targetZ > obstacleMin) {
      targetZ = obstacleMin;
      continue;
    }
    if (!movingPositive && startZ >= obstacleMax && targetZ < obstacleMax) targetZ = obstacleMax;
  }

  return targetZ;
};

/**
 * Resolves a desired displacement against the shop walls and shelf rectangles.
 * X and Z are swept independently, which prevents tunnelling and lets the
 * player slide along a shelf instead of stopping all movement.
 */
export const resolveShopMovement = (
  current: Readonly<PlanarPoint>,
  displacement: Readonly<PlanarPoint>,
  playerRadius: number,
  world: Readonly<ShopCollisionWorld>,
  output: PlanarPoint,
) => {
  const radius = Math.max(0, playerRadius);
  const boundedTargetX = clampPlayerAxis(current.x + displacement.x, world.bounds.minX, world.bounds.maxX, radius);
  const x = resolveX(current.x, boundedTargetX, current.z, radius, world.obstacles);
  const boundedTargetZ = clampPlayerAxis(current.z + displacement.z, world.bounds.minZ, world.bounds.maxZ, radius);

  output.x = x;
  output.z = resolveZ(x, current.z, boundedTargetZ, radius, world.obstacles);
  return output;
};

const rejectBookTransition = (state: BookInteractionState, error: BookTransitionError): BookTransitionResult => ({
  error,
  ok: false,
  state,
});

/** Advances a book interaction while retaining the old state on errors. */
export const transitionBookInteraction = (
  state: BookInteractionState,
  action: BookInteractionAction,
): BookTransitionResult => {
  if (action.type === "pick-up") {
    if (state.status === "carried") return rejectBookTransition(state, "book-not-pickable");
    return {ok: true, state: CARRIED_BOOK_STATE};
  }

  if (state.status !== "carried") return rejectBookTransition(state, "book-not-carried");
  if (action.type === "drop") return {ok: true, state: FLOOR_BOOK_STATE};
  if (!action.shelfId.trim() || !Number.isSafeInteger(action.slotIndex))
    return rejectBookTransition(state, "invalid-shelf-slot");
  if (action.slotIndex < 0) return rejectBookTransition(state, "invalid-shelf-slot");

  return {
    ok: true,
    state: {
      shelfId: action.shelfId,
      slotIndex: action.slotIndex,
      status: "shelved",
    },
  };
};
