export type InputDevice = "keyboard" | "gamepad";

export type ShortcutBinding = {
  device: InputDevice;
  code: string;
};

export type ShortcutAction =
  // Movement / physics
  | "moveForward"
  | "moveBackward"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "sprint"
  // Core interactions
  | "interact"
  | "throw"
  | "drop"
  | "pickUpCancel"
  | "toggleShelfPresentation"
  // Menu
  | "toggleMenu"
  // Placement toggles
  | "toggleModelPlacement"
  | "toggleArtFramePlacement"
  | "togglePosterPlacement"
  // Book inspection
  | "inspectionTurnLeft"
  | "inspectionTurnRight"
  | "inspectionThrow"
  | "inspectionDrop"
  | "inspectionReturn"
  // TV
  | "tvPreviousChannel"
  | "tvNextChannel"
  | "tvMute"
  | "tvSkip"
  // Art frames (targeted)
  | "artFramePreviousChannel"
  | "artFrameNextChannel"
  | "artFrameInterval"
  | "artFrameFit"
  | "artFrameRemove"
  // Posters (targeted)
  | "posterRemove"
  // Placement mode (model / art-frame / poster)
  | "placementCancel"
  | "placementCycleLeft"
  | "placementCycleRight"
  | "placementCycleImageLeft"
  | "placementCycleImageRight"
  | "placementToggleFit"
  | "placementToggleInterval"
  | "placementToggleGridSnap"
  // Props
  | "propToggleSnap"
  | "propCycleAnimationLeft"
  | "propCycleAnimationRight"
  // Channel editor
  | "channelEditorOpen";

export type ShortcutsConfig = Record<ShortcutAction, ShortcutBinding[]>;

const STORAGE_KEY = "afterleaf:shortcuts:v1";

