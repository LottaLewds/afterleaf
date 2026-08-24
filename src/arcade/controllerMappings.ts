import type {ForwardedKeyEvent} from "~/arcade/emulatorHost";
import type {ArcadeSystemId, ArcadeSystem} from "~/arcade/systems";
import {ARCADE_SYSTEMS} from "~/arcade/systems";
import type {GamepadButtonName} from "~/game/input/bindings";

/**
 * Per-system controller mappings for the arcade cabinet's emulators.
 *
 * Every emulated console exposes a set of console controls ("B", "C-Up",
 * "Insert Coin", ...). Each control carries:
 *
 * - a default keyboard binding, exported to EmulatorJS through
 *   `defaultControllers` so physical keys and the synthetic key events
 *   forwarded by the shop both resolve to the right retropad button, and
 * - an optional default binding from a standard-mapping (Xbox-layout)
 *   gamepad button, which the raw gamepad forward path resolves back into
 *   that control's synthetic key event.
 *
 * Users remap the gamepad side per system from Shortcuts; overrides persist
 * in their own versioned storage entry and merge over these defaults.
 */

/** One default keyboard binding for a console control. */
export type ArcadeKeyBinding = {
  /**
   * EmulatorJS keyMap name stored in `defaultControllers` (e.g. "x",
   * "up arrow"); EmulatorJS converts these to legacy key codes on boot.
   */
  value: string;
  /** Synthetic KeyboardEvent fields for the gamepad forwarding path. */
  eventKey: string;
  code: string;
  keyCode: number;
};

/** Diagram placement for a console control on its system's pad drawing. */
export type ControlDiagramPlacement =
  | {shape: "dpad"; x: number; y: number}
  | {shape: "stick"; x: number; y: number}
  | {shape: "face"; x: number; y: number; r?: number}
  | {shape: "pill"; x: number; y: number; w: number}
  | {shape: "rect"; x: number; y: number; w: number; h: number};

export type ArcadeConsoleControl = {
  /** EmulatorJS retropad input id (simulateInput button index). */
  id: number;
  /** Console-facing label used in mapping rows ("A", "C-Up", "Insert Coin"). */
  label: string;
  /** Compact label rendered inside the diagram shape. */
  shortLabel?: string | undefined;
  keyboard: ArcadeKeyBinding;
  diagram?: ControlDiagramPlacement;
};

const key = (
  value: string,
  eventKey: string,
  code: string,
  keyCode: number,
): ArcadeKeyBinding => ({value, eventKey, code, keyCode});

const z = (): ArcadeKeyBinding => key("z", "Z", "KeyZ", 90);
const x = (): ArcadeKeyBinding => key("x", "X", "KeyX", 88);
const c = (): ArcadeKeyBinding => key("c", "C", "KeyC", 67);
const v = (): ArcadeKeyBinding => key("v", "V", "KeyV", 86);
const a = (): ArcadeKeyBinding => key("a", "A", "KeyA", 65);
const s = (): ArcadeKeyBinding => key("s", "S", "KeyS", 83);
const d = (): ArcadeKeyBinding => key("d", "D", "KeyD", 68);
const q = (): ArcadeKeyBinding => key("q", "Q", "KeyQ", 81);
const w = (): ArcadeKeyBinding => key("w", "W", "KeyW", 87);
const e = (): ArcadeKeyBinding => key("e", "E", "KeyE", 69);
const i = () => key("i", "I", "KeyI", 73);
const j = () => key("j", "J", "KeyJ", 74);
const k = () => key("k", "K", "KeyK", 75);
const l = () => key("l", "L", "KeyL", 76);

const shift = (): ArcadeKeyBinding => key("shift", "Shift", "ShiftRight", 16);
const enter = (): ArcadeKeyBinding => key("enter", "Enter", "Enter", 13);

// Arrow bindings reuse the synthetic-event shape of the existing forwarding
// path (legacy `key` values) so behavior stays byte-identical.
const dpadUp = (): ArcadeKeyBinding => key("up arrow", "Up", "ArrowUp", 38);
const dpadDown = (): ArcadeKeyBinding =>
  key("down arrow", "Down", "ArrowDown", 40);
const dpadLeft = (): ArcadeKeyBinding =>
  key("left arrow", "Left", "ArrowLeft", 37);
const dpadRight = (): ArcadeKeyBinding =>
  key("right arrow", "Right", "ArrowRight", 39);

type DirectionalControls = readonly [
  ArcadeConsoleControl,
  ArcadeConsoleControl,
  ArcadeConsoleControl,
  ArcadeConsoleControl,
];

