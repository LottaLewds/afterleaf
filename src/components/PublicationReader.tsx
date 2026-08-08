import {
  FiAlertTriangle,
  FiBookmark,
  FiChevronLeft,
  FiChevronRight,
  FiLoader,
  FiX,
} from "solid-icons/fi";
import {
  Index,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
  type Accessor,
} from "solid-js";

import type {CatalogItem} from "~/catalog";
import {physicalBookWidth} from "~/game/bookDimensions";
import {
  detectWideReaderPage,
  getWideReaderPageIndices,
  readerPageSourceUrl,
  subscribeToWideReaderPages,
} from "~/reader/pageSpreadDetection";
import {
  READER_PAGE_BUFFER_SIZE,
  clampPageIndex,
  formatPageCounter,
  getAdjacentSpreadStart,
  getArrowNavigation,
  getReaderSpread,
  getReaderWindow,
  orderSpreadPages,
  type ReaderNavigation,
} from "~/reader/pagination";

export type PublicationReaderProps = {
  publication: Accessor<CatalogItem>;
  initialPage?: number;
  onClose: () => void;
  onBookmark: (publicationId: string, pageIndex: number) => void;
};

type ReaderPageProps = {
  expectedAspectRatio: Accessor<number>;
  isWide: Accessor<boolean>;
  pageIndex: Accessor<number>;
  pages: Accessor<readonly string[]>;
  title: Accessor<string>;
  visible: Accessor<boolean>;
  order: Accessor<number>;
};

const ReaderPage = (props: ReaderPageProps) => {
  const [status, setStatus] = createSignal<"error" | "loaded" | "loading">(
    "loading",
  );
  const source = () => props.pages()[props.pageIndex()] ?? "";
  let image: HTMLImageElement | undefined;

  createEffect(
    on(source, (nextSource) => setStatus(nextSource ? "loading" : "error")),
  );

  const isCurrentSource = (element: HTMLImageElement) =>
    element.getAttribute("src") === source();

  const retry = () => {
    if (!image) return;
    setStatus("loading");
    image.src = source();
  };

  return (
    <figure
      class="relative mx-auto flex h-full max-h-full w-full max-w-full items-center justify-center overflow-hidden bg-[#0a0f0e] shadow-[0_24px_70px_#000a]"
      classList={{
        "aspect-[2/3]": !props.isWide(),
        "aspect-[4/3]": props.isWide(),
        hidden: !props.visible(),
      }}
      style={{order: props.order()}}
      aria-hidden={!props.visible()}
    >
      <img
        ref={image}
        class="absolute inset-0 size-full object-contain select-none"
        classList={{"opacity-0": status() !== "loaded"}}
        src={source()}
        alt={`Page ${props.pageIndex() + 1} of ${props.title()}`}
        draggable={false}
        loading="eager"
        onLoad={(event) => {
          if (!isCurrentSource(event.currentTarget)) return;
          detectWideReaderPage(
            source(),
            event.currentTarget.naturalWidth,
            event.currentTarget.naturalHeight,
            props.expectedAspectRatio(),
          );
          setStatus("loaded");
        }}
        onError={(event) => {
          if (isCurrentSource(event.currentTarget)) setStatus("error");
        }}
      />

      <Show when={props.visible() && status() === "loading"}>
        <div class="grid place-items-center gap-3 text-center text-[#84908b]">
          <FiLoader class="animate-spin" size={22} />
          <p class="text-[10px] font-semibold tracking-[0.18em] uppercase">
            Loading page {props.pageIndex() + 1}
          </p>
        </div>
      </Show>

      <Show when={props.visible() && status() === "error"}>
        <div class="grid max-w-52 place-items-center gap-3 px-5 text-center">
          <FiAlertTriangle class="text-[#dd675b]" size={23} />
          <p class="text-xs leading-5 text-[#b8c0bc]">
            Page {props.pageIndex() + 1} could not be loaded.
          </p>
          <button
            class="border border-white/12 px-3 py-2 text-[10px] font-bold tracking-wide text-[#e9e4da] uppercase hover:bg-white/5"
            onClick={retry}
          >
            Try again
          </button>
        </div>
      </Show>
    </figure>
  );
};

