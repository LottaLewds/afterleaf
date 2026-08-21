import type {PlanarMovementInput} from "~/game/shopGameplay";

export type GamepadLookInput = {
  pitch: number;
  yaw: number;
};

/**
 * Mapping for an 8-button USB gamepad (A/B/C/X/Y/Z/Select/Start), commonly
 * matching the Genesis/MD 6-button layout plus select/start. Indices can be
 * tweaked here for other controllers.
 */
export const GAMEPAD_MAPPING = {
  /** A button. */
  interact: 0,
  /** B button. */
  sprint: 1,
  /** C button. */
  jump: 2,
  /** X button — hold to redirect the D-pad to camera look. */
  lookModifier: 3,
  /** Start button. */
  menu: 7,
  /** D-pad up/down/left/right buttons. */
  dpad: {
    down: 13,
    left: 14,
    right: 15,
    up: 12,
  },
  /** Left analog stick deadzone and axes. */
  leftStick: {
    deadzone: 0.15,
    horizontalAxis: 0,
    verticalAxis: 1,
  },
  /** Right analog stick deadzone and axes. */
  rightStick: {
    deadzone: 0.15,
    horizontalAxis: 2,
    verticalAxis: 3,
  },
} as const;

export type GamepadFrameInput = {
  buttons: boolean[];
  look: GamepadLookInput;
  lookModifier: boolean;
  movement: PlanarMovementInput;
};

const clampAxis = (value: number) => Math.min(Math.max(value, -1), 1);

const readDpadMovement = (gamepad: Gamepad, movement: PlanarMovementInput) => {
  const up = gamepad.buttons[GAMEPAD_MAPPING.dpad.up]?.pressed ?? false;
  const down = gamepad.buttons[GAMEPAD_MAPPING.dpad.down]?.pressed ?? false;
  const left = gamepad.buttons[GAMEPAD_MAPPING.dpad.left]?.pressed ?? false;
  const right = gamepad.buttons[GAMEPAD_MAPPING.dpad.right]?.pressed ?? false;

  movement.forward += Number(up) - Number(down);
  movement.right += Number(right) - Number(left);
};

const readDpadLook = (gamepad: Gamepad, look: GamepadLookInput) => {
  const up = gamepad.buttons[GAMEPAD_MAPPING.dpad.up]?.pressed ?? false;
  const down = gamepad.buttons[GAMEPAD_MAPPING.dpad.down]?.pressed ?? false;
  const left = gamepad.buttons[GAMEPAD_MAPPING.dpad.left]?.pressed ?? false;
  const right = gamepad.buttons[GAMEPAD_MAPPING.dpad.right]?.pressed ?? false;

  const vertical = Number(down) - Number(up);
  const horizontal = Number(right) - Number(left);

  // Diagonal D-pad inputs are ignored in look-lock mode: pressing up/down
  // together with left/right would turn and pitch at the same time, which is
  // disorienting in a first-person 3D view. Only one axis at a time is allowed.
  if (vertical !== 0 && horizontal !== 0) return;

  look.pitch += vertical;
  look.yaw += horizontal;
};

const readLeftStickMovement = (
  gamepad: Gamepad,
  movement: PlanarMovementInput,
) => {
  const axes = gamepad.axes;
  if (axes.length < 2) return;

  const x = axes[GAMEPAD_MAPPING.leftStick.horizontalAxis] ?? 0;
  const y = axes[GAMEPAD_MAPPING.leftStick.verticalAxis] ?? 0;
  const deadzone = GAMEPAD_MAPPING.leftStick.deadzone;

  if (Math.abs(x) > deadzone) movement.right += x;
  if (Math.abs(y) > deadzone) movement.forward -= y;
};

const readRightStickLook = (gamepad: Gamepad, look: GamepadLookInput) => {
  const axes = gamepad.axes;
  if (axes.length < 4) return;

  const x = axes[GAMEPAD_MAPPING.rightStick.horizontalAxis] ?? 0;
  const y = axes[GAMEPAD_MAPPING.rightStick.verticalAxis] ?? 0;
  const deadzone = GAMEPAD_MAPPING.rightStick.deadzone;

  if (Math.abs(x) > deadzone) look.yaw += x;
  if (Math.abs(y) > deadzone) look.pitch += y;
};

const neutralLook = (): GamepadLookInput => ({pitch: 0, yaw: 0});

/**
 * Reads the first connected gamepad and returns normalized frame input.
 *
 * Movement is returned in `movement` as `forward` and `right` in the range
 * `[-1, 1]`. D-pad buttons take priority; if they are neutral, the left analog
 * stick is used as a fallback.
 *
 * Camera look is returned in `look` as `yaw` and `pitch` in `[-1, 1]`. It is
 * driven by the right analog stick, or by the D-pad while `lookModifier` (X)
 * is held. When the modifier is held, the D-pad no longer contributes to
 * movement.
 *
 * Raw button states are returned in `buttons` so that `ShopScene` can map them
 * through the configurable shortcuts system.
 */
export const readGamepadInput = (): GamepadFrameInput => {
  const gamepads = navigator.getGamepads?.() ?? [];
  const gamepad = gamepads.find((g): g is Gamepad => g !== null && g.connected);

  if (!gamepad) {
    return {
      movement: {forward: 0, right: 0},
      look: neutralLook(),
      lookModifier: false,
      buttons: [],
    };
  }

  const lookModifier =
    gamepad.buttons[GAMEPAD_MAPPING.lookModifier]?.pressed ?? false;

  const movement: PlanarMovementInput = {forward: 0, right: 0};
  const look: GamepadLookInput = neutralLook();

  if (lookModifier) {
    readDpadLook(gamepad, look);
  } else {
    readDpadMovement(gamepad, movement);
    if (movement.forward === 0 && movement.right === 0)
      readLeftStickMovement(gamepad, movement);
  }

  readRightStickLook(gamepad, look);

  return {
    movement: {
      forward: clampAxis(movement.forward),
      right: clampAxis(movement.right),
    },
    look: {
      yaw: clampAxis(look.yaw),
      pitch: clampAxis(look.pitch),
    },
    lookModifier,
    buttons: gamepad.buttons.map((button) => button?.pressed ?? false),
  };
};

/** Resets any module-level state. Currently a no-op, kept for API symmetry. */
export const resetGamepadInputState = () => {
  // nothing to reset now that stateless buttons are returned raw
};
