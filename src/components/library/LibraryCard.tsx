import {FiArrowUpRight} from "solid-icons/fi";
import type {CatalogItem} from "~/catalog";

export const LibraryCard = (props: {item: CatalogItem; active: boolean; onSelect: () => void}) => (
  <button
    class="group min-w-0 cursor-pointer text-left outline-none"
    aria-pressed={props.active ? "true" : "false"}
    onClick={() => props.onSelect?.()}
  >
    <div
      class={[
        "cover-frame relative aspect-[2/3] overflow-hidden bg-[#252b2b] shadow-[0_13px_21px_#02050475] transition duration-300 group-hover:-translate-y-2 group-hover:rotate-[0.4deg] group-hover:shadow-[0_20px_28px_#02050490] group-focus-visible:ring-2 group-focus-visible:ring-[#e85649]",
        {"ring-2 ring-[#e85649] ring-offset-4 ring-offset-[#121918]": props.active},
      ]}
    >
      <img class="size-full object-cover" src={props.item.cover} alt={`${props.item.title} cover`} loading="lazy" />
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 via-black/10 to-transparent p-3 pt-12 opacity-0 transition group-hover:opacity-100">
        <span class="text-[10px] font-bold tracking-[0.15em] text-white uppercase">Inspect</span>
        <FiArrowUpRight color="#ffffff" size={15} />
      </div>
    </div>
    <div class="px-1 pt-3">
      <div class="flex items-start justify-between gap-2">
        <p class="truncate text-[13px] font-semibold text-[#e5e1d8]">{props.item.title}</p>
        <span class="mt-0.5 shrink-0 text-[10px] text-[#737d79] tabular-nums">
          #{props.item.issue.toString().padStart(2, "0")}
        </span>
      </div>
      <p class="mt-1 truncate text-[10px] tracking-[0.1em] text-[#78827f] uppercase">{props.item.collection}</p>
    </div>
  </button>
);