type DirectionSpec = {
  id: number;
  label: string;
  keyboard: ArcadeKeyBinding;
};

/**
 * Builds four direction controls (up, down, left, right) that share one
 * diagram anchor of the given shape.
 */
const directionsAt = (
  specs: readonly DirectionSpec[],
  shape: "dpad" | "stick",
  x: number,
  y: number,
): DirectionalControls => {
  const [up, down, left, right] = specs;
  if (!up || !down || !left || !right)
    throw new Error("Direction controls need exactly four entries.");
  return [
    {...up, diagram: {shape, x, y}},
    {...down, diagram: {shape, x, y}},
    {...left, diagram: {shape, x, y}},
    {...right, diagram: {shape, x, y}},
  ];
};

/** Four d-pad controls sharing one diagram anchor (up, down, left, right). */
const dpadAt = (x: number, y: number): DirectionalControls =>
  directionsAt(
    [
      {id: 4, label: "D-pad Up", keyboard: dpadUp()},
      {id: 5, label: "D-pad Down", keyboard: dpadDown()},
      {id: 6, label: "D-pad Left", keyboard: dpadLeft()},
      {id: 7, label: "D-pad Right", keyboard: dpadRight()},
    ],
    "dpad",
    x,
    y,
  );

/** Analog-stick controls sharing one diagram anchor (up, down, left, right). */
const stickAt = (x: number, y: number): DirectionalControls =>
  directionsAt(
    [
      {id: 19, label: "Stick Up", keyboard: dpadUp()},
      {id: 18, label: "Stick Down", keyboard: dpadDown()},
      {id: 17, label: "Stick Left", keyboard: dpadLeft()},
      {id: 16, label: "Stick Right", keyboard: dpadRight()},
    ],
    "stick",
    x,
    y,
  );

const face = (
  id: number,
  label: string,
  keyboard: ArcadeKeyBinding,
  placement: ControlDiagramPlacement,
  shortLabel?: string,
): ArcadeConsoleControl => ({
  id,
  label,
  shortLabel,
  keyboard,
  diagram: placement,
});

const pill = face;

/** Control listed in the mapping rows but not drawn on the pad. */
const offPad = (
  id: number,
  label: string,
  keyboard: ArcadeKeyBinding,
): ArcadeConsoleControl => ({id, label, keyboard});

/**
 * Console controls for every supported system, ordered top-to-bottom as the
 * mapping UI lists them. Ids follow each core's libretro/EmulatorJS scheme.
 */
export const SYSTEM_CONTROLLER_CONTROLS: Record<
  ArcadeSystemId,
  readonly ArcadeConsoleControl[]
