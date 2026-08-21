import {afterEach, beforeEach, describe, expect, test} from "bun:test";

import {
  DEFAULT_SHORTCUTS,
  formatGamepadButton,
  formatKeyboardCode,
  isActionDownGamepad,
  isActionDownKeyboard,
  isGamepadActionJustDown,
  isGamepadActionJustUp,
  loadShortcuts,
  matchesKeyboardAction,
  saveShortcuts,
  SHORTCUT_CATEGORIES,
  SHORTCUT_LABELS,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/shortcuts";

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

describe("shortcuts", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMockStorage(),
      writable: true,
    });
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  test("loads default shortcuts when storage is empty", () => {
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  test("loads saved shortcuts", () => {
    const custom: ShortcutsConfig = {
      ...DEFAULT_SHORTCUTS,
      jump: [{device: "keyboard", code: "KeyJ"}],
    };
    saveShortcuts(custom);
    expect(loadShortcuts().jump).toEqual([{device: "keyboard", code: "KeyJ"}]);
    // Other actions fall back to defaults.
    expect(loadShortcuts().interact).toEqual(DEFAULT_SHORTCUTS.interact);
  });

  test("ignores corrupted storage", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({jump: "invalid"}));
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  test("matches keyboard action by physical code", () => {
    const config = loadShortcuts();
    expect(matchesKeyboardAction(config, "jump", {code: "Space"})).toBe(true);
    expect(matchesKeyboardAction(config, "jump", {code: "KeyE"})).toBe(false);
  });

  test("detects action held from keysDown set", () => {
    const config = loadShortcuts();
    const keysDown = new Set(["KeyW", "ShiftLeft"]);
    expect(isActionDownKeyboard(config, "moveForward", keysDown)).toBe(true);
    expect(isActionDownKeyboard(config, "sprint", keysDown)).toBe(true);
    expect(isActionDownKeyboard(config, "moveBackward", keysDown)).toBe(false);
  });

  test("detects gamepad action from button states", () => {
    const config = loadShortcuts();
    const buttons = [{pressed: true}, {pressed: false}, {pressed: true}] as {
      pressed: boolean;
    }[];
    expect(isActionDownGamepad(config, "interact", buttons)).toBe(true);
    expect(isActionDownGamepad(config, "jump", buttons)).toBe(true);
    expect(isActionDownGamepad(config, "sprint", buttons)).toBe(false);
  });

  test("detects gamepad button press and release edges", () => {
    const config = loadShortcuts();
    const previous = [{pressed: false}, {pressed: false}, {pressed: false}];
    const current = [{pressed: true}, {pressed: false}, {pressed: true}];
    expect(isGamepadActionJustDown(config, "interact", current, previous)).toBe(
      true,
    );
    expect(isGamepadActionJustDown(config, "interact", current, current)).toBe(
      false,
    );
    expect(isGamepadActionJustUp(config, "interact", previous, current)).toBe(
      true,
    );
    expect(isGamepadActionJustUp(config, "interact", previous, previous)).toBe(
      false,
    );
  });

  test("formats keyboard codes for display", () => {
    expect(formatKeyboardCode("KeyE")).toBe("E");
    expect(formatKeyboardCode("Space")).toBe("Space");
    expect(formatKeyboardCode("Escape")).toBe("Esc");
    expect(formatKeyboardCode("Digit1")).toBe("1");
    expect(formatKeyboardCode("ShiftLeft")).toBe("Shift");
  });

  test("formats gamepad buttons for display", () => {
    expect(formatGamepadButton("0")).toBe("A");
    expect(formatGamepadButton("9")).toBe("Start");
    expect(formatGamepadButton("15")).toBe("D-pad Right");
    expect(formatGamepadButton("99")).toBe("Btn 99");
  });

  test("all default actions have labels and categories", () => {
    const allCategorized = Object.values(SHORTCUT_CATEGORIES).flatMap(
      (category) => category.actions,
    );
    for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
      expect(SHORTCUT_LABELS[action]).toBeTruthy();
      expect(allCategorized).toContain(action);
    }
  });
});
