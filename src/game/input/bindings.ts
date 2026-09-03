/**
 * Action-oriented input bindings shared by every input device.
 *
 * An action is a semantic game verb ("interact", "jump", ...). Devices are
 * just dimensions of a binding: a keyboard binding stores a physical
 * `KeyboardEvent.code`, a gamepad binding stores a standard-mapping button
 * name. Nothing in the game may branch on raw device codes; everything goes
 * through actions so remapping stays trivial and the gamepad behaves as "just
 * another keyboard".
 */

export type ShortcutAction =
  // Movement / physics (held-state queries; no edge dispatch needed)
  | "moveForward"
  | "moveBackward"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "sprint"
  // Movement toggles
  | "crouch"
  // Core interactions
  | "interact"
  | "throw"
  | "drop"
  | "pickUpCancel"
  | "propPinToggle"
  | "toggleShelfPresentation"
  | "toggleMenu"
  // Placement toggles
  | "toggleModelPlacement"
  | "toggleArtFramePlacement"
  | "togglePosterPlacement"
  | "channelEditorOpen"
  // Book inspection
  | "inspectionTurnLeft"
  | "inspectionTurnRight"
  | "inspectionThrow"
  | "inspectionDrop"
  | "inspectionReturn"
  // Television (targeted)
  | "tvPreviousChannel"
  | "tvMute"
  // Art frames (targeted)
  | "artFramePreviousChannel"
  | "artFrameNextChannel"
  | "artFrameInterval"
  | "artFrameFit"
  // Targeted media programs (TV videos and art-frame images)
  | "prevMedia"
  | "nextMedia"
  // Posters / props / frames removal (whatever is targeted)
  | "removeTargeted"
  // Placement mode
  | "placementCycleLeft"
  | "placementCycleRight"
  | "placementCycleImageLeft"
  | "placementCycleImageRight"
  | "placementCycleChannelLeft"
  | "placementCycleChannelRight"
  | "placementToggleFit"
  | "placementToggleInterval"
  | "placementToggleGridSnap"
  // Props
  | "propToggleSnap"
  | "propCycleAnimationLeft"
  | "propCycleAnimationRight";

export type InputDevice = "keyboard" | "gamepad";

/**
 * Standard Gamepad API mapping button names. Stored as strings (not indices)
 * in persisted configs so exotic pads and future spec changes stay readable.
 */
export type GamepadButtonName =
  | "A"
  | "B"
  | "X"
  | "Y"
  | "LB"
  | "RB"
  | "L2"
  | "R2"
  | "Back"
  | "Start"
  | "L3"
  | "R3"
  | "DpadUp"
  | "DpadDown"
  | "DpadLeft"
  | "DpadRight";

/** W3C standard gamepad mapping button order. */
export const GAMEPAD_BUTTON_NAMES: readonly GamepadButtonName[] = [
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
];

const GAMEPAD_BUTTON_INDEX: Record<GamepadButtonName, number> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  L2: 6,
  R2: 7,
  Back: 8,
  Start: 9,
  L3: 10,
  R3: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
};

export const gamepadButtonIndex = (name: GamepadButtonName): number => GAMEPAD_BUTTON_INDEX[name];

/** Physical controller families with distinct button iconography. */
export type GamepadStyle = "xbox" | "playstation";

/** Detects a controller family from the Gamepad API id string. */
export const detectGamepadStyle = (id: string): GamepadStyle =>
  /dualsense|dualshock|wireless controller|playstation|\bps[345]\b/i.test(id) ? "playstation" : "xbox";

type GamepadButtonPresentation = {label: string; icon: string};

