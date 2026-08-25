import {
  FiAlertTriangle,
  FiArrowUpRight,
  FiBookOpen,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiCommand,
  FiDownload,
  FiGrid,
  FiLock,
  FiMapPin,
  FiMenu,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiSliders,
  FiTool,
  FiTrash2,
  FiX,
} from "solid-icons/fi";
import {
  For,
  Suspense,
  createEffect,
  createResource,
  lazy,
  onCleanup,
  onMount,
  Show,
  createMemo,
  createSignal,
  on,
  untrack,
} from "solid-js";
import {
  DEFAULT_SHORTCUTS,
  detectGamepadStyle,
  formatGamepadButton,
  formatKeyboardCode,
  gamepadButtonIcon,
  GAMEPAD_BUTTON_NAMES,
  loadShortcuts,
  saveShortcuts,
  SHORTCUT_CATEGORIES,
  SHORTCUT_LABELS,
  type GamepadButtonName,
  type GamepadStyle,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutsConfig,
} from "~/game/input/bindings";
import {isEditableTarget} from "~/game/input/inputManager";
import {promptIconUrl} from "~/game/input/prompts";
import {
  formatArcadeKeyBinding,
  resolvePadMapping,
  SYSTEM_CONTROLLER_CONTROLS,
} from "~/arcade/controllerMappings";
import {ControllerDiagram} from "~/arcade/ControllerDiagram";

import {
  emptyLibrary,
  isRuntimeLibraryAvailable,
  loadRuntimeLibrary,
  type CatalogItem,
  type CatalogLanguage,
} from "~/catalog";
import {
  BrowserLibraryOperationError,
  blacklistPublication,
  fetchMorePublications,
  loadActiveLibraryJob,
  loadBlacklistedPublications,
  loadLibraryOperationStatus,
  loadLibraryProviders,
  loadLibrarySourceStatus,
  resolvePastedLibraryImport,
  scanLocalLibrary,
  loadLibraryConfig,
  reenrollLibraryRoot,
  saveLibraryConfig,
  type LocalLibraryJob,
  type LocalLibrarySnapshotResult,
} from "~/content/libraryUpdate/browserClient";
import {
  ARCADE_SYSTEMS,
  findArcadeSystem,
  type ArcadeSystemId,
} from "~/arcade/systems";
import {
  loadPadMappingOverrides,
  savePadMappingOverrides,
  resetPadMapping,
  type ArcadePadMappingOverrides,
} from "~/arcade/controllerMappings";
import {findBlacklistedTagMatches} from "~/content/libraryUpdate/tagPurge";
import {MouseSensitivityControl} from "~/components/options/MouseSensitivityControl";
import {GamepadLookSensitivityControl} from "~/components/options/GamepadLookSensitivityControl";
import {TvScreenLightingControl} from "~/components/options/TvScreenLightingControl";
import {ReadingDirectionControl} from "~/components/options/ReadingDirectionControl";
import {TagBlacklistControl} from "~/components/options/TagBlacklistControl";
import {AdditionalLocationsControl} from "~/components/locations/AdditionalLocationsControl";
import {
  bookLocationKeys,
  configLocationsChanged,
  visualMediaLocationKeys,
} from "~/components/locations/locationKinds";
import {
  loadBootFetchPreference,
  saveBootFetchPreference,
} from "~/content/libraryUpdate/bootFetchPreference";
import {
  loadLibraryFetchPreferences,
  saveLibraryFetchPreferences,
} from "~/content/libraryUpdate/fetchPreferences";
import {
  loadLibraryProviderPreference,
  saveLibraryProviderPreference,
} from "~/content/libraryUpdate/providerPreference";
import {
  MAX_LIBRARY_FETCH_LIMIT,
  MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  MIN_LIBRARY_FETCH_LIMIT,
  MIN_LIBRARY_SEARCH_PAGE_LIMIT,
} from "~/content/libraryUpdate/httpProtocol";
import {
  loadTagBlacklist,
  normalizeTag,
  saveTagBlacklist,
} from "~/content/tagBlacklistPreference";
import {
  loadControlPreferences,
  saveControlPreferences,
  type ReadingDirection,
} from "~/game/controlPreferences";
import {createEscapeScope, modalModes} from "~/game/modalModes";
import {UiModeProvider, createModeListener, useUiMode} from "~/game/uiMode";
import {loadReaderBookmarks, saveReaderBookmark} from "~/reader/bookmarks";
import type {LibraryProviderDescriptor} from "~/content/providers/types";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";
import type {ShopViewportControls} from "~/components/ShopViewport";

const ShopViewport = lazy(async () => {
  const module = await import("~/components/ShopViewport");
  return {default: module.ShopViewport};
});

type LanguageFilter = "all" | CatalogLanguage;
type LibraryOperation = "fetch-more" | "scan";
type LibraryScanMode = "quick" | "repair";
interface LibraryRepairOptions {
  redownloadProviderAssets: boolean;
  repairProviderMetadata: boolean;
}
type LibraryUpdateStage = "loading-library" | "working";
type MenuTab = "library" | "options" | "shortcuts";

const languageLabels: Record<LanguageFilter, string> = {
  all: "All",
  english: "English",
  japanese: "日本語",
};

const GamepadBindingGlyph = (props: {
  code: string;
  style: GamepadStyle | undefined;
}) => {
  const info = () => {
    if (!props.style) return undefined;
    const icon = gamepadButtonIcon(
      props.code as GamepadButtonName,
      props.style,
    );
    const url = icon ? promptIconUrl(icon) : undefined;
    return url
      ? {
          url,
          alt: formatGamepadButton(
            props.code as GamepadButtonName,
            props.style,
          ),
        }
      : undefined;
  };
  return (
    <Show when={info()} fallback={formatGamepadButton(props.code)}>
      {(resolved) => (
        <img
          src={resolved().url}
          alt={resolved().alt}
          title={resolved().alt}
          class="inline-block size-7 align-middle drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.65)]"
        />
      )}
    </Show>
  );
};

/** First connected pad id, or undefined. */
const connectedGamepadId = (): string | undefined => {
  const gamepads = navigator.getGamepads?.() ?? [];
  for (const gamepad of gamepads) if (gamepad?.connected) return gamepad.id;
  return undefined;
};

/** What a click-to-capture interaction is currently waiting for. */
type CaptureTarget =
  | {
      kind: "shortcut";
      action: ShortcutAction;
      device: ShortcutBinding["device"];
    }
  | {kind: "padControl"; systemId: ArcadeSystemId; controlId: number};

