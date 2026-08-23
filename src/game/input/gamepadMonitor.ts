import type {PlanarMovementInput} from "~/game/shopGameplay";
import {
  gamepadButtonIndex,
  type GamepadButtonName,
  type GamepadStyle,
} from "~/game/input/bindings";

/** Detects a controller family from the Gamepad API id string. */
const detectGamepadStyle = (id: string): GamepadStyle =>
  /dualsense|dualshock|wireless controller|playstation|\bps[345]\b/i.test(id)
    ? "playstation"
    : "xbox";

/**
 * Zero-allocation per-frame gamepad polling.
 *
 * Button states live in two swapped `Uint8Array` snapshots (current vs.
 * previous frame) so edge detection never allocates; analog movement and look
 * are written into persistent structs owned by the monitor. The only
 * unavoidable allocation is `navigator.getGamepads()`'s return array.
 *
 * Buttons follow the W3C standard gamepad mapping. Pads that do not report
 * `"standard"` mapping still use the same indices - most browsers remap
 * common controllers to standard anyway, and users can rebind actions.
 */
export class GamepadMonitor {
  /** True while at least one pad is connected. */
  connected = false;
  /** Detected controller family, for prompt iconography and labels. */
  style: GamepadStyle = "xbox";
  /** Current-frame pressed flags, indexed by standard-mapping order. */
  readonly pressed = new Uint8Array(GAMEPAD_STANDARD_BUTTON_COUNT);
  readonly #previous = new Uint8Array(GAMEPAD_STANDARD_BUTTON_COUNT);
  /** Left stick + D-pad movement in [-1, 1]. */
  readonly movement: PlanarMovementInput = {forward: 0, right: 0};
  /** Right stick (or modified D-pad) look in [-1, 1]. */
  readonly look = {pitch: 0, yaw: 0};

  attach(signal: AbortSignal) {
    const refreshConnected = () => {
      this.connected = findGamepad() !== undefined;
      if (!this.connected) {
        this.movement.forward = 0;
        this.movement.right = 0;
        this.look.pitch = 0;
        this.look.yaw = 0;
        this.pressed.fill(0);
        this.#previous.fill(0);
      }
    };
    window.addEventListener("gamepadconnected", refreshConnected, {signal});
    window.addEventListener("gamepaddisconnected", refreshConnected, {signal});
    if (!this.connected) refreshConnected();
  }

  /**
   * Reads the first connected pad into the current snapshot. Call exactly
   * once per frame before querying state; cheap no-op when no pad exists.
   */
  poll() {
    // Swap snapshots without allocating: previous frame's edges stay intact.
    const current = this.pressed;
    const previous = this.#previous;
    previous.set(current);
    current.fill(0);
    this.movement.forward = 0;
    this.movement.right = 0;
    this.look.pitch = 0;
    this.look.yaw = 0;
    if (!this.connected) return;

    const gamepad = findGamepad();
    if (!gamepad) return;
    this.style = detectGamepadStyle(gamepad.id);

    const buttons = gamepad.buttons;
    for (let index = 0; index < GAMEPAD_STANDARD_BUTTON_COUNT; index++) {
      const button = buttons[index];
      if (button !== undefined && button.pressed) current[index] = 1;
    }

    const axes = gamepad.axes;
    // Left stick always moves; the look modifier only redirects the D-pad.
    if (axes.length >= 2) {
      const x = axes[STANDARD_AXES.leftX] ?? 0;
      const y = axes[STANDARD_AXES.leftY] ?? 0;
      if (x > LEFT_STICK_DEADZONE || x < -LEFT_STICK_DEADZONE)
        this.movement.right += x;
      if (y > LEFT_STICK_DEADZONE || y < -LEFT_STICK_DEADZONE)
        this.movement.forward -= y;
    }
    // D-pad contributes to look while R2 is held; otherwise it moves. A
    // diagonal D-pad press never turns and pitches simultaneously.
    if (current[GAMEPAD_BUTTON_INDEX_R2] === 0) {
      this.movement.forward +=
        Number(current[12] !== 0) - Number(current[13] !== 0);
      this.movement.right +=
        Number(current[15] !== 0) - Number(current[14] !== 0);
    } else {
      const vertical = Number(current[13] !== 0) - Number(current[12] !== 0);
      const horizontal = Number(current[15] !== 0) - Number(current[14] !== 0);
      if (!(vertical !== 0 && horizontal !== 0)) {
        this.look.pitch += vertical;
        this.look.yaw += horizontal;
      }
    }
    if (this.movement.forward > 1) this.movement.forward = 1;
    else if (this.movement.forward < -1) this.movement.forward = -1;
    if (this.movement.right > 1) this.movement.right = 1;
    else if (this.movement.right < -1) this.movement.right = -1;

    if (axes.length >= 4) {
      const x = axes[STANDARD_AXES.rightX] ?? 0;
      const y = axes[STANDARD_AXES.rightY] ?? 0;
      if (x > RIGHT_STICK_DEADZONE || x < -RIGHT_STICK_DEADZONE)
        this.look.yaw += x;
      if (y > RIGHT_STICK_DEADZONE || y < -RIGHT_STICK_DEADZONE)
        this.look.pitch += y;
    }
  }

  isDown(name: GamepadButtonName): boolean {
    return this.pressed[gamepadButtonIndex(name)] !== 0;
  }

  justPressed(name: GamepadButtonName): boolean {
    const index = gamepadButtonIndex(name);
    return this.pressed[index] !== 0 && this.#previous[index] === 0;
  }

  justReleased(name: GamepadButtonName): boolean {
    const index = gamepadButtonIndex(name);
    return this.pressed[index] === 0 && this.#previous[index] !== 0;
  }
}

const GAMEPAD_STANDARD_BUTTON_COUNT = 16;
const STANDARD_AXES = {leftX: 0, leftY: 1, rightX: 2, rightY: 3} as const;
const GAMEPAD_BUTTON_INDEX_R2 = gamepadButtonIndex("R2");
const LEFT_STICK_DEADZONE = 0.15;
const RIGHT_STICK_DEADZONE = 0.18;

/** First connected pad, or undefined. Allocation-free beyond the API array. */
const findGamepad = (): Gamepad | undefined => {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return undefined;
  for (let index = 0; index < gamepads.length; index++) {
    const gamepad = gamepads[index];
    if (gamepad !== null && gamepad !== undefined && gamepad.connected)
      return gamepad;
  }
  return undefined;
};
