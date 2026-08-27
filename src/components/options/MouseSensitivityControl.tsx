import {FiCrosshair} from "solid-icons/fi";
import {MAX_MOUSE_SENSITIVITY, MIN_MOUSE_SENSITIVITY} from "~/game/controlPreferences";

export const MouseSensitivityControl = (props: {onChange: (value: number) => void; value: number}) => (
  <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
    <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
      <FiCrosshair size={15} />
    </span>
    <div class="min-w-0 sm:w-52">
      <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">Mouse sensitivity</p>
      <p class="mt-1 text-[9px] leading-4 text-[#65716c]">Camera look is smoothed at display refresh rate.</p>
    </div>
    <label class="flex min-w-0 flex-1 items-center gap-4">
      <span class="sr-only">Mouse sensitivity</span>
      <input
        class="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#d94c3f]"
        type="range"
        min={MIN_MOUSE_SENSITIVITY * 100}
        max={MAX_MOUSE_SENSITIVITY * 100}
        step="5"
        value={Math.round(props.value * 100)}
        onInput={(event) => props.onChange(Number(event.currentTarget.value) / 100)}
      />
      <span class="w-12 text-right text-[10px] font-semibold text-[#aeb8b3] tabular-nums">
        {Math.round(props.value * 100)}%
      </span>
    </label>
  </div>
);