/** Per-style display labels and prompt icon stems for every button. */
export const GAMEPAD_BUTTON_PRESENTATION: Record<GamepadStyle, Record<GamepadButtonName, GamepadButtonPresentation>> = {
  xbox: {
    A: {label: "A", icon: "xbox-a"},
    B: {label: "B", icon: "xbox-b"},
    X: {label: "X", icon: "xbox-x"},
    Y: {label: "Y", icon: "xbox-y"},
    LB: {label: "LB", icon: "xbox-lb"},
    RB: {label: "RB", icon: "xbox-rb"},
    L2: {label: "LT", icon: "xbox-lt"},
    R2: {label: "RT", icon: "xbox-rt"},
    Back: {label: "View", icon: "xbox-view"},
    Start: {label: "Menu", icon: "xbox-menu"},
    L3: {label: "LS", icon: "xbox-l3"},
    R3: {label: "RS", icon: "xbox-r3"},
    DpadUp: {label: "D-Up", icon: "xbox-dpad-up"},
    DpadDown: {label: "D-Down", icon: "xbox-dpad-down"},
    DpadLeft: {label: "D-Left", icon: "xbox-dpad-left"},
    DpadRight: {label: "D-Right", icon: "xbox-dpad-right"},
  },
  playstation: {
    A: {label: "Cross", icon: "playstation-cross"},
    B: {label: "Circle", icon: "playstation-circle"},
    X: {label: "Square", icon: "playstation-square"},
    Y: {label: "Triangle", icon: "playstation-triangle"},
    LB: {label: "L1", icon: "playstation-l1"},
    RB: {label: "R1", icon: "playstation-r1"},
    L2: {label: "L2", icon: "playstation-l2"},
    R2: {label: "R2", icon: "playstation-r2"},
    Back: {label: "Share", icon: "playstation-share"},
    Start: {label: "Options", icon: "playstation-options"},
    L3: {label: "L3", icon: "playstation-l3"},
    R3: {label: "R3", icon: "playstation-r3"},
    DpadUp: {label: "D-Up", icon: "playstation-dpad-up"},
    DpadDown: {label: "D-Down", icon: "playstation-dpad-down"},
    DpadLeft: {label: "D-Left", icon: "playstation-dpad-left"},
    DpadRight: {label: "D-Right", icon: "playstation-dpad-right"},
  },
};

export const formatGamepadButton = (code: string, style: GamepadStyle = "xbox"): string =>
  GAMEPAD_BUTTON_PRESENTATION[style][code as GamepadButtonName]?.label ?? `Btn ${code}`;

/** Prompt icon stem under /images/input-prompts/ for a standard-mapping button. */
export const gamepadButtonIcon = (code: string, style: GamepadStyle): string | undefined =>
  GAMEPAD_BUTTON_PRESENTATION[style][code as GamepadButtonName]?.icon;

export type ShortcutBinding = {device: "keyboard"; code: string} | {device: "gamepad"; code: GamepadButtonName};

export type ShortcutsConfig = Record<ShortcutAction, ShortcutBinding[]>;

/**
 * Global dispatch precedence. When one physical input is bound to several
 * actions (Q is cycle-left, TV-previous-channel, shelf presentation, ...),
 * candidates are tried in this order and the first context that consumes the
 * press wins - mirroring the original hardcoded handler chain exactly.
 */
export const ACTION_DISPATCH_ORDER: readonly ShortcutAction[] = [
  // Book inspection owns its keys entirely while a spread is open.
  "inspectionTurnLeft",
  "inspectionTurnRight",
  "inspectionThrow",
  "inspectionDrop",
  "inspectionReturn",
  "jump",
  "crouch",
  // Placement-mode actions must beat core carry actions sharing a button.
  "toggleModelPlacement",
  "toggleArtFramePlacement",
  "channelEditorOpen",
  "togglePosterPlacement",
  "placementCycleLeft",
  "placementCycleRight",
  "placementCycleChannelLeft",
  "placementCycleChannelRight",
  "placementCycleImageLeft",
  "placementCycleImageRight",
  "placementToggleFit",
  "placementToggleInterval",
  "placementToggleGridSnap",
  "propToggleSnap",
  "propCycleAnimationLeft",
  "propCycleAnimationRight",
  "removeTargeted",
  "pickUpCancel",
  // Targeted-device actions before generic ones.
  "artFramePreviousChannel",
  "artFrameNextChannel",
  "artFrameInterval",
  "artFrameFit",
  "tvPreviousChannel",
  "tvMute",
  "prevMedia",
  "nextMedia",
  "toggleShelfPresentation",
  "propPinToggle",
  "interact",
  "throw",
  "drop",
];

const ACTION_ORDER_INDEX: Partial<Record<ShortcutAction, number>> = {};
for (const [index, action] of ACTION_DISPATCH_ORDER.entries()) ACTION_ORDER_INDEX[action] = index;

