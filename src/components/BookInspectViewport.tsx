import {
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiRotateCcw,
} from "solid-icons/fi";
import {
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";

import type {CatalogItem} from "~/catalog";
import {BookInspectScene} from "~/game/BookInspectScene";
import {formatPageCounter, getReaderSpread} from "~/reader/pagination";

export type BookInspectViewportProps = {
  initialPage?: number;
  publication: Accessor<CatalogItem | undefined>;
  class?: string;
  onPageChange?: (pageIndex: number) => void;
  onReady?: () => void;
  paused?: Accessor<boolean>;
};

/** Owns one renderer while the publication accessor changes beneath it. */
export const BookInspectViewport = (props: BookInspectViewportProps) => {
  const [coverOpen, setCoverOpen] = createSignal(0);
  const [error, setError] = createSignal<string>();
  const [pageIndex, setPageIndex] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  let canvas: HTMLCanvasElement | undefined;
  let inspectScene: BookInspectScene | undefined;

  onMount(() => {
    const sceneCanvas = canvas;
    if (!sceneCanvas) return;

    try {
      inspectScene = new BookInspectScene({
        canvas: sceneCanvas,
        initialPageIndex: () => props.initialPage ?? 0,
        publication: props.publication,
        onCoverOpenChange: setCoverOpen,
        onPageIndexChange: (nextPageIndex) => {
          setPageIndex(nextPageIndex);
          props.onPageChange?.(nextPageIndex);
        },
        onReady: () => {
          setReady(true);
          props.onReady?.();
        },
        ...(props.paused === undefined ? {} : {paused: props.paused}),
      });
      inspectScene.start();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The book inspector could not be initialized.",
      );
    }
  });

  onCleanup(() => inspectScene?.dispose());

  const setOpenAmount = (amount: number) => {
    inspectScene?.setCoverOpen(amount);
    setCoverOpen(amount);
  };

  const pageCount = () => props.publication()?.pages.length ?? 0;
  const currentSpread = createMemo(() =>
    getReaderSpread(pageIndex(), pageCount(), "spread"),
  );
  const pageCounter = () =>
    formatPageCounter(currentSpread().pageIndices, pageCount());

  return (
    <section
      class={`relative isolate size-full overflow-hidden bg-[#151817] ${props.class ?? ""}`}
      aria-label="Zoomed physical book view"
    >
      <canvas
        ref={(element) => {
          canvas = element;
        }}
        class="block size-full cursor-grab touch-none outline-none"
        aria-label="Interactive physical book. Drag to rotate and scroll to open the cover."
      />

      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start bg-gradient-to-b from-black/55 to-transparent p-4 sm:p-5">
        <div class="border-l-2 border-[#d94c3f] bg-[#111514]/75 px-3 py-2 backdrop-blur-sm">
          <p class="text-[9px] font-bold tracking-[0.22em] text-[#beb8ad] uppercase">
            Zoomed view · physical edition
          </p>
          <Show
            when={props.publication()}
            fallback={
              <p class="mt-1 font-serif text-sm text-[#eee8dc]">
                Select an edition
              </p>
            }
          >
            {(publication) => (
              <p class="mt-1 max-w-72 truncate font-serif text-sm text-[#eee8dc]">
                {publication().title}
              </p>
            )}
          </Show>
        </div>
      </div>

      <Show when={props.publication()}>
        <div class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-[#111413] via-[#111413]/50 to-transparent p-4 pt-20 sm:p-5 sm:pt-24">
          <p class="pointer-events-none max-w-xs text-[10px] leading-4 text-[#aaa69d]">
            Scroll over the book or use the controls to ease the front cover
            open.
          </p>
          <div class="flex items-center gap-1.5 rounded-sm border border-white/10 bg-[#171b1a]/85 p-1.5 backdrop-blur-sm">
            <Show when={pageCount() > 1}>
              <button
                type="button"
                class="grid size-8 place-items-center text-[#bdb7ab] transition-colors hover:bg-white/8 hover:text-[#f1eadc] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                aria-label="Previous page"
                title="Previous page"
                disabled={currentSpread().start === 0}
                onClick={() => inspectScene?.turnPage(-1)}
              >
                <FiChevronLeft class="size-3.5" />
              </button>
              <span class="min-w-28 text-center text-[9px] font-semibold tracking-[0.12em] text-[#aaa69d] uppercase tabular-nums">
                {pageCounter()}
              </span>
              <button
                type="button"
                class="grid size-8 place-items-center text-[#bdb7ab] transition-colors hover:bg-white/8 hover:text-[#f1eadc] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                aria-label="Next page"
                title="Next page"
                disabled={
                  (currentSpread().pageIndices.at(-1) ?? 0) >= pageCount() - 1
                }
                onClick={() => inspectScene?.turnPage(1)}
              >
                <FiChevronRight class="size-3.5" />
              </button>
              <span class="mx-0.5 h-5 w-px bg-white/10" />
            </Show>
            <button
              type="button"
              class="grid size-8 place-items-center text-[#bdb7ab] transition-colors hover:bg-white/8 hover:text-[#f1eadc]"
              aria-label="Reset book view"
              title="Reset view"
              onClick={() => inspectScene?.resetView()}
            >
              <FiRotateCcw class="size-3.5" />
            </button>
            <button
              type="button"
              class="flex h-8 items-center gap-2 px-2.5 text-[9px] font-bold tracking-[0.14em] text-[#d8d0c2] uppercase transition-colors hover:bg-white/8 hover:text-white"
              aria-label={coverOpen() > 0.4 ? "Close cover" : "Open cover"}
              onClick={() => setOpenAmount(coverOpen() > 0.4 ? 0 : 0.78)}
            >
              <FiBookOpen class="size-3.5 text-[#d94c3f]" />
              {coverOpen() > 0.4 ? "Close" : "Open"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={!ready() && !error()}>
        <div class="pointer-events-none absolute inset-0 grid place-items-center bg-[#151817]">
          <div class="text-center">
            <span class="mx-auto block size-5 animate-spin rounded-full border-2 border-[#6f7471] border-t-[#d94c3f]" />
            <p class="mt-3 text-[9px] font-semibold tracking-[0.2em] text-[#92958f] uppercase">
              Preparing the inspection table
            </p>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <div class="absolute inset-0 grid place-items-center bg-[#151817] p-6 text-center">
            <div class="max-w-sm border border-[#a44238]/40 bg-[#1b1f1e] p-6">
              <p class="font-serif text-lg text-[#eee8dc]">
                The inspection light stayed off.
              </p>
              <p class="mt-2 text-xs leading-5 text-[#aaa69d]">{message()}</p>
            </div>
          </div>
        )}
      </Show>
    </section>
  );
};
