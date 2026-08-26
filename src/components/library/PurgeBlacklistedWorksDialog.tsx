import {FiTrash2} from "solid-icons/fi";
import {For} from "solid-js";

export const PurgeBlacklistedWorksDialog = (props: {
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
          <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">Destructive action</p>
          <h2 id="purge-blacklisted-title" class="mt-2 font-serif text-2xl text-[#f0ebdf]">
            Purge blacklisted works?
          </h2>
        </div>
      </div>

      <p class="mt-5 text-xs leading-5 text-[#929e99]">
        This will remove {props.workCount} catalogued {props.workCount === 1 ? "work" : "works"} matching any
        blacklisted tag, discard their managed source files, and rebuild the local library.
      </p>
      <div class="mt-4 flex flex-wrap gap-2" aria-label="Tags to purge">
        <For each={props.blacklistedTags}>
          {(tag) => <span class="bg-[#251d1c] px-2.5 py-1.5 text-[9px] text-[#d9aaa5]">{tag}</span>}
        </For>
      </div>
      <p class="mt-5 border border-[#d94c3f]/25 bg-[#d94c3f]/8 p-3 text-[10px] leading-4 text-[#d9aaa5]">
        This cannot be undone. Confirm only if you want these works removed from this library.
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
          {props.busy ? "Purging…" : `Purge ${props.workCount} ${props.workCount === 1 ? "work" : "works"}`}
        </button>
      </div>
    </div>
  </div>
);