/** Lower sorts earlier. Unlisted actions sort last, stable. */
export const actionDispatchPriority = (action: ShortcutAction): number =>
  ACTION_ORDER_INDEX[action] ?? Number.MAX_SAFE_INTEGER;

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  moveForward: "Move forward",
  moveBackward: "Move backward",
  moveLeft: "Move left",
  moveRight: "Move right",
  jump: "Jump",
  crouch: "Crouch",
  sprint: "Sprint",
  interact: "Interact / use",
  throw: "Throw / charge",
  drop: "Drop / remove",
  pickUpCancel: "Pick up / cancel",
  propPinToggle: "Pin / release prop",
  toggleShelfPresentation: "Toggle shelf presentation",
  toggleMenu: "Open menu",
  toggleModelPlacement: "Toggle model placement",
  toggleArtFramePlacement: "Toggle art frame placement",
  togglePosterPlacement: "Toggle poster placement",
  channelEditorOpen: "Open channel editor",
  inspectionTurnLeft: "Inspection: turn page left",
  inspectionTurnRight: "Inspection: turn page right",
  inspectionThrow: "Inspection: throw book",
  inspectionDrop: "Inspection: drop book",
  inspectionReturn: "Inspection: return book",
  tvPreviousChannel: "TV: previous channel",
  tvMute: "TV: mute",
  artFramePreviousChannel: "Art frame: previous channel",
  artFrameNextChannel: "Art frame: next channel",
  prevMedia: "Previous video / image",
  nextMedia: "Next video / image",
  artFrameInterval: "Art frame: interval",
  artFrameFit: "Art frame: fit",
  removeTargeted: "Remove targeted item",
  placementCycleLeft: "Placement: cycle previous",
  placementCycleRight: "Placement: cycle next",
  placementCycleImageLeft: "Placement: previous image",
  placementCycleImageRight: "Placement: next image",
  placementCycleChannelLeft: "Placement: previous channel",
  placementCycleChannelRight: "Placement: next channel",
  placementToggleFit: "Placement: toggle fit",
  placementToggleInterval: "Placement: toggle interval",
  placementToggleGridSnap: "Placement: toggle grid snap",
  propToggleSnap: "Prop: toggle snap",
  propCycleAnimationLeft: "Prop: previous animation",
  propCycleAnimationRight: "Prop: next animation",
};

export const SHORTCUT_CATEGORIES: Record<string, {label: string; actions: ShortcutAction[]}> = {
  movement: {
    label: "Movement",
    actions: ["moveForward", "moveBackward", "moveLeft", "moveRight", "jump", "crouch", "sprint"],
  },
  core: {
    label: "Core",
    actions: ["interact", "throw", "drop", "pickUpCancel", "propPinToggle", "toggleShelfPresentation", "toggleMenu"],
  },
  placementToggle: {
    label: "Placement toggles",
    actions: ["toggleModelPlacement", "toggleArtFramePlacement", "togglePosterPlacement", "channelEditorOpen"],
  },
  inspection: {
    label: "Book inspection",
    actions: ["inspectionTurnLeft", "inspectionTurnRight", "inspectionThrow", "inspectionDrop", "inspectionReturn"],
  },
  tv: {
    label: "Television",
    actions: ["tvPreviousChannel", "tvMute"],
  },
  artFrame: {
    label: "Digital art frames",
    actions: ["artFramePreviousChannel", "artFrameNextChannel", "artFrameInterval", "artFrameFit"],
  },
  media: {
    label: "Media",
    actions: ["prevMedia", "nextMedia"],
  },
  remove: {
    label: "Removal",
    actions: ["removeTargeted"],
  },
  placement: {
    label: "Placement mode",
    actions: [
      "placementCycleLeft",
      "placementCycleRight",
      "placementCycleChannelLeft",
      "placementCycleChannelRight",
      "placementCycleImageLeft",
      "placementCycleImageRight",
      "placementToggleFit",
      "placementToggleInterval",
      "placementToggleGridSnap",
    ],
  },
  prop: {
    label: "Props",
    actions: ["propToggleSnap", "propCycleAnimationLeft", "propCycleAnimationRight"],
  },
};

