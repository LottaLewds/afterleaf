import {afterEach, beforeEach, describe, expect, test} from "bun:test";

import {
  actionDispatchPriority,
  ACTION_DISPATCH_ORDER,
  DEFAULT_SHORTCUTS,
  formatGamepadButton,
  formatKeyboardCode,
  GAMEPAD_BUTTON_NAMES,
  gamepadButtonIndex,
  loadShortcuts,
  saveShortcuts,
  SHORTCUT_CATEGORIES,
  SHORTCUT_LABELS,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/input/bindings";

const STORAGE_KEY = "afterleaf:shortcuts:v1";

const createMockStorage = () => {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
};

describe("bindings", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMockStorage(),
      writable: true,
    });
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  test("standard button names map one-to-one onto spec indices", () => {
    expect(GAMEPAD_BUTTON_NAMES).toHaveLength(16);
    for (const [index, name] of GAMEPAD_BUTTON_NAMES.entries())
      expect(gamepadButtonIndex(name)).toBe(index);
  });

  test("loads default shortcuts when storage is empty", () => {
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  test("loads saved shortcuts", () => {
    const custom: ShortcutsConfig = {
      ...DEFAULT_SHORTCUTS,
      interact: [{device: "keyboard", code: "KeyH"}],
    };
    saveShortcuts(custom);
    expect(loadShortcuts().interact).toEqual([
      {device: "keyboard", code: "KeyH"},
    ]);
    // Untouched actions keep their defaults.
    expect(loadShortcuts().jump).toEqual(DEFAULT_SHORTCUTS.jump);
  });

  test("falls back to defaults on corrupt or invalid payloads", () => {
    globalThis.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({interact: [{device: "gamepad", code: "Turbo"}]}),
    );
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({interact: "nope"}),
    );
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  test("every action has labels, a category, and defaults", () => {
    for (const category of Object.values(SHORTCUT_CATEGORIES)) {
      for (const action of category.actions) {
        expect(SHORTCUT_LABELS[action]).toBeDefined();
        expect(DEFAULT_SHORTCUTS[action].length).toBeGreaterThan(0);
      }
    }
  });

  test("dispatch order covers every action exactly once", () => {
    const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];
    expect(new Set(ACTION_DISPATCH_ORDER).size).toBe(
      ACTION_DISPATCH_ORDER.length,
    );
    // Held-state actions are queried per frame, not dispatched on edges, so
    // they are the only ones allowed outside the dispatch order.
    const heldActions = new Set<ShortcutAction>([
      "moveForward",
      "moveBackward",
      "moveLeft",
      "moveRight",
      "sprint",
      "toggleMenu",
    ]);
    for (const action of actions) {
      const priority = actionDispatchPriority(action);
      if (priority === Number.MAX_SAFE_INTEGER)
        expect(heldActions.has(action)).toBe(true);
    }
  });

  test("formats keyboard and gamepad codes", () => {
    expect(formatKeyboardCode("KeyW")).toBe("W");
    expect(formatKeyboardCode("ShiftLeft")).toBe("Shift");
    expect(formatKeyboardCode("Delete")).toBe("Del");
    expect(formatGamepadButton("A")).toBe("A");
    expect(formatGamepadButton("L2")).toBe("LT");
    expect(formatGamepadButton("DpadUp")).toBe("D-Up");
    expect(formatGamepadButton("99")).toBe("Btn 99");
  });
});
