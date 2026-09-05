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
import {isNativeGamepadReadingAllowed} from "~/game/input/gamepadNativeAccess";

// Served by the emulator-data plugin (dev/preview middleware + build copy);
// see ~/arcade/emulatorAssets for how the files are vendored.
export const EMULATORJS_DATA_URL = "/api/runtime/emulatorjs/data/";

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

export const describeKeyboardEvent = (event: KeyboardEvent): ForwardedKeyEvent => ({
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
export const buildForwardedKeyInit = (down: boolean, event: ForwardedKeyEvent): ForwardedKeyInit => ({
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

/**
 * Prevents EmulatorJS's built-in GamepadHandler from polling physical pads.
 *
 * Afterleaf reads the gamepad itself and forwards inputs through synthetic
 * keyboard events (see ShopScene's setRawGamepadForward). If EmulatorJS also
 * reads navigator.getGamepads(), the same physical input reaches the core
 * twice: once as a forwarded key event and once as a native gamepad event,
 * causing inverted axes, duplicated D-pad presses, or silent inputs depending
 * on the core. Patching the handler's prototype makes every EmulatorJS
 * instance see an empty gamepad list while Afterleaf's own GamepadMonitor
 * keeps working through navigator.getGamepads().
 */
export const disableEmulatorJSGamepadPolling = (): void => {
  const handler = (globalThis as unknown as {GamepadHandler?: {prototype: {getGamepads?: () => (Gamepad | null)[]}}})
    .GamepadHandler;
  if (!handler?.prototype?.getGamepads) return;
  handler.prototype.getGamepads = () => [];
};

// -- Native gamepad hiding ----------------------------------------------------
//
// EmulatorJS can also reach navigator.getGamepads() directly (its bundled
// gamepad.js does). Hiding physical gamepads from that API while a session is
// active guarantees Afterleaf's forwarded inputs are the only ones the core
// sees. Afterleaf's own GamepadMonitor wraps its call in readNativeGamepads()
// so the block lets Afterleaf through while keeping EmulatorJS in the dark.

let originalNavigatorGetGamepads: (() => (Gamepad | null)[]) | undefined;
let navigatorGamepadHideDepth = 0;

/** Hides physical gamepads from navigator.getGamepads() for EmulatorJS. */
export const hideNavigatorGamepads = (): void => {
  if (navigatorGamepadHideDepth++ > 0) return;
  const getter = navigator.getGamepads?.bind(navigator);
  if (!getter) return;
  originalNavigatorGetGamepads = getter;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => (isNativeGamepadReadingAllowed() ? getter() : []),
  });
};

/** Restores navigator.getGamepads() once the last session ends. */
export const restoreNavigatorGamepads = (): void => {
  if (navigatorGamepadHideDepth === 0 || --navigatorGamepadHideDepth > 0) return;
  if (!originalNavigatorGetGamepads) return;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: originalNavigatorGetGamepads,
  });
  originalNavigatorGetGamepads = undefined;
};

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
  /**
   * Per-system player-1 controller defaults (see
   * ~/arcade/controllerMappings); forwarded to EmulatorJS verbatim.
   */
  defaultControllers?: Record<string, unknown>;
};

/**
 * Pure builder mirroring what loader.js derives from the `EJS_*` globals;
 * constructing `EmulatorJS` directly with this config keeps parallel boots
 * free of global-variable races. Volume is pinned to 1 so loudness is owned
 * by the positional audio bus rather than an extra gain stage. Local
 * storage stays disabled: Afterleaf owns all persistence, and stale EJS
 * settings could otherwise override our per-system controller defaults.
 */