const keyboard = (code: string): ShortcutBinding => ({
  device: "keyboard",
  code,
});
const gamepad = (code: GamepadButtonName): ShortcutBinding => ({
  device: "gamepad",
  code,
});

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  moveForward: [keyboard("KeyW")],
  moveBackward: [keyboard("KeyS")],
  moveLeft: [keyboard("KeyA")],
  moveRight: [keyboard("KeyD")],
  jump: [keyboard("Space"), gamepad("L2")],
  crouch: [keyboard("KeyC")],
  sprint: [keyboard("ShiftLeft"), keyboard("ShiftRight"), gamepad("L3")],
  interact: [keyboard("KeyE"), gamepad("A")],
  throw: [keyboard("KeyF"), gamepad("X")],
  drop: [keyboard("KeyG"), gamepad("Y")],
  pickUpCancel: [keyboard("KeyT"), gamepad("B")],
  propPinToggle: [keyboard("KeyL"), gamepad("R3")],
  toggleShelfPresentation: [keyboard("KeyQ"), gamepad("Back")],
  toggleMenu: [gamepad("Start")],
  toggleModelPlacement: [keyboard("KeyM")],
  toggleArtFramePlacement: [keyboard("KeyV")],
  togglePosterPlacement: [keyboard("KeyP")],
  channelEditorOpen: [keyboard("KeyN")],
  inspectionTurnLeft: [keyboard("KeyA"), gamepad("DpadLeft")],
  inspectionTurnRight: [keyboard("KeyD"), gamepad("DpadRight")],
  inspectionThrow: [keyboard("KeyF"), gamepad("X")],
  inspectionDrop: [keyboard("KeyG"), gamepad("Y")],
  inspectionReturn: [keyboard("KeyR"), gamepad("B")],
  tvPreviousChannel: [keyboard("KeyQ"), gamepad("LB")],
  tvMute: [keyboard("KeyM")],
  artFramePreviousChannel: [keyboard("KeyQ"), gamepad("LB")],
  artFrameNextChannel: [keyboard("KeyE"), gamepad("RB")],
  artFrameInterval: [keyboard("KeyI"), gamepad("Back")],
  artFrameFit: [keyboard("KeyR"), gamepad("Y")],
  prevMedia: [keyboard("KeyF"), gamepad("X")],
  nextMedia: [keyboard("KeyG"), gamepad("Y")],
  removeTargeted: [keyboard("Delete"), keyboard("Backspace"), gamepad("RB")],
  placementCycleLeft: [keyboard("KeyQ"), gamepad("LB")],
  placementCycleRight: [keyboard("KeyE"), gamepad("RB")],
  placementCycleImageLeft: [keyboard("KeyF"), gamepad("LB")],
  placementCycleImageRight: [keyboard("KeyG"), gamepad("RB")],
  placementCycleChannelLeft: [keyboard("KeyQ"), gamepad("LB")],
  placementCycleChannelRight: [keyboard("KeyE"), gamepad("RB")],
  placementToggleFit: [keyboard("KeyR"), gamepad("Y")],
  placementToggleInterval: [keyboard("KeyI"), gamepad("Back")],
  placementToggleGridSnap: [keyboard("KeyX"), gamepad("X")],
  propToggleSnap: [keyboard("KeyQ"), gamepad("X")],
  propCycleAnimationLeft: [keyboard("KeyQ"), gamepad("LB")],
  propCycleAnimationRight: [keyboard("KeyE"), gamepad("RB")],
};

const STORAGE_KEY = "afterleaf:shortcuts:v1";

const GAMEPAD_BUTTON_NAME_SET: ReadonlySet<string> = new Set(GAMEPAD_BUTTON_NAMES);

const isShortcutBinding = (value: unknown): value is ShortcutBinding => {
  if (typeof value !== "object" || value === null) return false;
  const binding = value as {code?: unknown; device?: unknown};
  if (typeof binding.code !== "string") return false;
  return binding.device === "gamepad" ? GAMEPAD_BUTTON_NAME_SET.has(binding.code) : binding.device === "keyboard";
};

const isShortcutsConfig = (value: unknown): value is Partial<ShortcutsConfig> => {
  if (typeof value !== "object" || value === null) return false;
  for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
    const bindings = (value as Record<string, unknown>)[action];
    if (bindings === undefined) continue;
    if (!Array.isArray(bindings)) return false;
    if (bindings.some((binding) => !isShortcutBinding(binding))) return false;
  }
  return true;
};

export const loadShortcuts = (): ShortcutsConfig => {
  if (typeof localStorage === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!isShortcutsConfig(parsed)) return DEFAULT_SHORTCUTS;
    const merged: ShortcutsConfig = {...DEFAULT_SHORTCUTS};
    for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
      const bindings = parsed[action];
      if (bindings && bindings.length > 0) merged[action] = bindings;
    }
    return merged;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
};

export const saveShortcuts = (config: ShortcutsConfig): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
};

const KEYBOARD_CODE_LABELS: Readonly<Record<string, string>> = {
  AltLeft: "Alt",
  AltRight: "Alt",
  Backspace: "Back",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  Delete: "Del",
  Escape: "Esc",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  Space: "Space",
};

export const formatKeyboardCode = (code: string): string => {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return KEYBOARD_CODE_LABELS[code] ?? code;
};

export const formatBinding = (binding: ShortcutBinding, style: GamepadStyle = "xbox"): string =>
  binding.device === "keyboard" ? formatKeyboardCode(binding.code) : formatGamepadButton(binding.code, style);
