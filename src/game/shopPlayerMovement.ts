import {Vector3, type PerspectiveCamera} from "three";

import type {InputManager} from "~/game/input/inputManager";
import type {ShopInputState} from "~/game/shopInputController";
import {
  getPlanarMovement,
  resolvePlayerGrounded,
  resolveShopMovement,
  type PlanarMovementInput,
  type PlanarPoint,
  type ShopCollisionWorld,
} from "~/game/shopGameplay";
import {clampUnit} from "~/game/mathHelpers";
import {
  SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
  type MutablePlayerMovement,
  type ShopPhysicsWorld,
} from "~/game/ShopPhysicsWorld";

const PLAYER_RADIUS = 0.3;
const WALK_SPEED = 2.65;
const SPRINT_SPEED = 4.35;
const PLAYER_GRAVITY = -18;
const PLAYER_JUMP_SPEED = 6.2;
const PLAYER_JUMP_BUFFER_MS = 160;
const PLAYER_JUMP_COYOTE_MS = 160;
const PLAYER_TERMINAL_VELOCITY = -24;

export type ShopPlayerMovementHost = {
  camera: () => PerspectiveCamera;
  collisionWorld: ShopCollisionWorld;
  input: () => InputManager;
  inputState: () => ShopInputState;
  inspectionSpread: () => boolean;
  markWorldStateDirty: () => void;
  physicsWorld: () => ShopPhysicsWorld;
  playerVelocity: () => Vector3;
};

/** Owns free-roam movement, jumping, and the small amount of player physics state. */
export class ShopPlayerMovement {
  readonly #host: ShopPlayerMovementHost;
  readonly #movementDelta: PlanarPoint = {x: 0, z: 0};
  readonly #movementInput: PlanarMovementInput = {forward: 0, right: 0};
  readonly #movementPosition: PlanarPoint = {x: 0, z: 0};
  readonly #playerDesiredDisplacement = new Vector3();
  readonly #playerMovement: MutablePlayerMovement = {
    ceilingHit: false,
    collisionCount: 0,
    correctedDisplacement: new Vector3(),
    eyePosition: new Vector3(),
    grounded: false,
  };
  #lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
  #playerGrounded = false;
  #playerVerticalVelocity = 0;

  constructor(host: ShopPlayerMovementHost) {
    this.#host = host;
  }

  reset() {
    this.#host.playerVelocity().set(0, 0, 0);
    this.#playerGrounded = false;
    this.#lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
    this.#playerVerticalVelocity = 0;
    this.#host.inputState().jumpQueued = false;
  }

  update(deltaSeconds: number) {
    const host = this.#host;
    const state = host.inputState();
    const camera = host.camera();
    if (!state.pointerLocked || host.inspectionSpread()) {
      host.playerVelocity().set(0, 0, 0);
      this.#playerVerticalVelocity = 0;
      state.jumpQueued = false;
      return;
    }
    // Digital keyboard input and analog stick input combine, then clamp.
    const padMovement = host.input().gamepad.movement;
    this.#movementInput.forward = clampUnit(
      Number(host.input().isActionDown("moveForward")) -
        Number(host.input().isActionDown("moveBackward")) +
        padMovement.forward,
    );
    this.#movementInput.right = clampUnit(
      Number(host.input().isActionDown("moveRight")) -
        Number(host.input().isActionDown("moveLeft")) +
        padMovement.right,
    );
    const sprinting = host.input().isActionDown("sprint");
    getPlanarMovement(
      this.#movementInput,
      state.lookAngles.yaw,
      (sprinting ? SPRINT_SPEED : WALK_SPEED) * deltaSeconds,
      this.#movementDelta,
    );
    const previousX = camera.position.x;
    const previousY = camera.position.y;
    const previousZ = camera.position.z;
    if (host.physicsWorld().isReady) {
      const movementTime = performance.now();
      const canJump =
        this.#playerGrounded ||
        movementTime - this.#lastPlayerGroundedAt <= PLAYER_JUMP_COYOTE_MS ||
        camera.position.y <= SHOP_PHYSICS_PLAYER_EYE_HEIGHT + 0.025;
      const jumpBuffered = state.jumpQueued && movementTime - state.jumpQueuedAt <= PLAYER_JUMP_BUFFER_MS;
      if (jumpBuffered && canJump) {
        this.#playerVerticalVelocity = PLAYER_JUMP_SPEED;
        this.#playerGrounded = false;
        this.#lastPlayerGroundedAt = Number.NEGATIVE_INFINITY;
      } else
        this.#playerVerticalVelocity = Math.max(
          PLAYER_TERMINAL_VELOCITY,
          this.#playerVerticalVelocity + PLAYER_GRAVITY * deltaSeconds,
        );
      state.jumpQueued = jumpBuffered && !canJump;
      this.#playerDesiredDisplacement.set(
        this.#movementDelta.x,
        this.#playerVerticalVelocity * deltaSeconds,
        this.#movementDelta.z,
      );
      host.physicsWorld().movePlayer(this.#playerDesiredDisplacement, this.#playerMovement);
      camera.position.copy(this.#playerMovement.eyePosition);
      const correctedY = this.#playerMovement.correctedDisplacement.y;
      const descending = this.#playerVerticalVelocity <= 0;
      const supportedWhileFalling = descending && correctedY > this.#playerDesiredDisplacement.y + 0.0001;
      // Rapier can retain a ground contact during the first upward sweep based
      // on its planar direction. It must not cancel a jump that just launched.
      const grounded = resolvePlayerGrounded(
        this.#playerVerticalVelocity,
        this.#playerMovement.grounded,
        supportedWhileFalling,
      );
      if (grounded || (this.#playerVerticalVelocity > 0 && this.#playerMovement.ceilingHit))
        this.#playerVerticalVelocity = 0;
      this.#playerGrounded = grounded;
      if (grounded) this.#lastPlayerGroundedAt = movementTime;
    } else {
      state.jumpQueued = false;
      this.#movementPosition.x = previousX;
      this.#movementPosition.z = previousZ;
      resolveShopMovement(
        this.#movementPosition,
        this.#movementDelta,
        PLAYER_RADIUS,
        host.collisionWorld,
        this.#movementPosition,
      );
      camera.position.set(this.#movementPosition.x, SHOP_PHYSICS_PLAYER_EYE_HEIGHT, this.#movementPosition.z);
      this.#playerGrounded = true;
      this.#lastPlayerGroundedAt = performance.now();
      this.#playerVerticalVelocity = 0;
    }
    host
      .playerVelocity()
      .set(
        (camera.position.x - previousX) / deltaSeconds,
        (camera.position.y - previousY) / deltaSeconds,
        (camera.position.z - previousZ) / deltaSeconds,
      );
    if (camera.position.x !== previousX || camera.position.y !== previousY || camera.position.z !== previousZ)
      host.markWorldStateDirty();
  }
}
