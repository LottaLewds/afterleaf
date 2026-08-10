import {
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiLoader,
  FiTrash2,
  FiX,
} from "solid-icons/fi";
import {
  DEV,
  For,
  Show,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";

import type {CatalogAtlases, CatalogIdentity, CatalogItem} from "~/catalog";
import {
  importArtFrameImage,
  loadArtFrameChannels,
} from "~/artFrames/browserClient";
import {artFrameChannelId} from "~/artFrames/protocol";
import {
  ShopScene,
  type ShopGameSnapshot,
  type ShopInteraction,
  type ShopSignEditRequest,
} from "~/game/ShopScene";
import {
  loadServerWorldSave,
  queueServerWorldSave,
} from "~/game/worldSaveBrowserClient";
import type {WorldSaveV1} from "~/game/worldSave";
import {importPoster, loadPosters} from "~/posters/browserClient";
import {importTvVideo, loadTvChannels} from "~/tv/browserClient";
import {tvChannelId, tvVideoImportUrl} from "~/tv/protocol";

type MediaChannelKind = "art-frame" | "tv";

const keycapParts = (key: string) =>
  key
    .split(/\s*(?:\/|\+)\s*/)
    .flatMap((part) =>
      part.startsWith("Hold ") ? ["Hold", part.slice("Hold ".length)] : [part],
    );

export type ShopViewportControls = {
  requestPointerLock: () => void;
};

export type ShopViewportProps = {
  catalogAtlases: Accessor<CatalogAtlases>;
  catalogIdentity: Accessor<CatalogIdentity>;
  mouseSensitivity?: Accessor<number>;
  newPublicationIds?: Accessor<readonly string[]>;
  onControlsChange?: (controls: ShopViewportControls | undefined) => void;
  pageIndexForPublication?: (publicationId: string) => number;
  publications: Accessor<readonly CatalogItem[]>;
  selectedPublicationId: Accessor<string | undefined>;
  unstuckRequest?: Accessor<number>;
  onOpenMenu?: () => void;
  onPasteText?: (text: string) => boolean | Promise<boolean>;
  onPageIndexChange?: (publicationId: string, pageIndex: number) => void;
  onDiscardPublication?: (publicationId: string) => Promise<boolean>;
  onSelectPublication?: (publicationId: string) => void;
  paused?: Accessor<boolean>;
  class?: string;
};

/**
 * Owns one ShopScene for this component's lifetime. Catalog and selection stay
 * in Solid; the Three runtime samples only the two narrow accessors it needs.
 */
export const ShopViewport = (props: ShopViewportProps) => {
  const [mediaChannelEditor, setMediaChannelEditor] =
    createSignal<MediaChannelKind>();
  const [mediaChannelError, setMediaChannelError] = createSignal<string>();
  const [mediaChannelName, setMediaChannelName] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [gameState, setGameState] = createSignal<ShopGameSnapshot>({
    inspectionMode: "none",
    looseCount: 0,
    physicsReady: false,
    pointerLocked: false,
    posterCount: 0,
    shelvedCount: 0,
  });
  const [ready, setReady] = createSignal(false);
  const [signEditor, setSignEditor] = createSignal<ShopSignEditRequest>();
  const [signSubtitle, setSignSubtitle] = createSignal("");
  const [signTitle, setSignTitle] = createSignal("");
  let canvas: HTMLCanvasElement | undefined;
  let mediaChannelInput: HTMLInputElement | undefined;
  let signTitleInput: HTMLInputElement | undefined;
  let shopScene: ShopScene | undefined;
  const worldSaveAbortController = new AbortController();
  const shouldBePointerLocked = createMemo(
    () =>
      props.paused?.() !== true &&
      signEditor() === undefined &&
      mediaChannelEditor() === undefined &&
      gameState().inspectionMode !== "spread",
  );
  const controls: ShopViewportControls = {
    requestPointerLock: () => shopScene?.requestPointerLock(),
  };

  const openSignEditor = (request: ShopSignEditRequest) => {
    setSignTitle(request.title);
    setSignSubtitle(request.subtitle);
    setSignEditor(request);
    queueMicrotask(() => signTitleInput?.focus());
  };

  const closeSignEditor = () => setSignEditor(undefined);

  const saveSign = () => {
    const request = signEditor();
    if (!request || !signTitle().trim()) return;
    shopScene?.setSignContent(
      request.kind,
      request.id,
      signTitle(),
      signSubtitle(),
    );
    closeSignEditor();
  };

  const removeSign = () => {
    const request = signEditor();
    if (!request) return;
    shopScene?.setSignContent(request.kind, request.id, "", "");
    closeSignEditor();
  };

  const openMediaChannelEditor = (kind: MediaChannelKind) => {
    setMediaChannelName("");
    setMediaChannelError(undefined);
    setMediaChannelEditor(kind);
    queueMicrotask(() => mediaChannelInput?.focus());
  };

  const closeMediaChannelEditor = () => setMediaChannelEditor(undefined);

  const mediaChannelId = () =>
    mediaChannelEditor() === "tv"
      ? tvChannelId(mediaChannelName())
      : artFrameChannelId(mediaChannelName());

  const pasteIntoMediaChannel = (event: ClipboardEvent) => {
    const kind = mediaChannelEditor();
    if (!kind) return;
    event.preventDefault();
    if (!mediaChannelId()) {
      setMediaChannelError("Name the channel before pasting its first item.");
      mediaChannelInput?.focus();
      return;
    }
    let importChannel: (() => Promise<boolean | undefined>) | undefined;
    if (kind === "art-frame") {
      const image =
        Array.from(event.clipboardData?.items ?? [])
          .find(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          )
          ?.getAsFile() ?? undefined;
      if (image)
        importChannel = () =>
          shopScene?.importArtFrameChannelImage(mediaChannelName(), image) ??
          Promise.resolve(undefined);
    } else {
      const text =
        event.clipboardData?.getData("text/plain") ||
        event.clipboardData?.getData("text/uri-list");
      if (text && tvVideoImportUrl(text))
        importChannel = () =>
          shopScene?.importTvChannelVideo(mediaChannelName(), text) ??
          Promise.resolve(undefined);
    }
    if (!importChannel) {
      setMediaChannelError(
        kind === "tv"
          ? "Paste a valid HTTP or HTTPS video URL."
          : "Paste an image to create this channel.",
      );
      return;
    }
    setMediaChannelError(undefined);
    setMediaChannelEditor(undefined);
    void importChannel();
  };

  onMount(() => {
    props.onControlsChange?.(controls);
    const sceneCanvas = canvas;
    if (!sceneCanvas) return;

    void (async () => {
      try {
        let initialWorldSave: WorldSaveV1 | undefined;
        try {
          initialWorldSave = await loadServerWorldSave(
            worldSaveAbortController.signal,
          );
        } catch (cause) {
          if (worldSaveAbortController.signal.aborted) return;
          if (DEV)
            console.warn(
              "Afterleaf could not load the shared world save; starting without it.",
              cause,
            );
        }
        if (worldSaveAbortController.signal.aborted) return;

        shopScene = new ShopScene({
          canvas: sceneCanvas,
          catalogAtlases: props.catalogAtlases,
          catalogIdentity: props.catalogIdentity,
          catalogItems: props.publications,
          initialWorldSave,
          ...(props.pageIndexForPublication === undefined
            ? {}
            : {initialPageIndex: props.pageIndexForPublication}),
          ...(props.mouseSensitivity === undefined
            ? {}
            : {mouseSensitivity: props.mouseSensitivity}),
          ...(props.newPublicationIds === undefined
            ? {}
            : {newPublicationIds: props.newPublicationIds}),
          selectedPublicationId: props.selectedPublicationId,
          onGameStateChange: setGameState,
          onPauseRequest: () => props.onOpenMenu?.(),
          onTextPaste: (text) => props.onPasteText?.(text) ?? false,
          onPageIndexChange: (publicationId, pageIndex) =>
            props.onPageIndexChange?.(publicationId, pageIndex),
          onDiscardPublication: (publicationId) =>
            props.onDiscardPublication?.(publicationId) ??
            Promise.resolve(false),
          onSelectPublication: (publicationId) =>
            props.onSelectPublication?.(publicationId),
          onMediaChannelCreateRequest: openMediaChannelEditor,
          onSignEditRequest: openSignEditor,
          onWorldSave: queueServerWorldSave,
          loadTvChannels,
          importTvVideo,
          loadArtFrameChannels,
          loadPosters,
          importArtFrameImage,
          importPoster,
          paused: () =>
            props.paused?.() === true ||
            signEditor() !== undefined ||
            mediaChannelEditor() !== undefined,
          onReady: () => setReady(true),
        });
        if (!shouldBePointerLocked()) shopScene.releasePointerLock();
        shopScene.start();
      } catch (cause) {
        if (worldSaveAbortController.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The 3D shop could not be initialized.",
        );
      }
    })();
  });

  onCleanup(() => {
    props.onControlsChange?.(undefined);
    worldSaveAbortController.abort();
    shopScene?.dispose();
  });

  createRenderEffect(
    on(
      shouldBePointerLocked,
      (shouldLock) => {
        if (!shouldLock) shopScene?.releasePointerLock();
      },
      {defer: true},
    ),
  );

  createEffect(
    on(
      () => props.unstuckRequest?.(),
      () => shopScene?.unstuckPlayer(),
      {defer: true},
    ),
  );

  const carriedTitle = () => {
    const publicationId = gameState().carriedPublicationId;
    if (!publicationId) return;
    return props.publications().find((item) => item.id === publicationId)
      ?.title;
  };
  const carriedBookCount = () => gameState().carriedBookCount ?? 1;

  return (
    <section
      class={`relative isolate size-full overflow-hidden bg-[#071010] ${props.class ?? ""}`}
      aria-label="Afterleaf nighttime manga shop"
    >
      <canvas
        ref={(element) => {
          canvas = element;
        }}
        class="block size-full touch-manipulation outline-none"
      />

      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-4 pb-16 sm:p-5 sm:pb-20">
        <div class="border-l-2 border-[#d94c3f] bg-[#0b1312]/75 px-3 py-2 backdrop-blur-sm">
          <p class="text-[9px] font-bold tracking-[0.22em] text-[#d9cabd] uppercase">
            Closing shift · aisle 01
          </p>
          <p class="mt-1 text-xs font-semibold text-[#f1eadc]">
            Shelve the loose stock
          </p>
          <p class="mt-1 text-[9px] tracking-[0.08em] text-[#8da098] uppercase tabular-nums">
            {gameState().shelvedCount} shelved · {gameState().looseCount}{" "}
            remaining
          </p>
          <p class="mt-1 text-[8px] tracking-[0.12em] text-[#657a72] uppercase">
            {gameState().physicsReady
              ? "Physical stock active"
              : "Waking stock…"}
          </p>
        </div>
        <button
          class="pointer-events-auto flex h-9 items-center gap-2 border border-white/12 bg-[#0b1312]/75 px-3 text-[9px] font-semibold tracking-[0.14em] text-[#b3c0bb] uppercase backdrop-blur-sm transition hover:border-white/25 hover:bg-[#15201e] hover:text-white"
          onClick={() => props.onOpenMenu?.()}
        >
          Menu{" "}
          <span class="border border-white/15 px-1.5 py-0.5 text-[8px]">
            Esc
          </span>
        </button>
      </div>

      <Show when={ready() && !error()}>
        <Show
          when={
            gameState().posterImporting ||
            gameState().posterImportError ||
            gameState().digitalArtFrameImporting ||
            gameState().digitalArtFrameImportError ||
            gameState().tvVideoImporting ||
            gameState().tvVideoImportError ||
            gameState().tvVideoImportMessage
          }
        >
          <div class="pointer-events-none absolute top-24 left-1/2 z-20 -translate-x-1/2 border border-white/10 bg-[#08100f]/88 px-4 py-2 text-[9px] font-semibold tracking-[0.12em] uppercase shadow-lg backdrop-blur-sm">
            <Show when={gameState().posterImporting}>
              <span class="flex items-center gap-2 text-[#cbd5d0]">
                <FiLoader class="size-3 animate-spin text-[#d94c3f]" />
                Optimizing pasted poster…
              </span>
            </Show>
            <Show when={gameState().posterImportError}>
              {(message) => (
                <span class="block max-w-80 text-[#dc7167]">{message()}</span>
              )}
            </Show>
            <Show when={gameState().digitalArtFrameImporting}>
              <span class="flex items-center gap-2 text-[#cbd5d0]">
                <FiLoader class="size-3 animate-spin text-[#d94c3f]" />
                Optimizing pasted art…
              </span>
            </Show>
            <Show when={gameState().digitalArtFrameImportError}>
              {(message) => (
                <span class="block max-w-80 text-[#dc7167]">{message()}</span>
              )}
            </Show>
            <Show when={gameState().tvVideoImporting}>
              <span class="flex items-center gap-2 text-[#cbd5d0]">
                <FiLoader class="size-3 animate-spin text-[#d94c3f]" />
                Downloading pasted video…
              </span>
            </Show>
            <Show when={gameState().tvVideoImportError}>
              {(message) => (
                <span class="block max-w-80 text-[#dc7167]">{message()}</span>
              )}
            </Show>
            <Show when={gameState().tvVideoImportMessage}>
              {(message) => (
                <span class="flex max-w-96 items-center gap-2 text-[#b8d7c1]">
                  <FiCheck class="size-3 shrink-0 text-[#62b47c]" />
                  <span class="truncate">{message()}</span>
                </span>
              )}
            </Show>
          </div>
        </Show>
        <Show when={gameState().inspectionMode !== "spread"}>
          <div
            class="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <span class="absolute top-1/2 left-0 h-px w-1.5 bg-white/75 shadow-[0_0_4px_#000]" />
            <span class="absolute top-1/2 right-0 h-px w-1.5 bg-white/75 shadow-[0_0_4px_#000]" />
            <span class="absolute top-0 left-1/2 h-1.5 w-px bg-white/75 shadow-[0_0_4px_#000]" />
            <span class="absolute bottom-0 left-1/2 h-1.5 w-px bg-white/75 shadow-[0_0_4px_#000]" />
          </div>
        </Show>

        <Show when={gameState().interactions}>
          {(interactions) => (
            <div class="pointer-events-none absolute bottom-5 left-4 z-10 w-max max-w-[min(18rem,calc(100vw-2rem))] border-l-2 border-[#d94c3f] bg-[#08100f]/88 px-3 py-2 text-sm text-[#e5e0d5] shadow-lg backdrop-blur-sm sm:bottom-6 sm:left-5">
              <p class="mb-1 text-[8px] font-bold tracking-[0.18em] text-[#8da098] uppercase">
                Interact
              </p>
              <Show when={gameState().interactionContext}>
                {(context) => (
                  <p class="mb-1 max-w-56 truncate text-[10px] font-semibold tracking-[0.04em] text-[#e7dcc4] normal-case">
                    {context()}
                  </p>
                )}
              </Show>
              <div class="grid gap-1">
                <For each={interactions()}>
                  {(interaction: ShopInteraction) => (
                    <div class="flex items-center gap-2 leading-tight">
                      <span
                        class="flex shrink-0 items-center gap-1"
                        aria-label={interaction.key}
                      >
                        <For each={keycapParts(interaction.key)}>
                          {(key) => (
                            <span class="inline-flex min-h-5 min-w-6 items-center justify-center rounded-[3px] border border-b-2 border-[#52605b] bg-gradient-to-b from-[#394742] to-[#18211f] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-[#f1eadc] uppercase shadow-[0_1px_2px_rgb(0_0_0_/_0.65),inset_0_1px_0_rgb(255_255_255_/_0.16)]">
                              {key}
                            </span>
                          )}
                        </For>
                      </span>
                      <span class="text-[11px] text-[#c4cec8]">
                        {interaction.label}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>

        <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06100f]/90 via-[#06100f]/35 to-transparent p-4 pt-24 sm:p-5 sm:pt-28">
          <div class="flex items-end justify-end">
            <Show when={carriedTitle()}>
              {(title) => (
                <p class="max-w-64 truncate border-l-2 border-[#d94c3f] bg-black/35 px-3 py-2 text-right text-[10px] text-[#d9d2c6]">
                  Carrying {title()}
                  <Show when={carriedBookCount() > 1}>
                    <span> (+{carriedBookCount() - 1} more)</span>
                  </Show>
                </p>
              )}
            </Show>
          </div>
          <Show when={gameState().throwCharge !== undefined}>
            <div class="absolute bottom-24 left-1/2 w-[min(24rem,72vw)] -translate-x-1/2 border border-[#d9b96f]/35 bg-[#08100f]/85 p-1.5 shadow-lg backdrop-blur-sm">
              <div class="mb-1 flex items-center justify-between px-0.5 text-[8px] font-bold tracking-[0.16em] text-[#d9cabd] uppercase">
                <span>Throw charge</span>
                <span class="tabular-nums">
                  {Math.round((gameState().throwCharge ?? 0) * 100)}%
                </span>
              </div>
              <div class="h-2 overflow-hidden bg-black/45">
                <div
                  class="h-full bg-gradient-to-r from-[#b4483f] via-[#d9b96f] to-[#e9eee6] shadow-[0_0_12px_#d9b96f]"
                  style={{
                    width: `${Math.round((gameState().throwCharge ?? 0) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </Show>
          <Show when={gameState().prompt && !gameState().interactions}>
            {(prompt) => (
              <p class="absolute bottom-8 left-1/2 max-w-[min(40rem,90vw)] -translate-x-1/2 bg-[#08100f]/75 px-5 py-3 text-center text-sm font-semibold tracking-[0.06em] text-[#e5e0d5] uppercase backdrop-blur-sm sm:text-base">
                {prompt()}
              </p>
            )}
          </Show>
        </div>

        <Show when={gameState().inspectionMode !== "none"}>
          <Show when={gameState().inspectionPageCount}>
            {(pageCount) => (
              <div class="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 sm:top-5">
                <div class="pointer-events-auto flex items-center gap-2 border border-white/10 bg-[#08100f]/80 px-3 py-2 text-[8px] font-semibold tracking-[0.1em] text-[#aeb9b4] uppercase shadow-lg backdrop-blur-sm">
                  <span class="min-w-5 text-right tabular-nums">
                    {(gameState().inspectionPageIndex ?? 0) + 1}
                  </span>
                  <button
                    aria-label="Previous page"
                    class="grid size-5 shrink-0 place-items-center text-[#7f8d87] transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    disabled={!gameState().inspectionCanTurnBackward}
                    onClick={() => shopScene?.turnInspectionPage("backward")}
                    title="Previous page"
                    type="button"
                  >
                    <FiChevronLeft class="size-3" />
                  </button>
                  <input
                    aria-label="Current page"
                    class="h-1 w-44 cursor-pointer accent-[#d94c3f] sm:w-60"
                    max={Math.max(0, pageCount() - 1)}
                    min="0"
                    onInput={(event) =>
                      shopScene?.seekInspectionPage(
                        event.currentTarget.valueAsNumber,
                      )
                    }
                    step="1"
                    type="range"
                    value={gameState().inspectionPageIndex ?? 0}
                  />
                  <button
                    aria-label="Next page"
                    class="grid size-5 shrink-0 place-items-center text-[#7f8d87] transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    disabled={!gameState().inspectionCanTurnForward}
                    onClick={() => shopScene?.turnInspectionPage("forward")}
                    title="Next page"
                    type="button"
                  >
                    <FiChevronRight class="size-3" />
                  </button>
                  <span
                    class="grid min-w-5 shrink-0 place-items-center tabular-nums"
                    aria-label={
                      gameState().inspectionPagesLoading
                        ? "Streaming pages"
                        : undefined
                    }
                    aria-live="polite"
                    role="status"
                    title={
                      gameState().inspectionPagesLoading
                        ? "Streaming pages…"
                        : undefined
                    }
                  >
                    <Show
                      when={gameState().inspectionPagesLoading}
                      fallback={pageCount()}
                    >
                      <FiLoader class="size-3 animate-spin text-[#d94c3f]" />
                    </Show>
                  </span>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </Show>

      <Show when={mediaChannelEditor()}>
        {(kind) => (
          <div
            class="absolute inset-0 z-30 grid place-items-center bg-[#07100f]/78 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Create ${kind() === "tv" ? "TV" : "digital art"} channel`}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeMediaChannelEditor();
            }}
            onPaste={pasteIntoMediaChannel}
          >
            <form
              class="w-full max-w-md border border-white/12 bg-[#101716] shadow-[0_30px_100px_#000]"
              onSubmit={(event) => event.preventDefault()}
            >
              <header class="flex items-start gap-4 border-b border-white/8 px-5 py-4">
                <div class="min-w-0">
                  <p class="text-[9px] font-bold tracking-[0.2em] text-[#d05b50] uppercase">
                    {kind() === "tv" ? "Television" : "Digital art frame"}
                  </p>
                  <h2 class="mt-1 font-serif text-xl text-[#eee8dc]">
                    Create {kind() === "tv" ? "video" : "image"} channel
                  </h2>
                </div>
                <button
                  class="ml-auto grid size-9 shrink-0 place-items-center text-[#87938e] transition hover:bg-white/5 hover:text-white"
                  aria-label="Close channel editor"
                  type="button"
                  onClick={closeMediaChannelEditor}
                >
                  <FiX size={17} />
                </button>
              </header>

              <div class="space-y-4 px-5 py-5">
                <label class="block">
                  <span class="text-[9px] font-bold tracking-[0.14em] text-[#8f9b96] uppercase">
                    Channel name
                  </span>
                  <input
                    ref={(element) => {
                      mediaChannelInput = element;
                    }}
                    class="mt-2 h-11 w-full border border-white/12 bg-[#0a1110] px-3 text-sm text-[#f0ebdf] transition outline-none placeholder:text-[#4f5b57] focus:border-[#c7554b]"
                    maxLength={64}
                    onInput={(event) => {
                      setMediaChannelName(event.currentTarget.value);
                      setMediaChannelError(undefined);
                    }}
                    placeholder={
                      kind() === "tv" ? "Late Night" : "Night Scenes"
                    }
                    value={mediaChannelName()}
                  />
                </label>
                <div class="border border-white/8 bg-[#0b1211] px-4 py-3">
                  <p class="text-[8px] font-semibold tracking-[0.12em] text-[#89958f] uppercase">
                    Folder ID
                  </p>
                  <p class="mt-1 font-mono text-xs text-[#d9d2c6]">
                    {mediaChannelId() || "channel-name"}
                  </p>
                </div>
                <div class="border border-dashed border-[#c7554b]/45 bg-[#c7554b]/6 px-4 py-4 text-center">
                  <p class="text-xs font-semibold text-[#eee8dc]">
                    Paste {kind() === "tv" ? "a video URL" : "an image"} to
                    create the channel
                  </p>
                  <p class="mt-1 text-[10px] leading-4 text-[#8f9b96]">
                    The import continues in the background and tunes this{" "}
                    {kind() === "tv" ? "TV" : "frame"} when it is ready.
                  </p>
                </div>
                <Show when={mediaChannelError()}>
                  {(message) => (
                    <p class="text-xs leading-5 text-[#e47a70]" role="alert">
                      {message()}
                    </p>
                  )}
                </Show>
              </div>

              <footer class="flex items-center justify-end border-t border-white/8 px-5 py-4">
                <button
                  class="h-10 px-4 text-[10px] font-bold tracking-[0.08em] text-[#98a39e] uppercase transition hover:bg-white/5 hover:text-white"
                  type="button"
                  onClick={closeMediaChannelEditor}
                >
                  Cancel
                </button>
              </footer>
            </form>
          </div>
        )}
      </Show>

      <Show when={signEditor()}>
        {(request) => (
          <div
            class="absolute inset-0 z-30 grid place-items-center bg-[#07100f]/78 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Customize ${request().label}`}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeSignEditor();
            }}
          >
            <form
              class="w-full max-w-md border border-white/12 bg-[#101716] shadow-[0_30px_100px_#000]"
              onSubmit={(event) => {
                event.preventDefault();
                saveSign();
              }}
            >
              <header class="flex items-start gap-4 border-b border-white/8 px-5 py-4">
                <div class="min-w-0">
                  <p class="text-[9px] font-bold tracking-[0.2em] text-[#d05b50] uppercase">
                    {request().kind === "aisle"
                      ? "Aisle-level sign"
                      : "Shelf-column sign"}
                  </p>
                  <h2 class="mt-1 truncate font-serif text-xl text-[#eee8dc]">
                    {request().label}
                  </h2>
                </div>
                <button
                  class="ml-auto grid size-9 shrink-0 place-items-center text-[#87938e] transition hover:bg-white/5 hover:text-white"
                  aria-label="Close sign editor"
                  type="button"
                  onClick={closeSignEditor}
                >
                  <FiX size={17} />
                </button>
              </header>

              <div class="space-y-5 px-5 py-5">
                <label class="block">
                  <span class="text-[9px] font-bold tracking-[0.14em] text-[#8f9b96] uppercase">
                    Title
                  </span>
                  <input
                    ref={(element) => {
                      signTitleInput = element;
                    }}
                    class="mt-2 h-11 w-full border border-white/12 bg-[#0a1110] px-3 text-sm text-[#f0ebdf] transition outline-none placeholder:text-[#4f5b57] focus:border-[#c7554b]"
                    maxLength={48}
                    onInput={(event) => setSignTitle(event.currentTarget.value)}
                    placeholder="Adult Comics"
                    value={signTitle()}
                  />
                </label>
                <label class="block">
                  <span class="text-[9px] font-bold tracking-[0.14em] text-[#8f9b96] uppercase">
                    Subtitle
                  </span>
                  <input
                    class="mt-2 h-11 w-full border border-white/12 bg-[#0a1110] px-3 text-sm text-[#f0ebdf] transition outline-none placeholder:text-[#4f5b57] focus:border-[#c7554b]"
                    maxLength={72}
                    onInput={(event) =>
                      setSignSubtitle(event.currentTarget.value)
                    }
                    placeholder="Aisle 01 · New releases"
                    value={signSubtitle()}
                  />
                </label>
                <div class="border border-white/8 bg-[#0b1211] px-4 py-3">
                  <p class="truncate text-center font-serif text-base text-[#eee8dc]">
                    {signTitle().trim() || "Sign title"}
                  </p>
                  <p class="mt-1 truncate text-center text-[8px] font-semibold tracking-[0.16em] text-[#89958f] uppercase">
                    {signSubtitle().trim() || "Optional subtitle"}
                  </p>
                </div>
              </div>

              <footer class="flex items-center gap-2 border-t border-white/8 px-5 py-4">
                <Show when={request().title}>
                  <button
                    class="flex h-10 items-center gap-2 px-3 text-[10px] font-bold tracking-[0.08em] text-[#b06a63] uppercase transition hover:bg-[#a73b34]/10 hover:text-[#dc7167]"
                    type="button"
                    onClick={removeSign}
                  >
                    <FiTrash2 size={14} /> Remove
                  </button>
                </Show>
                <button
                  class="ml-auto h-10 px-4 text-[10px] font-bold tracking-[0.08em] text-[#98a39e] uppercase transition hover:bg-white/5 hover:text-white"
                  type="button"
                  onClick={closeSignEditor}
                >
                  Cancel
                </button>
                <button
                  class="flex h-10 items-center gap-2 bg-[#ece6d8] px-4 text-[10px] font-bold tracking-[0.08em] text-[#17201e] uppercase transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!signTitle().trim()}
                  type="submit"
                >
                  <FiCheck size={14} /> Save sign
                </button>
              </footer>
            </form>
          </div>
        )}
      </Show>

      <Show when={!ready() && !error()}>
        <div class="pointer-events-none absolute inset-0 grid place-items-center bg-[#071010]">
          <div class="text-center">
            <span class="mx-auto block size-5 animate-spin rounded-full border-2 border-[#758b84] border-t-[#e55749]" />
            <p class="mt-3 text-[9px] font-semibold tracking-[0.2em] text-[#7e918b] uppercase">
              Switching on the aisle lights
            </p>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <div class="absolute inset-0 grid place-items-center bg-[#101716] p-6 text-center">
            <div class="max-w-sm border border-[#a44238]/40 bg-[#191f1e] p-6">
              <p class="font-serif text-lg text-[#eee8dc]">
                The shop lights stayed off.
              </p>
              <p class="mt-2 text-xs leading-5 text-[#9ba6a2]">{message()}</p>
            </div>
          </div>
        )}
      </Show>
    </section>
  );
};
