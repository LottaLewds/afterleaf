import {describe, expect, test} from "bun:test";

import {gamepadButtonIndex} from "~/game/input/bindings";
import {GamepadMonitor} from "~/game/input/gamepadMonitor";

const mockGamepad = (overrides?: {buttons?: (boolean | null)[]; axes?: number[]; connected?: boolean}): Gamepad => {
  const buttons = (overrides?.buttons ?? Array(16).fill(null)).map(
    (pressed): GamepadButton =>
      ({
        pressed: pressed === true,
        touched: false,
        value: pressed ? 1 : 0,
      }) as GamepadButton,
  );
  return {
    axes: overrides?.axes ?? [0, 0, 0, 0],
    buttons,
    connected: overrides?.connected ?? true,
    id: "Mock Pad",
    index: 0,
    mapping: "standard",
    timestamp: performance.now(),
    vibrationActuator: undefined,
    hapticActuators: [],
  } as unknown as Gamepad;
};

const setNavigatorGamepads = (gamepads: (Gamepad | null)[]) => {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: () => gamepads,
  });
};

const press = (monitor: GamepadMonitor, name: Parameters<GamepadMonitor["isDown"]>[0]) => {
  monitor.pressed[gamepadButtonIndex(name)] = 1;
};

describe("GamepadMonitor", () => {
  test("reports edges from swapped snapshots without allocating", () => {
    const monitor = new GamepadMonitor();
    monitor.connected = true;

    // Frame 1: A goes down.
    monitor.poll();
    setNavigatorGamepads([mockGamepad({buttons: [true, false]}), null, null, null]);
    monitor.connected = true;
    monitor.poll();
    expect(monitor.justPressed("A")).toBe(true);
    expect(monitor.justReleased("A")).toBe(false);

    // Frame 2: held - no edge.
    monitor.poll();
    expect(monitor.justPressed("A")).toBe(false);
    expect(monitor.isDown("A")).toBe(true);

    // Frame 3: released.
    setNavigatorGamepads([mockGamepad(), null, null, null]);
    monitor.poll();
    expect(monitor.isDown("A")).toBe(false);
    expect(monitor.justReleased("A")).toBe(true);
  });

  test("applies deadzones to stick axes and clamps movement", () => {
    const monitor = new GamepadMonitor();
    monitor.connected = true;
    setNavigatorGamepads([mockGamepad({axes: [0.1, -0.1, 0.15, -0.15]}), null, null, null]);
    monitor.poll();
    expect(monitor.movement.right).toBe(0);
    expect(monitor.movement.forward).toBe(0);
    expect(monitor.look.yaw).toBe(0);
    expect(monitor.look.pitch).toBe(0);

    setNavigatorGamepads([
      mockGamepad({
        axes: [1, -1, 0.9, -0.9],
        buttons: [null, null, null, null, null, null, null, true],
      }),
      null,
      null,
      null,
    ]);
    monitor.poll();
    // Stick up (negative Y axis) walks forward.
    expect(monitor.movement.right).toBe(1);
    expect(monitor.movement.forward).toBe(1);
    expect(monitor.look.yaw).toBeCloseTo(0.9);
    expect(monitor.look.pitch).toBeCloseTo(-0.9);
  });

  test("look modifier redirects the D-pad from movement to look", () => {
    const monitor = new GamepadMonitor();
    monitor.connected = true;
    setNavigatorGamepads([
      mockGamepad({
        buttons: [false, false, false, false, false, false, false, true, false, false, false, false, true],
      }),
      null,
      null,
      null,
    ]);
    monitor.poll();
    // R2 + D-pad up pitches the camera instead of walking forward; the
    // negative pitch matches the mouse-delta sign convention (look up).
    expect(monitor.movement.forward).toBe(0);
    expect(monitor.look.pitch).toBe(-1);
  });

  test("clears state when no pad is connected", () => {
    const monitor = new GamepadMonitor();
    monitor.connected = true;
    setNavigatorGamepads([null, null, null, null]);
    press(monitor, "X");
    monitor.poll();
    expect(monitor.isDown("X")).toBe(false);
    expect(monitor.movement.forward).toBe(0);
  });
});
