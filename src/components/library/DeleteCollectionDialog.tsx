import {FiTrash2} from "solid-icons/fi";

export const DeleteCollectionDialog = (props: {
  busy: boolean;
  collectionName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <div
    class="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-collection-title"
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
          <h2 id="delete-collection-title" class="mt-2 font-serif text-2xl text-[#f0ebdf]">
            Delete collection?
          </h2>
        </div>
      </div>

      <p class="mt-5 text-xs leading-5 text-[#929e99]">
        Delete &quot;{props.collectionName}&quot;? The collection and its saved membership will be removed, but the
        books themselves will remain in your library.
      </p>
      <p class="mt-4 border border-[#d94c3f]/25 bg-[#d94c3f]/8 p-3 text-[10px] leading-4 text-[#d9aaa5]">
        This cannot be undone.
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
          {props.busy ? "Deleting…" : "Delete collection"}
        </button>
      </div>
    </div>
  </div>
);
