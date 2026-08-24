import {afterEach, beforeEach, describe, expect, test} from "bun:test";

import {
  DEFAULT_SHORTCUTS,
  gamepadButtonIndex,
  type GamepadButtonName,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/input/bindings";
import {InputManager} from "~/game/input/inputManager";

type RecordedEvent = {
  action: ShortcutAction;
  phase: "down" | "up";
  source: "keyboard" | "gamepad";
};

/** Minimal window stub; bun tests have no DOM. */
const keyboardListeners = new Map<
  string,
  Array<(event: FakeKeyEvent) => void>
>();
type FakeKeyEvent = {
  code: string;
  repeat: boolean;
  type: string;
  defaultPrevented: boolean;
  preventDefault: () => void;
  target?: EventTarget | null;
};
const installWindowStub = () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: unknown) => {
        const list = keyboardListeners.get(type) ?? [];
        list.push(listener as (event: FakeKeyEvent) => void);
        keyboardListeners.set(type, list);
      },
    },
  });
};
const fakeKeyEvent = (
  code: string,
  type = "keydown",
  repeat = false,
): FakeKeyEvent => ({
  code,
  repeat,
  type,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
});
const dispatchKey = (event: FakeKeyEvent) => {
  for (const listener of keyboardListeners.get(event.type) ?? [])
    listener(event);
};

const createManager = (
  config: ShortcutsConfig = DEFAULT_SHORTCUTS,
  consumedActions?: ReadonlySet<ShortcutAction>,
) => {
  const events: RecordedEvent[] = [];
  const manager = new InputManager({
    getShortcuts: () => config,
    handleAction: (action, phase, source) => {
      events.push({action, phase, source});
      return consumedActions?.has(action) ?? true;
    },
  });
  // Registers the keyboard listeners against the window stub.
  manager.attach(new AbortController().signal);
  return {events, manager};
};

const mockPadButtons = new Uint8Array(16);
let padConnected = false;

const installMockGamepad = () => {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: () =>
      padConnected
        ? [
            {
              axes: [0, 0, 0, 0],
              buttons: Array.from(mockPadButtons, (down) => ({
                pressed: down === 1,
                touched: false,
                value: down,
              })),
              connected: true,
              id: "Mock Pad",
              index: 0,
              mapping: "standard",
              timestamp: 0,
            },
            null,
            null,
            null,
          ]
        : [null, null, null, null],
  });
};

/** Sets a button and runs two update() ticks so the edge becomes visible. */
const pressButton = (manager: InputManager, name: GamepadButtonName) => {
  mockPadButtons[gamepadButtonIndex(name)] = 1;
  manager.update("shop");
  manager.update("shop");
};

beforeEach(() => {
  keyboardListeners.clear();
  installWindowStub();
  padConnected = true;
  mockPadButtons.fill(0);
  installMockGamepad();
});

afterEach(() => {
  padConnected = false;
});

