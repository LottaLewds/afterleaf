import {isEditableTarget} from "~/game/input/inputManager";
import {modalModes} from "~/game/modalModes";
import {createModeListener, useUiMode} from "~/game/uiMode";
import {onSettled} from "solid-js";

/**
 * Window of time after a stack-consumed Escape during which the menu
 * fallback stays deaf, so backing out of an exclusive surface (picker,
 * emulator, dialog) cannot roll straight into opening the pause menu from
 * the same physical gesture.
 */
const ESCAPE_GESTURE_COOLDOWN_MS = 250;

/**
 * True while a key press originates inside a modal dialog. Dialogs own
 * their own Tab-based focus navigation (summary rows, buttons, selects),
 * so the global Tab router must never swallow presses born there.
 */
const isDialogDescendant = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="dialog"]') !== null;

/**
 * Always-on Tab router plus a mode-scoped menu fallback. The router offers
 * every press to the shared modal stack from whichever mode is active; the
 * fallback that toggles the pause menu binds only while a fallback-armed
 * mode is active, so exclusive surfaces such as an emulator session can
 * never leak a stray press into the menu.
 *
 * Tab owns the menus outright: Escape stays reserved for the browser's own
 * pointer-lock management, and Tab presses on text-entry surfaces or inside
 * modal dialogs are ignored so form focus navigation keeps working. Closing
 * the menu through here resumes regular gameplay, so the pointer lock is
 * re-acquired.
 */
export const GlobalEscapeShortcuts = (props: {onFallback: () => void}) => {
  const {escapeFallbackArmed} = useUiMode();
  // Written by whichever press the stack consumed most recently.
  let lastStackConsumeAt = Number.NEGATIVE_INFINITY;
  onSettled(() => {
    const routerAbortController = new AbortController();
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Tab" || isEditableTarget(event.target)) return;
        if (isDialogDescendant(event.target)) return;
        if (event.defaultPrevented || event.repeat) return;
        if (!modalModes.consumeEscape()) return;
        lastStackConsumeAt = performance.now();
        event.preventDefault();
      },
      {signal: routerAbortController.signal},
    );
    return () => routerAbortController.abort();
  });
  createModeListener(escapeFallbackArmed, (signal) => {
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Tab" || isEditableTarget(event.target)) return;
        if (isDialogDescendant(event.target)) return;
        if (event.defaultPrevented || event.repeat) return;
        if (performance.now() - lastStackConsumeAt < ESCAPE_GESTURE_COOLDOWN_MS) return;
        event.preventDefault();
        props.onFallback();
      },
      {signal},
    );
  });
  return null;
};