export const GAMEPAD_BUTTON_LABELS: Record<string, string> = {
  "0": "A",
  "1": "B",
  "2": "X",
  "3": "Y	",
  "4": "C",
  "5": "Z",
  "6": "L",
  "7": "R",
  "8": "Select",
  "9": "Start",
  "10": "L2",
  "11": "R2",
  "12": "D-pad Up",
  "13": "D-pad Down",
  "14": "D-pad Left",
  "15": "D-pad Right",
};

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  moveForward: [{device: "keyboard", code: "KeyW"}],
  moveBackward: [{device: "keyboard", code: "KeyS"}],
  moveLeft: [{device: "keyboard", code: "KeyA"}],
  moveRight: [{device: "keyboard", code: "KeyD"}],
  jump: [
    {device: "keyboard", code: "Space"},
    {device: "gamepad", code: "2"},
  ],
  sprint: [
    {device: "keyboard", code: "ShiftLeft"},
    {device: "keyboard", code: "ShiftRight"},
    {device: "gamepad", code: "1"},
  ],
  interact: [
    {device: "keyboard", code: "KeyE"},
    {device: "gamepad", code: "0"},
  ],
  throw: [
    {device: "keyboard", code: "KeyF"},
    {device: "gamepad", code: "5"},
  ],
  drop: [
    {device: "keyboard", code: "KeyG"},
    {device: "gamepad", code: "4"},
  ],
  pickUpCancel: [
    {device: "keyboard", code: "KeyT"},
    {device: "gamepad", code: "3"},
  ],
  toggleShelfPresentation: [{device: "keyboard", code: "KeyQ"}],
  toggleMenu: [
    {device: "keyboard", code: "Escape"},
    {device: "gamepad", code: "9"},
  ],
  toggleModelPlacement: [{device: "keyboard", code: "KeyM"}],
  toggleArtFramePlacement: [{device: "keyboard", code: "KeyV"}],
  togglePosterPlacement: [{device: "keyboard", code: "KeyP"}],
  inspectionTurnLeft: [{device: "keyboard", code: "KeyA"}],
  inspectionTurnRight: [{device: "keyboard", code: "KeyD"}],
  inspectionThrow: [{device: "keyboard", code: "KeyF"}],
  inspectionDrop: [{device: "keyboard", code: "KeyG"}],
  inspectionReturn: [{device: "keyboard", code: "KeyR"}],
  tvPreviousChannel: [{device: "keyboard", code: "KeyQ"}],
  tvNextChannel: [{device: "keyboard", code: "KeyE"}],
  tvMute: [{device: "keyboard", code: "KeyM"}],
  tvSkip: [{device: "keyboard", code: "KeyF"}],
  artFramePreviousChannel: [{device: "keyboard", code: "KeyQ"}],
  artFrameNextChannel: [{device: "keyboard", code: "KeyE"}],
  artFrameInterval: [{device: "keyboard", code: "KeyI"}],
  artFrameFit: [{device: "keyboard", code: "KeyR"}],
  artFrameRemove: [
    {device: "keyboard", code: "Delete"},
    {device: "keyboard", code: "Backspace"},
  ],
  posterRemove: [
    {device: "keyboard", code: "Delete"},
    {device: "keyboard", code: "Backspace"},
  ],
  placementCancel: [{device: "keyboard", code: "KeyT"}],
  placementCycleLeft: [{device: "keyboard", code: "KeyQ"}],
  placementCycleRight: [{device: "keyboard", code: "KeyE"}],
  placementCycleImageLeft: [{device: "keyboard", code: "KeyF"}],
  placementCycleImageRight: [{device: "keyboard", code: "KeyG"}],
  placementToggleFit: [{device: "keyboard", code: "KeyR"}],
  placementToggleInterval: [{device: "keyboard", code: "KeyI"}],
  placementToggleGridSnap: [{device: "keyboard", code: "KeyX"}],
  propToggleSnap: [{device: "keyboard", code: "KeyQ"}],
  propCycleAnimationLeft: [{device: "keyboard", code: "KeyQ"}],
  propCycleAnimationRight: [{device: "keyboard", code: "KeyE"}],
  channelEditorOpen: [{device: "keyboard", code: "KeyN"}],
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  moveForward: "Move forward",
  moveBackward: "Move backward",
  moveLeft: "Move left",
  moveRight: "Move right",
  jump: "Jump",
  sprint: "Sprint",
  interact: "Interact / use",
  throw: "Throw / charge / skip",
  drop: "Drop / remove",
  pickUpCancel: "Pick up / cancel",
  toggleShelfPresentation: "Toggle shelf presentation",
  toggleMenu: "Open menu",
  toggleModelPlacement: "Toggle model placement",
  toggleArtFramePlacement: "Toggle art frame placement",
  togglePosterPlacement: "Toggle poster placement",
  inspectionTurnLeft: "Inspection: turn page left",
  inspectionTurnRight: "Inspection: turn page right",
  inspectionThrow: "Inspection: throw book",
  inspectionDrop: "Inspection: drop book",
  inspectionReturn: "Inspection: return book",
  tvPreviousChannel: "TV: previous channel",
  tvNextChannel: "TV: next channel",
  tvMute: "TV: mute",
  tvSkip: "TV: skip",
  artFramePreviousChannel: "Art frame: previous channel",
  artFrameNextChannel: "Art frame: next channel",
  artFrameInterval: "Art frame: interval",
  artFrameFit: "Art frame: fit",
  artFrameRemove: "Art frame: remove",
  posterRemove: "Poster: remove",
  placementCancel: "Placement: cancel",
  placementCycleLeft: "Placement: cycle previous",
  placementCycleRight: "Placement: cycle next",
  placementCycleImageLeft: "Placement: previous image",
  placementCycleImageRight: "Placement: next image",
  placementToggleFit: "Placement: toggle fit",
  placementToggleInterval: "Placement: toggle interval",
  placementToggleGridSnap: "Placement: toggle grid snap",
  propToggleSnap: "Prop: toggle snap",
  propCycleAnimationLeft: "Prop: previous animation",
  propCycleAnimationRight: "Prop: next animation",
  channelEditorOpen: "Open channel editor",
};

export const SHORTCUT_CATEGORIES: Record<
  string,
  {label: string; actions: ShortcutAction[]}
