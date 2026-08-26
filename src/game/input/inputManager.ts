import type {Accessor} from "solid-js";
import {
  actionDispatchPriority,
  type GamepadButtonName,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/input/bindings";
import {GamepadMonitor} from "~/game/input/gamepadMonitor";

export type ActionPhase = "down" | "up";
export type ActionSource = "keyboard" | "gamepad";
export type InputMode = "shop" | "arcade" | "paused";

export type ActionHandler = (
  action: ShortcutAction,
  phase: ActionPhase,
  source: ActionSource,
) => boolean;

/** Standard-mapping names by index; mirrors GAMEPAD_BUTTON_NAMES order. */
const BUTTON_NAME_BY_INDEX: readonly GamepadButtonName[] = [
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

const LEFT_STICK_ARROW_THRESHOLD = 0.5;

/** Text entry surfaces that must never be hijacked by game bindings. */
const EDITABLE_TAGS: ReadonlySet<string> = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

/** True while keyboard events target a text-entry surface. */
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (target === null || typeof target !== "object") return false;
  const element = target as {tagName?: string; isContentEditable?: boolean};
  return (
    EDITABLE_TAGS.has(element.tagName ?? "") ||
    element.isContentEditable === true
  );
};

/**
 * True while a clipboard/browser modifier is held. Bindings match bare
 * physical codes only, so these combos stay reserved for native
 * shortcuts (e.g. Ctrl/Cmd+V paste) and are never consumed.
 */
const hasReservedModifier = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;

/** Bit slots for synthesized stick arrows: up, down, left, right. */
const STICK_ARROW_SLOTS: readonly (readonly [number, GamepadButtonName])[] = [
  [1, "DpadUp"],
  [2, "DpadDown"],
  [4, "DpadLeft"],
  [8, "DpadRight"],
];

/**
 * Device-agnostic input layer for the shop scene.
 *
 * Keyboard and gamepad are two dimensions of the same binding table: both
 * resolve physical inputs to actions ordered by `ACTION_DISPATCH_ORDER`, and
 * feed them to a single handler. Lookup tables rebuild only when the
 * shortcuts config object identity changes; every per-frame path is
 * allocation-free.
 */
export class InputManager {
  readonly gamepad = new GamepadMonitor();
  /** Raw keyboard codes currently held down. */
  readonly #keysDown = new Set<string>();

  readonly #getShortcuts: Accessor<ShortcutsConfig>;
  readonly #handleAction: ActionHandler;
  readonly #isActive: (() => boolean) | undefined;
  readonly #onMenuToggle: (() => void) | undefined;
  readonly #onKeyEvent: ((event: KeyboardEvent) => void) | undefined;
  /** Arcade sessions intercept raw keys before action resolution. */
  #keyboardInterceptor: ((event: KeyboardEvent) => boolean) | undefined;
  #rawGamepadForward:
    | ((name: GamepadButtonName, down: boolean) => void)
    | undefined;

  #lastShortcuts: ShortcutsConfig | undefined;
  /** Physical code -> candidate actions (dispatch order). */
  readonly #actionsByKeyCode = new Map<string, ShortcutAction[]>();
  /** Button name -> candidate actions (dispatch order). */
  readonly #actionsByButtonName = new Map<
    GamepadButtonName,
    ShortcutAction[]
  >();
  /** Every bound keyboard code, for preventDefault decisions. */
  readonly #boundCodes = new Set<string>();
  /** Synthesized D-pad-arrow states for arcade stick driving. */
  readonly #stickArrows = new Uint8Array(4);

  constructor(options: {
    getShortcuts: Accessor<ShortcutsConfig>;
    handleAction: ActionHandler;
    /**
     * When false (menus, dialogs), keyboard events are never consumed -
     * bound keys must not break typing or page scrolling. Held-key tracking
     * continues so state stays consistent across the gate.
     */
    isActive?: () => boolean;
    /** Fired on Start presses in every mode; the owner decides the toggle. */
    onMenuToggle?: () => void;
    /** Observes every keydown (layout hints); cannot consume events. */
    onKeyEvent?: (event: KeyboardEvent) => void;
  }) {
    this.#getShortcuts = options.getShortcuts;
    this.#handleAction = options.handleAction;
    this.#isActive = options.isActive;
    this.#onMenuToggle = options.onMenuToggle;
    this.#onKeyEvent = options.onKeyEvent;
  }

  attach(signal: AbortSignal) {
    window.addEventListener(
      "keydown",
      (event) => {
        this.#syncShortcuts();
        // Typing into inputs must never be hijacked by bindings.
        if (isEditableTarget(event.target)) return;
        if (!event.repeat && !hasReservedModifier(event))
          this.#keysDown.add(event.code);
        this.#onKeyEvent?.(event);
        // The interceptor owns modal raw-key routing (arcade emulation).
        if (this.#keyboardInterceptor?.(event)) return;
        // Repeats never dispatch: held actions are queried via isActionDown.
        if (event.repeat || !this.#inputActive()) return;
        if (hasReservedModifier(event)) return;
        const actions = this.#actionsByKeyCode.get(event.code);
        if (actions === undefined) return;
        event.preventDefault();
        this.#dispatchCandidateList(actions, "down", "keyboard");
      },
      {signal},
    );
    window.addEventListener(
      "keyup",
      (event) => {
        // Always release held state, even when typing or inactive.
        this.#keysDown.delete(event.code);
        if (isEditableTarget(event.target)) return;
        if (this.#keyboardInterceptor?.(event)) return;
        const actions = this.#actionsByKeyCode.get(event.code);
        if (
          actions === undefined ||
          !this.#inputActive() ||
          hasReservedModifier(event)
        )
          return;
        event.preventDefault();
        this.#dispatchCandidateList(actions, "up", "keyboard");
      },
      {signal},
    );
    window.addEventListener("blur", () => this.suspend(), {signal});
    this.gamepad.attach(signal);
    this.#syncShortcuts();
  }

  /**
   * Per-frame tick. Polls the pad and dispatches edge events. Runs in every
   * mode so the menu keeps working while paused or during arcade sessions.
   */
  update(mode: InputMode) {
    this.#syncShortcuts();
    this.gamepad.poll();

    // While a session plays every pad button belongs to the emulated game -
    // including Start and Back. The pause/pick-game menu is keyboard-only
    // (Tab); every other mode keeps Start as the menu toggle.
    if (mode !== "arcade" && this.gamepad.justPressed("Start"))
      this.#onMenuToggle?.();

    if (mode === "shop") {
      for (const [name, actions] of this.#actionsByButtonName) {
        const down = this.gamepad.justPressed(name);
        const up = this.gamepad.justReleased(name);
        if (!down && !up) continue;
        this.#dispatchCandidateList(actions, down ? "down" : "up", "gamepad");
      }
      return;
    }
    if (mode === "arcade") {
      const forward = this.#rawGamepadForward;
      if (!forward) return;
      for (let index = 0; index < BUTTON_NAME_BY_INDEX.length; index++) {
        const name = BUTTON_NAME_BY_INDEX[index];
        if (!name) continue;
        if (this.gamepad.justPressed(name)) forward(name, true);
        else if (this.gamepad.justReleased(name)) forward(name, false);
      }
      this.#forwardLeftStickArrows(forward);
    }
  }

  /**
   * True while any bound input for the action is held (keyboard or pad).
   * Allocation-free; used by movement, sprint, throw charge, shelf previews.
   */
  isActionDown(action: ShortcutAction): boolean {
    const bindings = this.#getShortcuts()[action];
    for (let index = 0; index < bindings.length; index++) {
      const binding = bindings[index];
      if (!binding) continue;
      if (binding.device === "keyboard") {
        if (this.#keysDown.has(binding.code)) return true;
      } else if (this.gamepad.isDown(binding.code)) return true;
    }
    return false;
  }

  /** Releases every held key/pad state (pointer unlock, blur, pause). */
  suspend() {
    this.#keysDown.clear();
    // Deliberately leaves the pad snapshot intact: zeroing it while a button
    // is physically held would fabricate a fresh just-pressed edge on the
    // next poll (e.g. B re-triggering inspection right after opening it).
    // Stale analog values self-correct on the next poll().
    this.gamepad.movement.forward = 0;
    this.gamepad.movement.right = 0;
    this.gamepad.look.pitch = 0;
    this.gamepad.look.yaw = 0;
  }

  /**
   * Installs the modal raw-key interceptor (arcade forwarding); pass
   * undefined to restore normal action resolution.
   */
  setKeyboardInterceptor(
    interceptor: ((event: KeyboardEvent) => boolean) | undefined,
  ) {
    this.#keyboardInterceptor = interceptor;
  }

  /** Installs arcade-mode gamepad button forwarding. */
  setRawGamepadForward(
    forward: ((name: GamepadButtonName, down: boolean) => void) | undefined,
  ) {
    this.#rawGamepadForward = forward;
  }

  /** False while menus or dialogs own the page (keyboard must pass through). */
  #inputActive(): boolean {
    if (this.#isActive && !this.#isActive()) return false;
    // Headless environments (tests) have no document to inspect.
    const element =
      typeof document === "undefined" ? null : document.activeElement;
    return !isEditableTarget(element);
  }

  #dispatchCandidateList(
    actions: ShortcutAction[],
    phase: ActionPhase,
    source: ActionSource,
  ) {
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      if (action && this.#handleAction(action, phase, source)) return;
    }
  }

  /**
   * Drives emulators' D-pad defaults from left-stick deflection so analog
   * input works in retro games without per-core support.
   */
  #forwardLeftStickArrows(
    forward: (name: GamepadButtonName, down: boolean) => void,
  ) {
    const {forward: moveForward, right: moveRight} = this.gamepad.movement;
    const wanted =
      (moveForward < -LEFT_STICK_ARROW_THRESHOLD ? 1 : 0) |
      (moveForward > LEFT_STICK_ARROW_THRESHOLD ? 2 : 0) |
      (moveRight < -LEFT_STICK_ARROW_THRESHOLD ? 4 : 0) |
      (moveRight > LEFT_STICK_ARROW_THRESHOLD ? 8 : 0);
    for (let slot = 0; slot < STICK_ARROW_SLOTS.length; slot++) {
      const arrowSlot = STICK_ARROW_SLOTS[slot];
      if (!arrowSlot) continue;
      const [bit, name] = arrowSlot;
      const isWanted = (wanted & bit) !== 0 ? 1 : 0;
      if (this.#stickArrows[slot] === isWanted) continue;
      this.#stickArrows[slot] = isWanted;
      forward(name, isWanted === 1);
    }
  }

  #syncShortcuts() {
    const config = this.#getShortcuts();
    if (config === this.#lastShortcuts) return;
    this.#lastShortcuts = config;
    this.#rebuild(config);
  }

  #rebuild(config: ShortcutsConfig) {
    this.#actionsByKeyCode.clear();
    this.#actionsByButtonName.clear();
    this.#boundCodes.clear();
    for (const action of Object.keys(config) as ShortcutAction[]) {
      for (const binding of config[action]) {
        if (binding.device === "keyboard") {
          this.#boundCodes.add(binding.code);
          this.#pushCandidate(this.#actionsByKeyCode, binding.code, action);
        } else {
          this.#pushCandidate(this.#actionsByButtonName, binding.code, action);
        }
      }
    }
  }

  #pushCandidate<K>(
    table: Map<K, ShortcutAction[]>,
    key: K,
    action: ShortcutAction,
  ) {
    const existing = table.get(key);
    if (existing === undefined) {
      table.set(key, [action]);
      return;
    }
    // Keep candidates sorted by global dispatch priority; lists are tiny.
    let insertAt = existing.length;
    const priority = actionDispatchPriority(action);
    while (
      insertAt > 0 &&
      existing[insertAt - 1] !== undefined &&
      actionDispatchPriority(existing[insertAt - 1] as ShortcutAction) >
        priority
    )
      insertAt -= 1;
    existing.splice(insertAt, 0, action);
  }
}
