/**
 * Lifecycle manager for an embedded EmulatorJS instance.
 *
 * EmulatorJS documents that single-page apps must embed it inside an iframe;
 * running it directly tampers with the page DOM and globals. Each session
 * therefore boots a fresh same-origin iframe whose document sets up the
 * `EJS_*` options and loads the npm-vendored loader. The host page reaches
 * into the frame to grab the rendered `<canvas>` for texturing the cabinet's
 * TVScreen mesh, and forwards keyboard input as synthetic events so shop
 * controls stay fully modal while a game is running.
 */
// Served by the emulator-data plugin (dev/preview middleware + build copy);
// see ~/arcade/emulatorAssets for how the files are vendored.
export const EMULATORJS_DATA_URL = "/emulatorjs/data/";

const HOST_MESSAGE_FLAG = "__afterleafArcade";

export type ArcadeHostMessage = {
  [HOST_MESSAGE_FLAG]: true;
  type: "start" | "exit" | "error";
  detail?: string;
};

export type ForwardedKeyEvent = {
  key: string;
  code: string;
  /** Legacy numeric code EmulatorJS matches its bindings against. */
  keyCode: number;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export const describeKeyboardEvent = (
  event: KeyboardEvent,
): ForwardedKeyEvent => ({
  key: event.key,
  code: event.code,
  keyCode: event.keyCode,
  repeat: event.repeat,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  shiftKey: event.shiftKey,
});

export const isArcadeHostMessage = (data: unknown): data is ArcadeHostMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as ArcadeHostMessage)[HOST_MESSAGE_FLAG] === true &&
  typeof (data as ArcadeHostMessage).type === "string";