> = {
  nes: [
    face(8, "A", x(), {shape: "face", x: 246, y: 116}),
    face(0, "B", z(), {shape: "face", x: 208, y: 100}),
    pill(2, "Select", shift(), {shape: "pill", x: 148, y: 152, w: 40}, "Sel"),
    pill(3, "Start", enter(), {shape: "pill", x: 192, y: 152, w: 40}),
    ...dpadAt(96, 104),
  ],
  snes: [
    face(8, "A", x(), {shape: "face", x: 262, y: 88}),
    face(0, "B", z(), {shape: "face", x: 236, y: 114}),
    face(9, "X", s(), {shape: "face", x: 236, y: 62}),
    face(1, "Y", a(), {shape: "face", x: 210, y: 88}),
    pill(10, "L", q(), {shape: "rect", x: 62, y: 38, w: 52, h: 14}),
    pill(11, "R", w(), {shape: "rect", x: 226, y: 38, w: 52, h: 14}),
    pill(2, "Select", shift(), {shape: "pill", x: 140, y: 154, w: 42}, "Sel"),
    pill(3, "Start", enter(), {shape: "pill", x: 186, y: 154, w: 42}),
    ...dpadAt(94, 106),
  ],
  arcade: [
    face(0, "Button 1", z(), {shape: "face", x: 232, y: 122}, "1"),
    face(8, "Button 2", x(), {shape: "face", x: 262, y: 98}, "2"),
    face(1, "Button 3", c(), {shape: "face", x: 292, y: 122}, "3"),
    pill(
      2,
      "Coin / Credit",
      shift(),
      {shape: "pill", x: 146, y: 154, w: 46},
      "Coin",
    ),
    pill(3, "Start", enter(), {shape: "pill", x: 196, y: 154, w: 42}),
    // Extra MAME action buttons stay reachable from the keyboard; 5 and 6
    // are listed without a diagram placement to keep the panel drawn clean.
    face(9, "Button 4", v(), {shape: "face", x: 322, y: 98}, "4"),
    offPad(10, "Button 5", q()),
    offPad(11, "Button 6", w()),
    ...stickAt(102, 108),
  ],
  gb: [
    face(8, "A", x(), {shape: "face", x: 250, y: 100}),
    face(0, "B", z(), {shape: "face", x: 214, y: 118}),
    pill(2, "Select", shift(), {shape: "pill", x: 126, y: 154, w: 42}, "Sel"),
    pill(3, "Start", enter(), {shape: "pill", x: 172, y: 154, w: 42}),
    ...dpadAt(98, 108),
  ],
  gba: [
    face(8, "A", x(), {shape: "face", x: 250, y: 100}),
    face(0, "B", z(), {shape: "face", x: 214, y: 118}),
    pill(10, "L", q(), {shape: "rect", x: 58, y: 38, w: 50, h: 14}),
    pill(11, "R", w(), {shape: "rect", x: 232, y: 38, w: 50, h: 14}),
    pill(2, "Select", shift(), {shape: "pill", x: 126, y: 154, w: 42}, "Sel"),
    pill(3, "Start", enter(), {shape: "pill", x: 172, y: 154, w: 42}),
    ...dpadAt(98, 108),
  ],
  n64: [
    face(0, "A", x(), {shape: "face", x: 206, y: 112, r: 14}),
    face(1, "B", z(), {shape: "face", x: 238, y: 84}),
    pill(12, "Z", w(), {shape: "rect", x: 150, y: 38, w: 44, h: 13}),
    pill(10, "L", q(), {shape: "rect", x: 66, y: 38, w: 48, h: 14}),
    pill(11, "R", e(), {shape: "rect", x: 228, y: 38, w: 48, h: 14}),
    face(23, "C-Up", i(), {shape: "face", x: 292, y: 64, r: 9}),
    face(21, "C-Left", j(), {shape: "face", x: 266, y: 90, r: 9}),
    face(22, "C-Down", k(), {shape: "face", x: 292, y: 116, r: 9}),
    face(20, "C-Right", l(), {shape: "face", x: 318, y: 90, r: 9}),
    pill(3, "Start", enter(), {shape: "pill", x: 162, y: 150, w: 36}, "St"),
    ...stickAt(104, 92),
    ...dpadAt(104, 146),
  ],
  vb: [
    face(8, "A", x(), {shape: "face", x: 218, y: 114}),
    face(0, "B", z(), {shape: "face", x: 188, y: 92}),
    pill(10, "L", q(), {shape: "rect", x: 56, y: 38, w: 48, h: 14}),
    pill(11, "R", w(), {shape: "rect", x: 236, y: 38, w: 48, h: 14}),
    pill(2, "Select", shift(), {shape: "pill", x: 128, y: 156, w: 42}, "Sel"),
    pill(3, "Start", enter(), {shape: "pill", x: 174, y: 156, w: 42}),
    // Left d-pad on the pad's own d-pad; the right d-pad stays
    // keyboard-only (I/J/K/L) since most pads have no second stick.
    ...dpadAt(90, 104),
    face(19, "Right D-pad Up", i(), {shape: "face", x: 284, y: 78, r: 9}),
    face(18, "Right D-pad Down", k(), {shape: "face", x: 284, y: 130, r: 9}),
    face(17, "Right D-pad Left", j(), {shape: "face", x: 258, y: 104, r: 9}),
    face(16, "Right D-pad Right", l(), {shape: "face", x: 310, y: 104, r: 9}),
  ],
  segaMS: [
    face(0, "Button 1", z(), {shape: "face", x: 216, y: 106}),
    face(8, "Button 2", x(), {shape: "face", x: 256, y: 106}),
    pill(
      3,
      "Start / Pause",
      enter(),
      {shape: "pill", x: 172, y: 152, w: 52},
      "St",
    ),
    ...dpadAt(96, 106),
  ],
  segaMD: [
    face(0, "B", x(), {shape: "face", x: 236, y: 118}),
    face(8, "C", c(), {shape: "face", x: 272, y: 118}),
    face(1, "A", z(), {shape: "face", x: 200, y: 118}),
    face(9, "Y", s(), {shape: "face", x: 236, y: 82}),
    face(11, "Z", d(), {shape: "face", x: 272, y: 82}),
    face(10, "X", a(), {shape: "face", x: 200, y: 82}),
    pill(3, "Start", enter(), {shape: "pill", x: 178, y: 154, w: 44}),
    pill(2, "Mode", shift(), {shape: "pill", x: 132, y: 154, w: 40}),
    ...dpadAt(92, 108),
  ],
  segaGG: [
    face(0, "Button 1", z(), {shape: "face", x: 234, y: 100}),
    face(8, "Button 2", x(), {shape: "face", x: 262, y: 124}),
    pill(3, "Start", enter(), {shape: "pill", x: 170, y: 154, w: 42}),
    ...dpadAt(98, 110),
  ],
  pce: [
    face(8, "I", x(), {shape: "face", x: 254, y: 106}),
    face(0, "II", z(), {shape: "face", x: 216, y: 106}),
    pill(2, "Select", shift(), {shape: "pill", x: 138, y: 152, w: 44}, "Sel"),
    pill(3, "Run", enter(), {shape: "pill", x: 186, y: 152, w: 40}),
    ...dpadAt(96, 106),
  ],
  atari2600: [
    face(0, "Fire", x(), {shape: "face", x: 246, y: 108, r: 17}, ""),
    pill(
      2,
      "Game Select",
      shift(),
      {shape: "pill", x: 142, y: 156, w: 54},
      "Sel",
    ),
    pill(
      3,
      "Game Reset",
      enter(),
      {shape: "pill", x: 200, y: 156, w: 54},
      "Rst",
    ),
    ...stickAt(110, 108),
  ],
};

