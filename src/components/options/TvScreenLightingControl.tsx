import {FiTv} from "solid-icons/fi";

export const TvScreenLightingControl = (props: {enabled: boolean; onChange: (enabled: boolean) => void}) => (
  <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
    <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
      <FiTv size={15} />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">TV screen lighting</p>
      <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
        Let active screens cast sampled color light onto nearby surfaces.
      </p>
    </div>
    <button
      class="flex min-h-11 shrink-0 items-center gap-3 bg-[#1b2422] px-3 py-2 text-left transition hover:bg-[#202b28]"
      aria-checked={props.enabled ? "true" : "false"}
      onClick={() => props.onChange(!props.enabled)}
      role="switch"
      type="button"
    >
      <span
        class={[
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          {
            "bg-[#d94c3f]": props.enabled,
            "bg-[#3b4743]": !props.enabled,
          },
        ]}
      >
        <span
          class={[
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            {
              "translate-x-[18px]": props.enabled,
              "translate-x-0.5": !props.enabled,
            },
          ]}
        />
      </span>
      <span class="text-[9px] font-semibold tracking-[0.08em] text-[#c5cec9] uppercase">
        {props.enabled ? "On" : "Off"}
      </span>
    </button>
  </div>
);
