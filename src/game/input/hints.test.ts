import {describe, expect, test} from "bun:test";

import {DEFAULT_SHORTCUTS} from "~/game/input/bindings";
import {buildInteractionPrompts} from "~/game/input/hints";

const style = "xbox" as const;

describe("interaction prompt translation", () => {
  test("translates alternatives via their declared actions", () => {
    const prompts = buildInteractionPrompts(
      "Q / E",
      ["propCycleAnimationLeft", "propCycleAnimationRight"],
      DEFAULT_SHORTCUTS,
      style,
    );
    expect(prompts).toEqual([
      {type: "button", icon: "xbox-lb", alt: "LB"},
      {type: "text", text: "/"},
      {type: "button", icon: "xbox-rb", alt: "RB"},
    ]);
  });

  test("resolves the same letter differently per row action", () => {
    // E means interact here...
    const interact = buildInteractionPrompts(
      "E",
      ["interact"],
      DEFAULT_SHORTCUTS,
      style,
    );
    expect(interact).toEqual([{type: "button", icon: "xbox-a", alt: "A"}]);
    // ...and cycle-next here.
    const cycle = buildInteractionPrompts(
      "E",
      ["propCycleAnimationRight"],
      DEFAULT_SHORTCUTS,
      style,
    );
    expect(cycle).toEqual([{type: "button", icon: "xbox-rb", alt: "RB"}]);
  });

  test("collapses duplicate actions like Click / E into one prompt", () => {
    const prompts = buildInteractionPrompts(
      "Click / E",
      ["interact", "interact"],
      DEFAULT_SHORTCUTS,
      style,
    );
    expect(prompts).toEqual([{type: "button", icon: "xbox-a", alt: "A"}]);
  });

  test("leaves mouse-only rows untouched", () => {
    for (const key of [
      "Wheel",
      "Shift + Wheel",
      "Ctrl + Wheel",
      "Hold F + Wheel",
    ]) {
      expect(
        buildInteractionPrompts(key, undefined, DEFAULT_SHORTCUTS, style),
      ).toBeUndefined();
    }
  });

  test("rows without pad bindings fall back to keycaps", () => {
    // toggleModelPlacement has no default pad binding.
    const prompts = buildInteractionPrompts(
      "M",
      ["toggleModelPlacement"],
      DEFAULT_SHORTCUTS,
      style,
    );
    expect(prompts).toBeUndefined();
  });

  test("switches iconography per controller style", () => {
    const xbox = buildInteractionPrompts(
      "T",
      ["pickUpCancel"],
      DEFAULT_SHORTCUTS,
      "xbox",
    );
    const playstation = buildInteractionPrompts(
      "T",
      ["pickUpCancel"],
      DEFAULT_SHORTCUTS,
      "playstation",
    );
    expect(xbox).toEqual([{type: "button", icon: "xbox-b", alt: "B"}]);
    expect(playstation).toEqual([
      {type: "button", icon: "playstation-circle", alt: "Circle"},
    ]);
  });
});
