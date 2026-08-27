import {FiBookOpen} from "solid-icons/fi";
import {For} from "solid-js";
import type {ReadingDirection} from "~/game/controlPreferences";

const readingDirectionOptions: readonly {
  label: string;
  value: ReadingDirection;
}[] = [
  {label: "Left to right", value: "LTR"},
  {label: "Right to left", value: "RTL"},
];

export const ReadingDirectionControl = (props: {
  defaultDirection: ReadingDirection;
  onDefaultDirectionChange: (value: ReadingDirection) => void;
  onRespectMetadataChange: (value: boolean) => void;
  respectMetadata: boolean;
}) => (
  <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
    <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
      <FiBookOpen size={15} />
    </span>
    <div class="min-w-0 sm:w-52">
      <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">Reading direction</p>
      <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
        The default applies when metadata is unavailable or overridden.
      </p>
    </div>
    <div class="min-w-0 flex-1 space-y-2">
      <button
        class="flex min-h-11 w-full items-center gap-3 bg-[#1b2422] px-3 py-2 text-left transition hover:bg-[#202b28]"
        aria-checked={props.respectMetadata ? "true" : "false"}
        onClick={() => props.onRespectMetadataChange(!props.respectMetadata)}
        role="switch"
        type="button"
      >
        <span
          class={[
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            {
              "bg-[#d94c3f]": props.respectMetadata,
              "bg-[#3b4743]": !props.respectMetadata,
            },
          ]}
        >
          <span
            class={[
              "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
              {
                "translate-x-[18px]": props.respectMetadata,
                "translate-x-0.5": !props.respectMetadata,
              },
            ]}
          />
        </span>
        <span>
          <span class="block text-[9px] font-semibold tracking-[0.08em] text-[#c5cec9] uppercase">
            Respect book metadata
          </span>
          <span class="mt-0.5 block text-[8px] leading-3 text-[#65716c]">
            Turn off when imported metadata is wrong or unreliable.
          </span>
        </span>
      </button>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <For each={readingDirectionOptions}>
          {(option) => (
            <button
              class={[
                "min-h-10 px-3 py-2 text-[9px] font-semibold tracking-[0.08em] uppercase transition",
                {
                  "bg-[#ece6d8] text-[#1b2321]": props.defaultDirection === option.value,
                  "bg-[#1b2422] text-[#7f8b86] hover:bg-[#202b28] hover:text-white":
                    props.defaultDirection !== option.value,
                },
              ]}
              aria-pressed={props.defaultDirection === option.value ? "true" : "false"}
              onClick={() => props.onDefaultDirectionChange(option.value)}
              type="button"
            >
              Default: {option.label}
            </button>
          )}
        </For>
      </div>
    </div>
  </div>
);
