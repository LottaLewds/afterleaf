import {beforeEach, describe, expect, test} from "bun:test";

import {
  GAMEPAD_MAPPING,
  readGamepadInput,
  resetGamepadInputState,
} from "~/game/gamepadInput";

const mockGamepad = (overrides?: {
  buttons?: (GamepadButton | null)[];
  axes?: number[];
}): Gamepad => {
  const buttons =
    overrides?.buttons ?? Array<GamepadButton | null>(16).fill(null);
  const axes = overrides?.axes ?? Array<number>(4).fill(0);
  return {
    axes,
    buttons: buttons.map((button) =>
      button === null
        ? ({pressed: false, touched: false, value: 0} as GamepadButton)
        : button,
    ),
    connected: true,
    hapticActuators: [],
    id: "Mock Gamepad",
    index: 0,
    mapping: "standard",
    timestamp: performance.now(),
    vibrationActuator: undefined,
  } as Gamepad;
};

const press = (_index: number): GamepadButton =>
  ({pressed: true, touched: true, value: 1}) as GamepadButton;

const release = (_index: number): GamepadButton =>
  ({pressed: false, touched: false, value: 0}) as GamepadButton;

const setButton = (
  buttons: (GamepadButton | null)[],
  index: number,
  pressed: boolean,
) => {
  buttons[index] = pressed ? press(index) : release(index);
};

const expectMovement = (
  input: ReturnType<typeof readGamepadInput>,
  expected: {forward: number; right: number},
) => {
  expect(input.movement.forward).toBeCloseTo(expected.forward);
  expect(input.movement.right).toBeCloseTo(expected.right);
};

const expectLook = (
  input: ReturnType<typeof readGamepadInput>,
  expected: {pitch: number; yaw: number},
) => {
  expect(input.look.pitch).toBeCloseTo(expected.pitch);
  expect(input.look.yaw).toBeCloseTo(expected.yaw);
};

describe("gamepad input", () => {
  beforeEach(() => {
    resetGamepadInputState();
  });

  test("returns neutral input when no gamepad is connected", () => {
    globalThis.navigator.getGamepads = () => [];
    const input = readGamepadInput();
    expectMovement(input, {forward: 0, right: 0});
    expectLook(input, {pitch: 0, yaw: 0});
    expect(input.lookModifier).toBe(false);
    expect(input.buttons).toEqual([]);
  });

  test("maps D-pad to movement", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.dpad.up, true);
    setButton(buttons, GAMEPAD_MAPPING.dpad.right, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];

    expectMovement(readGamepadInput(), {forward: 1, right: 1});
  });

  test("maps D-pad down and left to negative movement", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.dpad.down, true);
    setButton(buttons, GAMEPAD_MAPPING.dpad.left, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];

    expectMovement(readGamepadInput(), {forward: -1, right: -1});
  });

  test("falls back to the left analog stick when D-pad is neutral", () => {
    globalThis.navigator.getGamepads = () => [
      mockGamepad({axes: [0.5, -0.75, 0, 0]}),
    ];

    expectMovement(readGamepadInput(), {forward: 0.75, right: 0.5});
  });

  test("ignores analog stick values below the deadzone", () => {
    globalThis.navigator.getGamepads = () => [
      mockGamepad({axes: [0.05, -0.05, 0, 0]}),
    ];

    expectMovement(readGamepadInput(), {forward: 0, right: 0});
  });

  test("D-pad takes priority over the analog stick", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.dpad.up, true);
    globalThis.navigator.getGamepads = () => [
      mockGamepad({buttons, axes: [0, 1, 0, 0]}),
    ];

    expectMovement(readGamepadInput(), {forward: 1, right: 0});
  });

  test("ignores disconnected gamepads", () => {
    globalThis.navigator.getGamepads = () => [
      {...mockGamepad(), connected: false} as Gamepad,
    ];
    expectMovement(readGamepadInput(), {forward: 0, right: 0});
  });

  test("maps right analog stick to look", () => {
    globalThis.navigator.getGamepads = () => [
      mockGamepad({axes: [0, 0, 0.6, -0.8]}),
    ];

    expectLook(readGamepadInput(), {pitch: -0.8, yaw: 0.6});
  });

  test("ignores right analog stick values below the deadzone", () => {
    globalThis.navigator.getGamepads = () => [
      mockGamepad({axes: [0, 0, 0.05, -0.05]}),
    ];

    expectLook(readGamepadInput(), {pitch: 0, yaw: 0});
  });

  test("allows pure vertical or horizontal D-pad look, but ignores diagonals", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.lookModifier, true);
    setButton(buttons, GAMEPAD_MAPPING.dpad.up, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];
    expectLook(readGamepadInput(), {pitch: -1, yaw: 0});

    setButton(buttons, GAMEPAD_MAPPING.dpad.up, false);
    setButton(buttons, GAMEPAD_MAPPING.dpad.right, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];
    expectLook(readGamepadInput(), {pitch: 0, yaw: 1});

    setButton(buttons, GAMEPAD_MAPPING.dpad.up, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];
    // Diagonal up+right is ignored to avoid disorienting combined turns.
    expectLook(readGamepadInput(), {pitch: 0, yaw: 0});
  });

  test("D-pad moves normally when the look modifier is not held", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.dpad.up, true);
    setButton(buttons, GAMEPAD_MAPPING.dpad.right, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];

    const input = readGamepadInput();
    expectMovement(input, {forward: 1, right: 1});
    expectLook(input, {pitch: 0, yaw: 0});
    expect(input.lookModifier).toBe(false);
  });

  test("returns raw button states", () => {
    const buttons: (GamepadButton | null)[] = Array(16).fill(null);
    setButton(buttons, GAMEPAD_MAPPING.jump, true);
    setButton(buttons, GAMEPAD_MAPPING.interact, true);
    globalThis.navigator.getGamepads = () => [mockGamepad({buttons})];

    const input = readGamepadInput();
    expect(input.buttons[2]).toBe(true);
    expect(input.buttons[0]).toBe(true);
    expect(input.buttons[1]).toBe(false);
  });
});
