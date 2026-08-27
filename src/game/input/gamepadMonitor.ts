import type {PlanarMovementInput} from "~/game/shopGameplay";
import {detectGamepadStyle, gamepadButtonIndex, type GamepadButtonName, type GamepadStyle} from "~/game/input/bindings";

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
    this.#readButtons(gamepad.buttons);
    this.#readMovement(gamepad.axes);
    this.#readLook(gamepad.axes);
  }

  #readButtons(buttons: readonly GamepadButton[]) {
    for (let index = 0; index < GAMEPAD_STANDARD_BUTTON_COUNT; index++) {
      const button = buttons[index];
      if (button !== undefined && button.pressed) this.pressed[index] = 1;
    }
  }

  #readMovement(axes: readonly number[]) {
    // Left stick always moves; the look modifier only redirects the D-pad.
    if (axes.length >= 2) {
      const x = axes[STANDARD_AXES.leftX] ?? 0;
      const y = axes[STANDARD_AXES.leftY] ?? 0;
      this.movement.right += applyDeadzone(x, LEFT_STICK_DEADZONE);
      this.movement.forward -= applyDeadzone(y, LEFT_STICK_DEADZONE);
    }
    // D-pad contributes to look while R2 is held; otherwise it moves. A
    // diagonal D-pad press never turns and pitches simultaneously.
    if (this.pressed[GAMEPAD_BUTTON_INDEX_R2] === 0) {
      this.movement.forward += Number(this.pressed[12] !== 0) - Number(this.pressed[13] !== 0);
      this.movement.right += Number(this.pressed[15] !== 0) - Number(this.pressed[14] !== 0);
    }
    this.movement.forward = clampToUnit(this.movement.forward);
    this.movement.right = clampToUnit(this.movement.right);
  }

  #readLook(axes: readonly number[]) {
    if (this.pressed[GAMEPAD_BUTTON_INDEX_R2] !== 0) {
      const vertical = Number(this.pressed[13] !== 0) - Number(this.pressed[12] !== 0);
      const horizontal = Number(this.pressed[15] !== 0) - Number(this.pressed[14] !== 0);
      if (vertical !== 0 && horizontal !== 0) return;
      this.look.pitch += vertical;
      this.look.yaw += horizontal;
    }
    if (axes.length >= 4) {
      const x = axes[STANDARD_AXES.rightX] ?? 0;
      const y = axes[STANDARD_AXES.rightY] ?? 0;
      this.look.yaw += applyDeadzone(x, RIGHT_STICK_DEADZONE);
      this.look.pitch += applyDeadzone(y, RIGHT_STICK_DEADZONE);
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

const applyDeadzone = (value: number, deadzone: number) => (Math.abs(value) > deadzone ? value : 0);

const clampToUnit = (value: number) => Math.min(Math.max(value, -1), 1);

/** First connected pad, or undefined. Allocation-free beyond the API array. */
const findGamepad = (): Gamepad | undefined => {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return undefined;
  for (let index = 0; index < gamepads.length; index++) {
    const gamepad = gamepads[index];
    if (gamepad !== null && gamepad !== undefined && gamepad.connected) return gamepad;
  }
  return undefined;
};
