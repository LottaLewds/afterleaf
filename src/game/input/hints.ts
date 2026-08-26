import {
  formatGamepadButton,
  gamepadButtonIcon,
  type GamepadButtonName,
  type GamepadStyle,
  type ShortcutAction,
  type ShortcutsConfig,
} from "~/game/input/bindings";

/** A rendered piece of an interaction prompt row. */
export type InteractionPromptToken = {type: "button"; icon: string; alt: string} | {type: "text"; text: string};

/**
 * Resolves the pad prompts for one interaction row.
 *
 * `actions` entries line up with the " / " alternatives of the keyboard hint
 * string, so ambiguous letters resolve to exactly the action the row means.
 * Rows without any pad-bound action return undefined and stay on keycaps.
 */
export const buildInteractionPrompts = (
  key: string,
  actions: readonly (ShortcutAction | undefined)[] | undefined,
  config: ShortcutsConfig,
  style: GamepadStyle,
): InteractionPromptToken[] | undefined => {
  // Mouse-wheel affordances have no controller equivalent; keep keycaps so
  // the prompt never promises something the pad cannot do.
  if (/\b(?:Wheel|Shift|Ctrl|Hold)\b/i.test(key)) return undefined;

  const alternatives = key.split(" / ");
  const tokens: InteractionPromptToken[] = [];
  let sawButton = false;
  for (const [index, alternative] of alternatives.entries()) {
    if (index > 0) tokens.push({type: "text", text: "/"});
    const action = actions?.[index];
    const padCode = action ? padBindingFor(config, action) : undefined;
    if (padCode) {
      const icon = gamepadButtonIcon(padCode, style);
      if (icon) {
        sawButton = true;
        tokens.push({
          type: "button",
          icon,
          alt: formatGamepadButton(padCode, style),
        });
        continue;
      }
    }
    for (const word of alternative.split(" ")) tokens.push({type: "text", text: word});
  }
  if (!sawButton) return undefined;
  return collapseDuplicates(tokens);
};

/** Resolves a physical keyboard code to its display label (layout-aware). */
export type KeyboardLabelResolver = (code: string) => string;

/**
 * Derives the keyboard display string of an interaction row from the live
 * bindings - the single source of truth, so rebound actions update every
 * hint. Returns undefined when the row cannot be fully derived (missing
 * action refs, unbound action); callers then fall back to the literal key.
 */
export const formatInteractionRowKey = (
  actions: readonly (ShortcutAction | undefined)[] | undefined,
  config: ShortcutsConfig,
  resolveKeyboardLabel: KeyboardLabelResolver,
): string | undefined => {
  if (!actions?.length) return undefined;
  const alternatives: string[] = [];
  let previous: ShortcutAction | undefined;
  for (const action of actions) {
    if (!action) return undefined;
    // Repeated actions ("Click / E" -> interact twice) collapse to one.
    if (action !== previous) alternatives.push(keyboardBindingLabel(config, action, resolveKeyboardLabel));
    previous = action;
  }
  return alternatives.length > 0 ? alternatives.join(" / ") : undefined;
};

const keyboardBindingLabel = (
  config: ShortcutsConfig,
  action: ShortcutAction,
  resolveKeyboardLabel: KeyboardLabelResolver,
): string => {
  const binding = config[action]?.find((candidate) => candidate.device === "keyboard");
  return binding?.device === "keyboard" ? resolveKeyboardLabel(binding.code) : "?";
};

const padBindingFor = (config: ShortcutsConfig, action: ShortcutAction): GamepadButtonName | undefined => {
  const binding = config[action]?.find((candidate) => candidate.device === "gamepad");
  return binding?.device === "gamepad" ? binding.code : undefined;
};

const collapseDuplicates = (tokens: readonly InteractionPromptToken[]): InteractionPromptToken[] => {
  const result: InteractionPromptToken[] = [];
  for (const token of tokens) {
    const previous = result.at(-1);
    const secondLast = result.at(-2);
    // Collapse "A / A" into a single prompt.
    if (
      token.type === "button" &&
      previous?.type === "text" &&
      previous.text === "/" &&
      secondLast?.type === "button" &&
      secondLast.icon === token.icon
    ) {
      result.pop();
      result.pop();
    }
    result.push(token);
  }
  return result;
};
