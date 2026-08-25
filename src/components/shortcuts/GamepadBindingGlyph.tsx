import {
  gamepadButtonIcon,
  formatGamepadButton,
  type GamepadButtonName,
  type GamepadStyle,
} from "~/game/input/bindings";
import {promptIconUrl} from "~/game/input/prompts";
import {Show} from "solid-js";

export const GamepadBindingGlyph = (props: {
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