export const buildEmulatorConfig = (options: ArcadeEmulatorOptions): Record<string, unknown> => ({
  system: options.core,
  gameUrl: options.romUrl,
  gameName: options.gameName,
  gameId: options.gameId,
  dataPath: EMULATORJS_DATA_URL,
  startOnLoad: true,
  noAutoFocus: true,
  disableLocalStorage: true,
  color: "#d94c3f",
  backgroundColor: "#000000",
  volume: 1,
  buttonOpts: buildEmulatorButtonOptions(),
  ...(options.defaultControllers ? {defaultControllers: options.defaultControllers} : {}),
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
    /** Native video info from the core; see EJS GameManager.getVideoDimensions. */
    getVideoDimensions?: (type: string) => number | undefined;
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

type EmulatorJsConstructor = new (elementSelector: string, config: Record<string, unknown>) => EmulatorJsInstance;

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
    script.addEventListener("load", () => {
      // Afterleaf forwards pad inputs itself; stop EmulatorJS from reading
      // the same physical gamepads and doubling inputs.
      disableEmulatorJSGamepadPolling();
      resolve();
    });
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
  /**
   * Fires when the core's audio driver was restarted and the tap moved to a
   * new AudioContext; the consumer must swap to this stream to keep
   * positional audio. Same-context re-wiring does not fire this.
   */
  onAudioStreamChange?: (stream: MediaStream) => void;
  /**
   * The app's own AudioContext (ShopAudioManager's). Everything except this
   * context is treated as emulator audio: its destination connections are
   * diverted into silent sinks so restarted drivers cannot reach speakers.
   */
  safeAudioContext?: BaseAudioContext;
};

const BOOT_TIMEOUT_MS = 150_000;
const AUDIO_TAP_TIMEOUT_MS = 15_000;
const AUDIO_TAP_POLL_MS = 100;
// Frequent enough that a restarted driver's sources sit in their silent
// divert sink for at most a fraction of a second before the watchdog
// claims them into the positional stream.
const AUDIO_WATCHDOG_INTERVAL_MS = 250;
const VIDEO_FIT_TIMEOUT_MS = 10_000;
const VIDEO_FIT_POLL_MS = 200;

let nextSlotId = 1;
// Cores define shared globals while their glue executes; keep boot phases
// mutually exclusive across sessions (see module docstring).
let bootChain = Promise.resolve();

// -- Speaker interception ----------------------------------------------------
//
// Afterleaf owns every audio path on the page, so connections targeting a
// raw AudioDestinationNode come from exactly two parties: three.js's
// AudioListener internals (on the one shared app context) and emscripten's
// OpenAL glue (on whatever context it spawns or restarts). Intercepting
// connect() and diverting every non-app destination into a per-context sink
// makes the speakers structurally unreachable for emulator audio - driver
// restarts cannot blast sound while the watchdog is on its way to claim
// them. MediaStreamAudioDestinationNode (the tap's target) extends
// AudioNode directly, so our own wiring never trips this.

/** Per-context silent sinks created for diverted connections. */
const divertSinks = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();

type AudioConnectFn = (destination: AudioNode | AudioParam, output?: number, input?: number) => AudioNode | AudioParam;

let interceptorInstalled = false;

/**
 * Installs the global connect() diversion once per page. `safeContext` is
 * the app's own AudioContext whose destination keeps working normally;
 * every other context's destination-connects land in a silent sink.
 */
const installAudioInterceptor = (safeContext: BaseAudioContext) => {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  const prototype = AudioNode.prototype as {connect: AudioConnectFn};
  const originalConnect = prototype.connect;
  prototype.connect = function (destination, output, input) {
    if (destination instanceof AudioDestinationNode && destination.context !== safeContext) {
      const context = destination.context;
      // OfflineAudioContext cannot produce realtime sound; only realtime
      // contexts are worth diverting (and only they have stream sinks).
      if (!(context instanceof AudioContext)) return originalConnect.call(this, destination, output, input);
      let sink = divertSinks.get(context);
      if (!sink) {
        sink = context.createMediaStreamDestination();
        divertSinks.set(context, sink);
      }
      return originalConnect.call(this, sink, output, input);
    }
    return originalConnect.call(this, destination, output, input);
  };
};

// Offscreen layout only feeds EmulatorJS's resize math: the canvas backing
// store follows this box times devicePixelRatio, and every texture copy the
// host does scales with it. This is just the pre-boot placeholder; once the
// core reports its native video dimensions the box is resized so the backing
// store lands at native height x presentation aspect (see fitContainer).
const CONTAINER_WIDTH_PX = 320;
const CONTAINER_HEIGHT_PX = 240;

/**
 * Boots an EmulatorJS session directly in this document. Callers own the
 * returned session and must call `destroy()` when done.
 */
export const launchEmulator = (options: EmulatorLaunchOptions): EmulatorSession => {
  if (options.safeAudioContext) installAudioInterceptor(options.safeAudioContext);
  hideNavigatorGamepads();
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
    restoreNavigatorGamepads();
    abortController.abort();
    // The GameManager "exit" hook saves SRAM, stops the core main loop,
    // unmounts its filesystems, and aborts the wasm module shortly after.
    try {
      if (emulator?.started && !emulator.failedToStart) emulator.callEvent("exit");
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
    restoreNavigatorGamepads();
    abortController.abort();
    try {
      if (emulator?.started && !emulator.failedToStart) emulator.callEvent("exit");
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
   * are disconnected from their default routing first, otherwise each sound
   * would play twice (flat + spatialized). EJS's own setVolume writes these
   * exact nodes (`currentCtx.sources[*].gain`), so its mute/volume controls
   * keep working through the tap. If OpenAL never initializes, resolving
   * undefined leaves normal speaker output intact.
   *
   * The tap is self-healing: sources can appear after the first successful
   * wiring (late driver init - a boot-time race), and a hide/resume cycle
   * can restart RetroArch's audio driver entirely. The connect() interceptor
   * guarantees those sources never reach speakers - they land in the
   * context's silent divert sink - and this watchdog claims them into the
   * positional stream, adopting that sink as the tap destination whenever
   * one already exists so there is no silent gap either.
   */
  // The tap's single MediaStreamDestination. Re-taps must rewire gains into
  // THIS node - creating a second one would orphan the stream the cabinet
  // already consumes.
  let tapDestination: MediaStreamAudioDestinationNode | undefined;
  let tapDestinationContext: AudioContext | undefined;
  let tapDelivered = false;

  /**
   * One-shot check: wire whatever AL sources currently exist into the shared
   * destination. Returns true once a tap exists in the live context.
   */
  const ensureTapWiring = (): boolean => {
    if (destroyed) return false;
    const currentCtx = emulator?.Module?.AL?.currentCtx;
    const audioCtx = currentCtx?.audioCtx;
    const gains = (currentCtx?.sources ?? [])
      .map((source) => source.gain)
      .filter((gain): gain is GainNode => Boolean(gain));
    if (!audioCtx || gains.length === 0) return false;

    if (!tapDestination || tapDestinationContext !== audioCtx) {
      // Adopt the interceptor's sink when it exists: freshly restarted
      // drivers may already be feeding it, so adopting instead of creating
      // a sibling node keeps those sources flowing without a gap.
      const adoptedSink = divertSinks.get(audioCtx);
      tapDestination = adoptedSink ?? audioCtx.createMediaStreamDestination();
      tapDestinationContext = audioCtx;
      if (!tapDelivered) {
        tapDelivered = true;
        resolveAudioStream(tapDestination.stream);
        // setVolume may have run before OpenAL existed; apply once so a
        // muted or lowered session does not come through at full blast.
        const activeEmulator = emulator;
        if (activeEmulator && !activeEmulator.muted) activeEmulator.setVolume(activeEmulator.volume);
        else if (activeEmulator) activeEmulator.setVolume(0);
      } else {
        // Whole-context swap (driver restart): same wiring, new stream.
        options.onAudioStreamChange?.(tapDestination.stream);
      }
    }
    for (const gain of gains) {
      gain.disconnect();
      gain.connect(tapDestination);
    }
    return true;
  };

  const tapAudio = async () => {
    const deadline = performance.now() + AUDIO_TAP_TIMEOUT_MS;
    for (;;) {
      if (destroyed) {
        resolveAudioStream(undefined);
        return;
      }
      if (ensureTapWiring()) return;
      if (performance.now() > deadline) {
        resolveAudioStream(undefined);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, AUDIO_TAP_POLL_MS));
    }
  };

  // Self-healing loop: claims late-created or recreated sources within a
  // second of them appearing, forever, for the life of the session.
  const audioWatchdog = setInterval(() => {
    ensureTapWiring();
  }, AUDIO_WATCHDOG_INTERVAL_MS);
  abortController.signal.addEventListener("abort", () => clearInterval(audioWatchdog), {once: true});

  /**
   * Sizes the offscreen container so the canvas backing store lands at the
   * core's native height x presentation aspect (e.g. SNES: 299x224 instead
   * of a layout-derived 480x360). Fewer bytes per texture copy and crisper
   * magnification, since upscale-to-fit then happens once on the GPU at
   * sample time. Backing store tracks element size x devicePixelRatio, so
   * the CSS box is divided back out; emscripten only re-syncs the drawing
   * buffer on window resize events, hence the synthetic dispatch.
   */
  const fitContainerToVideo = async () => {
    const getDimensions = () => {
      const manager = emulator?.gameManager;
      if (!manager?.getVideoDimensions || !manager.functions) return undefined;
      try {
        // Invoked as a method: extracting it detached `this`, and EJS's
        // implementation reads `this.functions` - unbound calls exploded.
        const width = manager.getVideoDimensions("width");
        const height = manager.getVideoDimensions("height");
        const aspect = manager.getVideoDimensions("aspect");
        if (!width || !height || !aspect) return undefined;
        return {width, height, aspect};
      } catch {
        return undefined;
      }
    };

    const deadline = performance.now() + VIDEO_FIT_TIMEOUT_MS;
    let previous = getDimensions();
    for (;;) {
      if (destroyed) return;
      await new Promise((resolve) => setTimeout(resolve, VIDEO_FIT_POLL_MS));
      // Wait until the video driver reports stable dimensions - they move
      // around during boot before settling.
      const current = getDimensions();
      if (
        current &&
        previous &&
        current.width === previous.width &&
        current.height === previous.height &&
        current.aspect === previous.aspect
      )
        break;
      previous = current;
      if (performance.now() > deadline) return; // Keep the placeholder geometry rather than guessing.
    }
    if (destroyed || !previous) return;

    const dpr = window.devicePixelRatio || 1;
    const targetHeight = Math.max(1, Math.round(previous.height));
    const targetWidth = Math.max(1, Math.round(targetHeight * previous.aspect));
    container.style.width = `${targetWidth / dpr}px`;
    container.style.height = `${targetHeight / dpr}px`;
    window.dispatchEvent(new Event("resize"));
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
      // Resizing the canvas backing store can make the core reconfigure its
      // drivers, which spawns fresh OpenAL sources wired straight to the
      // speakers - so re-tap once the video dimensions have settled. The
      // second run only reconnects nodes: audioStreamReady ignores resolves
      // after the first.
      void fitContainerToVideo().then(() => {
        if (!destroyed) void tapAudio();
      });
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
      if (!destroyed && instance.failedToStart) fail("The emulator reported a startup failure.");
    }, 250);
    abortController.signal.addEventListener("abort", () => clearInterval(failurePoll), {once: true});
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
