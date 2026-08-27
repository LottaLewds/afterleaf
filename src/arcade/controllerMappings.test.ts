import {describe, expect, test, beforeEach, afterEach} from "bun:test";

import {
  buildDefaultControllers,
  DEFAULT_PAD_MAPPINGS,
  formatArcadeKeyBinding,
  forwardedKeyEventForBinding,
  loadPadMappingOverrides,
  padForwardEvent,
  resetPadMapping,
  resolvePadMapping,
  savePadMappingOverrides,
  SYSTEM_CONTROLLER_CONTROLS,
} from "~/arcade/controllerMappings";
import {ARCADE_SYSTEMS, type ArcadeSystemId} from "~/arcade/systems";
import type {GamepadButtonName} from "~/game/input/bindings";

/** EmulatorJS keyMap names accepted by its keyLookup on boot. */
const VALID_EJS_VALUES = new Set([
  "x",
  "z",
  "c",
  "v",
  "a",
  "s",
  "d",
  "q",
  "w",
  "e",
  "i",
  "j",
  "k",
  "l",
  "shift",
  "enter",
  "up arrow",
  "down arrow",
  "left arrow",
  "right arrow",
]);

const systemIds = ARCADE_SYSTEMS.map((system) => system.id) as ArcadeSystemId[];

const createMockStorage = () => {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: createMockStorage(),
    writable: true,
  });
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("SYSTEM_CONTROLLER_CONTROLS", () => {
  test("defines controls for every supported system", () => {
    for (const id of systemIds) expect(SYSTEM_CONTROLLER_CONTROLS[id].length).toBeGreaterThan(0);
  });

  test("uses unique retropad ids and valid EJS key values per system", () => {
    for (const id of systemIds) {
      const ids = SYSTEM_CONTROLLER_CONTROLS[id].map((control) => control.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const control of SYSTEM_CONTROLLER_CONTROLS[id]) {
        expect(VALID_EJS_VALUES.has(control.keyboard.value)).toBe(true);
        expect(Number.isInteger(control.keyboard.keyCode)).toBe(true);
        expect(control.label.length).toBeGreaterThan(0);
      }
    }
  });

  test("every default pad binding targets an existing control", () => {
    for (const id of systemIds) {
      const validIds = new Set(SYSTEM_CONTROLLER_CONTROLS[id].map((control) => control.id));
      for (const controlId of Object.values(DEFAULT_PAD_MAPPINGS[id]))
        expect(validIds.has(controlId as number)).toBe(true);
    }
  });

  test("every system maps the pad directions to movement controls", () => {
    // Regression guard: without these, pads cannot move in-game at all.
    const movementIds = new Set([4, 5, 6, 7, 16, 17, 18, 19]);
    for (const id of systemIds) {
      const mapping = DEFAULT_PAD_MAPPINGS[id];
      expect(mapping.DpadUp, `${id} DpadUp`).toBeDefined();
      expect(mapping.DpadDown, `${id} DpadDown`).toBeDefined();
      expect(mapping.DpadLeft, `${id} DpadLeft`).toBeDefined();
      expect(mapping.DpadRight, `${id} DpadRight`).toBeDefined();
      for (const direction of [mapping.DpadUp, mapping.DpadDown, mapping.DpadLeft, mapping.DpadRight])
        expect(movementIds.has(direction as number), `${id}`).toBe(true);
    }
  });
});

describe("buildDefaultControllers", () => {
  test("maps every console control for player one only", () => {
    const controllers = buildDefaultControllers("snes");
    expect(Object.keys(controllers).sort()).toEqual(["0", "1", "2", "3"]);
    const player = controllers[0] as Record<number, {value: string}>;
    // Retropad ids: B=0, Y=1, Select=2, Start=3, A=8, X=9.
    expect(player[0]?.value).toBe("z");
    expect(player[8]?.value).toBe("x");
    expect(player[2]?.value).toBe("shift");
    expect(player[3]?.value).toBe("enter");
    expect(controllers[1]).toEqual({});
  });

  test("includes directional controls bound to arrows", () => {
    const player = buildDefaultControllers("nes")[0] as Record<number, {value: string}>;
    expect(player[4]?.value).toBe("up arrow");
    expect(player[7]?.value).toBe("right arrow");
  });
});

describe("pad mapping persistence", () => {
  test("load returns an empty object without stored data", () => {
    localStorage.removeItem("afterleaf:arcade:pad-mappings:v1");
    expect(loadPadMappingOverrides()).toEqual({});
  });

  test("save + load round-trips and drops invalid entries", () => {
    savePadMappingOverrides({nes: {A: 0}, bogus: {A: 0}} as never);
    const loaded = loadPadMappingOverrides() as Record<string, Partial<Record<GamepadButtonName, number>> | undefined>;
    expect(loaded.nes?.A).toBe(0);
    expect(loaded.bogus).toBeUndefined();
    localStorage.removeItem("afterleaf:arcade:pad-mappings:v1");
  });

  test("rejects overrides pointing at unknown control ids", () => {
    savePadMappingOverrides({nes: {A: 999}});
    expect(loadPadMappingOverrides().nes).toBeUndefined();
    localStorage.removeItem("afterleaf:arcade:pad-mappings:v1");
  });
});

describe("resolvePadMapping", () => {
  test("merges overrides over defaults", () => {
    const resolved = resolvePadMapping("nes", {nes: {A: 8}});
    expect(resolved.A).toBe(8); // Overridden to NES A.
    expect(resolved.Start).toBe(3); // Default preserved.
    expect(resolvePadMapping("snes", {}).A).toBe(0); // Defaults untouched.
  });
});

describe("resetPadMapping", () => {
  test("removes only the requested system", () => {
    const remaining = resetPadMapping({nes: {A: 8}, snes: {A: 0}}, "nes");
    expect(remaining.nes).toBeUndefined();
    expect(remaining.snes?.A).toBe(0);
  });
});

describe("padForwardEvent", () => {
  test("resolves the mapped control's synthetic key event", () => {
    const event = padForwardEvent("snes", "A", {});
    expect(event?.keyCode).toBe(90); // SNES B (primary action).
    expect(event?.repeat).toBe(false);
  });

  test("returns undefined for unmapped buttons", () => {
    expect(padForwardEvent("nes", "L3", {})).toBeUndefined();
  });

  test("follows user overrides", () => {
    const event = padForwardEvent("nes", "A", {nes: {A: 8}});
    expect(event?.keyCode).toBe(88); // NES A after override.
  });
});

describe("forwardedKeyEventForBinding", () => {
  test("flags shift bindings so modifiers stay consistent", () => {
    const control = SYSTEM_CONTROLLER_CONTROLS.snes.find((item) => item.id === 2);
    if (!control) throw new Error("missing snes select control");
    const event = forwardedKeyEventForBinding(control.keyboard);
    expect(event.shiftKey).toBe(true);
    expect(event.keyCode).toBe(16);
  });
});

describe("formatArcadeKeyBinding", () => {
  test("formats letters, modifiers, and arrows readably", () => {
    const b = SYSTEM_CONTROLLER_CONTROLS.nes.find((item) => item.id === 0);
    if (!b) throw new Error("missing nes B control");
    expect(formatArcadeKeyBinding(b.keyboard)).toBe("Z");
    expect(formatArcadeKeyBinding(b.keyboard)).not.toBe("");
  });
});
