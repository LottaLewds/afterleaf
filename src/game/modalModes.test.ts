import {describe, expect, test} from "bun:test";

import {modalModes} from "./modalModes";

const scope = (id: string, onEscape?: () => boolean) => ({id, onEscape});

describe("modalModes", () => {
  test("consumes Escape from the top of the stack first", () => {
    const order: string[] = [];
    const bottom = scope("bottom", () => {
      order.push("bottom");
      return true;
    });
    const top = scope("top", () => {
      order.push("top");
      return true;
    });
    modalModes.push(bottom);
    modalModes.push(top);
    expect(modalModes.consumeEscape()).toBe(true);
    expect(order).toEqual(["top"]);
    modalModes.pop(top);
    modalModes.pop(bottom);
  });

  test("falls through scopes that decline the press", () => {
    let bottomCalls = 0;
    const bottom = scope("bottom", () => {
      bottomCalls += 1;
      return true;
    });
    const decliningTop = scope("declining-top", () => false);
    const silentScope = scope("silent");
    modalModes.push(bottom);
    modalModes.push(decliningTop);
    modalModes.push(silentScope);
    expect(modalModes.consumeEscape()).toBe(true);
    expect(bottomCalls).toBe(1);
    modalModes.pop(silentScope);
    modalModes.pop(decliningTop);
    // With no consuming handler left the press is unhandled.
    modalModes.pop(bottom);
    expect(modalModes.consumeEscape()).toBe(false);
    expect(modalModes.depth).toBe(0);
  });

  test("pop removes only the matching scope id", () => {
    const first = scope("first");
    const second = scope("second");
    modalModes.push(first);
    modalModes.push(second);
    expect(modalModes.has("first")).toBe(true);
    expect(modalModes.pop("first")).toBe(true);
    expect(modalModes.has("first")).toBe(false);
    expect(modalModes.has("second")).toBe(true);
    expect(modalModes.pop("missing")).toBe(false);
    modalModes.pop(second);
    expect(modalModes.depth).toBe(0);
  });

  test("re-pushing an id moves it to the top instead of duplicating", () => {
    const first = scope("dup", () => true);
    const second = scope("other", () => true);
    modalModes.push(first);
    modalModes.push(second);
    modalModes.push(scope("dup", first.onEscape));
    expect(modalModes.depth).toBe(2);
    expect(modalModes.top()?.id).toBe("dup");
    modalModes.pop("dup");
    modalModes.pop("other");
  });
});
