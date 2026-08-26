import {describe, expect, test} from "bun:test";

import {formatInteractionKey, keyboardLayoutEntry} from "~/game/keyboardLayout";

describe("keyboard layout labels", () => {
  const azerty = new Map([
    ["KeyA", "q"],
    ["KeyD", "d"],
    ["KeyQ", "a"],
    ["KeyW", "z"],
  ]);

  test("formats physical letter keys from the browser layout", () => {
    expect(formatInteractionKey("A / D", azerty)).toBe("Q / D");
    expect(formatInteractionKey("Q / E", azerty)).toBe("A / E");
    expect(formatInteractionKey("Hold F + Wheel", azerty)).toBe("Hold F + Wheel");
    expect(formatInteractionKey("Space", azerty)).toBe("Space");
  });

  test("learns a physical key label from key events", () => {
    expect(keyboardLayoutEntry({code: "KeyW", key: "Z"})).toEqual(["KeyW", "z"]);
    expect(keyboardLayoutEntry({code: "KeyW", key: "Dead"})).toBeUndefined();
    expect(keyboardLayoutEntry({code: "Space", key: " "})).toBeUndefined();
  });
});
