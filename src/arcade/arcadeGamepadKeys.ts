import type {ForwardedKeyEvent} from "~/arcade/emulatorHost";
import type {GamepadButtonName} from "~/game/input/bindings";

/**
 * Default gamepad-to-emulator key profile.
 *
 * EmulatorJS consumes synthetic keyboard events, so a gamepad during an
 * arcade session forwards as virtual keys following common retro defaults:
 * D-pad/stick -> arrows, A -> X key (east confirm), B -> Z key (west), Start
 * -> Enter. Unmapped buttons simply forward nothing.
 *
 * Every descriptor is frozen and allocated once - the per-frame forwarding
 * path never allocates.
 */
export const ARCADE_GAMEPAD_KEYS: Partial<
  Record<GamepadButtonName, ForwardedKeyEvent>
> = {
  A: key("x", "KeyX", 88),
  B: key("z", "KeyZ", 90),
  X: key("s", "KeyS", 83),
  Y: key("a", "KeyA", 65),
  LB: key("q", "KeyQ", 81),
  RB: key("w", "KeyW", 87),
  Back: shift(),
  L2: shift(),
  DpadUp: arrow("ArrowUp", "Up", 38),
  DpadDown: arrow("ArrowDown", "Down", 40),
  DpadLeft: arrow("ArrowLeft", "Left", 37),
  DpadRight: arrow("ArrowRight", "Right", 39),
};

function key(
  keyValue: string,
  code: string,
  keyCode: number,
): ForwardedKeyEvent {
  return Object.freeze({
    key: keyValue,
    code,
    keyCode,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  });
}

function arrow(
  keyValue: string,
  legacyKey: string,
  keyCode: number,
): ForwardedKeyEvent {
  // EmulatorJS matches its arrow bindings against the legacy `key` value.
  return Object.freeze({
    key: legacyKey,
    code: keyValue,
    keyCode,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  });
}

function shift(): ForwardedKeyEvent {
  return Object.freeze({
    key: "Shift",
    code: "ShiftRight",
    keyCode: 16,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
  });
}
