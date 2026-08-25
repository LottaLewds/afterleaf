import {FiBookOpen, FiCheck, FiX} from "solid-icons/fi";
import {For} from "solid-js";
import type {CatalogItem} from "~/catalog";
import {languageLabels} from "~/components/library/languageLabels";

export const DetailPanel = (props: {
  item: CatalogItem;
  onClose: () => void;
  onInspect: () => void;
}) => (
  <aside class="detail-panel relative flex h-full min-h-[560px] flex-col overflow-hidden border-l border-white/8 bg-[#151c1b] xl:min-h-0">
    <div
      class="absolute inset-x-0 top-0 h-52 opacity-20 blur-2xl"
      style={{
        background: `radial-gradient(circle at 50% 0%, ${props.item.accent}, transparent 68%)`,
      }}
    />
    <div class="relative flex items-center justify-between border-b border-white/8 px-6 py-5">
      <p class="text-[10px] font-semibold tracking-[0.2em] text-[#77817d] uppercase">
        Selected publication
      </p>
      <button
        class="grid size-8 place-items-center text-[#7f8985] transition hover:bg-white/5 hover:text-white"
        aria-label="Close details"
        onClick={() => props.onClose?.()}
      >
        <FiX size={17} />
      </button>
    </div>
    <div class="relative min-h-0 flex-1 overflow-y-auto px-6 py-7">
      <div class="mx-auto w-[58%] max-w-[230px] -rotate-1 bg-[#222] p-1 shadow-[14px_20px_35px_#03070699]">
        <img
          class="aspect-[2/3] w-full object-cover"
          src={props.item.cover}
          alt=""
        />
      </div>
      <div class="mt-8 text-center">
        <p class="text-[11px] tracking-[0.15em] text-[#8b9691] uppercase">
          {props.item.titleJp}
        </p>
        <h2 class="mt-2 font-serif text-2xl leading-tight text-[#f1ecdf]">
          {props.item.title}
        </h2>
        <p class="mt-2 text-xs text-[#737e79]">
          {props.item.collection} · Issue {props.item.issue}
        </p>
      </div>

      <div class="mt-7 flex flex-wrap justify-center gap-2">
        <For each={props.item.tags}>
          {(tag) => (
            <span class="border border-white/9 bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-[#a2aca7]">
              {tag}
            </span>
          )}
        </For>
      </div>

      <dl class="mt-8 grid grid-cols-2 border-y border-white/8 py-5 text-xs">
        <div class="border-r border-white/8 pl-2">
          <dt class="text-[9px] tracking-widest text-[#65706c] uppercase">
            Format
          </dt>
          <dd class="mt-2 text-[#d5d2c9]">
            {props.item.trim} · {props.item.thicknessMm} mm
          </dd>
        </div>
        <div class="pl-5">
          <dt class="text-[9px] tracking-widest text-[#65706c] uppercase">
            Reading
          </dt>
          <dd class="mt-2 text-[#d5d2c9]">
            {props.item.direction} · {languageLabels[props.item.language]}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex items-center gap-3 bg-[#1b2422] px-4 py-3.5">
        <span class="grid size-8 place-items-center rounded-full bg-[#5c8e7c]/15 text-[#73ad98]">
          <FiCheck size={15} />
        </span>
        <div>
          <p class="text-xs font-medium text-[#cfd8d3]">Ready to shelve</p>
          <p class="mt-0.5 text-[10px] text-[#687570]">
            Metadata and cover verified
          </p>
        </div>
      </div>
    </div>
    <div class="relative border-t border-white/8 p-5">
      <button
        class="flex w-full items-center justify-center gap-2 bg-[#e14f42] px-5 py-3.5 text-xs font-bold text-white transition hover:bg-[#eb5a4e]"
        onClick={() => props.onInspect?.()}
      >
        <FiBookOpen size={15} /> Return to the shop
      </button>
      <p class="mt-3 text-center text-[9px] text-[#66716d]">
        Added {props.item.added}
      </p>
    </div>
  </aside>
);