/**
 * Default standard-gamepad (Xbox layout) bindings per system: physical pad
 * button -> console control id. Face buttons follow positional convention -
 * south is the primary action, east secondary, west/north fill in the rest.
 */
export const DEFAULT_PAD_MAPPINGS: Record<
  ArcadeSystemId,
  Readonly<Partial<Record<GamepadButtonName, number>>>
> = {
  nes: {A: 0, B: 8, Back: 2, Start: 3},
  snes: {
    A: 0,
    B: 8,
    X: 1,
    Y: 9,
    LB: 10,
    RB: 11,
    Back: 2,
    Start: 3,
  },
  arcade: {A: 0, B: 8, X: 1, Y: 9, LB: 10, RB: 11, Back: 2, Start: 3},
  gb: {A: 0, B: 8, Back: 2, Start: 3},
  gba: {A: 0, B: 8, LB: 10, RB: 11, Back: 2, Start: 3},
  n64: {
    A: 0,
    B: 1,
    X: 21,
    Y: 23,
    LB: 10,
    RB: 11,
    L2: 12,
    R2: 20,
    Back: 22,
    Start: 3,
    // No analog support through the synthetic-key bridge yet: the pad's
    // d-pad drives the N64 stick so every game stays fully playable.
    DpadUp: 19,
    DpadDown: 18,
    DpadLeft: 17,
    DpadRight: 16,
  },
  vb: {A: 0, B: 8, LB: 10, RB: 11, Back: 2, Start: 3},
  segaMS: {A: 0, B: 8, Start: 3},
  segaMD: {
    A: 0,
    B: 8,
    X: 1,
    Y: 9,
    LB: 10,
    RB: 11,
    Back: 2,
    Start: 3,
  },
  segaGG: {A: 0, B: 8, Start: 3},
  pce: {A: 0, B: 8, Back: 2, Start: 3},
  atari2600: {A: 0, Back: 2, Start: 3},
};

// -- Persistence ---------------------------------------------------------------

export type ArcadePadMappingOverrides = Partial<
  Record<ArcadeSystemId, Partial<Record<GamepadButtonName, number>>>
>;

const STORAGE_KEY = "afterleaf:arcade:pad-mappings:v1";

const GAMEPAD_BUTTON_NAME_SET: ReadonlySet<string> = new Set([
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "L2",
  "R2",
  "Back",
  "Start",
  "L3",
  "R3",
  "DpadUp",
  "DpadDown",
  "DpadLeft",
  "DpadRight",
]);

const systemsById = new Map<string, ArcadeSystem>(
  ARCADE_SYSTEMS.map((system) => [system.id, system] as const),
);

