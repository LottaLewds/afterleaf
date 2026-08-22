/**
 * Lifecycle manager for an embedded EmulatorJS instance.
 *
 * EmulatorJS runs directly in the host document - no iframe. That is safe
 * here because every session constructs its own `EmulatorJS` inside a
 * detached offscreen container: EJS binds its keyboard handler to its own
 * container element (never window/document), so parallel cabinet sessions
 * cannot cross-talk, and teardown removes the container after stopping the
 * core main loop, letting the wasm heap become garbage-collectable. Going
 * in-page removes a postMessage hop from input (synthetic key events are
 * dispatched synchronously), removes any risk of offscreen-iframe rAF
 * throttling, and lets us tap the core's OpenAL audio graph into a
 * MediaStream for positional playback through the shop's audio buses.
 *
 * One deliberate serialization remains: boot phases run one at a time across
 * all sessions because core glue scripts define shared globals
 * (`window.EJS_Runtime`) when they execute; two cores initializing
 * concurrently could hand the wrong runtime to a booting session.
 */
// Served by the emulator-data plugin (dev/preview middleware + build copy);
// see ~/arcade/emulatorAssets for how the files are vendored.
export const EMULATORJS_DATA_URL = "/emulatorjs/data/";

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

/**
 * Plain init for the synthetic event forwarded into the emulator, including
 * the stamped `keyCode`: engines do not derive keyCode for constructed
 * events, and EmulatorJS matches its bindings with it. Without the stamp
 * every input reads keyCode 0, which collides with the defaults' unbound
 * FAST FORWARD / REWIND / SLOW MOTION entries.
 *
 * The event must NOT bubble: it is dispatched at the container element where
 * EmulatorJS binds its key handler, and a same-document event that escapes
 * the container would reach host-page window listeners, which forward it
 * straight back - an infinite dispatch loop.
 */
export type ForwardedKeyInit = {
  type: "keydown" | "keyup";
  bubbles: false;
  cancelable: true;
  location: 0;
  key: string;
  code: string;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  keyCode: number;
};

/** Pure builder so the synthetic-event contract stays unit-testable. */
export const buildForwardedKeyInit = (
  down: boolean,
  event: ForwardedKeyEvent,
): ForwardedKeyInit => ({
  type: down ? "keydown" : "keyup",
  bubbles: false,
  cancelable: true,
  location: 0,
  key: event.key,
  code: event.code,
  repeat: event.repeat,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  shiftKey: event.shiftKey,
  keyCode: Number(event.keyCode) || 0,
});

/** Bottom-bar buttons surfaced on the (offscreen) emulator UI. */
export const buildEmulatorButtonOptions = (): Record<string, boolean> => ({
  playPause: true,
  restart: true,
  mute: true,
  settings: false,
  fullscreen: false,
  saveState: true,
  loadState: true,
  screenRecord: false,
  gamepad: false,
  cheat: false,
  volume: true,
  saveSavFiles: false,
  loadSavFiles: false,
  quickSave: true,
  quickLoad: true,
  screenshot: false,
  cacheManager: false,
  exitEmulation: true,
});

export type ArcadeEmulatorOptions = {
  core: string;
  romUrl: string;
  gameName: string;
  gameId: number;
};

/**
 * Pure builder mirroring what loader.js derives from the `EJS_*` globals;
 * constructing `EmulatorJS` directly with this config keeps parallel boots
 * free of global-variable races. Volume is pinned to 1 so loudness is owned
 * by the positional audio bus rather than an extra gain stage.
 */
export const buildEmulatorConfig = (
  options: ArcadeEmulatorOptions,
): Record<string, unknown> => ({
  system: options.core,
  gameUrl: options.romUrl,
  gameName: options.gameName,
  gameId: options.gameId,
  dataPath: EMULATORJS_DATA_URL,
  startOnLoad: true,
  noAutoFocus: true,
  color: "#d94c3f",
  backgroundColor: "#000000",
  volume: 1,
  buttonOpts: buildEmulatorButtonOptions(),
});

/** The slice of the EmulatorJS surface Afterleaf touches. */
type EmulatorJsInstance = {
  canvas: HTMLCanvasElement;
  elements: {parent: HTMLElement};
  started: boolean;
  paused: boolean;
  failedToStart?: boolean;
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  gameManager?: {
    functions?: {getFrameNum?: () => number};
  };
  Module?: {
    AL?: {
      currentCtx?: {
        audioCtx?: AudioContext;
        sources?: {gain?: GainNode}[];
      };
    };
  };
  on: (event: string, cb: (data?: unknown) => void) => void;
  callEvent: (event: string, data?: unknown) => void;
};

type EmulatorJsConstructor = new (
  elementSelector: string,
  config: Record<string, unknown>,
) => EmulatorJsInstance;

const getEmulatorJsConstructor = (): EmulatorJsConstructor | undefined =>
  (window as unknown as {EmulatorJS?: EmulatorJsConstructor}).EmulatorJS;

let runtimePromise: Promise<void> | undefined;

