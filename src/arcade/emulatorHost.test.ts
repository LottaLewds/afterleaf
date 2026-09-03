import {describe, expect, test} from "bun:test";

import {
  buildEmulatorButtonOptions,
  buildEmulatorConfig,
  buildForwardedKeyInit,
  describeKeyboardEvent,
  disableEmulatorJSGamepadPolling,
  EMULATORJS_DATA_URL,
  hideNavigatorGamepads,
  restoreNavigatorGamepads,
} from "~/arcade/emulatorHost";

describe("describeKeyboardEvent", () => {
  test("captures the numeric code and modifiers the bridge needs", () => {
    // Bun's test env lacks KeyboardEvent; the function only reads fields.
    const event = {
      key: "ArrowUp",
      code: "ArrowUp",
      keyCode: 38,
      repeat: true,
      shiftKey: true,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
    } as KeyboardEvent;
    expect(describeKeyboardEvent(event)).toEqual({
      key: "ArrowUp",
      code: "ArrowUp",
      keyCode: 38,
      repeat: true,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
    });
  });
});

describe("buildForwardedKeyInit", () => {
  test("stamps the legacy keyCode without bubbling out of the emulator", () => {
    expect(
      buildForwardedKeyInit(true, {
        key: "ArrowLeft",
        code: "ArrowLeft",
        keyCode: 37,
        repeat: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toEqual({
      type: "keydown",
      // Non-bubbling is load-bearing: a same-document event that escapes the
      // emulator container would re-enter host key listeners and loop.
      bubbles: false,
      cancelable: true,
      location: 0,
      key: "ArrowLeft",
      code: "ArrowLeft",
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      keyCode: 37,
    });
  });

  test("coerces missing keyCodes to zero and switches to keyup", () => {
    const init = buildForwardedKeyInit(false, {
      key: "x",
      code: "KeyX",
      keyCode: Number.NaN,
      repeat: true,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
    expect(init.type).toBe("keyup");
    expect(init.keyCode).toBe(0);
  });
});

describe("buildEmulatorConfig", () => {
  const config = buildEmulatorConfig({
    core: "nes",
    romUrl: "blob:http://localhost/abc",
    gameName: "Alter Ego.nes",
    gameId: 12345,
  });

  test("wires the vendored same-origin runtime", () => {
    expect(config.system).toBe("nes");
    expect(config.gameUrl).toBe("blob:http://localhost/abc");
    expect(config.gameName).toBe("Alter Ego.nes");
    expect(config.gameId).toBe(12345);
    expect(config.dataPath).toBe(EMULATORJS_DATA_URL);
    expect(JSON.stringify(config)).not.toContain("cdn.emulatorjs.org");
  });

  test("boots unattended without stealing focus or audio gain", () => {
    expect(config.startOnLoad).toBe(true);
    expect(config.noAutoFocus).toBe(true);
    // Loudness is owned by the positional media bus; an extra EJS gain
    // stage would double-attenuate and desync mute expectations.
    expect(config.volume).toBe(1);
    expect(config.backgroundColor).toBe("#000000");
  });

  test("keeps exit reachable but hides world-breaking UI", () => {
    const buttons = config.buttonOpts as Record<string, boolean>;
    expect(buttons.exitEmulation).toBe(true);
    expect(buttons.settings).toBe(false);
    expect(buttons.fullscreen).toBe(false);
    expect(buttons.gamepad).toBe(false);
    expect(buttons.screenRecord).toBe(false);
    // Mute/volume stay on: setVolume writes the same AL source gains the
    // positional tap reroutes, so they keep working through it.
    expect(buttons.mute).toBe(true);
    expect(buttons.volume).toBe(true);
  });
});

describe("buildEmulatorButtonOptions", () => {
  test("is stable across calls so sessions share one shape", () => {
    expect(buildEmulatorButtonOptions()).toEqual(buildEmulatorButtonOptions());
  });
});

describe("disableEmulatorJSGamepadPolling", () => {
  test("makes every GamepadHandler instance see an empty gamepad list", () => {
    const getGamepads = () => [{id: "pad"}] as (Gamepad | null)[];
    const GamepadHandler = function () {} as unknown as {
      prototype: {getGamepads: () => (Gamepad | null)[]};
      new (): {getGamepads: () => (Gamepad | null)[]};
    };
    GamepadHandler.prototype = {getGamepads};
    Object.assign(globalThis, {GamepadHandler});

    expect(new GamepadHandler().getGamepads().length).toBe(1);
    disableEmulatorJSGamepadPolling();
    expect(new GamepadHandler().getGamepads().length).toBe(0);
  });

  test("is a no-op when EmulatorJS has not loaded yet", () => {
    // @ts-expect-error intentionally deleting the global for the test.
    delete globalThis.GamepadHandler;
    expect(() => disableEmulatorJSGamepadPolling()).not.toThrow();
  });
});

describe("hideNavigatorGamepads / restoreNavigatorGamepads", () => {
  const defineGetter = (value: () => (Gamepad | null)[]) =>
    Object.defineProperty(globalThis.navigator, "getGamepads", {
      configurable: true,
      value,
    });

  test("hides gamepads from navigator.getGamepads()", () => {
    defineGetter(() => [{id: "pad"}] as (Gamepad | null)[]);
    hideNavigatorGamepads();
    expect(globalThis.navigator.getGamepads()).toEqual([]);
    restoreNavigatorGamepads();
  });

  test("keeps a reference-count for concurrent sessions", () => {
    defineGetter(() => [{id: "pad"}] as (Gamepad | null)[]);
    hideNavigatorGamepads();
    hideNavigatorGamepads();
    expect(globalThis.navigator.getGamepads()).toEqual([]);
    restoreNavigatorGamepads();
    // Still hidden because one session remains active.
    expect(globalThis.navigator.getGamepads()).toEqual([]);
    restoreNavigatorGamepads();
    // All sessions ended: the getter is restored.
    expect(globalThis.navigator.getGamepads()).toEqual([{id: "pad"}]);
  });

  test("restores the getter even when it was never replaced", () => {
    defineGetter(() => []);
    expect(() => restoreNavigatorGamepads()).not.toThrow();
  });
});