/** Pure builder so the generated boot document stays unit-testable. */
export const buildEmulatorDocumentHtml = (config: {
  core: string;
  romUrl: string;
  gameName: string;
  gameId: number;
}) => {
  // JSON.stringify keeps arbitrary strings safe inside the script tag; the
  // closing-tag split prevents </script> sequences in names from breaking out.
  const encode = (value: string) =>
    JSON.stringify(value).replace(/<\//gu, "<\\/");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}
#game{position:absolute;left:-99999px;top:0;width:320px;height:240px}
</style></head><body>
<div id="game"></div>
<script>
window.EJS_player = "#game";
window.EJS_core = ${encode(config.core)};
window.EJS_gameUrl = ${encode(config.romUrl)};
window.EJS_gameName = ${encode(config.gameName)};
window.EJS_gameID = ${config.gameId};
window.EJS_startOnLoaded = true;
window.EJS_pathtodata = ${encode(EMULATORJS_DATA_URL)};
window.EJS_color = "#d94c3f";
window.EJS_backgroundColor = "#000000";
window.EJS_askBeforeExit = false;
window.EJS_noAutoFocus = true;
window.EJS_Buttons = {
  playPause: true, restart: true, mute: true, settings: false,
  fullscreen: false, saveState: true, loadState: true, screenRecord: false,
  gamepad: false, cheat: false, volume: true, saveSavFiles: false,
  loadSavFiles: false, quickSave: true, quickLoad: true, screenshot: false,
  cacheManager: false, exitEmulation: true
};
var post = function (type, detail) {
  parent.postMessage({${HOST_MESSAGE_FLAG}: true, type: type, detail: detail}, "*");
};
window.EJS_onGameStart = function () { post("start"); };
window.EJS_onExit = function () { post("exit"); };
window.addEventListener("error", function (event) {
  post("error", event.message || "Unknown emulator error");
});
window.addEventListener("message", function (event) {
  var data = event.data;
  if (!data || data.${HOST_MESSAGE_FLAG} !== true || event.source !== parent) return;
  var down = data.type === "keydown";
  // EmulatorJS binds its key handler to its own container element and
  // matches by keyCode, so the synthetic event must originate there and
  // bubble; the engine derives keyCode from key.
  var forwarded = new KeyboardEvent(down ? "keydown" : "keyup", {
    key: String(data.key), code: String(data.code), repeat: !!data.repeat,
    location: 0, altKey: !!data.altKey, ctrlKey: !!data.ctrlKey,
    metaKey: !!data.metaKey, shiftKey: !!data.shiftKey,
    bubbles: true, cancelable: true
  });
  // Engines do not derive keyCode for constructed events (and EmulatorJS
  // matches bindings with it), so stamp the real value from the trusted
  // event. Without it every input reads keyCode 0, which collides with the
  // defaults' unbound FAST FORWARD / REWIND / SLOW MOTION entries.
  Object.defineProperty(forwarded, "keyCode", {
    value: Number(data.keyCode) || 0,
  });
  var target =
    document.querySelector("#game canvas") ||
    document.querySelector("#game") ||
    document;
  target.dispatchEvent(forwarded);
});
</script>
<script src="${EMULATORJS_DATA_URL}loader.js"></script>
</body></html>`;
};

export type EmulatorSession = {
  /** Resolves once emulation is running and the render canvas exists. */
  canvasReady: Promise<HTMLCanvasElement>;
  forwardKey: (down: boolean, event: ForwardedKeyEvent) => void;
  destroy: () => void;
};

export type EmulatorLaunchOptions = {
  core: string;
  romUrl: string;
  gameName: string;
  gameId: number;
  onStart?: () => void;
  onExit?: () => void;
  onError?: (message: string) => void;
  /** Milliseconds without a successful boot before reporting failure. */
  bootTimeoutMs?: number;
};

const CANVAS_WAIT_TIMEOUT_MS = 20_000;

/**
 * Boots an EmulatorJS session in a detached offscreen iframe. Callers own the
 * returned session and must call `destroy()` when done.
 */
export const launchEmulator = (
  options: EmulatorLaunchOptions,
): EmulatorSession => {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "2px";
  container.style.height = "2px";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";

  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Arcade emulator");
  frame.style.width = "2px";
  frame.style.height = "2px";
  frame.style.border = "0";
  frame.srcdoc = buildEmulatorDocumentHtml({
    core: options.core,
    romUrl: options.romUrl,
    gameName: options.gameName,
    gameId: options.gameId,
  });
  container.appendChild(frame);
  document.body.appendChild(container);

  const abortController = new AbortController();
  let destroyed = false;
  let bootTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let resolveCanvas!: (canvas: HTMLCanvasElement) => void;
  let rejectCanvas!: (cause: unknown) => void;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (bootTimeoutHandle !== undefined) clearTimeout(bootTimeoutHandle);
    abortController.abort();
    container.remove();
  };

  const fail = (message: string) => {
    if (destroyed) return;
    destroyed = true;
    if (bootTimeoutHandle !== undefined) clearTimeout(bootTimeoutHandle);
    abortController.abort();
    container.remove();
    // Surface the failure both through onError and by settling canvasReady
    // so awaiting code always wakes up.
    options.onError?.(message);
    rejectCanvas(new Error(message));
  };

  window.addEventListener(
    "message",
    (event) => {
      if (destroyed || event.source !== frame.contentWindow) return;
      if (!isArcadeHostMessage(event.data)) return;
      if (event.data.type === "start") options.onStart?.();
      else if (event.data.type === "exit") {
        destroy();
        options.onExit?.();
      } else if (event.data.type === "error")
        fail(`Emulator error: ${event.data.detail ?? "unknown"}`);
    },
    {signal: abortController.signal},
  );

  const bootTimeoutMs = options.bootTimeoutMs ?? 150_000;
  bootTimeoutHandle = setTimeout(() => {
    fail("The emulator took too long to boot.");
  }, bootTimeoutMs);

  abortController.signal.addEventListener(
    "abort",
    () => rejectCanvas(new Error("The emulator session was destroyed.")),
    {once: true},
  );
  const canvasReady = new Promise<HTMLCanvasElement>((resolve, reject) => {
    resolveCanvas = resolve;
    rejectCanvas = reject;
  });
  // Callers usually attach after boot settles; keep early failures from
  // surfacing as unhandled rejections while still rejecting real awaiters.
  canvasReady.catch(() => {});

  const pollForCanvas = async () => {
    // The boot timeout owns overall failure; here we only wait for the
    // render canvas to exist once the core is up.
    const deadline = performance.now() + CANVAS_WAIT_TIMEOUT_MS;
    for (;;) {
      if (destroyed) return;
      const canvas =
        frame.contentWindow?.document.querySelector<HTMLCanvasElement>(
          "canvas",
        );
      if (canvas && canvas.width > 0) {
        resolveCanvas(canvas);
        return;
      }
      if (performance.now() > deadline) {
        fail("The emulator canvas never appeared.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  void pollForCanvas();

  return {
    canvasReady,
    forwardKey: (down, event) => {
      const frameWindow = frame.contentWindow;
      if (!frameWindow || destroyed) return;
      frameWindow.postMessage(
        {[HOST_MESSAGE_FLAG]: true, type: down ? "keydown" : "keyup", ...event},
        "*",
      );
    },
    destroy,
  };
};
