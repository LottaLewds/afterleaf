import {
  DEFAULT_SHORTCUTS,
  detectGamepadStyle,
  formatKeyboardCode,
  GAMEPAD_BUTTON_NAMES,
  SHORTCUT_CATEGORIES,
  SHORTCUT_LABELS,
  type GamepadButtonName,
  type GamepadStyle,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutsConfig,
} from "~/game/input/bindings";
import {
  formatArcadeKeyBinding,
  resolvePadMapping,
  resetPadMapping,
  SYSTEM_CONTROLLER_CONTROLS,
  type ArcadePadMappingOverrides,
} from "~/arcade/controllerMappings";
import {ControllerDiagram} from "~/arcade/ControllerDiagram";
import {findArcadeSystem, ARCADE_SYSTEMS, type ArcadeSystemId} from "~/arcade/systems";
import {GamepadBindingGlyph} from "~/components/shortcuts/GamepadBindingGlyph";
import {createEffect, createSignal, For, onCleanup, onMount, Show} from "solid-js";

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

export const ShortcutsPanel = (props: {
  config: ShortcutsConfig;
  onChange: (config: ShortcutsConfig) => void;
  padMappingOverrides: ArcadePadMappingOverrides;
  onPadMappingChange: (overrides: ArcadePadMappingOverrides) => void;
}) => {
  const [listening, setListening] = createSignal<CaptureTarget | undefined>();
  // Emulated system whose controller layout is being configured.
  const [selectedSystemId, setSelectedSystemId] = createSignal<ArcadeSystemId>("nes");
  const selectedSystem = () => findArcadeSystem(selectedSystemId());
  // Detected controller family for pad glyph display; undefined while no pad
  // has been seen yet.
  const [padStyle, setPadStyle] = createSignal<GamepadStyle | undefined>();

  /** Fully-resolved pad mapping (defaults + overrides) for a system. */
  const resolvedPadMapping = (systemId: ArcadeSystemId) => resolvePadMapping(systemId, props.padMappingOverrides);

  /** Standard-gamepad button bound to a console control, if any. */
  const buttonForControl = (systemId: ArcadeSystemId, controlId: number): GamepadButtonName | undefined =>
    GAMEPAD_BUTTON_NAMES.find((button) => resolvedPadMapping(systemId)[button] === controlId);

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
  const setPadBinding = (systemId: ArcadeSystemId, controlId: number, button: GamepadButtonName) => {
    const mapping = {...resolvedPadMapping(systemId)};
    for (const name of GAMEPAD_BUTTON_NAMES) if (mapping[name] === controlId) delete mapping[name];
    mapping[button] = controlId;
    props.onPadMappingChange({
      ...props.padMappingOverrides,
      [systemId]: mapping,
    });
    setListening(undefined);
  };

  const resetSystemPadMapping = (systemId: ArcadeSystemId) =>
    props.onPadMappingChange(resetPadMapping(props.padMappingOverrides, systemId));

  const updateBinding = (action: ShortcutAction, device: ShortcutBinding["device"], code: string) => {
    // Keyboard codes are stored verbatim; gamepad codes arrive already
    // resolved to standard-mapping button names by the capture loops.
    const binding: ShortcutBinding = device === "keyboard" ? {device, code} : {device, code: code as GamepadButtonName};
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
        if (current.kind !== "shortcut" || current.device !== "keyboard") return;
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
        const pressed = Array.from(gamepad.buttons, (button) => Boolean(button?.pressed || (button?.value ?? 0) > 0.5));
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
            if (current.kind === "padControl") setPadBinding(current.systemId, current.controlId, name);
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
        <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">Controls</p>
        <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">Shortcuts</h2>
        <p class="mt-2 max-w-xl text-xs leading-5 text-[#6e7974]">
          Click any binding to remap it. Keyboard codes are physical keys; press Escape while capturing to cancel.
        </p>

        <div class="mt-8 flex items-center justify-between gap-4">
          <span class="text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">Action</span>
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
              <p class="mb-3 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">{category.label}</p>
              <div class="space-y-2">
                <For each={category.actions}>
                  {(action) => {
                    const keyboard = () => props.config[action].find((binding) => binding.device === "keyboard");
                    const gamepad = () => props.config[action].find((binding) => binding.device === "gamepad");
                    const isListening = (device: ShortcutBinding["device"]) => {
                      const current = listening();
                      return current?.kind === "shortcut" && current.action === action && current.device === device;
                    };

                    return (
                      <div class="flex items-center justify-between gap-4 border border-white/8 bg-[#151e1c] px-4 py-3">
                        <span class="text-xs text-[#b8c1bc]">{SHORTCUT_LABELS[action]}</span>
                        <div class="flex items-center gap-2">
                          <button
                            class="flex h-9 min-w-[4.5rem] items-center justify-center border border-white/10 bg-[#121918] px-2.5 text-center text-[10px] font-semibold tracking-wider text-[#e2ded4] uppercase transition hover:border-[#d94c3f]/40 hover:text-white"
                            classList={{
                              "animate-pulse border-[#d94c3f]/60 text-[#d94c3f]": isListening("keyboard"),
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
                              "animate-pulse border-[#d94c3f]/60 text-[#d94c3f]": isListening("gamepad"),
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
                              {(binding) => <GamepadBindingGlyph code={binding().code} style={padStyle()} />}
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
          <p class="mb-3 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">Emulator controllers</p>
          <p class="mb-4 max-w-xl text-xs leading-5 text-[#6e7974]">
            Map your controller to each retro system. Click a console button below, then press the controller button you
            want to use for it.
          </p>
          <div class="border border-white/8 bg-[#151e1c] p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-3">
              <select
                class="h-8 border border-white/10 bg-[#0c1312] px-2 text-xs text-[#e2ded4] [color-scheme:dark]"
                value={selectedSystemId()}
                onChange={(event) => setSelectedSystemId(event.currentTarget.value as ArcadeSystemId)}
              >
                <For each={ARCADE_SYSTEMS}>
                  {(system) => (
                    <option value={system.id} class="bg-[#1b2422] text-[#f0ecdf]">
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
                    mappedIds={() => new Set(Object.values(resolvedPadMapping(system().id)))}
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
                        const boundButton = () => buttonForControl(system().id, control.id);
                        const isCapturing = () => {
                          const current = listening();
                          return current?.kind === "padControl" && current.controlId === control.id;
                        };
                        return (
                          <div class="flex items-center justify-between gap-3 border border-white/8 bg-[#121918] px-3 py-2">
                            <span class="text-xs text-[#b8c1bc]">{control.label}</span>
                            <span
                              class="font-mono text-[10px] tracking-wider text-[#59645f]"
                              title="Default keyboard binding"
                            >
                              {formatArcadeKeyBinding(control.keyboard)}
                            </span>
                            <button
                              class="flex h-9 min-w-[4.5rem] items-center justify-center border border-white/10 bg-[#151e1c] px-2.5 text-center transition hover:border-[#d94c3f]/40"
                              classList={{
                                "animate-pulse border-[#d94c3f]/60": isCapturing(),
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
                                {(button) => <GamepadBindingGlyph code={button()} style={padStyle()} />}
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
              The left stick also acts as the d-pad. Keyboard bindings for the emulators stay on their defaults shown
              above.
            </p>
          </div>
        </div>

        <p class="mt-6 text-[10px] tracking-[0.08em] text-[#59645f] uppercase">
          {(() => {
            const current = listening();
            if (!current) return undefined;
            if (current.kind === "padControl") return "Press any controller button to bind it";
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
