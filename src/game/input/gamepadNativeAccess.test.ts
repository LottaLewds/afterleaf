import {describe, expect, test} from "bun:test";

import {isNativeGamepadReadingAllowed, readNativeGamepads} from "~/game/input/gamepadNativeAccess";

describe("readNativeGamepads", () => {
  test("sets the flag around the callback and clears it after", () => {
    expect(isNativeGamepadReadingAllowed()).toBe(false);
    readNativeGamepads(() => {
      expect(isNativeGamepadReadingAllowed()).toBe(true);
      return "result";
    });
    expect(isNativeGamepadReadingAllowed()).toBe(false);
  });

  test("returns the callback result and resets the flag on throw", () => {
    expect(() =>
      readNativeGamepads(() => {
        expect(isNativeGamepadReadingAllowed()).toBe(true);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(isNativeGamepadReadingAllowed()).toBe(false);
  });
});