const isValidOverrideEntry = (
  systemId: string,
  entry: unknown,
): entry is Partial<Record<GamepadButtonName, number>> => {
  if (typeof entry !== "object" || entry === null) return false;
  if (!systemsById.has(systemId)) return false;
  const controls = SYSTEM_CONTROLLER_CONTROLS[systemId as ArcadeSystemId];
  const validIds = new Set(controls.map((control) => control.id));
  for (const [button, controlId] of Object.entries(entry)) {
    if (!GAMEPAD_BUTTON_NAME_SET.has(button)) return false;
    if (typeof controlId !== "number" || !validIds.has(controlId)) return false;
  }
  return true;
};

export const loadPadMappingOverrides = (): ArcadePadMappingOverrides => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const merged: ArcadePadMappingOverrides = {};
    for (const [systemId, entry] of Object.entries(parsed))
      if (isValidOverrideEntry(systemId, entry))
        merged[systemId as ArcadeSystemId] = entry;
    return merged;
  } catch {
    return {};
  }
};

export const savePadMappingOverrides = (
  overrides: ArcadePadMappingOverrides,
): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage failures; mappings fall back to defaults next boot.
  }
};

/** Merges user overrides over the shipped defaults for one system. */
export const resolvePadMapping = (
  systemId: ArcadeSystemId,
  overrides: ArcadePadMappingOverrides,
): Readonly<Partial<Record<GamepadButtonName, number>>> => ({
  ...DEFAULT_PAD_MAPPINGS[systemId],
  ...overrides[systemId],
});

/** Clears one system's overrides, restoring the shipped defaults. */
export const resetPadMapping = (
  overrides: ArcadePadMappingOverrides,
  systemId: ArcadeSystemId,
): ArcadePadMappingOverrides => {
  const {[systemId]: _removed, ...rest} = overrides;
  void _removed;
  return rest;
};

// -- Runtime helpers -------------------------------------------------------------

/**
 * Builds the EmulatorJS `defaultControllers` config (player 1 only) from a
 * system's console-control table. Gamepad slots (`value2`) stay empty on
 * purpose: real pads are forwarded by the shop itself so parallel sessions
 * cannot cross-talk (see emulatorHost.ts).
 */
export const buildDefaultControllers = (
  systemId: ArcadeSystemId,
): Record<string, unknown> => {
  const player: Record<number, {value: string}> = {};
  for (const control of SYSTEM_CONTROLLER_CONTROLS[systemId])
    player[control.id] = {value: control.keyboard.value};
  return {0: player, 1: {}, 2: {}, 3: {}};
};

const frozenForwardEventCache = new Map<ArcadeKeyBinding, ForwardedKeyEvent>();

/** Converts a console control's keyboard binding into a forwardable event. */
export const forwardedKeyEventForBinding = (
  binding: ArcadeKeyBinding,
): ForwardedKeyEvent => {
  const cached = frozenForwardEventCache.get(binding);
  if (cached) return cached;
  const event: ForwardedKeyEvent = Object.freeze({
    key: binding.eventKey,
    code: binding.code,
    keyCode: binding.keyCode,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: binding.keyCode === 16,
  });
  frozenForwardEventCache.set(binding, event);
  return event;
};

const controlsByIdCache = new Map<
  ArcadeSystemId,
  Map<number, ArcadeConsoleControl>
>();

const controlsById = (
  systemId: ArcadeSystemId,
): Map<number, ArcadeConsoleControl> => {
  let cache = controlsByIdCache.get(systemId);
  if (!cache) {
    cache = new Map(
      SYSTEM_CONTROLLER_CONTROLS[systemId].map((control) => [
        control.id,
        control,
      ]),
    );
    controlsByIdCache.set(systemId, cache);
  }
  return cache;
};

/**
 * Resolves the synthetic key event a pressed standard-gamepad button should
 * forward for a system, or undefined when the button is unmapped.
 */
export const padForwardEvent = (
  systemId: ArcadeSystemId,
  button: GamepadButtonName,
  overrides: ArcadePadMappingOverrides,
): ForwardedKeyEvent | undefined => {
  const controlId = resolvePadMapping(systemId, overrides)[button];
  if (controlId === undefined) return undefined;
  const control = controlsById(systemId).get(controlId);
  if (!control) return undefined;
  return forwardedKeyEventForBinding(control.keyboard);
};

/** Human-readable label for a control's default keyboard binding. */
export const formatArcadeKeyBinding = (binding: ArcadeKeyBinding): string => {
  switch (binding.keyCode) {
    case 13:
      return "Enter";
    case 16:
      return "Shift";
    case 37:
      return "\u2190";
    case 38:
      return "\u2191";
    case 39:
      return "\u2192";
    case 40:
      return "\u2193";
    default:
      return binding.eventKey.toUpperCase();
  }
};