describe("InputManager", () => {
  test("dispatches bound keyboard presses as actions", () => {
    const {manager, events} = createManager();
    manager.update("shop");
    dispatchKey(fakeKeyEvent("Space"));
    expect(events).toEqual([
      {action: "jump", phase: "down", source: "keyboard"},
    ]);
    expect(manager.isActionDown("jump")).toBe(true);
    dispatchKey(fakeKeyEvent("Space", "keyup"));
    expect(events[1]).toEqual({
      action: "jump",
      phase: "up",
      source: "keyboard",
    });
    expect(manager.isActionDown("jump")).toBe(false);
  });

  test("ignores repeats and unbound keys", () => {
    const {manager, events} = createManager();
    manager.update("shop");
    dispatchKey(fakeKeyEvent("KeyZ", "keydown", true));
    dispatchKey(fakeKeyEvent("F13"));
    expect(events).toEqual([]);
    expect(manager.isActionDown("interact")).toBe(false);
  });

  test("tries candidates in dispatch priority until one consumes", () => {
    // Both actions share KeyQ; only the higher-priority one consumes.
    const config: ShortcutsConfig = {
      ...DEFAULT_SHORTCUTS,
      placementCycleLeft: [{device: "keyboard", code: "KeyQ"}],
      tvPreviousChannel: [{device: "keyboard", code: "KeyQ"}],
    };
    const consumed = new Set<ShortcutAction>(["tvPreviousChannel"]);
    const {manager, events} = createManager(config, consumed);
    manager.update("shop");
    dispatchKey(fakeKeyEvent("KeyQ"));
    // Lower-priority candidates run first and decline; dispatch stops as
    // soon as tvPreviousChannel consumes the press.
    expect(events.at(-1)?.action).toBe("tvPreviousChannel");
    expect(events.some((event) => event.action === "placementCycleLeft")).toBe(
      true,
    );

    // When nothing declines, only the highest-priority candidate sees it.
    const all = createManager(config);
    all.manager.update("shop");
    dispatchKey(fakeKeyEvent("KeyQ"));
    expect(all.events.length).toBe(1);
    expect(all.events[0]?.action).toBe("placementCycleLeft");
  });

  test("held-state queries span both devices", () => {
    const config: ShortcutsConfig = {
      ...DEFAULT_SHORTCUTS,
      sprint: [
        {device: "keyboard", code: "ShiftLeft"},
        {device: "gamepad", code: "L3"},
      ],
    };
    const {manager} = createManager(config);
    manager.update("shop");
    dispatchKey(fakeKeyEvent("ShiftLeft"));
    expect(manager.isActionDown("sprint")).toBe(true);
    dispatchKey(fakeKeyEvent("ShiftLeft", "keyup"));
    expect(manager.isActionDown("sprint")).toBe(false);

    // Gamepad L3 is held across frames without any dispatched edge handler.
    mockPadButtons[gamepadButtonIndex("L3")] = 1;
    manager.update("shop");
    expect(manager.isActionDown("sprint")).toBe(true);
  });

  test("dispatches gamepad edges through the same handler", () => {
    const {manager, events} = createManager();
    manager.attach(new AbortController().signal);
    pressButton(manager, "A");
    expect(events.some((event) => event.source === "gamepad")).toBe(true);
    expect(
      events.filter((event) => event.source === "gamepad").map((e) => e.phase),
    ).toContain("down");
  });

  test("arcade mode forwards raw gamepad buttons instead of actions", () => {
    const {manager, events} = createManager();
    const forwarded: Array<[GamepadButtonName, boolean]> = [];
    manager.setRawGamepadForward((name, down) => forwarded.push([name, down]));

    // Shop mode dispatches actions for the press.
    mockPadButtons[gamepadButtonIndex("A")] = 1;
    manager.update("shop");
    expect(forwarded).toEqual([]);
    expect(events.some((event) => event.source === "gamepad")).toBe(true);

    // Arcade mode forwards raw edges; the press edge was already consumed,
    // so only the release arrives while the button stays held across modes.
    manager.update("arcade");
    mockPadButtons[gamepadButtonIndex("A")] = 0;
    manager.update("arcade");
    mockPadButtons[gamepadButtonIndex("A")] = 1;
    manager.update("arcade");
    expect(forwarded).toEqual([
      ["A", false],
      ["A", true],
    ]);
  });

  test("Start toggles the menu in every mode", () => {
    let toggles = 0;
    const manager = new InputManager({
      getShortcuts: () => DEFAULT_SHORTCUTS,
      handleAction: () => true,
      onMenuToggle: () => {
        toggles += 1;
      },
    });
    manager.gamepad.connected = true;
    mockPadButtons[gamepadButtonIndex("Start")] = 1;
    manager.update("paused");
    expect(toggles).toBe(1);
    mockPadButtons[gamepadButtonIndex("Start")] = 0;
    manager.update("paused");
    mockPadButtons[gamepadButtonIndex("Start")] = 1;
    manager.update("paused");
    expect(toggles).toBe(2);
  });

  test("suspend releases held keys and analog state", () => {
    const {manager} = createManager();
    manager.update("shop");
    dispatchKey(fakeKeyEvent("Space"));
    expect(manager.isActionDown("jump")).toBe(true);
    manager.suspend();
    expect(manager.isActionDown("jump")).toBe(false);
  });
});

describe("InputManager input gating", () => {
  test("does not consume keys typed into editable targets", () => {
    const {manager, events} = createManager();
    manager.update("shop");
    const typing = fakeKeyEvent("KeyE");
    // Simulate focus sitting in a text input.
    typing.target = {
      tagName: "INPUT",
      isContentEditable: false,
    } as unknown as EventTarget;
    dispatchKey(typing);
    expect(events).toEqual([]);
    expect(typing.defaultPrevented).toBe(false);
    expect(manager.isActionDown("interact")).toBe(false);
  });

  test("stops consuming bound keys while inactive (menus)", () => {
    let active = true;
    const manager = new InputManager({
      getShortcuts: () => DEFAULT_SHORTCUTS,
      handleAction: () => true,
      isActive: () => active,
    });
    manager.attach(new AbortController().signal);
    manager.update("shop");
    active = false;
    const press = fakeKeyEvent("Space");
    dispatchKey(press);
    expect(press.defaultPrevented).toBe(false);
    // Held-key tracking continues so state stays consistent across the gate.
    expect(manager.isActionDown("jump")).toBe(true);
    active = true;
    const release = fakeKeyEvent("Space", "keyup");
    dispatchKey(release);
    expect(manager.isActionDown("jump")).toBe(false);
  });
});

describe("InputManager edge dispatch", () => {
  test("key-up reaches lower-priority candidates when higher ones decline", () => {
    // Mirrors the throw bug: inspectionThrow shares KeyF with throw and sits
    // higher in dispatch order; its up-phase declines so throw must still
    // receive the release.
    const config: ShortcutsConfig = {
      ...DEFAULT_SHORTCUTS,
      inspectionThrow: [{device: "keyboard", code: "KeyF"}],
      throw: [{device: "keyboard", code: "KeyF"}],
    };
    const ups: ShortcutAction[] = [];
    const manager = new InputManager({
      getShortcuts: () => config,
      // Mirror the scene's up-handler: every action declines its release
      // except throw, even though three actions share KeyF.
      handleAction: (action, phase) => {
        if (phase === "down") return action === "throw";
        if (action !== "throw") return false;
        ups.push(action);
        return true;
      },
    });
    manager.attach(new AbortController().signal);
    manager.update("shop");
    dispatchKey(fakeKeyEvent("KeyF"));
    dispatchKey(fakeKeyEvent("KeyF", "keyup"));
    expect(ups).toEqual(["throw"]);
  });
});
