import {describe, expect, test} from "bun:test";

import {
  buildEmulatorDocumentHtml,
  describeKeyboardEvent,
  isArcadeHostMessage,
} from "~/arcade/emulatorHost";

describe("buildEmulatorDocumentHtml", () => {
  const html = buildEmulatorDocumentHtml({
    core: "nes",
    romUrl: "blob:http://localhost/abc",
    gameName: "Alter Ego.nes",
    gameId: 12345,
  });

  test("wires the EJS options for the CDN loader", () => {
    expect(html).toContain('window.EJS_player = "#game"');
    expect(html).toContain('window.EJS_core = "nes"');
    expect(html).toContain('"blob:http://localhost/abc"');
    expect(html).toContain("window.EJS_gameID = 12345");
    expect(html).toContain("https://cdn.emulatorjs.org/stable/data/loader.js");
  });

  test("escapes hostile game names", () => {
    const hostile = buildEmulatorDocumentHtml({
      core: "nes",
      romUrl: "blob:x",
      gameName: '</script><script>alert(1)</script>"',
      gameId: 1,
    });
    expect(hostile).not.toContain("</script><script>alert(1)");
    expect(hostile.match(/<script>/gu)?.length).toBe(2);
  });

  test("includes the keyboard bridge and host message plumbing", () => {
    expect(html).toContain("__afterleafArcade: true");
    expect(html).toContain("new KeyboardEvent");
    expect(html).toContain("bubbles: true");
    // Events must originate at the emulator's own element to reach its
    // container-scoped key handler.
    expect(html).toContain("#game canvas");
  });
});

describe("isArcadeHostMessage", () => {
  test("accepts only flagged messages with a known shape", () => {
    expect(isArcadeHostMessage({__afterleafArcade: true, type: "start"})).toBe(
      true,
    );
    expect(
      isArcadeHostMessage({
        __afterleafArcade: true,
        type: "error",
        detail: "x",
      }),
    ).toBe(true);
    expect(isArcadeHostMessage({type: "start"})).toBe(false);
    expect(isArcadeHostMessage({__afterleafArcade: false, type: "start"})).toBe(
      false,
    );
    expect(isArcadeHostMessage(null)).toBe(false);
    expect(isArcadeHostMessage("start")).toBe(false);
  });
});

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
