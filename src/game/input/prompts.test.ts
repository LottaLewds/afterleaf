import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, test} from "bun:test";

import {GAMEPAD_BUTTON_NAMES, GAMEPAD_BUTTON_PRESENTATION} from "~/game/input/bindings";

const ICON_DIRECTORY = join(import.meta.dir, "../../assets/input-prompts");

const availableIcons = new Set(
  readdirSync(ICON_DIRECTORY)
    .filter((name) => name.endsWith(".svg"))
    .map((name) => name.replace(/\.svg$/u, "")),
);

describe("prompt iconography", () => {
  test("every button in every style has an icon asset", () => {
    for (const style of ["xbox", "playstation"] as const) {
      for (const name of GAMEPAD_BUTTON_NAMES) {
        const icon = GAMEPAD_BUTTON_PRESENTATION[style][name].icon;
        expect(availableIcons.has(icon)).toBe(true);
      }
    }
  });

  test("every icon asset is a non-empty SVG", () => {
    expect(availableIcons.size).toBeGreaterThan(0);
    for (const icon of availableIcons) {
      const contents = readFileSync(join(ICON_DIRECTORY, `${icon}.svg`), "utf8");
      expect(contents.startsWith("<svg")).toBe(true);
    }
  });
});