/**
 * Loads the vendored runtime bundle and stylesheet once per page; later
 * sessions reuse the already-defined globals.
 */
const loadEmulatorRuntime = (): Promise<void> => {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${EMULATORJS_DATA_URL}emulator.min.css`;
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = `${EMULATORJS_DATA_URL}emulator.min.js`;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      // Allow a retry on the next boot attempt instead of caching failure.
      runtimePromise = undefined;
      reject(new Error("The vendored EmulatorJS runtime failed to load."));
    });
    document.head.appendChild(script);
  });
  return runtimePromise;
};

export type EmulatorSession = {
  /** Resolves once emulation is running and the render canvas exists. */
  canvasReady: Promise<HTMLCanvasElement>;
  /**
   * Resolves with a live tap of the core's audio output for positional
   * playback, or undefined when the OpenAL graph never materialized (local
   * speaker output stays untouched in that case).
   */
  audioStreamReady: Promise<MediaStream | undefined>;
  forwardKey: (down: boolean, event: ForwardedKeyEvent) => void;
  /**
   * Emulated frame counter for dev diagnostics only; undefined until the
   * core exposes it. Deltas over wall time give the core's real step rate.
   */
  frameCount: () => number | undefined;
  destroy: () => void;
};

export type EmulatorLaunchOptions = ArcadeEmulatorOptions & {
  onStart?: () => void;
  onExit?: () => void;
  onError?: (message: string) => void;
  /** Milliseconds without a successful boot before reporting failure. */
  bootTimeoutMs?: number;
};

const BOOT_TIMEOUT_MS = 150_000;
const AUDIO_TAP_TIMEOUT_MS = 15_000;
const AUDIO_TAP_POLL_MS = 100;

// Offscreen layout only feeds EmulatorJS's resize math: the canvas backing
// store follows this box times devicePixelRatio (e.g. 320x240 becomes
// 480x360 at dpr 1.5), and every texture copy the host does scales with it.
// The cabinet screen mesh never gets close enough to need more than that.
const CONTAINER_WIDTH_PX = 320;
const CONTAINER_HEIGHT_PX = 240;

let nextSlotId = 1;
// Cores define shared globals while their glue executes; keep boot phases
// mutually exclusive across sessions (see module docstring).
let bootChain = Promise.resolve();

/**
 * Boots an EmulatorJS session directly in this document. Callers own the
 * returned session and must call `destroy()` when done.
 */
export const launchEmulator = (
  options: EmulatorLaunchOptions,
): EmulatorSession => {
  let destroyed = false;
  let bootWatchdogHandle: ReturnType<typeof setTimeout> | undefined;
  let emulator: EmulatorJsInstance | undefined;
  let resolveCanvas!: (canvas: HTMLCanvasElement) => void;
  let rejectCanvas!: (cause: unknown) => void;
  let resolveAudioStream!: (stream: MediaStream | undefined) => void;
  const abortController = new AbortController();

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = `${CONTAINER_WIDTH_PX}px`;
  container.style.height = `${CONTAINER_HEIGHT_PX}px`;
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";

  const slotId = `afterleaf-arcade-${nextSlotId++}`;
  const slot = document.createElement("div");
  slot.id = slotId;
  slot.style.width = "100%";
  slot.style.height = "100%";
  container.appendChild(slot);
  document.body.appendChild(container);

  const disarmBootWatchdog = () => {
    if (bootWatchdogHandle === undefined) return;
    clearTimeout(bootWatchdogHandle);
    bootWatchdogHandle = undefined;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    disarmBootWatchdog();
    abortController.abort();
    // The GameManager "exit" hook saves SRAM, stops the core main loop,
    // unmounts its filesystems, and aborts the wasm module shortly after.
    try {
      if (emulator?.started && !emulator.failedToStart)
        emulator.callEvent("exit");
    } catch (error) {
      console.warn("Afterleaf arcade emulator teardown failed.", error);
    }
    emulator = undefined;
    container.remove();
  };

  const fail = (message: string) => {
    if (destroyed) return;
    destroyed = true;
    disarmBootWatchdog();
    abortController.abort();
    try {
      if (emulator?.started && !emulator.failedToStart)
        emulator.callEvent("exit");
    } catch {
      // Best-effort cleanup; the session is being torn down regardless.
    }
    emulator = undefined;
    container.remove();
    console.error(`Afterleaf arcade emulator failed: ${message}`);
    options.onError?.(message);
    rejectCanvas(new Error(message));
  };

  const canvasReady = new Promise<HTMLCanvasElement>((resolve, reject) => {
    resolveCanvas = resolve;
    rejectCanvas = reject;
  });
  // Callers usually attach after boot settles; keep early failures from
  // surfacing as unhandled rejections while still rejecting real awaiters.
  canvasReady.catch(() => {});
  const audioStreamReady = new Promise<MediaStream | undefined>((resolve) => {
    resolveAudioStream = resolve;
  });
  audioStreamReady.catch(() => {});
  abortController.signal.addEventListener(
    "abort",
    () => {
      rejectCanvas(new Error("The emulator session was destroyed."));
      // Never leave stream awaiters hanging if destruction wins the race.
      resolveAudioStream(undefined);
    },
    {once: true},
  );

  // The watchdog guards the whole boot window - runtime fetch included -
  // so it must be armed synchronously; once the core is up it is disarmed
  // or it would tear down a healthy session mid-play.
  bootWatchdogHandle = setTimeout(() => {
    fail("The emulator took too long to boot.");
  }, options.bootTimeoutMs ?? BOOT_TIMEOUT_MS);

  /**
   * Reroutes every OpenAL source gain into a MediaStreamDestination so the
   * cabinet can play the game positionally. This is exclusive: source gains
   * are disconnected from the default output first, otherwise each sound
   * would play twice (flat + spatialized). EJS's own setVolume writes these
   * exact nodes (`currentCtx.sources[*].gain`), so its mute/volume controls
   * keep working through the tap. If OpenAL never initializes, resolving
   * undefined leaves normal speaker output intact.
   */
  const tapAudio = async () => {
    const deadline = performance.now() + AUDIO_TAP_TIMEOUT_MS;
    for (;;) {
      if (destroyed) {
        resolveAudioStream(undefined);
        return;
      }
      const currentCtx = emulator?.Module?.AL?.currentCtx;
      const gains = (currentCtx?.sources ?? [])
        .map((source) => source.gain)
        .filter((gain): gain is GainNode => Boolean(gain));
      if (currentCtx?.audioCtx && gains.length > 0) {
        const destination = currentCtx.audioCtx.createMediaStreamDestination();
        for (const gain of gains) {
          gain.disconnect();
          gain.connect(destination);
        }
        // setVolume may have run before OpenAL existed; reapply so a muted
        // or lowered session does not come through the tap at full blast.
        const activeEmulator = emulator;
        if (activeEmulator && !activeEmulator.muted)
          activeEmulator.setVolume(activeEmulator.volume);
        else if (activeEmulator) activeEmulator.setVolume(0);
        resolveAudioStream(destination.stream);
        return;
      }
      if (performance.now() > deadline) {
        resolveAudioStream(undefined);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, AUDIO_TAP_POLL_MS));
    }
  };

  const boot = async () => {
    try {
      await loadEmulatorRuntime();
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    if (destroyed) return;
    const EmulatorJS = getEmulatorJsConstructor();
    if (!EmulatorJS) {
      fail("The vendored EmulatorJS runtime did not register itself.");
      return;
    }

    let instance: EmulatorJsInstance;
    try {
      instance = new EmulatorJS(`#${slotId}`, buildEmulatorConfig(options));
    } catch (cause) {
      console.error("Afterleaf could not construct the emulator.", cause);
      fail("The emulator could not be started.");
      return;
    }
    if (destroyed) return;
    emulator = instance;

    instance.on("start", () => {
      // Boot succeeded: the watchdog must never fire mid-play.
      disarmBootWatchdog();
      options.onStart?.();
      resolveCanvas(instance.canvas);
      void tapAudio();
    });
    instance.on("exit", () => {
      // Our own destroy() triggers this event too; the destroyed flag keeps
      // it from recursing while still letting user-initiated exits flow.
      if (destroyed) return;
      destroy();
      options.onExit?.();
    });

    // startGameError() flips this flag without any callback; poll briefly so
    // download/core failures settle fast instead of waiting out the watchdog.
    const failurePoll = setInterval(() => {
      if (!destroyed && instance.failedToStart)
        fail("The emulator reported a startup failure.");
    }, 250);
    abortController.signal.addEventListener(
      "abort",
      () => clearInterval(failurePoll),
      {once: true},
    );
  };

  bootChain = bootChain.then(boot).catch((cause: unknown) => {
    console.error("Afterleaf arcade boot crashed.", cause);
    fail("The emulator boot crashed unexpectedly.");
  });

  let forwardingInput = false;
  return {
    canvasReady,
    audioStreamReady,
    forwardKey: (down, event) => {
      if (destroyed || !emulator || forwardingInput) return;
      const {type, keyCode, ...init} = buildForwardedKeyInit(down, event);
      // Events do not derive keyCode for constructed KeyboardEvents, so the
      // real value is stamped onto the instance before dispatch.
      const forwarded = new KeyboardEvent(type, init);
      Object.defineProperty(forwarded, "keyCode", {value: keyCode});
      // Dispatch at the container itself, non-bubbling (see ForwardedKeyInit):
      // the key handler lives on this element and fires during the target
      // phase. The guard is belt-and-braces - dispatchEvent runs listeners
      // synchronously, so any re-entrant keydown would recurse right here.
      forwardingInput = true;
      try {
        emulator.elements.parent.dispatchEvent(forwarded);
      } finally {
        forwardingInput = false;
      }
    },
    frameCount: () => {
      const getFrameNum = emulator?.gameManager?.functions?.getFrameNum;
      if (!getFrameNum) return undefined;
      try {
        return getFrameNum();
      } catch {
        return undefined;
      }
    },
    destroy,
  };
};
