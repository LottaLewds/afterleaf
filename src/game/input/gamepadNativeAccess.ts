/**
 * Coordination flag for native gamepad API access.
 *
 * emulatorHost.ts hides physical gamepads from navigator.getGamepads() so
 * EmulatorJS cannot read them in parallel with Afterleaf's own forwarding.
 * Afterleaf's GamepadMonitor wraps its call in readNativeGamepads() so the
 * block knows to let the real request through.
 */

let allowNativeGamepadReading = false;

/** Runs fn while allowing navigator.getGamepads() to return real data. */
export const readNativeGamepads = <T>(fn: () => T): T => {
  allowNativeGamepadReading = true;
  try {
    return fn();
  } finally {
    allowNativeGamepadReading = false;
  }
};

/** True when readNativeGamepads has temporarily unblocked the API. */
export const isNativeGamepadReadingAllowed = (): boolean => allowNativeGamepadReading;