const ShortcutsPanel = (props: {
  config: ShortcutsConfig;
  onChange: (config: ShortcutsConfig) => void;
  padMappingOverrides: ArcadePadMappingOverrides;
  onPadMappingChange: (overrides: ArcadePadMappingOverrides) => void;
}) => {
  const [listening, setListening] = createSignal<CaptureTarget | undefined>();
  // Emulated system whose controller layout is being configured.
  const [selectedSystemId, setSelectedSystemId] =
    createSignal<ArcadeSystemId>("nes");
  const selectedSystem = () => findArcadeSystem(selectedSystemId());
  // Detected controller family for pad glyph display; undefined while no pad
  // has been seen yet.
  const [padStyle, setPadStyle] = createSignal<GamepadStyle | undefined>();

  /** Fully-resolved pad mapping (defaults + overrides) for a system. */
  const resolvedPadMapping = (systemId: ArcadeSystemId) =>
    resolvePadMapping(systemId, props.padMappingOverrides);

  /** Standard-gamepad button bound to a console control, if any. */
  const buttonForControl = (
    systemId: ArcadeSystemId,
    controlId: number,
  ): GamepadButtonName | undefined =>
    GAMEPAD_BUTTON_NAMES.find(
      (button) => resolvedPadMapping(systemId)[button] === controlId,
    );

  /** Console control currently waiting for a pad press, if any. */
  const capturingControlId = () => {
    const current = listening();
    return current?.kind === "padControl" ? current.controlId : undefined;
  };

  /**
   * Binds one gamepad button to a console control. Overrides store the
   * complete per-system mapping so unsetting stays expressible; any other
   * button previously bound to the control is released first.
   */
  const setPadBinding = (
    systemId: ArcadeSystemId,
    controlId: number,
    button: GamepadButtonName,
  ) => {
    const mapping = {...resolvedPadMapping(systemId)};
    for (const name of GAMEPAD_BUTTON_NAMES)
      if (mapping[name] === controlId) delete mapping[name];
    mapping[button] = controlId;
    props.onPadMappingChange({
      ...props.padMappingOverrides,
      [systemId]: mapping,
    });
    setListening(undefined);
  };

  const resetSystemPadMapping = (systemId: ArcadeSystemId) =>
    props.onPadMappingChange(
      resetPadMapping(props.padMappingOverrides, systemId),
    );

  const updateBinding = (
    action: ShortcutAction,
    device: ShortcutBinding["device"],
    code: string,
  ) => {
    // Keyboard codes are stored verbatim; gamepad codes arrive already
    // resolved to standard-mapping button names by the capture loops.
    const binding: ShortcutBinding =
      device === "keyboard"
        ? {device, code}
        : {device, code: code as GamepadButtonName};
    const next: ShortcutsConfig = {...props.config};
    const existing = next[action];
    const others = existing.filter((item) => item.device !== device);
    next[action] = [...others, binding];
    props.onChange(next);
    setListening(undefined);
  };

  const resetToDefaults = () => props.onChange({...DEFAULT_SHORTCUTS});

  onMount(() => {
    const abortController = new AbortController();
    window.addEventListener(
      "keydown",
      (event) => {
        const current = listening();
        if (!current) return;
        // Escape cancels capture rather than binding the modal key.
        if (event.code === "Escape") {
          setListening(undefined);
          return;
        }
        if (current.kind !== "shortcut" || current.device !== "keyboard")
          return;
        event.preventDefault();
        updateBinding(current.action, "keyboard", event.code);
      },
      {signal: abortController.signal},
    );
    // Track the connected controller family so bindings render with its
    // native button glyphs. Light polling is plenty for a menu screen.
    const styleInterval = setInterval(() => {
      const id = connectedGamepadId();
      setPadStyle(id ? detectGamepadStyle(id) : undefined);
    }, 500);
    onCleanup(() => {
      abortController.abort();
      clearInterval(styleInterval);
    });
  });

  // Capture a gamepad button while any pad capture is active (shortcut
  // bindings or emulator controller mappings); the poll loop lives exactly
  // as long as the capture request.
  createEffect(() => {
    const target = listening();
    if (!target) return;
    if (target.kind === "shortcut" && target.device !== "gamepad") return;
    let frameHandle: number | undefined;
    let previousButtons: boolean[] | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
    };
    const poll = () => {
      if (stopped) return;
      frameHandle = requestAnimationFrame(poll);
      const current = listening();
      if (!current) return;
      if (current.kind === "shortcut" && current.device !== "gamepad") return;
      const gamepads = navigator.getGamepads?.() ?? [];
      for (const gamepad of gamepads) {
        if (!gamepad?.connected || gamepad.buttons.length === 0) continue;
        const pressed = Array.from(gamepad.buttons, (button) =>
          Boolean(button?.pressed || (button?.value ?? 0) > 0.5),
        );
        // The first frame only records a baseline so a held button from
        // before the click is not mistaken for a fresh press.
        if (previousButtons !== undefined) {
          for (let index = 0; index < pressed.length; index++) {
            if (!pressed[index] || previousButtons[index]) continue;
            stop();
            const name = GAMEPAD_BUTTON_NAMES[index];
            if (name === undefined) {
              // Non-standard button beyond the mapping: keep listening.
              previousButtons = pressed;
              frameHandle = requestAnimationFrame(poll);
              return;
            }
            if (current.kind === "padControl")
              setPadBinding(current.systemId, current.controlId, name);
            else updateBinding(current.action, "gamepad", name);
            return;
          }
        }
        previousButtons = pressed;
        break;
      }
    };
    frameHandle = requestAnimationFrame(poll);
    onCleanup(stop);
  });

  return (
    <section class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9 xl:col-span-2">
      <div class="mx-auto max-w-4xl">
        <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
          Controls
        </p>
        <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
          Shortcuts
        </h2>
        <p class="mt-2 max-w-xl text-xs leading-5 text-[#6e7974]">
          Click any binding to remap it. Keyboard codes are physical keys; press
          Escape while capturing to cancel.
        </p>

        <div class="mt-8 flex items-center justify-between gap-4">
          <span class="text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
            Action
          </span>
          <div class="flex items-center gap-2">
            <span class="min-w-[4.5rem] text-center text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
              Keyboard
            </span>
            <span
              class="min-w-[4.5rem] text-center text-sm"
              title={padStyle() ? `${padStyle()} controller` : "Controller"}
            >
              🎮
            </span>
          </div>
        </div>
        <For each={Object.values(SHORTCUT_CATEGORIES)}>
          {(category) => (
            <div class="mt-8">
              <p class="mb-3 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                {category.label}
              </p>
              <div class="space-y-2">
                <For each={category.actions}>
                  {(action) => {
                    const keyboard = () =>
                      props.config[action].find(
                        (binding) => binding.device === "keyboard",
                      );
                    const gamepad = () =>
                      props.config[action].find(
                        (binding) => binding.device === "gamepad",
                      );
                    const isListening = (device: ShortcutBinding["device"]) => {
                      const current = listening();
                      return (
                        current?.kind === "shortcut" &&
                        current.action === action &&
                        current.device === device
                      );
                    };

                    return (
                      <div class="flex items-center justify-between gap-4 border border-white/8 bg-[#151e1c] px-4 py-3">
                        <span class="text-xs text-[#b8c1bc]">
                          {SHORTCUT_LABELS[action]}
                        </span>
                        <div class="flex items-center gap-2">
                          <button
                            class="flex h-9 min-w-[4.5rem] items-center justify-center border border-white/10 bg-[#121918] px-2.5 text-center text-[10px] font-semibold tracking-wider text-[#e2ded4] uppercase transition hover:border-[#d94c3f]/40 hover:text-white"
                            classList={{
                              "animate-pulse border-[#d94c3f]/60 text-[#d94c3f]":
                                isListening("keyboard"),
                            }}
                            onClick={() =>
                              setListening(
                                isListening("keyboard")
                                  ? undefined
                                  : {
                                      kind: "shortcut",
                                      action,
                                      device: "keyboard",
                                    },
                              )
                            }
                            type="button"
                          >
                            <Show when={keyboard()} fallback={"—" as string}>
                              {(binding) => formatKeyboardCode(binding().code)}
                            </Show>
                          </button>
                          <button
                            class="flex h-9 min-w-[4.5rem] items-center justify-center border border-white/10 bg-[#121918] px-2.5 text-center text-[10px] font-semibold tracking-wider text-[#e2ded4] uppercase transition hover:border-[#d94c3f]/40 hover:text-white"
                            classList={{
                              "animate-pulse border-[#d94c3f]/60 text-[#d94c3f]":
                                isListening("gamepad"),
                            }}
                            onClick={() =>
                              setListening(
                                isListening("gamepad")
                                  ? undefined
                                  : {
                                      kind: "shortcut",
                                      action,
                                      device: "gamepad",
                                    },
                              )
                            }
                            type="button"
                          >
                            <Show when={gamepad()} fallback={"—" as string}>
                              {(binding) => (
                                <GamepadBindingGlyph
                                  code={binding().code}
                                  style={padStyle()}
                                />
                              )}
                            </Show>
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>

        <div class="mt-10">
          <p class="mb-3 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
            Emulator controllers
          </p>
          <p class="mb-4 max-w-xl text-xs leading-5 text-[#6e7974]">
            Map your controller to each retro system. Click a console button
            below, then press the controller button you want to use for it.
          </p>
          <div class="border border-white/8 bg-[#151e1c] p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-3">
              <select
                class="h-8 border border-white/10 bg-[#0c1312] px-2 text-xs text-[#e2ded4] [color-scheme:dark]"
                value={selectedSystemId()}
                onChange={(event) =>
                  setSelectedSystemId(
                    event.currentTarget.value as ArcadeSystemId,
                  )
                }
              >
                <For each={ARCADE_SYSTEMS}>
                  {(system) => (
                    <option
                      value={system.id}
                      class="bg-[#1b2422] text-[#f0ecdf]"
                    >
                      {system.label}
                    </option>
                  )}
                </For>
              </select>
              <button
                class="ml-auto border border-white/10 bg-[#121918] px-3 py-2 text-[9px] font-semibold tracking-[0.12em] text-[#8a958f] uppercase transition hover:border-[#d94c3f]/40 hover:text-white"
                type="button"
                onClick={() => resetSystemPadMapping(selectedSystemId())}
              >
                Reset {findArcadeSystem(selectedSystemId())?.shortLabel ?? ""}
              </button>
            </div>

            <Show when={selectedSystem()}>
              {(system) => (
                <div class="mt-5 flex flex-col gap-6 xl:flex-row xl:items-start">
                  <ControllerDiagram
                    controls={() => SYSTEM_CONTROLLER_CONTROLS[system().id]}
                    mappedIds={() =>
                      new Set(Object.values(resolvedPadMapping(system().id)))
                    }
                    capturingControlId={capturingControlId}
                    onSelect={(controlId) =>
                      setListening(
                        // Clicking the capturing shape again cancels.
                        capturingControlId() === controlId
                          ? undefined
                          : {
                              kind: "padControl",
                              systemId: system().id,
                              controlId,
                            },
                      )
                    }
                  />
                  <div class="min-w-0 flex-1 space-y-2">
                    <For each={SYSTEM_CONTROLLER_CONTROLS[system().id]}>
                      {(control) => {
                        const boundButton = () =>
                          buttonForControl(system().id, control.id);
                        const isCapturing = () => {
                          const current = listening();
                          return (
                            current?.kind === "padControl" &&
                            current.controlId === control.id
                          );
                        };
                        return (
                          <div class="flex items-center justify-between gap-3 border border-white/8 bg-[#121918] px-3 py-2">
                            <span class="text-xs text-[#b8c1bc]">
                              {control.label}
                            </span>
                            <span
                              class="font-mono text-[10px] tracking-wider text-[#59645f]"
                              title="Default keyboard binding"
                            >
                              {formatArcadeKeyBinding(control.keyboard)}
                            </span>
                            <button
                              class="flex h-9 min-w-[4.5rem] items-center justify-center border border-white/10 bg-[#151e1c] px-2.5 text-center transition hover:border-[#d94c3f]/40"
                              classList={{
                                "animate-pulse border-[#d94c3f]/60":
                                  isCapturing(),
                              }}
                              title="Click, then press a controller button"
                              type="button"
                              onClick={() =>
                                setListening(
                                  isCapturing()
                                    ? undefined
                                    : {
                                        kind: "padControl",
                                        systemId: system().id,
                                        controlId: control.id,
                                      },
                                )
                              }
                            >
                              <Show
                                when={boundButton()}
                                fallback={
                                  <span class="text-[10px] font-semibold tracking-wider text-[#59645f] uppercase">
                                    —
                                  </span>
                                }
                              >
                                {(button) => (
                                  <GamepadBindingGlyph
                                    code={button()}
                                    style={padStyle()}
                                  />
                                )}
                              </Show>
                            </button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </Show>
            <p class="mt-4 text-[10px] leading-4 tracking-[0.04em] text-[#59645f]">
              The left stick also acts as the d-pad. Keyboard bindings for the
              emulators stay on their defaults shown above.
            </p>
          </div>
        </div>

        <p class="mt-6 text-[10px] tracking-[0.08em] text-[#59645f] uppercase">
          {(() => {
            const current = listening();
            if (!current) return undefined;
            if (current.kind === "padControl")
              return "Press any controller button to bind it";
            if (current.device === "gamepad")
              return padStyle() !== undefined
                ? "Press any controller button to bind it"
                : "Waiting for a controller — press any button on it once, then press the button you want to bind";
            return "Press any key to bind it · Escape cancels";
          })()}
        </p>

        <div class="mt-8 flex justify-end">
          <button
            class="border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#df776e] uppercase transition hover:border-[#d94c3f]/60 hover:bg-[#d94c3f]/20 hover:text-[#f3a098]"
            type="button"
            onClick={resetToDefaults}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </section>
  );
};

const OptionsPanel = (props: {
  availableTags: readonly string[];
  libraryConfig: AfterleafLibraryConfig;
  onLibraryConfigChange: (config: AfterleafLibraryConfig) => void;
  onReenrollLibraryRoot: (path: string) => Promise<void>;
  reenrollableBookPaths: ReadonlySet<string>;
  blacklistedTags: readonly string[];
  defaultReadingDirection: ReadingDirection;
  gamepadLookSensitivity: number;
  mouseSensitivity: number;
  onBlacklistedTagsChange: (tags: readonly string[]) => void;
  onDefaultReadingDirectionChange: (value: ReadingDirection) => void;
  onGamepadLookSensitivityChange: (value: number) => void;
  onMouseSensitivityChange: (value: number) => void;
  onPurgeBlacklistedWorks: () => void;
  onRespectBookReadingDirectionChange: (value: boolean) => void;
  onTvScreenLightingChange: (value: boolean) => void;
  onUnstuck: () => void;
  purgeDisabled: boolean;
  purgeWorkCount: number;
  respectBookReadingDirection: boolean;
  tvScreenLighting: boolean;
}) => (
  <section class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9 xl:col-span-2">
    <div class="mx-auto max-w-4xl">
      <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
        Shop preferences
      </p>
      <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
        Options
      </h2>
      <p class="mt-2 max-w-xl text-xs leading-5 text-[#6e7974]">
        Tune first-person controls, book handling, and which publications enter
        your shop.
      </p>

      <div class="mt-8 space-y-3">
        <MouseSensitivityControl
          value={props.mouseSensitivity}
          onChange={props.onMouseSensitivityChange}
        />
        <GamepadLookSensitivityControl
          value={props.gamepadLookSensitivity}
          onChange={props.onGamepadLookSensitivityChange}
        />
        <TvScreenLightingControl
          enabled={props.tvScreenLighting}
          onChange={props.onTvScreenLightingChange}
        />
        <ReadingDirectionControl
          defaultDirection={props.defaultReadingDirection}
          onDefaultDirectionChange={props.onDefaultReadingDirectionChange}
          onRespectMetadataChange={props.onRespectBookReadingDirectionChange}
          respectMetadata={props.respectBookReadingDirection}
        />
        <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
            <FiMapPin size={15} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
              Player recovery
            </p>
            <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
              Teleport back to the first-floor entrance if you become stuck.
            </p>
          </div>
          <button
            class="shrink-0 border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#df776e] uppercase transition hover:border-[#d94c3f]/60 hover:bg-[#d94c3f]/20 hover:text-[#f3a098]"
            type="button"
            onClick={() => props.onUnstuck()}
          >
            Unstuck
          </button>
        </div>
        <AdditionalLocationsControl
          config={props.libraryConfig}
          onChange={props.onLibraryConfigChange}
          onReenroll={props.onReenrollLibraryRoot}
          reenrollableBookPaths={props.reenrollableBookPaths}
        />
        <TagBlacklistControl
          availableTags={props.availableTags}
          blacklistedTags={props.blacklistedTags}
          onChange={props.onBlacklistedTagsChange}
          onPurge={props.onPurgeBlacklistedWorks}
          purgeDisabled={props.purgeDisabled}
          purgeWorkCount={props.purgeWorkCount}
        />
      </div>
    </div>
  </section>
);

const PurgeBlacklistedWorksDialog = (props: {
  blacklistedTags: readonly string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  workCount: number;
}) => (
  <div
    class="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="purge-blacklisted-title"
    onClick={() => {
      if (!props.busy) props.onCancel();
    }}
  >
    <div
      class="w-full max-w-md border border-[#d94c3f]/35 bg-[#151d1b] p-6 shadow-[0_30px_100px_#000] sm:p-8"
      onClick={(event) => event.stopPropagation()}
    >
      <div class="flex items-start gap-4">
        <span class="grid size-11 shrink-0 place-items-center border border-[#d94c3f]/35 bg-[#d94c3f]/10 text-[#e16458]">
          <FiTrash2 size={17} />
        </span>
        <div>
          <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">
            Destructive action
          </p>
          <h2
            id="purge-blacklisted-title"
            class="mt-2 font-serif text-2xl text-[#f0ebdf]"
          >
            Purge blacklisted works?
          </h2>
        </div>
      </div>

      <p class="mt-5 text-xs leading-5 text-[#929e99]">
        This will remove {props.workCount} catalogued{" "}
        {props.workCount === 1 ? "work" : "works"} matching any blacklisted tag,
        discard their managed source files, and rebuild the local library.
      </p>
      <div class="mt-4 flex flex-wrap gap-2" aria-label="Tags to purge">
        <For each={props.blacklistedTags}>
          {(tag) => (
            <span class="bg-[#251d1c] px-2.5 py-1.5 text-[9px] text-[#d9aaa5]">
              {tag}
            </span>
          )}
        </For>
      </div>
      <p class="mt-5 border border-[#d94c3f]/25 bg-[#d94c3f]/8 p-3 text-[10px] leading-4 text-[#d9aaa5]">
        This cannot be undone. Confirm only if you want these works removed from
        this library.
      </p>

      <div class="mt-7 flex justify-end gap-3">
        <button
          class="border border-white/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#9da7a2] uppercase transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-40"
          disabled={props.busy}
          type="button"
          onClick={() => props.onCancel()}
        >
          Cancel
        </button>
        <button
          class="flex items-center gap-2 bg-[#d94c3f] px-4 py-2.5 text-[10px] font-bold tracking-[0.12em] text-white uppercase transition hover:bg-[#e45a4e] disabled:cursor-wait disabled:opacity-50"
          disabled={props.busy}
          type="button"
          onClick={() => props.onConfirm()}
        >
          <FiTrash2 size={12} />
          {props.busy
            ? "Purging…"
            : `Purge ${props.workCount} ${props.workCount === 1 ? "work" : "works"}`}
        </button>
      </div>
    </div>
  </div>
);

const AdultGate = (props: {onEnter: () => void}) => (
  <div class="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#111716] p-5 text-[#eee8d9]">
    <div class="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_50%_15%,#819895_0,transparent_30%),linear-gradient(115deg,transparent_0_49%,#ffffff08_50%,transparent_51%)]" />
    <div class="gate-card relative w-full max-w-[460px] border border-white/12 bg-[#18201f]/95 px-7 py-8 shadow-2xl sm:px-10 sm:py-10">
      <div class="mb-10 flex items-start justify-between">
        <div>
          <p class="font-serif text-3xl tracking-[-0.04em]">Afterleaf</p>
          <p class="mt-1 text-[10px] font-semibold tracking-[0.25em] text-[#b8aaa0] uppercase">
            After-hours library
          </p>
        </div>
        <span class="grid size-11 place-items-center rounded-full border border-[#cf4a3c]/45 bg-[#cf4a3c]/10 text-sm font-semibold text-[#ef796b]">
          18+
        </span>
      </div>

      <p class="font-serif text-[2rem] leading-[1.08] tracking-[-0.035em] text-[#f5f0e5]">
        The shop is closed.
        <br />
        Your library awaits.
      </p>
      <p class="mt-5 max-w-sm text-sm leading-6 text-[#aeb9b4]">
        This library contains adult-only publications. Confirm that you are of
        legal age in your region to continue.
      </p>

      <button
        class="mt-9 flex w-full items-center justify-between bg-[#d94c3f] px-5 py-4 text-left text-sm font-bold text-white shadow-[0_10px_35px_#d94c3f33] transition hover:bg-[#e45a4d]"
        onClick={() => props.onEnter?.()}
      >
        <span class="flex items-center gap-3">
          <FiLock size={16} /> I’m 18 or older
        </span>
        <FiChevronRight size={18} />
      </button>
      <p class="mt-5 flex items-center gap-2 text-[11px] leading-4 text-[#75827d]">
        <FiShield size={14} /> Age confirmation stays in this browser session.
      </p>
    </div>
  </div>
);

const LibraryRepairDialog = (props: {
  onCancel: () => void;
  onConfirm: (options: LibraryRepairOptions) => void;
}) => {
  const [repairProviderMetadata, setRepairProviderMetadata] =
    createSignal(false);
  const [redownloadProviderAssets, setRedownloadProviderAssets] =
    createSignal(false);
  return (
    <div
      class="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deep-repair-title"
      onClick={() => props.onCancel()}
    >
      <div
        class="w-full max-w-lg border border-white/12 bg-[#151d1b] p-6 shadow-[0_30px_100px_#000] sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="flex items-start gap-4">
          <span class="grid size-11 shrink-0 place-items-center border border-[#d55247]/35 bg-[#d55247]/10 text-[#e16458]">
            <FiTool size={17} />
          </span>
          <div>
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">
              Library maintenance
            </p>
            <h2
              id="deep-repair-title"
              class="mt-2 font-serif text-2xl text-[#f0ebdf]"
            >
              Deep scan and repair
            </h2>
          </div>
        </div>

        <p class="mt-5 text-xs leading-5 text-[#929e99]">
          Every local publication and generated asset will be validated and
          rebuilt. This takes longer than Scan new but does not contact online
          providers unless you select an option below.
        </p>

        <div class="mt-5 space-y-3">
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={repairProviderMetadata()}
              onInput={(event) =>
                setRepairProviderMetadata(event.currentTarget.checked)
              }
            />
            <span>
              <span class="block font-semibold text-[#d6dcd8]">
                Update older provider metadata
              </span>
              <span class="mt-1 block text-[10px] leading-4 text-[#707c77]">
                Upgrade cached books that need current metadata. This may
                download a few representative pages, but it does not search for
                new books.
              </span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={redownloadProviderAssets()}
              onInput={(event) =>
                setRedownloadProviderAssets(event.currentTarget.checked)
              }
            />
            <span>
              <span class="block font-semibold text-[#d6dcd8]">
                Re-download cached provider images
              </span>
              <span class="mt-1 block text-[10px] leading-4 text-[#707c77]">
                Refresh preview and back-cover images for every cached remote
                book. Use this only when those images appear damaged or
                incomplete.
              </span>
            </span>
          </label>
        </div>

        <div class="mt-7 flex justify-end gap-3">
          <button
            class="border border-white/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#9da7a2] uppercase transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            type="button"
            onClick={() => props.onCancel()}
          >
            Cancel
          </button>
          <button
            class="flex items-center gap-2 bg-[#d94c3f] px-4 py-2.5 text-[10px] font-bold tracking-[0.12em] text-white uppercase transition hover:bg-[#e45a4e]"
            type="button"
            onClick={() =>
              props.onConfirm({
                redownloadProviderAssets: redownloadProviderAssets(),
                repairProviderMetadata: repairProviderMetadata(),
              })
            }
          >
            <FiTool size={12} />
            Start deep repair
          </button>
        </div>
      </div>
    </div>
  );
};

const LibraryUpdateDialog = (props: {
  busy: boolean;
  fetchOnBoot: boolean;
  fetchLimit: number;
  maxSearchPages: number;
  providerId: string;
  providers: readonly LibraryProviderDescriptor[];
  providerError?: string | undefined;
  onCancel: () => void;
  onConfirm: (
    fetchOnBoot: boolean,
    providerId: string,
    query: string,
    fetchLimit: number,
    maxSearchPages: number,
  ) => void;
  onFetchOnBootChange: (enabled: boolean) => void;
  onProviderChange: (providerId: string) => void;
}) => {
  const provider = () =>
    props.providers.find((candidate) => candidate.id === props.providerId);
  const [query, setQuery] = createSignal(
    untrack(() => provider()?.defaultQuery ?? ""),
  );
  const [fetchLimit, setFetchLimit] = createSignal(
    untrack(() => props.fetchLimit),
  );
  const [maxSearchPages, setMaxSearchPages] = createSignal(
    untrack(() => props.maxSearchPages),
  );
  const fetchLimitIsValid = () =>
    Number.isSafeInteger(fetchLimit()) &&
    fetchLimit() >= MIN_LIBRARY_FETCH_LIMIT &&
    fetchLimit() <= MAX_LIBRARY_FETCH_LIMIT;
  const searchPageLimitIsValid = () =>
    Number.isSafeInteger(maxSearchPages()) &&
    maxSearchPages() >= MIN_LIBRARY_SEARCH_PAGE_LIMIT &&
    maxSearchPages() <= MAX_LIBRARY_SEARCH_PAGE_LIMIT;
  createEffect(
    on(
      () => [props.providerId, props.providers] as const,
      () => setQuery(provider()?.defaultQuery ?? ""),
    ),
  );
  const canUpdate = () =>
    Boolean(provider()) &&
    fetchLimitIsValid() &&
    searchPageLimitIsValid() &&
    !props.busy;

  return (
    <div
      class="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Fetch more publications"
    >
      <div class="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-white/12 bg-[#151d1b] p-6 shadow-[0_30px_100px_#000] sm:p-8">
        <div class="flex items-start justify-between gap-5">
          <div>
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">
              Provider acquisition
            </p>
            <h2 class="mt-2 font-serif text-2xl text-[#f0ebdf]">
              Fetch more stock
            </h2>
          </div>
          <span class="grid size-10 shrink-0 place-items-center border border-[#d55247]/35 bg-[#d55247]/10 text-[#e16458]">
            <FiRefreshCw size={16} />
          </span>
        </div>
        <p class="mt-5 text-xs leading-5 text-[#929e99]">
          {provider()?.summary ?? "Choose a provider to fetch local stock."}{" "}
          This downloads a small preview and lazily caches later pages as you
          read.
        </p>

        <div class="mt-6 space-y-3">
          <Show when={props.providerError}>
            {(message) => (
              <p class="border border-[#d55247]/35 bg-[#d55247]/10 p-4 text-[10px] leading-4 text-[#df8a82]">
                {message()}
              </p>
            )}
          </Show>
          <Show when={props.providers.length > 1}>
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Source provider
              </span>
              <select
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                value={props.providerId}
                disabled={props.busy}
                onChange={(event) =>
                  props.onProviderChange(event.currentTarget.value)
                }
              >
                <For each={props.providers}>
                  {(candidate) => (
                    <option value={candidate.id}>
                      {candidate.name} · {candidate.summary}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
          <div class="border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <label>
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                {provider()?.queryLabel ?? "Search"}
              </span>
              <input
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none placeholder:text-[#53605b] focus:border-[#d55247]/70"
                value={query()}
                maxlength={100}
                placeholder={provider()?.queryPlaceholder ?? "Search"}
                disabled={props.busy}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
                {provider()?.queryHelp}
              </span>
            </label>
            <Show when={provider()?.queryGuide}>
              {(guide) => (
                <details class="group mt-3 border-t border-white/8 pt-3">
                  <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[9px] font-bold tracking-[0.16em] text-[#8e9b96] uppercase transition hover:text-[#d5d9d6]">
                    <span>{provider()?.name} search syntax</span>
                    <span class="text-[#d55247] group-open:hidden">Show</span>
                    <span class="hidden text-[#d55247] group-open:inline">
                      Hide
                    </span>
                  </summary>
                  <div class="pt-4">
                    <p class="text-[10px] leading-4 text-[#77837e]">
                      {guide().introduction}
                    </p>
                    <div class="mt-4">
                      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)] gap-x-3 gap-y-2 text-[10px]">
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">
                          Filter
                        </span>
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">
                          Include
                        </span>
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">
                          Exclude
                        </span>
                        <For each={guide().entries}>
                          {(entry) => (
                            <>
                              <span class="text-[#919c97]">
                                {entry.description}
                              </span>
                              <code class="break-words text-[#d7d1c6]">
                                {entry.expression}
                              </code>
                              <code class="break-words text-[#c7837c]">
                                {entry.exclusion}
                              </code>
                            </>
                          )}
                        </For>
                      </div>
                    </div>
                    <Show when={guide().examples.length > 0}>
                      <div class="mt-4 border-t border-white/8 pt-4">
                        <p class="text-[9px] font-bold tracking-[0.12em] text-[#68746f] uppercase">
                          Examples
                        </p>
                        <div class="mt-2 flex flex-col gap-1.5">
                          <For each={guide().examples}>
                            {(example) => (
                              <code class="bg-[#0c1312] px-2.5 py-2 text-[10px] break-words text-[#bfc8c3]">
                                {example}
                              </code>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </details>
              )}
            </Show>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Books per fetch
              </span>
              <input
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                type="number"
                min={MIN_LIBRARY_FETCH_LIMIT}
                max={MAX_LIBRARY_FETCH_LIMIT}
                step="1"
                value={fetchLimit()}
                disabled={props.busy}
                onInput={(event) =>
                  setFetchLimit(Number(event.currentTarget.value))
                }
              />
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
                Maximum unseen publications to acquire this run.
              </span>
            </label>
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Search result pages
              </span>
              <input
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                type="number"
                min={MIN_LIBRARY_SEARCH_PAGE_LIMIT}
                max={MAX_LIBRARY_SEARCH_PAGE_LIMIT}
                step="1"
                value={maxSearchPages()}
                disabled={props.busy}
                onInput={(event) =>
                  setMaxSearchPages(Number(event.currentTarget.value))
                }
              />
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
                Maximum provider result pages to search for unseen matches.
              </span>
            </label>
          </div>
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={props.fetchOnBoot}
              onInput={(event) =>
                props.onFetchOnBootChange(event.currentTarget.checked)
              }
            />
            <span>
              Try to fetch more unique stock whenever Afterleaf boots. This
              choice is remembered on this device and can be disabled here.
            </span>
          </label>
        </div>

        <div class="mt-7 flex justify-end gap-2">
          <button
            class="h-10 border border-white/10 px-4 text-[10px] font-semibold tracking-[0.1em] text-[#909a95] uppercase hover:border-white/20 hover:text-white disabled:opacity-40"
            disabled={props.busy}
            onClick={() => props.onCancel?.()}
          >
            Cancel
          </button>
          <button
            class="flex h-10 items-center gap-2 bg-[#d94c3f] px-4 text-[10px] font-bold tracking-[0.1em] text-white uppercase hover:bg-[#e45a4d] disabled:cursor-not-allowed disabled:bg-[#493331] disabled:text-[#86716e]"
            disabled={!canUpdate()}
            onClick={() =>
              props.onConfirm?.(
                props.fetchOnBoot,
                props.providerId,
                query().trim(),
                fetchLimit(),
                maxSearchPages(),
              )
            }
          >
            <FiRefreshCw classList={{"animate-spin": props.busy}} size={13} />
            {props.busy ? "Fetching stock…" : "Fetch more"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LibraryActivityToast = (props: {
  busy: boolean;
  completedSteps: number;
  elapsedSeconds: number;
  failed: boolean;
  notice?: string | undefined;
  status: string;
  subProgress?: {completed: number; total: number} | undefined;
  totalSteps: number;
  onDismiss: () => void;
}) => {
  // Fractional progress within the current step (when reported) keeps the
  // bar advancing during long single-step phases such as provider syncs.
  const progressPercent = () => {
    const subFraction = props.subProgress
      ? Math.min(
          1,
          Math.max(0, props.subProgress.completed / props.subProgress.total),
        )
      : 0;
    return Math.min(
      100,
      ((props.completedSteps + subFraction) / Math.max(1, props.totalSteps)) *
        100,
    );
  };
  return (
    <Show when={props.busy || props.notice}>
      <aside
        class="fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] border border-white/12 bg-[#101716]/95 p-4 shadow-[0_20px_70px_#000b] backdrop-blur-md"
        aria-live="polite"
        aria-atomic="false"
      >
        <Show
          when={props.busy}
          fallback={
            <div class="flex items-start gap-3">
              <span
                class="grid size-8 shrink-0 place-items-center"
                classList={{
                  "bg-[#6da089]/12 text-[#83b69f]": !props.failed,
                  "bg-[#d94c3f]/12 text-[#e16357]": props.failed,
                }}
              >
                <Show when={props.failed} fallback={<FiCheck size={14} />}>
                  <FiX size={14} />
                </Show>
              </span>
              <div class="min-w-0 flex-1">
                <p
                  class="text-[9px] font-bold tracking-[0.16em] uppercase"
                  classList={{
                    "text-[#799c8d]": !props.failed,
                    "text-[#d66a60]": props.failed,
                  }}
                >
                  Library update
                </p>
                <p class="mt-1 text-[11px] leading-5 text-[#c2cbc6]">
                  {props.notice}
                </p>
              </div>
              <button
                class="grid size-7 shrink-0 place-items-center text-[#68736e] hover:bg-white/5 hover:text-white"
                aria-label="Dismiss library update"
                onClick={() => props.onDismiss()}
              >
                <FiX size={13} />
              </button>
            </div>
          }
        >
          <div class="flex items-start gap-3">
            <span class="grid size-8 shrink-0 place-items-center bg-[#d94c3f]/12 text-[#e16357]">
              <FiRefreshCw class="animate-spin" size={14} />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[9px] font-bold tracking-[0.16em] text-[#d66a60] uppercase">
                  Background library job
                </p>
                <span
                  class="text-[9px] text-[#69746f] tabular-nums"
                  aria-hidden="true"
                >
                  {Math.round(progressPercent())}% · {props.elapsedSeconds}s
                </span>
              </div>
              <p class="mt-1 text-[11px] leading-5 text-[#c2cbc6]">
                {props.status}
              </p>
              <p class="mt-1 text-[9px] text-[#66716d]">
                Keep shelving—the shop will update when stock is ready.
              </p>
            </div>
          </div>
          <div class="mt-3 h-0.5 overflow-hidden bg-white/6">
            <div
              class="h-full bg-[#d94c3f]/75 transition-[width] duration-300"
              style={{width: `${Math.max(8, progressPercent())}%`}}
            />
          </div>
        </Show>
      </aside>
    </Show>
  );
};

const LibraryCard = (props: {
  item: CatalogItem;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    class="group min-w-0 cursor-pointer text-left outline-none"
    aria-pressed={props.active}
    onClick={() => props.onSelect?.()}
  >
    <div
      class="cover-frame relative aspect-[2/3] overflow-hidden bg-[#252b2b] shadow-[0_13px_21px_#02050475] transition duration-300 group-hover:-translate-y-2 group-hover:rotate-[0.4deg] group-hover:shadow-[0_20px_28px_#02050490] group-focus-visible:ring-2 group-focus-visible:ring-[#e85649]"
      classList={{
        "ring-2 ring-[#e85649] ring-offset-4 ring-offset-[#121918]":
          props.active,
      }}
    >
      <img
        class="size-full object-cover"
        src={props.item.cover}
        alt={`${props.item.title} cover`}
        loading="lazy"
      />
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 via-black/10 to-transparent p-3 pt-12 opacity-0 transition group-hover:opacity-100">
        <span class="text-[10px] font-bold tracking-[0.15em] text-white uppercase">
          Inspect
        </span>
        <FiArrowUpRight class="text-white" size={15} />
      </div>
    </div>
    <div class="px-1 pt-3">
      <div class="flex items-start justify-between gap-2">
        <p class="truncate text-[13px] font-semibold text-[#e5e1d8]">
          {props.item.title}
        </p>
        <span class="mt-0.5 shrink-0 text-[10px] text-[#737d79] tabular-nums">
          #{props.item.issue.toString().padStart(2, "0")}
        </span>
      </div>
      <p class="mt-1 truncate text-[10px] tracking-[0.1em] text-[#78827f] uppercase">
        {props.item.collection}
      </p>
    </div>
  </button>
);

const DetailPanel = (props: {
  item: CatalogItem;
  onClose: () => void;
  onInspect: () => void;
}) => (
  <aside class="detail-panel relative flex h-full min-h-[560px] flex-col overflow-hidden border-l border-white/8 bg-[#151c1b] xl:min-h-0">
    <div
      class="absolute inset-x-0 top-0 h-52 opacity-20 blur-2xl"
      style={{
        background: `radial-gradient(circle at 50% 0%, ${props.item.accent}, transparent 68%)`,
      }}
    />
    <div class="relative flex items-center justify-between border-b border-white/8 px-6 py-5">
      <p class="text-[10px] font-semibold tracking-[0.2em] text-[#77817d] uppercase">
        Selected publication
      </p>
      <button
        class="grid size-8 place-items-center text-[#7f8985] transition hover:bg-white/5 hover:text-white"
        aria-label="Close details"
        onClick={() => props.onClose?.()}
      >
        <FiX size={17} />
      </button>
    </div>
    <div class="relative min-h-0 flex-1 overflow-y-auto px-6 py-7">
      <div class="mx-auto w-[58%] max-w-[230px] -rotate-1 bg-[#222] p-1 shadow-[14px_20px_35px_#03070699]">
        <img
          class="aspect-[2/3] w-full object-cover"
          src={props.item.cover}
          alt=""
        />
      </div>
      <div class="mt-8 text-center">
        <p class="text-[11px] tracking-[0.15em] text-[#8b9691] uppercase">
          {props.item.titleJp}
        </p>
        <h2 class="mt-2 font-serif text-2xl leading-tight text-[#f1ecdf]">
          {props.item.title}
        </h2>
        <p class="mt-2 text-xs text-[#737e79]">
          {props.item.collection} · Issue {props.item.issue}
        </p>
      </div>

      <div class="mt-7 flex flex-wrap justify-center gap-2">
        <For each={props.item.tags}>
          {(tag) => (
            <span class="border border-white/9 bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-[#a2aca7]">
              {tag}
            </span>
          )}
        </For>
      </div>

      <dl class="mt-8 grid grid-cols-2 border-y border-white/8 py-5 text-xs">
        <div class="border-r border-white/8 pl-2">
          <dt class="text-[9px] tracking-widest text-[#65706c] uppercase">
            Format
          </dt>
          <dd class="mt-2 text-[#d5d2c9]">
            {props.item.trim} · {props.item.thicknessMm} mm
          </dd>
        </div>
        <div class="pl-5">
          <dt class="text-[9px] tracking-widest text-[#65706c] uppercase">
            Reading
          </dt>
          <dd class="mt-2 text-[#d5d2c9]">
            {props.item.direction} · {languageLabels[props.item.language]}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex items-center gap-3 bg-[#1b2422] px-4 py-3.5">
        <span class="grid size-8 place-items-center rounded-full bg-[#5c8e7c]/15 text-[#73ad98]">
          <FiCheck size={15} />
        </span>
        <div>
          <p class="text-xs font-medium text-[#cfd8d3]">Ready to shelve</p>
          <p class="mt-0.5 text-[10px] text-[#687570]">
            Metadata and cover verified
          </p>
        </div>
      </div>
    </div>
    <div class="relative border-t border-white/8 p-5">
      <button
        class="flex w-full items-center justify-center gap-2 bg-[#e14f42] px-5 py-3.5 text-xs font-bold text-white transition hover:bg-[#eb5a4e]"
        onClick={() => props.onInspect?.()}
      >
        <FiBookOpen size={15} /> Return to the shop
      </button>
      <p class="mt-3 text-center text-[9px] text-[#66716d]">
        Added {props.item.added}
      </p>
    </div>
  </aside>
);

/**
 * Window of time after a stack-consumed Escape during which the menu
 * fallback stays deaf, so backing out of an exclusive surface (picker,
 * emulator, dialog) cannot roll straight into opening the pause menu from
 * the same physical gesture.
 */
const ESCAPE_GESTURE_COOLDOWN_MS = 250;

/**
 * True while a key press originates inside a modal dialog. Dialogs own
 * their own Tab-based focus navigation (summary rows, buttons, selects),
 * so the global Tab router must never swallow presses born there.
 */
const isDialogDescendant = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="dialog"]') !== null;

/**
 * Always-on Tab router plus a mode-scoped menu fallback. The router offers
 * every press to the shared modal stack from whichever mode is active; the
 * fallback that toggles the pause menu binds only while a fallback-armed
 * mode is active, so exclusive surfaces such as an emulator session can
 * never leak a stray press into the menu.
 *
 * Tab owns the menus outright: Escape stays reserved for the browser's own
 * pointer-lock management, and Tab presses on text-entry surfaces or inside
 * modal dialogs are ignored so form focus navigation keeps working. Closing
 * the menu through here resumes regular gameplay, so the pointer lock is
 * re-acquired.
 */
const GlobalEscapeShortcuts = (props: {onFallback: () => void}) => {
  const {escapeFallbackArmed} = useUiMode();
  const routerAbortController = new AbortController();
  // Written by whichever press the stack consumed most recently.
  let lastStackConsumeAt = Number.NEGATIVE_INFINITY;
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab" || isEditableTarget(event.target)) return;
      if (isDialogDescendant(event.target)) return;
      if (event.defaultPrevented || event.repeat) return;
      if (!modalModes.consumeEscape()) return;
      lastStackConsumeAt = performance.now();
      event.preventDefault();
    },
    {signal: routerAbortController.signal},
  );
  onCleanup(() => routerAbortController.abort());
  createModeListener(escapeFallbackArmed, (signal) => {
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Tab" || isEditableTarget(event.target)) return;
        if (isDialogDescendant(event.target)) return;
        if (event.defaultPrevented || event.repeat) return;
        if (performance.now() - lastStackConsumeAt < ESCAPE_GESTURE_COOLDOWN_MS)
          return;
        event.preventDefault();
        props.onFallback();
      },
      {signal},
    );
  });
  return null;
};

export const App = () => {
  const bootFetchWasEnabled = loadBootFetchPreference()?.enabled === true;
  const initialControlPreferences = loadControlPreferences();
  const initialLibraryFetchPreferences = loadLibraryFetchPreferences();
  const initialProviderId = loadLibraryProviderPreference() ?? "nhentai";
  const [libraryConfig, setLibraryConfig] =
    createSignal<AfterleafLibraryConfig>({
      artFramePaths: [],
      comicPaths: [],
      mangaPaths: [],
      posterPaths: [],
      romPaths: {},
      tvChannelPaths: [],
    });
  onMount(() => {
    void loadLibraryConfig()
      .then(setLibraryConfig)
      .catch(() => {});
  });
  const updateLibraryConfig = async (config: AfterleafLibraryConfig) => {
    const previousConfig = libraryConfig();
    const bookLocationsChanged = configLocationsChanged(
      previousConfig,
      config,
      bookLocationKeys,
    );
    const visualMediaLocationsChanged = configLocationsChanged(
      previousConfig,
      config,
      visualMediaLocationKeys,
    );
    const romFoldersChanged =
      JSON.stringify(previousConfig.romPaths ?? {}) !==
      JSON.stringify(config.romPaths ?? {});
    setLibraryConfig(config);
    await saveLibraryConfig(config);
    if (romFoldersChanged) {
      setLibraryUpdateNotice(
        "ROM folders saved. Reopen the arcade picker to see its games.",
      );
      return;
    }
    if (bookLocationsChanged && visualMediaLocationsChanged) {
      setLibraryUpdateNotice(
        "Locations saved. Visual media will refresh automatically; run Scan new to update books.",
      );
      return;
    }
    if (bookLocationsChanged) {
      setLibraryUpdateNotice(
        "Book locations saved. Run Scan new to update the library.",
      );
      return;
    }
    if (visualMediaLocationsChanged) {
      setLibraryUpdateNotice(
        "Media locations saved. TV, poster, and art frame catalogs will refresh automatically.",
      );
      return;
    }
    setLibraryUpdateNotice("Locations are already up to date.");
  };

  // Profiling/automation mode (?profile=1) skips interactive gates so CDP
  // runs can boot the shop unattended.
  const [ageConfirmed, setAgeConfirmed] = createSignal(
    new URLSearchParams(window.location.search).has("profile") ||
      sessionStorage.getItem("afterleaf-age-confirmed") === "yes",
  );
  const [query, setQuery] = createSignal("");
  const [language, setLanguage] = createSignal<LanguageFilter>("all");
  const [tag, setTag] = createSignal<string | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let shopViewportControls: ShopViewportControls | undefined;
  const openMenu = () => {
    if (menuOpen()) return;
    setMenuOpen(true);
  };
  const closeMenu = (requestPointerLock = true) => {
    if (!menuOpen()) return;
    setMenuOpen(false);
    if (requestPointerLock) shopViewportControls?.requestPointerLock();
  };
  const [menuTab, setMenuTab] = createSignal<MenuTab>("library");
  const [purgeBlacklistedOpen, setPurgeBlacklistedOpen] = createSignal(false);
  const [libraryRepairOpen, setLibraryRepairOpen] = createSignal(false);
  const [unstuckRequest, setUnstuckRequest] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal("");
  const [mobileDetailOpen, setMobileDetailOpen] = createSignal(false);
  const [bookmarks, setBookmarks] = createSignal(loadReaderBookmarks());
  const [libraryUpdateNotice, setLibraryUpdateNotice] = createSignal<string>();
  const [libraryUpdateFailed, setLibraryUpdateFailed] = createSignal(false);
  const [libraryUpdateOpen, setLibraryUpdateOpen] = createSignal(false);
  const [libraryUpdating, setLibraryUpdating] = createSignal(false);
  const [libraryOperation, setLibraryOperation] =
    createSignal<LibraryOperation>();
  const [libraryScanMode, setLibraryScanMode] =
    createSignal<LibraryScanMode>("quick");
  const [libraryUpdateStage, setLibraryUpdateStage] =
    createSignal<LibraryUpdateStage>("working");
  const [libraryUpdateCompletedSteps, setLibraryUpdateCompletedSteps] =
    createSignal(0);
  const [libraryUpdateTotalSteps, setLibraryUpdateTotalSteps] = createSignal(3);
  const [libraryUpdateSubProgress, setLibraryUpdateSubProgress] = createSignal<{
    completed: number;
    total: number;
  }>();
  const [libraryUpdateProgressMessage, setLibraryUpdateProgressMessage] =
    createSignal("Starting library job");
  const [libraryUpdateElapsedSeconds, setLibraryUpdateElapsedSeconds] =
    createSignal(0);
  const [newPublicationIds, setNewPublicationIds] = createSignal<
    readonly string[]
  >([]);
  const [fetchOnBoot, setFetchOnBoot] = createSignal(bootFetchWasEnabled);
  const [selectedProviderId, setSelectedProviderId] =
    createSignal(initialProviderId);
  const [libraryFetchLimit, setLibraryFetchLimit] = createSignal(
    initialLibraryFetchPreferences.limit,
  );
  const [librarySearchPageLimit, setLibrarySearchPageLimit] = createSignal(
    initialLibraryFetchPreferences.maxSearchPages,
  );
  const [lastChecked, setLastChecked] = createSignal("when the shop opened");
  const [mouseSensitivity, setMouseSensitivity] = createSignal(
    initialControlPreferences.mouseSensitivity,
  );
  const [gamepadLookSensitivity, setGamepadLookSensitivity] = createSignal(
    initialControlPreferences.gamepadLookSensitivity,
  );
  const [shortcutsConfig, setShortcutsConfig] = createSignal(loadShortcuts());
  const [padMappingOverrides, setPadMappingOverrides] = createSignal(
    loadPadMappingOverrides(),
  );
  const [tvScreenLighting, setTvScreenLighting] = createSignal(
    initialControlPreferences.tvScreenLighting,
  );
  const [defaultReadingDirection, setDefaultReadingDirection] = createSignal(
    initialControlPreferences.defaultReadingDirection,
  );
  const [respectBookReadingDirection, setRespectBookReadingDirection] =
    createSignal(initialControlPreferences.respectBookReadingDirection);
  const [blacklistedTags, setBlacklistedTags] =
    createSignal(loadTagBlacklist());
  const [libraryProviderError, setLibraryProviderError] =
    createSignal<string>();
  const [runtimeLibrary, {refetch}] = createResource(() =>
    loadRuntimeLibrary(),
  );
  const [libraryProviders] = createResource(async () => {
    try {
      const providers = await loadLibraryProviders();
      setLibraryProviderError(undefined);
      return providers;
    } catch (error) {
      setLibraryProviderError(
        error instanceof Error
          ? error.message
          : "The library providers could not be loaded.",
      );
      return [];
    }
  });
  let latestLibrarySourceStatus = {
    reenrollableBookPaths: [] as readonly string[],
    unavailableBookPathCount: 0,
  };
  const [librarySourceStatus, {refetch: refetchLibrarySourceStatus}] =
    createResource(async () => {
      try {
        latestLibrarySourceStatus = await loadLibrarySourceStatus();
      } catch {
        // Keep the last safety status if a later health check is interrupted.
      }
      return latestLibrarySourceStatus;
    });
  const [blacklistedPublications, {mutate: setBlacklistedPublications}] =
    createResource(async () => {
      try {
        return await loadBlacklistedPublications();
      } catch {
        return [];
      }
    });
  const resolvedRuntimeLibrary = () =>
    runtimeLibrary.latest ?? runtimeLibrary();
  const availableLibraryProviders = createMemo(
    () => libraryProviders.latest ?? libraryProviders() ?? [],
  );
  const unavailableBookPathCount = () =>
    librarySourceStatus.latest?.unavailableBookPathCount ?? 0;
  const reenrollableBookPaths = createMemo(
    () =>
      new Set(
        librarySourceStatus.latest?.reenrollableBookPaths ??
          librarySourceStatus()?.reenrollableBookPaths ??
          [],
      ),
  );
  const reenrollBookRoot = async (path: string) => {
    await reenrollLibraryRoot(path);
    await refetchLibrarySourceStatus();
    setLibraryUpdateNotice(
      "Library root re-enrolled. Run Scan new to reconcile its books.",
    );
  };
  createEffect(
    on(availableLibraryProviders, (providers) => {
      if (providers.some((provider) => provider.id === selectedProviderId()))
        return;
      const fallback = providers[0];
      if (!fallback) return;
      setSelectedProviderId(fallback.id);
      saveLibraryProviderPreference(fallback.id);
    }),
  );
  createEffect(
    on(unavailableBookPathCount, (count) => {
      if (count === 0) return;
      const sourceStatusInterval = window.setInterval(
        () => void refetchLibrarySourceStatus(),
        3_000,
      );
      onCleanup(() => window.clearInterval(sourceStatusInterval));
    }),
  );
  const activeLibrary = () => resolvedRuntimeLibrary() ?? emptyLibrary;
  const blacklistedPublicationIds = createMemo(
    () => new Set(blacklistedPublications.latest ?? blacklistedPublications()),
  );
  const publicationLibrary = createMemo(() =>
    activeLibrary().publications.filter(
      (publication) => !blacklistedPublicationIds().has(publication.id),
    ),
  );
  const blacklistedTagWorkCandidates = createMemo(() =>
    findBlacklistedTagMatches(publicationLibrary(), blacklistedTags()),
  );
  const availableTags = createMemo(() =>
    [...new Set(publicationLibrary().flatMap((item) => item.tags))].sort(
      (left, right) => left.localeCompare(right),
    ),
  );
  const library = createMemo(() => {
    const publications = publicationLibrary();
    const defaultDirection = defaultReadingDirection();
    const respectMetadata = respectBookReadingDirection();
    return publications.map((publication) => {
      const direction =
        respectMetadata && !publication.readingDirectionUnspecified
          ? publication.direction
          : defaultDirection;
      return publication.direction === direction
        ? publication
        : {...publication, direction};
    });
  });
  const queryTokens = createMemo(() =>
    query().trim().toLowerCase().split(/\s+/).filter(Boolean),
  );
  const visibleTags = createMemo(() => {
    const tags = [...new Set(library().flatMap((item) => item.tags))].sort();
    const tokens = queryTokens();
    if (!tokens.length) return tags;
    return tags.filter((catalogTag) =>
      tokens.some((token) => catalogTag.toLowerCase().includes(token)),
    );
  });
  let libraryUpdateStartedAt = 0;
  let libraryUpdateTimer: number | undefined;
  let libraryStatusRequestPending = false;
  // `reconnect` marks a job adopted after a page reload, so a vanished job
  // (server restarted mid-run) cleans up silently instead of failing loudly.
  type MonitoredLibraryJob = LocalLibraryJob & {
    automatic: boolean;
    reconnect?: boolean;
  };
  let activeLibraryJob: MonitoredLibraryJob | undefined;
  const finishLibraryUpdate = () => {
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = undefined;
    activeLibraryJob = undefined;
    setLibraryUpdating(false);
    setLibraryOperation(undefined);
  };
  const scanButtonLabel = () => {
    if (runtimeLibrary.loading) return "Loading…";
    if (libraryOperation() === "scan")
      return `${libraryScanMode() === "repair" ? "Repairing" : "Scanning"} · ${libraryUpdateElapsedSeconds()}s`;
    if (libraryUpdating()) return "Library busy…";
    return "Scan new";
  };
  const fetchButtonLabel = () =>
    libraryOperation() === "fetch-more"
      ? `Fetching · ${libraryUpdateElapsedSeconds()}s`
      : "Fetch more";
  const libraryActivityStatus = () => {
    if (libraryUpdateStage() === "loading-library")
      return "Injecting the finished stock into the mounted shop…";
    return libraryUpdateProgressMessage();
  };

  const filteredCatalog = createMemo(() => {
    const tokens = queryTokens();
    return library().filter((item) => {
      if (language() !== "all" && item.language !== language()) return false;
      const selectedTag = tag();
      if (selectedTag && !item.tags.includes(selectedTag)) return false;
      return tokens.every((token) =>
        [item.title, item.titleJp, item.collection, ...item.tags].some(
          (value) => value.toLowerCase().includes(token),
        ),
      );
    });
  });

  const selectedItem = createMemo(
    () => library().find((item) => item.id === selectedId()) ?? library()[0],
  );

  const recordLibraryResult = async (
    result: LocalLibrarySnapshotResult,
    operation: "Fetched" | "Imported & scanned",
  ) => {
    const previousPublicationIds = new Set(
      library().map((publication) => publication.id),
    );
    const currentLibrary = resolvedRuntimeLibrary();
    const activatedLibrary =
      currentLibrary?.identity.snapshotId === result.snapshotId
        ? currentLibrary
        : await refetch();
    if (!activatedLibrary)
      throw new Error(
        `The library refresh returned no snapshot while activating ${result.snapshotId}`,
      );
    if (activatedLibrary.identity.snapshotId !== result.snapshotId)
      throw new Error(
        `The library activated snapshot ${result.snapshotId}, but the game loaded ${activatedLibrary.identity.snapshotId ?? "an empty library"}`,
      );
    const arrivedPublicationIds = activatedLibrary.publications
      .filter((publication) => !previousPublicationIds.has(publication.id))
      .map((publication) => publication.id);
    // This signal is an arrival event for the Three runtime. Publishing a new
    // empty array would look like a stock change and rebuild every book batch.
    if (arrivedPublicationIds.length > 0)
      setNewPublicationIds(arrivedPublicationIds);
    setLastChecked(
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    setLibraryUpdateNotice(
      `${operation}: ${arrivedPublicationIds.length} delivered to the live shop · ${result.publicationCount} catalogued · ${result.updatedCount} updated`,
    );
    setLibraryUpdateFailed(false);
  };

  const reportLibraryFailure = (
    operation: LibraryOperation,
    automatic: boolean,
    message: string,
  ) => {
    setLibraryUpdateFailed(true);
    if (operation === "scan") {
      setLibraryUpdateNotice(`Import and scan failed: ${message}`);
      return;
    }
    setLibraryUpdateNotice(
      automatic
        ? `Automatic fetch failed: ${message}`
        : `Fetch failed: ${message}`,
    );
  };

  const settleLibraryJob = async (
    job: MonitoredLibraryJob,
    status: Awaited<ReturnType<typeof loadLibraryOperationStatus>>,
  ) => {
    if (activeLibraryJob?.jobId !== job.jobId) return;
    setLibraryUpdateCompletedSteps(status.completedSteps);
    setLibraryUpdateTotalSteps(status.totalSteps);
    setLibraryUpdateSubProgress(status.subProgress);
    setLibraryUpdateProgressMessage(status.message);
    if (status.state === "running") return;
    try {
      if (status.state === "failed") {
        reportLibraryFailure(
          job.operation,
          job.automatic,
          status.error.message,
        );
        return;
      }
      setLibraryUpdateStage("loading-library");
      setLibraryUpdateProgressMessage("Injecting stock into the mounted shop");
      await recordLibraryResult(
        status.result,
        job.operation === "fetch-more" ? "Fetched" : "Imported & scanned",
      );
    } catch (error) {
      reportLibraryFailure(
        job.operation,
        job.automatic,
        error instanceof Error
          ? error.message
          : "The finished library could not be loaded.",
      );
    } finally {
      if (activeLibraryJob?.jobId === job.jobId) finishLibraryUpdate();
    }
  };

  const refreshLibraryUpdateStatus = async (job: MonitoredLibraryJob) => {
    if (libraryStatusRequestPending || activeLibraryJob?.jobId !== job.jobId)
      return;
    libraryStatusRequestPending = true;
    try {
      const status = await loadLibraryOperationStatus(job.jobId);
      await settleLibraryJob(job, status);
    } catch (error) {
      if (
        activeLibraryJob?.jobId === job.jobId &&
        error instanceof BrowserLibraryOperationError &&
        error.code === "job_not_found"
      ) {
        // A reattached job whose process is gone just winds down silently;
        // the server restarted, so there is nothing left to report.
        if (!job.reconnect)
          reportLibraryFailure(job.operation, job.automatic, error.message);
        finishLibraryUpdate();
      }
    } finally {
      libraryStatusRequestPending = false;
    }
  };

  const startLibraryStatusPolling = () => {
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = window.setInterval(() => {
      const job = activeLibraryJob;
      if (job) void refreshLibraryUpdateStatus(job);
      setLibraryUpdateElapsedSeconds(
        Math.floor((performance.now() - libraryUpdateStartedAt) / 1_000),
      );
    }, 1_000);
  };

  const beginLibraryUpdate = (operation: LibraryOperation, query?: string) => {
    libraryUpdateStartedAt = performance.now();
    activeLibraryJob = undefined;
    setLibraryUpdateElapsedSeconds(0);
    setLibraryUpdateFailed(false);
    setLibraryOperation(operation);
    setLibraryUpdateStage("working");
    setLibraryUpdateCompletedSteps(0);
    setLibraryUpdateTotalSteps(3);
    setLibraryUpdateSubProgress(undefined);
    setLibraryUpdateProgressMessage(
      operation === "fetch-more" && query
        ? `Starting provider search for “${query}”`
        : "Starting library job",
    );
    setLibraryUpdating(true);
    startLibraryStatusPolling();
  };

  const monitorLibraryJob = (job: LocalLibraryJob, automatic: boolean) => {
    activeLibraryJob = {...job, automatic};
    void refreshLibraryUpdateStatus(activeLibraryJob);
  };

  /**
   * Reattaches to a job that is already running on the server, e.g. after a
   * page reload. The server-persisted epoch start reconstructs the true
   * elapsed time instead of counting from the reload.
   */
  const reconnectActiveLibraryJob = async () => {
    const job = await loadActiveLibraryJob().catch(() => undefined);
    if (!job || libraryUpdating()) return;
    const elapsedMilliseconds = Math.max(0, Date.now() - job.startedAt);
    libraryUpdateStartedAt = performance.now() - elapsedMilliseconds;
    activeLibraryJob = {...job, automatic: true, reconnect: true};
    setLibraryUpdateFailed(false);
    setLibraryOperation(job.operation);
    setLibraryUpdateStage("working");
    setLibraryUpdateCompletedSteps(0);
    setLibraryUpdateTotalSteps(3);
    setLibraryUpdateSubProgress(undefined);
    setLibraryUpdateProgressMessage("Reattaching to the running library job");
    setLibraryUpdating(true);
    setLibraryUpdateElapsedSeconds(Math.floor(elapsedMilliseconds / 1_000));
    startLibraryStatusPolling();
    void refreshLibraryUpdateStatus(activeLibraryJob);
  };

  const fetchMoreLibrary = async (
    options: {
      automatic?: boolean;
      limit?: number;
      maxSearchPages?: number;
      rememberBootFetch?: boolean;
      providerId?: string;
      query?: string;
      transient?: boolean;
    } = {},
  ) => {
    if (libraryUpdating()) return;
    const providerId = options.providerId ?? selectedProviderId();
    const provider = availableLibraryProviders().find(
      (candidate) => candidate.id === providerId,
    );
    const query = options.query ?? provider?.defaultQuery ?? "";
    beginLibraryUpdate("fetch-more", query);
    setLibraryUpdateNotice(undefined);
    if (!options.transient) {
      setSelectedProviderId(providerId);
      saveLibraryProviderPreference(providerId);
    }
    if (options.rememberBootFetch !== undefined) {
      saveBootFetchPreference(options.rememberBootFetch);
      setFetchOnBoot(options.rememberBootFetch);
    }
    let acquisitionLimit = options.limit ?? libraryFetchLimit();
    let searchPageLimit = options.maxSearchPages ?? librarySearchPageLimit();
    if (
      !options.transient &&
      (options.limit !== undefined || options.maxSearchPages !== undefined)
    ) {
      const preferences = saveLibraryFetchPreferences({
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
      });
      acquisitionLimit = preferences.limit;
      searchPageLimit = preferences.maxSearchPages;
      setLibraryFetchLimit(preferences.limit);
      setLibrarySearchPageLimit(preferences.maxSearchPages);
    }
    if (!options.automatic) {
      setLibraryUpdateOpen(false);
      closeMenu();
    }
    try {
      const blockedTags = blacklistedTags();
      const job = await fetchMorePublications({
        ...(blockedTags.length === 0 ? {} : {blockedTags}),
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
        providerId,
        ...(query ? {query} : {}),
      });
      monitorLibraryJob(job, options.automatic === true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The local acquisition service could not fetch more stock.";
      reportLibraryFailure("fetch-more", options.automatic === true, message);
      finishLibraryUpdate();
    }
  };

  const scanLibrary = async (
    mode: LibraryScanMode = "quick",
    repairOptions?: LibraryRepairOptions,
  ) => {
    if (libraryUpdating()) return;
    setLibraryScanMode(mode);
    beginLibraryUpdate("scan");
    setLibraryUpdateNotice(undefined);
    try {
      const job = await scanLocalLibrary(
        mode === "repair"
          ? {
              repair: true,
              ...(repairOptions?.redownloadProviderAssets
                ? {redownloadProviderAssets: true}
                : {}),
              ...(repairOptions?.repairProviderMetadata
                ? {repairProviderMetadata: true}
                : {}),
            }
          : {},
      );
      monitorLibraryJob(job, false);
    } catch (error) {
      reportLibraryFailure(
        "scan",
        false,
        error instanceof Error
          ? error.message
          : "The local library could not be imported and scanned.",
      );
      finishLibraryUpdate();
    }
  };

  const importPastedPublication = async (text: string) => {
    let match;
    try {
      match = await resolvePastedLibraryImport(text);
    } catch (error) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(
        error instanceof Error
          ? `Could not resolve the pasted text: ${error.message}`
          : "Could not ask library providers about the pasted text.",
      );
      return false;
    }
    if (!match) return false;
    const importLabel =
      match.publicationId ?? `${match.providerId} publication`;
    if (
      match.publicationId &&
      activeLibrary().publications.some(
        (publication) => publication.id === match.publicationId,
      )
    ) {
      setLibraryUpdateFailed(false);
      setLibraryUpdateNotice(`${importLabel} is already imported.`);
      return true;
    }
    if (libraryUpdating()) {
      setLibraryUpdateNotice(
        `Could not import ${importLabel} because another library job is running.`,
      );
      return true;
    }
    if (unavailableBookPathCount() > 0) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(
        `Could not import ${importLabel} until the configured book paths are remounted.`,
      );
      return true;
    }
    void fetchMoreLibrary({
      limit: 1,
      maxSearchPages: 1,
      providerId: match.providerId,
      query: match.query,
      transient: true,
    });
    return true;
  };

  let bootFetchStarted = false;
  const maybeFetchOnBoot = () => {
    if (!ageConfirmed() || !bootFetchWasEnabled || bootFetchStarted) return;
    bootFetchStarted = true;
    void fetchMoreLibrary({automatic: true});
  };

  const confirmAge = () => {
    sessionStorage.setItem("afterleaf-age-confirmed", "yes");
    setAgeConfirmed(true);
    maybeFetchOnBoot();
  };

  const closeLibraryUpdate = () => {
    setFetchOnBoot(loadBootFetchPreference()?.enabled === true);
    setLibraryUpdateOpen(false);
  };

  const discardPublication = async (publicationId: string) => {
    await blacklistPublication({publicationId});
    setBlacklistedPublications((current = []) => [
      ...new Set([...current, publicationId]),
    ]);
    return true;
  };

  const purgeBlacklistedWorks = async () => {
    const candidates = blacklistedTagWorkCandidates();
    if (
      candidates.length === 0 ||
      libraryUpdating() ||
      unavailableBookPathCount() > 0
    )
      return;

    setLibraryScanMode("quick");
    beginLibraryUpdate("scan");
    setLibraryUpdateNotice(undefined);
    setLibraryUpdateTotalSteps(candidates.length + 3);
    const purgedPublicationIds: string[] = [];
    try {
      for (const [index, publication] of candidates.entries()) {
        setLibraryUpdateCompletedSteps(index);
        setLibraryUpdateProgressMessage(
          `Purging ${publication.title} (${index + 1} of ${candidates.length})`,
        );
        await blacklistPublication({publicationId: publication.id});
        purgedPublicationIds.push(publication.id);
      }
      setPurgeBlacklistedOpen(false);
      setBlacklistedPublications((current = []) => [
        ...new Set([...current, ...purgedPublicationIds]),
      ]);
      setLibraryUpdateCompletedSteps(0);
      setLibraryUpdateTotalSteps(3);
      setLibraryUpdateProgressMessage("Rebuilding the purged library");
      const job = await scanLocalLibrary();
      monitorLibraryJob(job, false);
    } catch (error) {
      if (purgedPublicationIds.length > 0)
        setBlacklistedPublications((current = []) => [
          ...new Set([...current, ...purgedPublicationIds]),
        ]);
      reportLibraryFailure(
        "scan",
        false,
        error instanceof Error
          ? `Could not finish purging blacklisted works: ${error.message}`
          : "Could not finish purging blacklisted works.",
      );
      finishLibraryUpdate();
    }
  };

  const updateMouseSensitivity = (value: number) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      gamepadLookSensitivity: gamepadLookSensitivity(),
      mouseSensitivity: value,
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setMouseSensitivity(preferences.mouseSensitivity);
  };

  const updateGamepadLookSensitivity = (value: number) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      gamepadLookSensitivity: value,
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setGamepadLookSensitivity(preferences.gamepadLookSensitivity);
  };

  const updateShortcuts = (config: ShortcutsConfig) => {
    saveShortcuts(config);
    setShortcutsConfig(config);
  };

  const updatePadMappingOverrides = (overrides: ArcadePadMappingOverrides) => {
    savePadMappingOverrides(overrides);
    setPadMappingOverrides(overrides);
  };

  const updateDefaultReadingDirection = (value: ReadingDirection) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: value,
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: tvScreenLighting(),
    });
    setDefaultReadingDirection(preferences.defaultReadingDirection);
  };

  const updateRespectBookReadingDirection = (value: boolean) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: value,
      tvScreenLighting: tvScreenLighting(),
    });
    setRespectBookReadingDirection(preferences.respectBookReadingDirection);
  };

  const updateTvScreenLighting = (value: boolean) => {
    const preferences = saveControlPreferences({
      gamepadLookSensitivity: gamepadLookSensitivity(),
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
      tvScreenLighting: value,
    });
    setTvScreenLighting(preferences.tvScreenLighting);
  };

  const updateBlacklistedTags = (tags: readonly string[]) => {
    const nextTags = saveTagBlacklist(tags);
    setBlacklistedTags(nextTags);
    const selectedTag = tag();
    if (selectedTag && nextTags.includes(normalizeTag(selectedTag)))
      setTag(null);
  };

  onMount(() => {
    // Reattach to a job that survived the reload before the boot fetch can
    // consider starting a second one; adoption marks the library busy.
    void reconnectActiveLibraryJob().then(() => maybeFetchOnBoot());
  });
  // Modal scopes mirror their dialog signals; the stack decides which one
  // owns Escape instead of a fixed priority chain in the key handler.
  createEscapeScope("purge-blacklisted", purgeBlacklistedOpen, () => {
    if (!libraryUpdating()) setPurgeBlacklistedOpen(false);
    return true;
  });
  createEscapeScope("library-repair", libraryRepairOpen, () => {
    setLibraryRepairOpen(false);
    return true;
  });
  createEscapeScope("library-update", libraryUpdateOpen, () => {
    if (!libraryUpdating()) closeLibraryUpdate();
    return true;
  });
  createEscapeScope("mobile-detail", mobileDetailOpen, () => {
    setMobileDetailOpen(false);
    return true;
  });
  onCleanup(() => {
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
  });

  return (
    <UiModeProvider paused={menuOpen}>
      <GlobalEscapeShortcuts
        onFallback={() => {
          // Closing back into regular gameplay re-acquires the pointer
          // lock; ShopScene ignores the request while arcade sessions or
          // inspection spreads own the cursor.
          if (menuOpen()) closeMenu();
          else openMenu();
        }}
      />
      <main class="h-[100dvh] overflow-hidden bg-[#071010] text-[#d9d6cc]">
        <Show
          when={ageConfirmed()}
          fallback={<AdultGate onEnter={confirmAge} />}
        >
          <div class="fixed inset-0">
            <Suspense
              fallback={
                <div class="grid size-full place-items-center bg-[#071010]">
                  <p class="text-[9px] font-semibold tracking-[0.2em] text-[#7e918b] uppercase">
                    Opening the shop floor…
                  </p>
                </div>
              }
            >
              <Show when={resolvedRuntimeLibrary()}>
                {(runtime) => (
                  <Show when={!blacklistedPublications.loading}>
                    <ShopViewport
                      catalogAtlases={() => runtime().atlases}
                      catalogAvailable={() =>
                        isRuntimeLibraryAvailable(runtime())
                      }
                      catalogIdentity={() => runtime().identity}
                      gamepadLookSensitivity={gamepadLookSensitivity}
                      mouseSensitivity={mouseSensitivity}
                      newPublicationIds={newPublicationIds}
                      onControlsChange={(controls) => {
                        shopViewportControls = controls;
                      }}
                      pageIndexForPublication={(publicationId) =>
                        bookmarks()[publicationId] ?? 0
                      }
                      publications={library}
                      selectedPublicationId={() => selectedItem()?.id}
                      tvScreenLighting={tvScreenLighting}
                      unstuckRequest={unstuckRequest}
                      paused={menuOpen}
                      onOpenMenu={openMenu}
                      onCloseMenu={() => closeMenu()}
                      shortcutsConfig={shortcutsConfig}
                      padMappingOverrides={padMappingOverrides}
                      onPasteText={importPastedPublication}
                      onDiscardPublication={discardPublication}
                      onPageIndexChange={(publicationId, pageIndex) =>
                        setBookmarks((current) =>
                          saveReaderBookmark(current, publicationId, pageIndex),
                        )
                      }
                      onSelectPublication={(publicationId) => {
                        setSelectedId(publicationId);
                      }}
                    />
                  </Show>
                )}
              </Show>
            </Suspense>

            <LibraryActivityToast
              busy={libraryUpdating()}
              completedSteps={libraryUpdateCompletedSteps()}
              elapsedSeconds={libraryUpdateElapsedSeconds()}
              failed={libraryUpdateFailed()}
              notice={libraryUpdateNotice()}
              status={libraryActivityStatus()}
              subProgress={libraryUpdateSubProgress()}
              totalSteps={libraryUpdateTotalSteps()}
              onDismiss={() => {
                setLibraryUpdateFailed(false);
                setLibraryUpdateNotice(undefined);
              }}
            />

            <Show when={unavailableBookPathCount()}>
              {(count) => (
                <aside
                  class="fixed top-4 left-1/2 z-40 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 border border-[#d94c3f]/60 bg-[#250d0b]/95 px-4 py-3 text-[#ff796c] shadow-[0_16px_50px_#000b] backdrop-blur-md"
                  aria-live="assertive"
                >
                  <FiAlertTriangle class="mt-0.5 shrink-0" size={16} />
                  <p class="text-[11px] leading-5">
                    {count()} configured book{" "}
                    {count() === 1 ? "path is" : "paths are"} unavailable.
                    Library updates are locked so the current books cannot be
                    removed. Remount the expected storage and restore its
                    Afterleaf library root marker to continue. Enrolled book
                    roots may be empty; missing or mismatched markers are
                    treated as unavailable storage.
                  </p>
                </aside>
              )}
            </Show>

            <Show when={menuOpen()}>
              <div
                class="fixed inset-0 z-30 overflow-hidden bg-[#080d0c]/80 p-0 backdrop-blur-sm sm:p-4 lg:p-7"
                role="dialog"
                aria-modal="true"
                aria-label="Afterleaf pause menu"
              >
                <div class="mx-auto flex size-full max-w-[1800px] flex-col overflow-hidden border-white/10 bg-[#101716]/98 shadow-[0_30px_120px_#000] sm:border">
                  <header class="flex h-[72px] shrink-0 items-center border-b border-white/8 bg-[#121918]/95 px-4 sm:px-5 lg:px-6">
                    <div class="flex min-w-0 items-center gap-4">
                      <div class="brand-mark grid size-9 shrink-0 place-items-center bg-[#d94c3f] font-serif text-lg text-white">
                        葉
                      </div>
                      <div class="min-w-0">
                        <h1 class="truncate font-serif text-xl tracking-[-0.03em] text-[#f0ebdf]">
                          Afterleaf
                        </h1>
                        <p class="hidden text-[9px] font-semibold tracking-[0.22em] text-[#6f7a76] uppercase sm:block">
                          Closing shift · local library
                        </p>
                      </div>
                    </div>
                    <div class="ml-auto flex items-center gap-2 sm:gap-3">
                      <div class="mr-2 hidden items-center gap-2 text-[10px] text-[#6f7b76] md:flex">
                        <span class="size-1.5 rounded-full bg-[#75aa91] shadow-[0_0_8px_#75aa91]"></span>{" "}
                        Local library
                      </div>
                      <button
                        class="flex h-9 items-center gap-2 border border-white/10 px-3 text-[11px] text-[#aab2ae] transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-50"
                        disabled={
                          runtimeLibrary.loading ||
                          libraryUpdating() ||
                          unavailableBookPathCount() > 0
                        }
                        onClick={() => void scanLibrary("quick")}
                        title={
                          unavailableBookPathCount() > 0
                            ? "Remount the configured book paths before updating the library"
                            : "Find new or normally changed local books and reuse unchanged generated assets"
                        }
                      >
                        <FiRefreshCw
                          classList={{
                            "animate-spin":
                              runtimeLibrary.loading || libraryUpdating(),
                          }}
                          size={14}
                        />
                        <span class="hidden sm:inline">
                          {scanButtonLabel()}
                        </span>
                      </button>
                      <button
                        aria-label="Deep scan and repair library"
                        class="grid size-9 place-items-center border border-white/10 text-[#8d9893] transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-50"
                        disabled={
                          runtimeLibrary.loading ||
                          libraryUpdating() ||
                          unavailableBookPathCount() > 0
                        }
                        onClick={() => setLibraryRepairOpen(true)}
                        title={
                          unavailableBookPathCount() > 0
                            ? "Remount the configured book paths before repairing the library"
                            : "Choose local and optional provider repair actions"
                        }
                      >
                        <FiTool size={14} />
                      </button>
                      <button
                        class="flex h-9 items-center gap-2 bg-[#ece6d8] px-3.5 text-[11px] font-bold text-[#1b2321] transition hover:bg-white disabled:cursor-wait"
                        disabled={
                          runtimeLibrary.loading ||
                          libraryUpdating() ||
                          unavailableBookPathCount() > 0
                        }
                        onClick={() => {
                          setFetchOnBoot(
                            loadBootFetchPreference()?.enabled === true,
                          );
                          setLibraryUpdateOpen(true);
                        }}
                      >
                        <FiDownload size={14} />
                        <span class="hidden sm:inline">
                          {fetchButtonLabel()}
                        </span>
                      </button>
                      <button
                        class="grid size-9 place-items-center text-[#8d9893] transition hover:bg-white/5 hover:text-white"
                        aria-label="Close menu and return to shop"
                        title="Return to shop (Tab)"
                        on:pointerdown={(event) => {
                          if (event.button === 0) closeMenu();
                        }}
                        onClick={() => closeMenu()}
                      >
                        <FiX size={17} />
                      </button>
                    </div>
                  </header>

                  <nav class="flex shrink-0 border-b border-white/8 bg-[#121918] p-2 xl:hidden">
                    <button
                      class="flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition"
                      classList={{
                        "bg-[#1c2523] text-[#ece8dd]": menuTab() === "library",
                        "text-[#78837e] hover:bg-white/[0.025] hover:text-white":
                          menuTab() !== "library",
                      }}
                      aria-pressed={menuTab() === "library"}
                      onClick={() => setMenuTab("library")}
                      type="button"
                    >
                      <FiGrid size={13} /> Library
                    </button>
                    <button
                      class="flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition"
                      classList={{
                        "bg-[#1c2523] text-[#ece8dd]": menuTab() === "options",
                        "text-[#78837e] hover:bg-white/[0.025] hover:text-white":
                          menuTab() !== "options",
                      }}
                      aria-pressed={menuTab() === "options"}
                      onClick={() => setMenuTab("options")}
                      type="button"
                    >
                      <FiSettings size={13} /> Options
                    </button>
                    <button
                      class="flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition"
                      classList={{
                        "bg-[#1c2523] text-[#ece8dd]":
                          menuTab() === "shortcuts",
                        "text-[#78837e] hover:bg-white/[0.025] hover:text-white":
                          menuTab() !== "shortcuts",
                      }}
                      aria-pressed={menuTab() === "shortcuts"}
                      onClick={() => setMenuTab("shortcuts")}
                      type="button"
                    >
                      <FiCommand size={13} /> Shortcuts
                    </button>
                  </nav>

                  <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)_330px]">
                    <nav class="hidden border-r border-white/8 bg-[#121918] px-5 py-7 xl:flex xl:flex-col">
                      <p class="px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                        Menu
                      </p>
                      <div class="mt-4 space-y-1">
                        <button
                          class="flex w-full items-center gap-3 px-3 py-2.5 text-xs transition"
                          classList={{
                            "bg-[#1c2523] font-semibold text-[#ece8dd]":
                              menuTab() === "library",
                            "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                              menuTab() !== "library",
                          }}
                          aria-pressed={menuTab() === "library"}
                          onClick={() => setMenuTab("library")}
                          type="button"
                        >
                          <FiGrid size={14} class="text-[#e25a4d]" /> Library{" "}
                          <span class="ml-auto text-[10px] text-[#7c8681]">
                            {String(library().length).padStart(2, "0")}
                          </span>
                        </button>
                        <button
                          class="flex w-full items-center gap-3 px-3 py-2.5 text-xs transition"
                          classList={{
                            "bg-[#1c2523] font-semibold text-[#ece8dd]":
                              menuTab() === "options",
                            "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                              menuTab() !== "options",
                          }}
                          aria-pressed={menuTab() === "options"}
                          onClick={() => setMenuTab("options")}
                          type="button"
                        >
                          <FiSettings size={14} class="text-[#e25a4d]" />{" "}
                          Options
                        </button>
                        <button
                          class="flex w-full items-center gap-3 px-3 py-2.5 text-xs transition"
                          classList={{
                            "bg-[#1c2523] font-semibold text-[#ece8dd]":
                              menuTab() === "shortcuts",
                            "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                              menuTab() !== "shortcuts",
                          }}
                          aria-pressed={menuTab() === "shortcuts"}
                          onClick={() => setMenuTab("shortcuts")}
                          type="button"
                        >
                          <FiCommand size={14} class="text-[#e25a4d]" />{" "}
                          Shortcuts
                        </button>
                      </div>

                      <p class="mt-9 px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                        Browse
                      </p>
                      <div class="mt-4 space-y-1">
                        <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                          <FiClock size={14} /> Recently added
                        </button>
                        <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                          <FiBookOpen size={14} /> Continue reading
                        </button>
                      </div>

                      <div class="mt-auto border-t border-white/8 pt-5">
                        <div class="flex items-center gap-3 px-2">
                          <span class="grid size-8 place-items-center rounded-full bg-[#24312e] text-[#789488]">
                            <FiShield size={13} />
                          </span>
                          <div>
                            <p class="text-[10px] font-semibold text-[#9ca6a1]">
                              Local catalog
                            </p>
                            <p class="mt-0.5 text-[9px] text-[#56615c]">
                              Stored on this device
                            </p>
                          </div>
                        </div>
                      </div>
                    </nav>

                    <section
                      class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9"
                      classList={{hidden: menuTab() !== "library"}}
                    >
                      <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                        <div>
                          <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
                            First floor · current stock
                          </p>
                          <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
                            The night shelf
                          </h2>
                          <p class="mt-2 text-xs text-[#6e7974]">
                            {library().length} publications catalogued ·{" "}
                            {library().length > 0
                              ? "all covers verified"
                              : "ready for import"}
                          </p>
                        </div>
                        <div class="flex items-center gap-3 border border-white/8 bg-[#151e1c] px-4 py-3">
                          <span class="relative flex size-7 items-center justify-center">
                            <span class="absolute size-6 rounded-full border border-[#70a28b]/20"></span>
                            <span class="size-2 rounded-full bg-[#70a28b] shadow-[0_0_10px_#70a28b]"></span>
                          </span>
                          <div>
                            <p class="text-[10px] font-semibold text-[#b8c1bc]">
                              Library is current
                            </p>
                            <p class="mt-0.5 text-[9px] text-[#5f6b66]">
                              Last checked {lastChecked()}
                            </p>
                            <Show when={libraryUpdating()}>
                              <p class="mt-1 text-[9px] text-[#d66a60]">
                                {libraryActivityStatus()} ·{" "}
                                {libraryUpdateElapsedSeconds()}s
                              </p>
                            </Show>
                            <Show when={libraryUpdateNotice()}>
                              {(notice) => (
                                <p class="mt-1 text-[9px] text-[#7fa995]">
                                  {notice()}
                                </p>
                              )}
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="mt-8 flex flex-col gap-3 border-y border-white/8 py-4 md:flex-row md:items-center">
                        <label class="flex h-10 flex-1 items-center gap-3 bg-[#19211f] px-3.5 text-[#7b8581] ring-[#d95145] focus-within:ring-1">
                          <FiSearch size={15} />
                          <input
                            class="min-w-0 flex-1 bg-transparent text-xs text-[#e2ded4] outline-none placeholder:text-[#65706c]"
                            value={query()}
                            onInput={(event) =>
                              setQuery(event.currentTarget.value)
                            }
                            placeholder="Search title, collection, or tag…"
                          />
                          <Show when={query()}>
                            <button
                              class="hover:text-white"
                              aria-label="Clear search"
                              onClick={() => setQuery("")}
                            >
                              <FiX size={13} />
                            </button>
                          </Show>
                        </label>
                        <div class="flex h-10 items-center gap-1 overflow-x-auto bg-[#19211f] p-1">
                          <FiSliders
                            class="mx-2 shrink-0 text-[#68736e]"
                            size={13}
                          />
                          <For
                            each={
                              Object.entries(languageLabels) as [
                                LanguageFilter,
                                string,
                              ][]
                            }
                          >
                            {(entry) => (
                              <button
                                class="h-8 shrink-0 px-3 text-[10px] font-semibold transition"
                                classList={{
                                  "bg-[#ede7d9] text-[#18201f]":
                                    language() === entry[0],
                                  "text-[#77827d] hover:text-white":
                                    language() !== entry[0],
                                }}
                                onClick={() => setLanguage(entry[0])}
                              >
                                {entry[1]}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>

                      <div class="scrollbar-themed-x mt-4 flex gap-2 overflow-x-auto pb-1">
                        <button
                          class="shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition"
                          classList={{
                            "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]":
                              tag() === null,
                            "border-white/8 text-[#69746f] hover:border-white/15":
                              tag() !== null,
                          }}
                          onClick={() => setTag(null)}
                        >
                          All tags
                        </button>
                        <For each={visibleTags()}>
                          {(catalogTag) => (
                            <button
                              class="shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition"
                              classList={{
                                "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]":
                                  tag() === catalogTag,
                                "border-white/8 text-[#69746f] hover:border-white/15 hover:text-[#aeb5b1]":
                                  tag() !== catalogTag,
                              }}
                              onClick={() => setTag(catalogTag)}
                            >
                              {catalogTag}
                            </button>
                          )}
                        </For>
                      </div>

                      <div class="mt-5 flex items-center justify-between border-b border-white/8 pb-4">
                        <p class="text-[9px] leading-4 text-[#5f6a66]">
                          Inspect the catalog here, then press Tab to return to
                          the shop floor.
                        </p>
                        <span class="hidden items-center gap-2 border border-white/10 px-3 py-2 text-[9px] font-semibold tracking-[0.12em] text-[#7d8883] uppercase sm:flex">
                          <FiMenu size={12} /> Menu (Tab)
                        </span>
                      </div>

                      <div class="mt-8">
                        <div class="mb-5 flex items-center justify-between">
                          <p class="text-[10px] font-semibold tracking-[0.17em] text-[#747f7a] uppercase">
                            Face-out rack{" "}
                            <span class="ml-2 text-[#4f5955]">
                              {filteredCatalog()
                                .length.toString()
                                .padStart(2, "0")}
                            </span>
                          </p>
                          <p class="text-[9px] text-[#515c57]">
                            Newest added first
                          </p>
                        </div>
                        <Show
                          when={filteredCatalog().length > 0}
                          fallback={
                            <div class="grid min-h-72 place-items-center border border-dashed border-white/10 text-center">
                              <div>
                                <FiSearch
                                  class="mx-auto text-[#53605a]"
                                  size={20}
                                />
                                <p class="mt-4 text-sm text-[#9ba49f]">
                                  Nothing on this shelf
                                </p>
                                <button
                                  class="mt-3 text-[10px] font-semibold text-[#d65a4f]"
                                  onClick={() => {
                                    setQuery("");
                                    setTag(null);
                                    setLanguage("all");
                                  }}
                                >
                                  Clear filters
                                </button>
                              </div>
                            </div>
                          }
                        >
                          <div class="shelf-grid grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                            <For each={filteredCatalog()}>
                              {(item) => (
                                <LibraryCard
                                  item={item}
                                  active={selectedItem()?.id === item.id}
                                  onSelect={() => {
                                    setSelectedId(item.id);
                                    setMobileDetailOpen(true);
                                  }}
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </section>

                    <Show
                      when={
                        menuTab() === "library" ? selectedItem() : undefined
                      }
                      fallback={
                        <Show when={menuTab() === "library"}>
                          <aside class="hidden border-l border-white/8 bg-[#151c1b] xl:block" />
                        </Show>
                      }
                    >
                      {(item) => (
                        <div class="hidden xl:block">
                          <DetailPanel
                            item={item()}
                            onClose={() => setSelectedId("")}
                            onInspect={() => closeMenu()}
                          />
                        </div>
                      )}
                    </Show>

                    <Show when={menuTab() === "options"}>
                      <OptionsPanel
                        availableTags={availableTags()}
                        libraryConfig={libraryConfig()}
                        onLibraryConfigChange={(config) =>
                          void updateLibraryConfig(config)
                        }
                        onReenrollLibraryRoot={reenrollBookRoot}
                        reenrollableBookPaths={reenrollableBookPaths()}
                        blacklistedTags={blacklistedTags()}
                        defaultReadingDirection={defaultReadingDirection()}
                        gamepadLookSensitivity={gamepadLookSensitivity()}
                        mouseSensitivity={mouseSensitivity()}
                        onBlacklistedTagsChange={updateBlacklistedTags}
                        onDefaultReadingDirectionChange={
                          updateDefaultReadingDirection
                        }
                        onGamepadLookSensitivityChange={
                          updateGamepadLookSensitivity
                        }
                        onMouseSensitivityChange={updateMouseSensitivity}
                        onPurgeBlacklistedWorks={() =>
                          setPurgeBlacklistedOpen(true)
                        }
                        onUnstuck={() => {
                          setUnstuckRequest((request) => request + 1);
                          closeMenu();
                        }}
                        onRespectBookReadingDirectionChange={
                          updateRespectBookReadingDirection
                        }
                        onTvScreenLightingChange={updateTvScreenLighting}
                        purgeDisabled={
                          libraryUpdating() ||
                          unavailableBookPathCount() > 0 ||
                          blacklistedTagWorkCandidates().length === 0
                        }
                        purgeWorkCount={blacklistedTagWorkCandidates().length}
                        respectBookReadingDirection={respectBookReadingDirection()}
                        tvScreenLighting={tvScreenLighting()}
                      />
                    </Show>
                    <Show when={menuTab() === "shortcuts"}>
                      <ShortcutsPanel
                        config={shortcutsConfig()}
                        onChange={updateShortcuts}
                        padMappingOverrides={padMappingOverrides()}
                        onPadMappingChange={updatePadMappingOverrides}
                      />
                    </Show>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={mobileDetailOpen()}>
              <Show when={selectedItem()}>
                {(item) => (
                  <div
                    class="fixed inset-0 z-40 bg-black/70 xl:hidden"
                    onClick={() => setMobileDetailOpen(false)}
                  >
                    <div
                      class="absolute inset-y-0 right-0 w-full max-w-sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DetailPanel
                        item={item()}
                        onClose={() => setMobileDetailOpen(false)}
                        onInspect={() => {
                          setMobileDetailOpen(false);
                          closeMenu();
                        }}
                      />
                    </div>
                  </div>
                )}
              </Show>
            </Show>

            <Show when={purgeBlacklistedOpen()}>
              <PurgeBlacklistedWorksDialog
                blacklistedTags={blacklistedTags()}
                busy={libraryUpdating()}
                workCount={blacklistedTagWorkCandidates().length}
                onCancel={() => setPurgeBlacklistedOpen(false)}
                onConfirm={() => void purgeBlacklistedWorks()}
              />
            </Show>

            <Show when={libraryRepairOpen()}>
              <LibraryRepairDialog
                onCancel={() => setLibraryRepairOpen(false)}
                onConfirm={(options) => {
                  setLibraryRepairOpen(false);
                  void scanLibrary("repair", options);
                }}
              />
            </Show>

            <Show when={libraryUpdateOpen()}>
              <LibraryUpdateDialog
                busy={libraryUpdating()}
                fetchOnBoot={fetchOnBoot()}
                fetchLimit={libraryFetchLimit()}
                maxSearchPages={librarySearchPageLimit()}
                providerId={selectedProviderId()}
                providers={availableLibraryProviders()}
                providerError={libraryProviderError()}
                onCancel={closeLibraryUpdate}
                onConfirm={(
                  rememberBootFetch,
                  providerId,
                  query,
                  fetchLimit,
                  maxSearchPages,
                ) =>
                  void fetchMoreLibrary({
                    limit: fetchLimit,
                    maxSearchPages,
                    rememberBootFetch,
                    providerId,
                    query,
                  })
                }
                onFetchOnBootChange={setFetchOnBoot}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  saveLibraryProviderPreference(providerId);
                }}
              />
            </Show>
          </div>
        </Show>
      </main>
    </UiModeProvider>
  );
};