export const PublicationReader = (props: PublicationReaderProps) => {
  const [pageIndex, setPageIndex] = createSignal(0);
  const [spreadRevision, setSpreadRevision] = createSignal(0);
  const [usesSpread, setUsesSpread] = createSignal(false);
  const pages = () => props.publication().pages;
  const title = () => props.publication().title;
  const layout = () => (usesSpread() ? "spread" : "single") as const;
  const pageCount = () => pages().length;
  const expectedAspectRatio = () =>
    physicalBookWidth(props.publication().aspectRatio, 1);
  const widePageIndices = createMemo(() => {
    spreadRevision();
    return getWideReaderPageIndices(pages());
  });
  const currentSpread = createMemo(() =>
    getReaderSpread(pageIndex(), pageCount(), layout(), widePageIndices()),
  );
  const visualPages = createMemo(() =>
    orderSpreadPages(
      currentSpread().pageIndices,
      props.publication().direction,
    ),
  );
  const mountedPages = createMemo(() =>
    getReaderWindow(
      pageIndex(),
      pageCount(),
      layout(),
      READER_PAGE_BUFFER_SIZE,
      widePageIndices(),
    ),
  );
  const visiblePages = createMemo(() => new Set(currentSpread().pageIndices));
  const pageCounter = () =>
    formatPageCounter(currentSpread().pageIndices, pageCount());
  let reader: HTMLElement | undefined;

  const navigate = (navigation: ReaderNavigation) => {
    setPageIndex((currentPage) =>
      getAdjacentSpreadStart(
        currentPage,
        pageCount(),
        layout(),
        navigation,
        widePageIndices(),
      ),
    );
  };

  const navigationForArrow = (key: "ArrowLeft" | "ArrowRight") =>
    getArrowNavigation(key, props.publication().direction);
  const canNavigate = (navigation: ReaderNavigation) =>
    getAdjacentSpreadStart(
      pageIndex(),
      pageCount(),
      layout(),
      navigation,
      widePageIndices(),
    ) !== currentSpread().start;
  const visualOrder = (index: number) => {
    const order = visualPages().indexOf(index);
    return order < 0 ? 0 : order;
  };

  createEffect(
    on(
      () => props.publication().id,
      () => {
        const publication = untrack(props.publication);
        setPageIndex(
          clampPageIndex(props.initialPage ?? 0, publication.pages.length),
        );
      },
    ),
  );
  createEffect(
    on(pageCount, (count) =>
      setPageIndex((currentPage) => clampPageIndex(currentPage, count)),
    ),
  );
  createEffect(
    on(layout, (nextLayout) => {
      const count = untrack(pageCount);
      setPageIndex(
        (currentPage) =>
          getReaderSpread(
            currentPage,
            count,
            nextLayout,
            untrack(widePageIndices),
          ).start,
      );
    }),
  );
  createEffect(
    on(
      [() => props.publication().id, () => currentSpread().start],
      ([publicationId, currentPage]) =>
        props.onBookmark(publicationId, currentPage),
    ),
  );

  onMount(() => {
    const abortController = new AbortController();
    const spreadQuery = window.matchMedia("(min-width: 768px)");
    const previousFocus = document.activeElement;
    const unsubscribeFromWidePages = subscribeToWideReaderPages((url) => {
      if (!untrack(pages).some((page) => readerPageSourceUrl(page) === url))
        return;
      setSpreadRevision((revision) => revision + 1);
    });
    const updateLayout = () => setUsesSpread(spreadQuery.matches);
    updateLayout();
    spreadQuery.addEventListener("change", updateLayout, {
      signal: abortController.signal,
    });
    window.addEventListener(
      "keydown",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.matches("input, textarea, select"))
        )
          return;
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        navigate(navigationForArrow(event.key));
      },
      {signal: abortController.signal},
    );
    reader?.focus();

    onCleanup(() => {
      abortController.abort();
      unsubscribeFromWidePages();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    });
  });

  return (
    <section
      ref={reader}
      class="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-[#080d0c] text-[#d9d6cc] outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${title()}`}
      tabIndex={-1}
    >
      <header class="relative z-10 flex h-16 shrink-0 items-center border-b border-white/8 bg-[#101716]/95 px-3 sm:px-6">
        <button
          class="grid size-10 shrink-0 place-items-center text-[#8b9691] transition hover:bg-white/5 hover:text-white"
          aria-label="Close reader"
          title="Close reader (Escape)"
          onClick={() => props.onClose()}
        >
          <FiX size={19} />
        </button>
        <div class="ml-3 min-w-0">
          <p class="truncate font-serif text-sm text-[#f0ebdf] sm:text-base">
            {title()}
          </p>
          <p class="mt-0.5 text-[9px] font-semibold tracking-[0.16em] text-[#68736e] uppercase">
            {props.publication().direction} · {pageCounter()}
          </p>
        </div>
        <button
          class="ml-auto flex h-10 shrink-0 items-center gap-2 border border-white/10 px-3 text-[10px] font-bold tracking-wide text-[#b8c0bc] uppercase transition hover:border-white/20 hover:bg-white/5 hover:text-white"
          disabled={pageCount() === 0}
          onClick={() =>
            props.onBookmark(props.publication().id, currentSpread().start)
          }
        >
          <FiBookmark size={15} />
          <span class="hidden sm:inline">Bookmark</span>
        </button>
      </header>

      <div class="h-0.5 shrink-0 bg-white/5">
        <div
          class="h-full bg-[#d94c3f] transition-[width] duration-200"
          style={{
            width: `${pageCount() === 0 ? 0 : (((currentSpread().pageIndices.at(-1) ?? 0) + 1) / pageCount()) * 100}%`,
          }}
        />
      </div>

      <main class="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_15%,#1c2825_0,transparent_50%)] p-3 sm:p-5 md:p-7">
        <Show
          when={pageCount() > 0}
          fallback={
            <div class="grid size-full place-items-center text-center">
              <div>
                <FiAlertTriangle class="mx-auto text-[#c85b50]" size={25} />
                <p class="mt-4 font-serif text-xl text-[#e6e1d6]">
                  This publication has no readable pages.
                </p>
                <button
                  class="mt-5 border border-white/12 px-4 py-2.5 text-[10px] font-bold tracking-wide uppercase hover:bg-white/5"
                  onClick={() => props.onClose()}
                >
                  Return to library
                </button>
              </div>
            </div>
          }
        >
          <div
            class="mx-auto grid size-full max-w-[1500px] items-center justify-center gap-2 md:gap-3"
            classList={{
              "grid-cols-1": currentSpread().pageIndices.length === 1,
              "grid-cols-2": currentSpread().pageIndices.length === 2,
            }}
          >
            <Index each={mountedPages()}>
              {(mountedPage) => (
                <ReaderPage
                  expectedAspectRatio={expectedAspectRatio}
                  isWide={() => widePageIndices().has(mountedPage())}
                  pageIndex={mountedPage}
                  pages={pages}
                  title={title}
                  visible={() => visiblePages().has(mountedPage())}
                  order={() => visualOrder(mountedPage())}
                />
              )}
            </Index>
          </div>

          <button
            class="absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center text-[#aeb6b2] transition hover:bg-white/[0.025] hover:text-white disabled:pointer-events-none disabled:opacity-20 sm:w-16"
            aria-label={`${navigationForArrow("ArrowLeft")} ${layout()}`}
            disabled={!canNavigate(navigationForArrow("ArrowLeft"))}
            onClick={() => navigate(navigationForArrow("ArrowLeft"))}
          >
            <FiChevronLeft size={28} />
          </button>
          <button
            class="absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-center text-[#aeb6b2] transition hover:bg-white/[0.025] hover:text-white disabled:pointer-events-none disabled:opacity-20 sm:w-16"
            aria-label={`${navigationForArrow("ArrowRight")} ${layout()}`}
            disabled={!canNavigate(navigationForArrow("ArrowRight"))}
            onClick={() => navigate(navigationForArrow("ArrowRight"))}
          >
            <FiChevronRight size={28} />
          </button>
        </Show>
      </main>

      <footer class="flex h-12 shrink-0 items-center justify-between border-t border-white/8 bg-[#101716] px-4 text-[9px] text-[#68736e] sm:px-6">
        <span class="hidden sm:inline">
          Arrow keys to turn pages · Esc to close
        </span>
        <span class="sm:ml-auto">{pageCounter()}</span>
      </footer>
    </section>
  );
};