> = {
  movement: {
    label: "Movement",
    actions: [
      "moveForward",
      "moveBackward",
      "moveLeft",
      "moveRight",
      "jump",
      "sprint",
    ],
  },
  core: {
    label: "Core",
    actions: [
      "interact",
      "throw",
      "drop",
      "pickUpCancel",
      "toggleShelfPresentation",
      "toggleMenu",
    ],
  },
  placementToggle: {
    label: "Placement toggles",
    actions: [
      "toggleModelPlacement",
      "toggleArtFramePlacement",
      "togglePosterPlacement",
    ],
  },
  inspection: {
    label: "Book inspection",
    actions: [
      "inspectionTurnLeft",
      "inspectionTurnRight",
      "inspectionThrow",
      "inspectionDrop",
      "inspectionReturn",
    ],
  },
  tv: {
    label: "Television",
    actions: ["tvPreviousChannel", "tvNextChannel", "tvMute", "tvSkip"],
  },
  artFrame: {
    label: "Digital art frames",
    actions: [
      "artFramePreviousChannel",
      "artFrameNextChannel",
      "artFrameInterval",
      "artFrameFit",
      "artFrameRemove",
    ],
  },
  poster: {
    label: "Posters",
    actions: ["posterRemove"],
  },
  placement: {
    label: "Placement mode",
    actions: [
      "placementCancel",
      "placementCycleLeft",
      "placementCycleRight",
      "placementCycleImageLeft",
      "placementCycleImageRight",
      "placementToggleFit",
      "placementToggleInterval",
      "placementToggleGridSnap",
    ],
  },
  prop: {
    label: "Props",
    actions: [
      "propToggleSnap",
      "propCycleAnimationLeft",
      "propCycleAnimationRight",
    ],
  },
  channel: {
    label: "Channels",
    actions: ["channelEditorOpen"],
  },
};

const isShortcutsConfig = (
  value: unknown,
): value is Partial<ShortcutsConfig> => {
  if (typeof value !== "object" || value === null) return false;
  for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
    const bindings = (value as Record<string, unknown>)[action];
    if (bindings === undefined) continue;
    if (!Array.isArray(bindings)) return false;
    for (const binding of bindings) {
      if (
        typeof binding !== "object" ||
        binding === null ||
        (binding.device !== "keyboard" && binding.device !== "gamepad") ||
        typeof binding.code !== "string"
      )
        return false;
    }
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

export const getKeyboardBindings = (
  config: ShortcutsConfig,
  action: ShortcutAction,
): ShortcutBinding[] =>
  config[action].filter((binding) => binding.device === "keyboard");

export const getGamepadBindings = (
  config: ShortcutsConfig,
  action: ShortcutAction,
): ShortcutBinding[] =>
  config[action].filter((binding) => binding.device === "gamepad");

export const matchesKeyboardAction = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  event: Pick<KeyboardEvent, "code">,
): boolean =>
  getKeyboardBindings(config, action).some(
    (binding) => binding.code === event.code,
  );

export const isActionDownKeyboard = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  keysDown: ReadonlySet<string>,
): boolean =>
  getKeyboardBindings(config, action).some((binding) =>
    keysDown.has(binding.code),
  );

export const isActionDownGamepad = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  buttons: ReadonlyArray<boolean | null | undefined>,
): boolean =>
  getGamepadBindings(config, action).some((binding) => {
    const index = Number(binding.code);
    return Number.isFinite(index) && buttons[index] === true;
  });

export const isGamepadActionJustDown = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  buttons: ReadonlyArray<boolean | null | undefined>,
  previousButtons: ReadonlyArray<boolean | null | undefined>,
): boolean =>
  isActionDownGamepad(config, action, buttons) &&
  !isActionDownGamepad(config, action, previousButtons);

export const isGamepadActionJustUp = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  buttons: ReadonlyArray<boolean | null | undefined>,
  previousButtons: ReadonlyArray<boolean | null | undefined>,
): boolean =>
  !isActionDownGamepad(config, action, buttons) &&
  isActionDownGamepad(config, action, previousButtons);

export const formatKeyboardCode = (code: string): string => {
  if (code.startsWith("Key")) return code.slice(3);
  if (code === "Space") return "Space";
  if (code === "Escape") return "Esc";
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  if (code === "Delete") return "Del";
  if (code === "Backspace") return "Back";
  return code;
};

export const formatGamepadButton = (code: string): string =>
  GAMEPAD_BUTTON_LABELS[code] ?? `Btn ${code}`;
