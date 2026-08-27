import {FiTool} from "solid-icons/fi";
import {createSignal} from "solid-js";

export interface LibraryRepairOptions {
  redownloadProviderAssets: boolean;
  repairProviderMetadata: boolean;
}

export const LibraryRepairDialog = (props: {
  onCancel: () => void;
  onConfirm: (options: LibraryRepairOptions) => void;
}) => {
  const [repairProviderMetadata, setRepairProviderMetadata] = createSignal(false);
  const [redownloadProviderAssets, setRedownloadProviderAssets] = createSignal(false);
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
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">Library maintenance</p>
            <h2 id="deep-repair-title" class="mt-2 font-serif text-2xl text-[#f0ebdf]">
              Deep scan and repair
            </h2>
          </div>
        </div>

        <p class="mt-5 text-xs leading-5 text-[#929e99]">
          Every local publication and generated asset will be validated and rebuilt. This takes longer than Scan new but
          does not contact online providers unless you select an option below.
        </p>

        <div class="mt-5 space-y-3">
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={repairProviderMetadata()}
              onInput={(event) => setRepairProviderMetadata(event.currentTarget.checked)}
            />
            <span>
              <span class="block font-semibold text-[#d6dcd8]">Update older provider metadata</span>
              <span class="mt-1 block text-[10px] leading-4 text-[#707c77]">
                Upgrade cached books that need current metadata. This may download a few representative pages, but it
                does not search for new books.
              </span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={redownloadProviderAssets()}
              onInput={(event) => setRedownloadProviderAssets(event.currentTarget.checked)}
            />
            <span>
              <span class="block font-semibold text-[#d6dcd8]">Re-download cached provider images</span>
              <span class="mt-1 block text-[10px] leading-4 text-[#707c77]">
                Refresh preview and back-cover images for every cached remote book. Use this only when those images
                appear damaged or incomplete.
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
