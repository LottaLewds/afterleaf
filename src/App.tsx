import {
  FiAlertTriangle,
  FiArrowUpRight,
  FiBookOpen,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiCrosshair,
  FiDownload,
  FiGrid,
  FiLock,
  FiMapPin,
  FiMenu,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiSliders,
  FiTag,
  FiX,
} from "solid-icons/fi";
import {
  For,
  Suspense,
  createEffect,
  createResource,
  lazy,
  onCleanup,
  onMount,
  Show,
  createMemo,
  createSignal,
  on,
  untrack,
} from "solid-js";

import {
  emptyLibrary,
  loadRuntimeLibrary,
  type CatalogItem,
  type CatalogLanguage,
} from "~/catalog";
import {
  BrowserLibraryOperationError,
  blacklistPublication,
  fetchMorePublications,
  loadBlacklistedPublications,
  loadLibraryOperationStatus,
  loadLibraryProviders,
  loadLibrarySourceStatus,
  resolvePastedLibraryImport,
  scanLocalLibrary,
  type LocalLibraryJob,
  type LocalLibrarySnapshotResult,
} from "~/content/libraryUpdate/browserClient";
import {
  loadBootFetchPreference,
  saveBootFetchPreference,
} from "~/content/libraryUpdate/bootFetchPreference";
import {
  loadLibraryFetchPreferences,
  saveLibraryFetchPreferences,
} from "~/content/libraryUpdate/fetchPreferences";
import {
  loadLibraryProviderPreference,
  saveLibraryProviderPreference,
} from "~/content/libraryUpdate/providerPreference";
import {
  MAX_LIBRARY_FETCH_LIMIT,
  MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  MIN_LIBRARY_FETCH_LIMIT,
  MIN_LIBRARY_SEARCH_PAGE_LIMIT,
} from "~/content/libraryUpdate/httpProtocol";
import {
  loadTagBlacklist,
  normalizeTag,
  normalizeTagBlacklist,
  saveTagBlacklist,
} from "~/content/tagBlacklistPreference";
import {
  loadControlPreferences,
  MAX_MOUSE_SENSITIVITY,
  MIN_MOUSE_SENSITIVITY,
  saveControlPreferences,
  type ReadingDirection,
} from "~/game/controlPreferences";
import {loadReaderBookmarks, saveReaderBookmark} from "~/reader/bookmarks";
import type {LibraryProviderDescriptor} from "~/content/providers/types";

const ShopViewport = lazy(async () => {
  const module = await import("~/components/ShopViewport");
  return {default: module.ShopViewport};
});

type LanguageFilter = "all" | CatalogLanguage;
type LibraryOperation = "fetch-more" | "scan";
type LibraryUpdateStage = "loading-library" | "working";
type MenuTab = "library" | "options";

const languageLabels: Record<LanguageFilter, string> = {
  all: "All editions",
  english: "English",
  japanese: "日本語",
};

const MouseSensitivityControl = (props: {
  onChange: (value: number) => void;
  value: number;
}) => (
  <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
    <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
      <FiCrosshair size={15} />
    </span>
    <div class="min-w-0 sm:w-52">
      <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
        Mouse sensitivity
      </p>
      <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
        Camera look is smoothed at display refresh rate.
      </p>
    </div>
    <label class="flex min-w-0 flex-1 items-center gap-4">
      <span class="sr-only">Mouse sensitivity</span>
      <input
        class="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#d94c3f]"
        type="range"
        min={MIN_MOUSE_SENSITIVITY * 100}
        max={MAX_MOUSE_SENSITIVITY * 100}
        step="5"
        value={Math.round(props.value * 100)}
        onInput={(event) =>
          props.onChange(Number(event.currentTarget.value) / 100)
        }
      />
      <span class="w-12 text-right text-[10px] font-semibold text-[#aeb8b3] tabular-nums">
        {Math.round(props.value * 100)}%
      </span>
    </label>
  </div>
);

const readingDirectionOptions: readonly {
  label: string;
  value: ReadingDirection;
}[] = [
  {label: "Left to right", value: "LTR"},
  {label: "Right to left", value: "RTL"},
];

const ReadingDirectionControl = (props: {
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
      <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
        Reading direction
      </p>
      <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
        The default applies when metadata is unavailable or overridden.
      </p>
    </div>
    <div class="min-w-0 flex-1 space-y-2">
      <button
        class="flex min-h-11 w-full items-center gap-3 bg-[#1b2422] px-3 py-2 text-left transition hover:bg-[#202b28]"
        aria-checked={props.respectMetadata}
        onClick={() => props.onRespectMetadataChange(!props.respectMetadata)}
        role="switch"
        type="button"
      >
        <span
          class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
          classList={{
            "bg-[#d94c3f]": props.respectMetadata,
            "bg-[#3b4743]": !props.respectMetadata,
          }}
        >
          <span
            class="absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform"
            classList={{
              "translate-x-[18px]": props.respectMetadata,
              "translate-x-0.5": !props.respectMetadata,
            }}
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
              class="min-h-10 px-3 py-2 text-[9px] font-semibold tracking-[0.08em] uppercase transition"
              classList={{
                "bg-[#ece6d8] text-[#1b2321]":
                  props.defaultDirection === option.value,
                "bg-[#1b2422] text-[#7f8b86] hover:bg-[#202b28] hover:text-white":
                  props.defaultDirection !== option.value,
              }}
              aria-pressed={props.defaultDirection === option.value}
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

const TagBlacklistControl = (props: {
  availableTags: readonly string[];
  blacklistedTags: readonly string[];
  onChange: (tags: readonly string[]) => void;
}) => {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);
  let input: HTMLInputElement | undefined;
  const normalizedQuery = () => normalizeTag(query());
  const blacklistedTagSet = createMemo(() => new Set(props.blacklistedTags));
  const suggestions = createMemo(() => {
    const search = normalizedQuery();
    return props.availableTags
      .filter((tag) => {
        const normalizedTag = normalizeTag(tag);
        return (
          !blacklistedTagSet().has(normalizedTag) &&
          (!search || normalizedTag.includes(search))
        );
      })
      .slice(0, 8);
  });
  const canAddCustomTag = () => {
    const tag = normalizedQuery();
    return Boolean(tag && !blacklistedTagSet().has(tag));
  };
  const addTag = (tag: string) => {
    const nextTags = normalizeTagBlacklist([...props.blacklistedTags, tag]);
    if (nextTags.length === props.blacklistedTags.length) return;
    props.onChange(nextTags);
    setQuery("");
    input?.focus();
    setOpen(true);
  };
  const removeTag = (tag: string) =>
    props.onChange(
      props.blacklistedTags.filter((blacklistedTag) => blacklistedTag !== tag),
    );

  return (
    <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:px-5">
      <div class="flex gap-4">
        <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
          <FiTag size={15} />
        </span>
        <div class="min-w-0">
          <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
            Blacklisted tags
          </p>
          <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
            Skip matching publications during future downloads. Books already in
            your library stay catalogued.
          </p>
        </div>
      </div>

      <form
        class="relative"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAddCustomTag()) addTag(query());
        }}
        onFocusIn={() => setOpen(true)}
        onFocusOut={(event) => {
          const nextTarget = event.relatedTarget;
          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(nextTarget)
          )
            return;
          setOpen(false);
        }}
      >
        <div class="flex min-h-11 items-center gap-2 border border-white/10 bg-[#0c1312] px-3 focus-within:border-[#d55247]/70">
          <FiSearch class="shrink-0 text-[#65716c]" size={13} />
          <input
            ref={(element) => {
              input = element;
            }}
            class="min-w-0 flex-1 bg-transparent py-3 text-xs text-[#eee8dc] outline-none placeholder:text-[#53605b]"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="tag-blacklist-options"
            aria-expanded={open()}
            autocomplete="off"
            maxlength={100}
            placeholder="Search library tags or enter a custom tag…"
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          />
          <button
            class="grid size-8 shrink-0 place-items-center text-[#8d9893] transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Add custom blacklisted tag"
            disabled={!canAddCustomTag()}
            type="submit"
          >
            <FiPlus size={15} />
          </button>
        </div>

        <Show when={open() && (suggestions().length > 0 || canAddCustomTag())}>
          <div
            id="tag-blacklist-options"
            class="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto border border-white/10 bg-[#101716] p-1 shadow-[0_18px_50px_#000]"
            role="listbox"
          >
            <For each={suggestions()}>
              {(suggestion) => (
                <button
                  class="flex w-full items-center justify-between px-3 py-2.5 text-left text-[10px] text-[#aeb8b3] transition hover:bg-white/5 hover:text-white"
                  role="option"
                  aria-selected="false"
                  type="button"
                  onClick={() => addTag(suggestion)}
                >
                  <span>{suggestion}</span>
                  <span class="text-[8px] tracking-[0.1em] text-[#59645f] uppercase">
                    Library tag
                  </span>
                </button>
              )}
            </For>
            <Show
              when={
                canAddCustomTag() &&
                !suggestions().some(
                  (suggestion) =>
                    normalizeTag(suggestion) === normalizedQuery(),
                )
              }
            >
              <button
                class="flex w-full items-center gap-2 border-t border-white/8 px-3 py-2.5 text-left text-[10px] text-[#d96b61] transition hover:bg-white/5 hover:text-[#ec8076]"
                role="option"
                aria-selected="false"
                type="button"
                onClick={() => addTag(query())}
              >
                <FiPlus size={12} /> Add custom tag “{normalizedQuery()}”
              </button>
            </Show>
          </div>
        </Show>
      </form>

      <Show
        when={props.blacklistedTags.length > 0}
        fallback={
          <p class="border border-dashed border-white/8 px-3 py-3 text-[9px] text-[#59645f]">
            No tags are blacklisted.
          </p>
        }
      >
        <div class="flex flex-wrap gap-2" aria-label="Blacklisted tags">
          <For each={props.blacklistedTags}>
            {(tag) => (
              <span class="flex items-center gap-2 bg-[#251d1c] py-1.5 pr-1.5 pl-2.5 text-[10px] text-[#d9aaa5]">
                {tag}
                <button
                  class="grid size-5 place-items-center text-[#8f6561] transition hover:bg-white/5 hover:text-white"
                  aria-label={`Remove ${tag} from blacklisted tags`}
                  type="button"
                  onClick={() => removeTag(tag)}
                >
                  <FiX size={11} />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

const OptionsPanel = (props: {
  availableTags: readonly string[];
  blacklistedTags: readonly string[];
  defaultReadingDirection: ReadingDirection;
  mouseSensitivity: number;
  onBlacklistedTagsChange: (tags: readonly string[]) => void;
  onDefaultReadingDirectionChange: (value: ReadingDirection) => void;
  onMouseSensitivityChange: (value: number) => void;
  onRespectBookReadingDirectionChange: (value: boolean) => void;
  onUnstuck: () => void;
  respectBookReadingDirection: boolean;
}) => (
  <section class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9 xl:col-span-2">
    <div class="mx-auto max-w-4xl">
      <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
        Shop preferences
      </p>
      <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
        Options
      </h2>
      <p class="mt-2 max-w-xl text-xs leading-5 text-[#6e7974]">
        Tune first-person controls, book handling, and which publications enter
        your shop.
      </p>

      <div class="mt-8 space-y-3">
        <MouseSensitivityControl
          value={props.mouseSensitivity}
          onChange={props.onMouseSensitivityChange}
        />
        <ReadingDirectionControl
          defaultDirection={props.defaultReadingDirection}
          onDefaultDirectionChange={props.onDefaultReadingDirectionChange}
          onRespectMetadataChange={props.onRespectBookReadingDirectionChange}
          respectMetadata={props.respectBookReadingDirection}
        />
        <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
            <FiMapPin size={15} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
              Player recovery
            </p>
            <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
              Teleport back to the first-floor entrance if you become stuck.
            </p>
          </div>
          <button
            class="shrink-0 border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#df776e] uppercase transition hover:border-[#d94c3f]/60 hover:bg-[#d94c3f]/20 hover:text-[#f3a098]"
            type="button"
            onClick={() => props.onUnstuck()}
          >
            Unstuck
          </button>
        </div>
        <TagBlacklistControl
          availableTags={props.availableTags}
          blacklistedTags={props.blacklistedTags}
          onChange={props.onBlacklistedTagsChange}
        />
      </div>
    </div>
  </section>
);

const AdultGate = (props: {onEnter: () => void}) => (
  <div class="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#111716] p-5 text-[#eee8d9]">
    <div class="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_50%_15%,#819895_0,transparent_30%),linear-gradient(115deg,transparent_0_49%,#ffffff08_50%,transparent_51%)]" />
    <div class="gate-card relative w-full max-w-[460px] border border-white/12 bg-[#18201f]/95 px-7 py-8 shadow-2xl sm:px-10 sm:py-10">
      <div class="mb-10 flex items-start justify-between">
        <div>
          <p class="font-serif text-3xl tracking-[-0.04em]">Afterleaf</p>
          <p class="mt-1 text-[10px] font-semibold tracking-[0.25em] text-[#b8aaa0] uppercase">
            After-hours library
          </p>
        </div>
        <span class="grid size-11 place-items-center rounded-full border border-[#cf4a3c]/45 bg-[#cf4a3c]/10 text-sm font-semibold text-[#ef796b]">
          18+
        </span>
      </div>

      <p class="font-serif text-[2rem] leading-[1.08] tracking-[-0.035em] text-[#f5f0e5]">
        The shop is closed.
        <br />
        Your library awaits.
      </p>
      <p class="mt-5 max-w-sm text-sm leading-6 text-[#aeb9b4]">
        This library contains adult-only publications. Confirm that you are of
        legal age in your region to continue.
      </p>

      <button
        class="mt-9 flex w-full items-center justify-between bg-[#d94c3f] px-5 py-4 text-left text-sm font-bold text-white shadow-[0_10px_35px_#d94c3f33] transition hover:bg-[#e45a4d]"
        onClick={() => props.onEnter?.()}
      >
        <span class="flex items-center gap-3">
          <FiLock size={16} /> I’m 18 or older
        </span>
        <FiChevronRight size={18} />
      </button>
      <p class="mt-5 flex items-center gap-2 text-[11px] leading-4 text-[#75827d]">
        <FiShield size={14} /> Age confirmation stays in this browser session.
      </p>
    </div>
  </div>
);

const LibraryUpdateDialog = (props: {
  busy: boolean;
  fetchOnBoot: boolean;
  fetchLimit: number;
  maxSearchPages: number;
  providerId: string;
  providers: readonly LibraryProviderDescriptor[];
  providerError?: string;
  onCancel: () => void;
  onConfirm: (
    fetchOnBoot: boolean,
    providerId: string,
    query: string,
    fetchLimit: number,
    maxSearchPages: number,
  ) => void;
  onFetchOnBootChange: (enabled: boolean) => void;
  onProviderChange: (providerId: string) => void;
}) => {
  const provider = () =>
    props.providers.find((candidate) => candidate.id === props.providerId);
  const [query, setQuery] = createSignal(
    untrack(() => provider()?.defaultQuery ?? ""),
  );
  const [fetchLimit, setFetchLimit] = createSignal(
    untrack(() => props.fetchLimit),
  );
  const [maxSearchPages, setMaxSearchPages] = createSignal(
    untrack(() => props.maxSearchPages),
  );
  const fetchLimitIsValid = () =>
    Number.isSafeInteger(fetchLimit()) &&
    fetchLimit() >= MIN_LIBRARY_FETCH_LIMIT &&
    fetchLimit() <= MAX_LIBRARY_FETCH_LIMIT;
  const searchPageLimitIsValid = () =>
    Number.isSafeInteger(maxSearchPages()) &&
    maxSearchPages() >= MIN_LIBRARY_SEARCH_PAGE_LIMIT &&
    maxSearchPages() <= MAX_LIBRARY_SEARCH_PAGE_LIMIT;
  createEffect(
    on(
      () => [props.providerId, props.providers] as const,
      () => setQuery(provider()?.defaultQuery ?? ""),
    ),
  );
  const canUpdate = () =>
    Boolean(provider()) &&
    fetchLimitIsValid() &&
    searchPageLimitIsValid() &&
    !props.busy;

  return (
    <div
      class="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Fetch more publications"
    >
      <div class="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-white/12 bg-[#151d1b] p-6 shadow-[0_30px_100px_#000] sm:p-8">
        <div class="flex items-start justify-between gap-5">
          <div>
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">
              Provider acquisition
            </p>
            <h2 class="mt-2 font-serif text-2xl text-[#f0ebdf]">
              Fetch more stock
            </h2>
          </div>
          <span class="grid size-10 shrink-0 place-items-center border border-[#d55247]/35 bg-[#d55247]/10 text-[#e16458]">
            <FiRefreshCw size={16} />
          </span>
        </div>
        <p class="mt-5 text-xs leading-5 text-[#929e99]">
          {provider()?.summary ?? "Choose a provider to fetch local stock."}{" "}
          This downloads a small preview and lazily caches later pages as you
          read.
        </p>

        <div class="mt-6 space-y-3">
          <Show when={props.providerError}>
            {(message) => (
              <p class="border border-[#d55247]/35 bg-[#d55247]/10 p-4 text-[10px] leading-4 text-[#df8a82]">
                {message()}
              </p>
            )}
          </Show>
          <Show when={props.providers.length > 1}>
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Source provider
              </span>
              <select
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                value={props.providerId}
                disabled={props.busy}
                onChange={(event) =>
                  props.onProviderChange(event.currentTarget.value)
                }
              >
                <For each={props.providers}>
                  {(candidate) => (
                    <option value={candidate.id}>
                      {candidate.name} · {candidate.summary}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
          <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
              {provider()?.queryLabel ?? "Search"}
            </span>
            <input
              class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none placeholder:text-[#53605b] focus:border-[#d55247]/70"
              value={query()}
              maxlength={100}
              placeholder={provider()?.queryPlaceholder ?? "Search"}
              disabled={props.busy}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
              {provider()?.queryHelp}
            </span>
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Books per fetch
              </span>
              <input
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                type="number"
                min={MIN_LIBRARY_FETCH_LIMIT}
                max={MAX_LIBRARY_FETCH_LIMIT}
                step="1"
                value={fetchLimit()}
                disabled={props.busy}
                onInput={(event) =>
                  setFetchLimit(Number(event.currentTarget.value))
                }
              />
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
                Maximum unseen publications to acquire this run.
              </span>
            </label>
            <label class="block border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
              <span class="mb-2 block text-[9px] font-bold tracking-[0.16em] text-[#7f8c87] uppercase">
                Search result pages
              </span>
              <input
                class="w-full border border-white/10 bg-[#0c1312] px-3 py-2.5 text-xs text-[#eee8dc] outline-none focus:border-[#d55247]/70"
                type="number"
                min={MIN_LIBRARY_SEARCH_PAGE_LIMIT}
                max={MAX_LIBRARY_SEARCH_PAGE_LIMIT}
                step="1"
                value={maxSearchPages()}
                disabled={props.busy}
                onInput={(event) =>
                  setMaxSearchPages(Number(event.currentTarget.value))
                }
              />
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">
                Maximum provider result pages to search for unseen matches.
              </span>
            </label>
          </div>
          <label class="flex cursor-pointer items-start gap-3 border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <input
              class="mt-0.5 size-4 accent-[#d94c3f]"
              type="checkbox"
              checked={props.fetchOnBoot}
              onInput={(event) =>
                props.onFetchOnBootChange(event.currentTarget.checked)
              }
            />
            <span>
              Try to fetch more unique stock whenever Afterleaf boots. This
              choice is remembered on this device and can be disabled here.
            </span>
          </label>
        </div>

        <div class="mt-7 flex justify-end gap-2">
          <button
            class="h-10 border border-white/10 px-4 text-[10px] font-semibold tracking-[0.1em] text-[#909a95] uppercase hover:border-white/20 hover:text-white disabled:opacity-40"
            disabled={props.busy}
            onClick={() => props.onCancel?.()}
          >
            Cancel
          </button>
          <button
            class="flex h-10 items-center gap-2 bg-[#d94c3f] px-4 text-[10px] font-bold tracking-[0.1em] text-white uppercase hover:bg-[#e45a4d] disabled:cursor-not-allowed disabled:bg-[#493331] disabled:text-[#86716e]"
            disabled={!canUpdate()}
            onClick={() =>
              props.onConfirm?.(
                props.fetchOnBoot,
                props.providerId,
                query().trim(),
                fetchLimit(),
                maxSearchPages(),
              )
            }
          >
            <FiRefreshCw classList={{"animate-spin": props.busy}} size={13} />
            {props.busy ? "Fetching stock…" : "Fetch more"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LibraryActivityToast = (props: {
  busy: boolean;
  completedSteps: number;
  elapsedSeconds: number;
  failed: boolean;
  notice?: string;
  status: string;
  totalSteps: number;
  onDismiss: () => void;
}) => (
  <Show when={props.busy || props.notice}>
    <aside
      class="fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] border border-white/12 bg-[#101716]/95 p-4 shadow-[0_20px_70px_#000b] backdrop-blur-md"
      aria-live="polite"
      aria-atomic="false"
    >
      <Show
        when={props.busy}
        fallback={
          <div class="flex items-start gap-3">
            <span
              class="grid size-8 shrink-0 place-items-center"
              classList={{
                "bg-[#6da089]/12 text-[#83b69f]": !props.failed,
                "bg-[#d94c3f]/12 text-[#e16357]": props.failed,
              }}
            >
              <Show when={props.failed} fallback={<FiCheck size={14} />}>
                <FiX size={14} />
              </Show>
            </span>
            <div class="min-w-0 flex-1">
              <p
                class="text-[9px] font-bold tracking-[0.16em] uppercase"
                classList={{
                  "text-[#799c8d]": !props.failed,
                  "text-[#d66a60]": props.failed,
                }}
              >
                Library update
              </p>
              <p class="mt-1 text-[11px] leading-5 text-[#c2cbc6]">
                {props.notice}
              </p>
            </div>
            <button
              class="grid size-7 shrink-0 place-items-center text-[#68736e] hover:bg-white/5 hover:text-white"
              aria-label="Dismiss library update"
              onClick={() => props.onDismiss()}
            >
              <FiX size={13} />
            </button>
          </div>
        }
      >
        <div class="flex items-start gap-3">
          <span class="grid size-8 shrink-0 place-items-center bg-[#d94c3f]/12 text-[#e16357]">
            <FiRefreshCw class="animate-spin" size={14} />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <p class="text-[9px] font-bold tracking-[0.16em] text-[#d66a60] uppercase">
                Background library job
              </p>
              <span
                class="text-[9px] text-[#69746f] tabular-nums"
                aria-hidden="true"
              >
                {props.completedSteps}/{props.totalSteps} ·{" "}
                {props.elapsedSeconds}s
              </span>
            </div>
            <p class="mt-1 text-[11px] leading-5 text-[#c2cbc6]">
              {props.status}
            </p>
            <p class="mt-1 text-[9px] text-[#66716d]">
              Keep shelving—the shop will update when stock is ready.
            </p>
          </div>
        </div>
        <div class="mt-3 h-0.5 overflow-hidden bg-white/6">
          <div
            class="h-full bg-[#d94c3f]/75 transition-[width] duration-300"
            style={{
              width: `${Math.max(
                8,
                (props.completedSteps / Math.max(1, props.totalSteps)) * 100,
              )}%`,
            }}
          />
        </div>
      </Show>
    </aside>
  </Show>
);

const LibraryCard = (props: {
  item: CatalogItem;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    class="group min-w-0 cursor-pointer text-left outline-none"
    aria-pressed={props.active}
    onClick={() => props.onSelect?.()}
  >
    <div
      class="cover-frame relative aspect-[2/3] overflow-hidden bg-[#252b2b] shadow-[0_13px_21px_#02050475] transition duration-300 group-hover:-translate-y-2 group-hover:rotate-[0.4deg] group-hover:shadow-[0_20px_28px_#02050490] group-focus-visible:ring-2 group-focus-visible:ring-[#e85649]"
      classList={{
        "ring-2 ring-[#e85649] ring-offset-4 ring-offset-[#121918]":
          props.active,
      }}
    >
      <img
        class="size-full object-cover"
        src={props.item.cover}
        alt={`${props.item.title} cover`}
        loading="lazy"
      />
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 via-black/10 to-transparent p-3 pt-12 opacity-0 transition group-hover:opacity-100">
        <span class="text-[10px] font-bold tracking-[0.15em] text-white uppercase">
          Inspect
        </span>
        <FiArrowUpRight class="text-white" size={15} />
      </div>
    </div>
    <div class="px-1 pt-3">
      <div class="flex items-start justify-between gap-2">
        <p class="truncate text-[13px] font-semibold text-[#e5e1d8]">
          {props.item.title}
        </p>
        <span class="mt-0.5 shrink-0 text-[10px] text-[#737d79] tabular-nums">
          #{props.item.issue.toString().padStart(2, "0")}
        </span>
      </div>
      <p class="mt-1 truncate text-[10px] tracking-[0.1em] text-[#78827f] uppercase">
        {props.item.collection}
      </p>
    </div>
  </button>
);

const DetailPanel = (props: {
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

export const App = () => {
  const unattendedProfiling =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("profile") === "1";
  const bootFetchWasEnabled = loadBootFetchPreference()?.enabled === true;
  const initialControlPreferences = loadControlPreferences();
  const initialLibraryFetchPreferences = loadLibraryFetchPreferences();
  const initialProviderId = loadLibraryProviderPreference() ?? "nhentai";
  const [ageConfirmed, setAgeConfirmed] = createSignal(
    sessionStorage.getItem("afterleaf-age-confirmed") === "yes",
  );
  const [query, setQuery] = createSignal("");
  const [language, setLanguage] = createSignal<LanguageFilter>("all");
  const [tag, setTag] = createSignal<string | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuTab, setMenuTab] = createSignal<MenuTab>("library");
  const [unstuckRequest, setUnstuckRequest] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal("");
  const [mobileDetailOpen, setMobileDetailOpen] = createSignal(false);
  const [bookmarks, setBookmarks] = createSignal(loadReaderBookmarks());
  const [libraryUpdateNotice, setLibraryUpdateNotice] = createSignal<string>();
  const [libraryUpdateFailed, setLibraryUpdateFailed] = createSignal(false);
  const [libraryUpdateOpen, setLibraryUpdateOpen] = createSignal(false);
  const [libraryUpdating, setLibraryUpdating] = createSignal(false);
  const [libraryOperation, setLibraryOperation] =
    createSignal<LibraryOperation>();
  const [libraryUpdateStage, setLibraryUpdateStage] =
    createSignal<LibraryUpdateStage>("working");
  const [libraryUpdateCompletedSteps, setLibraryUpdateCompletedSteps] =
    createSignal(0);
  const [libraryUpdateTotalSteps, setLibraryUpdateTotalSteps] = createSignal(3);
  const [libraryUpdateProgressMessage, setLibraryUpdateProgressMessage] =
    createSignal("Starting library job");
  const [libraryUpdateElapsedSeconds, setLibraryUpdateElapsedSeconds] =
    createSignal(0);
  const [newPublicationIds, setNewPublicationIds] = createSignal<
    readonly string[]
  >([]);
  const [fetchOnBoot, setFetchOnBoot] = createSignal(bootFetchWasEnabled);
  const [selectedProviderId, setSelectedProviderId] =
    createSignal(initialProviderId);
  const [libraryFetchLimit, setLibraryFetchLimit] = createSignal(
    initialLibraryFetchPreferences.limit,
  );
  const [librarySearchPageLimit, setLibrarySearchPageLimit] = createSignal(
    initialLibraryFetchPreferences.maxSearchPages,
  );
  const [lastChecked, setLastChecked] = createSignal("when the shop opened");
  const [mouseSensitivity, setMouseSensitivity] = createSignal(
    initialControlPreferences.mouseSensitivity,
  );
  const [defaultReadingDirection, setDefaultReadingDirection] = createSignal(
    initialControlPreferences.defaultReadingDirection,
  );
  const [respectBookReadingDirection, setRespectBookReadingDirection] =
    createSignal(initialControlPreferences.respectBookReadingDirection);
  const [blacklistedTags, setBlacklistedTags] =
    createSignal(loadTagBlacklist());
  const [libraryProviderError, setLibraryProviderError] =
    createSignal<string>();
  const [runtimeLibrary, {refetch}] = createResource(() =>
    loadRuntimeLibrary(),
  );
  const [libraryProviders] = createResource(async () => {
    try {
      const providers = await loadLibraryProviders();
      setLibraryProviderError(undefined);
      return providers;
    } catch (error) {
      setLibraryProviderError(
        error instanceof Error
          ? error.message
          : "The library providers could not be loaded.",
      );
      return [];
    }
  });
  let latestLibrarySourceStatus = {unavailableBookPathCount: 0};
  const [librarySourceStatus, {refetch: refetchLibrarySourceStatus}] =
    createResource(async () => {
      try {
        latestLibrarySourceStatus = await loadLibrarySourceStatus();
      } catch {
        // Keep the last safety status if a later health check is interrupted.
      }
      return latestLibrarySourceStatus;
    });
  const [blacklistedPublications, {mutate: setBlacklistedPublications}] =
    createResource(async () => {
      try {
        return await loadBlacklistedPublications();
      } catch {
        return [];
      }
    });
  const resolvedRuntimeLibrary = () =>
    runtimeLibrary.latest ?? runtimeLibrary();
  const availableLibraryProviders = createMemo(
    () => libraryProviders.latest ?? libraryProviders() ?? [],
  );
  const unavailableBookPathCount = () =>
    librarySourceStatus.latest?.unavailableBookPathCount ?? 0;
  createEffect(
    on(availableLibraryProviders, (providers) => {
      if (providers.some((provider) => provider.id === selectedProviderId()))
        return;
      const fallback = providers[0];
      if (!fallback) return;
      setSelectedProviderId(fallback.id);
      saveLibraryProviderPreference(fallback.id);
    }),
  );
  createEffect(
    on(unavailableBookPathCount, (count) => {
      if (count === 0) return;
      const sourceStatusInterval = window.setInterval(
        () => void refetchLibrarySourceStatus(),
        3_000,
      );
      onCleanup(() => window.clearInterval(sourceStatusInterval));
    }),
  );
  const activeLibrary = () => resolvedRuntimeLibrary() ?? emptyLibrary;
  const blacklistedPublicationIds = createMemo(
    () => new Set(blacklistedPublications.latest ?? blacklistedPublications()),
  );
  const publicationLibrary = createMemo(() =>
    activeLibrary().publications.filter(
      (publication) => !blacklistedPublicationIds().has(publication.id),
    ),
  );
  const availableTags = createMemo(() =>
    [...new Set(publicationLibrary().flatMap((item) => item.tags))].sort(
      (left, right) => left.localeCompare(right),
    ),
  );
  const library = createMemo(() => {
    const publications = publicationLibrary();
    const defaultDirection = defaultReadingDirection();
    const respectMetadata = respectBookReadingDirection();
    return publications.map((publication) => {
      const direction =
        respectMetadata && !publication.readingDirectionUnspecified
          ? publication.direction
          : defaultDirection;
      return publication.direction === direction
        ? publication
        : {...publication, direction};
    });
  });
  const visibleTags = createMemo(() =>
    [...new Set(library().flatMap((item) => item.tags))].sort(),
  );
  let libraryUpdateStartedAt = 0;
  let libraryUpdateTimer: number | undefined;
  let libraryStatusRequestPending = false;
  let activeLibraryJob: (LocalLibraryJob & {automatic: boolean}) | undefined;
  const finishLibraryUpdate = () => {
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = undefined;
    activeLibraryJob = undefined;
    setLibraryUpdating(false);
    setLibraryOperation(undefined);
  };
  const scanButtonLabel = () => {
    if (runtimeLibrary.loading) return "Loading…";
    if (libraryOperation() === "scan")
      return `Importing & scanning · ${libraryUpdateElapsedSeconds()}s`;
    if (libraryUpdating()) return "Library busy…";
    return "Import & scan";
  };
  const fetchButtonLabel = () =>
    libraryOperation() === "fetch-more"
      ? `Fetching · ${libraryUpdateElapsedSeconds()}s`
      : "Fetch more";
  const libraryActivityStatus = () => {
    if (libraryUpdateStage() === "loading-library")
      return "Injecting the finished stock into the mounted shop…";
    return libraryUpdateProgressMessage();
  };

  const filteredCatalog = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase();
    return library().filter((item) => {
      if (language() !== "all" && item.language !== language()) return false;
      if (tag() && !item.tags.includes(tag() ?? "")) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.titleJp, item.collection, ...item.tags].some(
        (value) => value.toLowerCase().includes(normalizedQuery),
      );
    });
  });

  const selectedItem = createMemo(
    () => library().find((item) => item.id === selectedId()) ?? library()[0],
  );

  const recordLibraryResult = async (
    result: LocalLibrarySnapshotResult,
    operation: "Fetched" | "Imported & scanned",
  ) => {
    const previousPublicationIds = new Set(
      library().map((publication) => publication.id),
    );
    const currentLibrary = resolvedRuntimeLibrary();
    const activatedLibrary =
      currentLibrary?.identity.snapshotId === result.snapshotId
        ? currentLibrary
        : await refetch();
    if (activatedLibrary.identity.snapshotId !== result.snapshotId)
      throw new Error(
        `The library activated snapshot ${result.snapshotId}, but the game loaded ${activatedLibrary.identity.snapshotId ?? "an empty library"}`,
      );
    const arrivedPublicationIds = activatedLibrary.publications
      .filter((publication) => !previousPublicationIds.has(publication.id))
      .map((publication) => publication.id);
    setNewPublicationIds(arrivedPublicationIds);
    setLastChecked(
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    setLibraryUpdateNotice(
      `${operation}: ${arrivedPublicationIds.length} delivered to the live shop · ${result.publicationCount} catalogued · ${result.updatedCount} updated`,
    );
    setLibraryUpdateFailed(false);
  };

  const reportLibraryFailure = (
    operation: LibraryOperation,
    automatic: boolean,
    message: string,
  ) => {
    setLibraryUpdateFailed(true);
    if (operation === "scan") {
      setLibraryUpdateNotice(`Import and scan failed: ${message}`);
      return;
    }
    setLibraryUpdateNotice(
      automatic
        ? `Automatic fetch failed: ${message}`
        : `Fetch failed: ${message}`,
    );
  };

  const settleLibraryJob = async (
    job: LocalLibraryJob & {automatic: boolean},
    status: Awaited<ReturnType<typeof loadLibraryOperationStatus>>,
  ) => {
    if (activeLibraryJob?.jobId !== job.jobId) return;
    setLibraryUpdateCompletedSteps(status.completedSteps);
    setLibraryUpdateTotalSteps(status.totalSteps);
    setLibraryUpdateProgressMessage(status.message);
    if (status.state === "running") return;
    try {
      if (status.state === "failed") {
        reportLibraryFailure(
          job.operation,
          job.automatic,
          status.error.message,
        );
        return;
      }
      setLibraryUpdateStage("loading-library");
      setLibraryUpdateProgressMessage("Injecting stock into the mounted shop");
      await recordLibraryResult(
        status.result,
        job.operation === "fetch-more" ? "Fetched" : "Imported & scanned",
      );
    } catch (error) {
      reportLibraryFailure(
        job.operation,
        job.automatic,
        error instanceof Error
          ? error.message
          : "The finished library could not be loaded.",
      );
    } finally {
      if (activeLibraryJob?.jobId === job.jobId) finishLibraryUpdate();
    }
  };

  const refreshLibraryUpdateStatus = async (
    job: LocalLibraryJob & {automatic: boolean},
  ) => {
    if (libraryStatusRequestPending || activeLibraryJob?.jobId !== job.jobId)
      return;
    libraryStatusRequestPending = true;
    try {
      const status = await loadLibraryOperationStatus(job.jobId);
      await settleLibraryJob(job, status);
    } catch (error) {
      if (
        activeLibraryJob?.jobId === job.jobId &&
        error instanceof BrowserLibraryOperationError &&
        error.code === "job_not_found"
      ) {
        reportLibraryFailure(job.operation, job.automatic, error.message);
        finishLibraryUpdate();
      }
    } finally {
      libraryStatusRequestPending = false;
    }
  };

  const beginLibraryUpdate = (operation: LibraryOperation, query?: string) => {
    libraryUpdateStartedAt = performance.now();
    activeLibraryJob = undefined;
    setLibraryUpdateElapsedSeconds(0);
    setLibraryUpdateFailed(false);
    setLibraryOperation(operation);
    setLibraryUpdateStage("working");
    setLibraryUpdateCompletedSteps(0);
    setLibraryUpdateTotalSteps(3);
    setLibraryUpdateProgressMessage(
      operation === "fetch-more" && query
        ? `Starting provider search for “${query}”`
        : "Starting library job",
    );
    setLibraryUpdating(true);
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
    libraryUpdateTimer = window.setInterval(() => {
      const job = activeLibraryJob;
      if (job) void refreshLibraryUpdateStatus(job);
      setLibraryUpdateElapsedSeconds(
        Math.floor((performance.now() - libraryUpdateStartedAt) / 1_000),
      );
    }, 1_000);
  };

  const monitorLibraryJob = (job: LocalLibraryJob, automatic: boolean) => {
    activeLibraryJob = {...job, automatic};
    void refreshLibraryUpdateStatus(activeLibraryJob);
  };

  const fetchMoreLibrary = async (
    options: {
      automatic?: boolean;
      limit?: number;
      maxSearchPages?: number;
      rememberBootFetch?: boolean;
      providerId?: string;
      query?: string;
      transient?: boolean;
    } = {},
  ) => {
    if (libraryUpdating()) return;
    const providerId = options.providerId ?? selectedProviderId();
    const provider = availableLibraryProviders().find(
      (candidate) => candidate.id === providerId,
    );
    const query = options.query ?? provider?.defaultQuery ?? "";
    beginLibraryUpdate("fetch-more", query);
    setLibraryUpdateNotice(undefined);
    if (!options.transient) {
      setSelectedProviderId(providerId);
      saveLibraryProviderPreference(providerId);
    }
    if (options.rememberBootFetch !== undefined) {
      saveBootFetchPreference(options.rememberBootFetch);
      setFetchOnBoot(options.rememberBootFetch);
    }
    let acquisitionLimit = options.limit ?? libraryFetchLimit();
    let searchPageLimit = options.maxSearchPages ?? librarySearchPageLimit();
    if (
      !options.transient &&
      (options.limit !== undefined || options.maxSearchPages !== undefined)
    ) {
      const preferences = saveLibraryFetchPreferences({
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
      });
      acquisitionLimit = preferences.limit;
      searchPageLimit = preferences.maxSearchPages;
      setLibraryFetchLimit(preferences.limit);
      setLibrarySearchPageLimit(preferences.maxSearchPages);
    }
    if (!options.automatic) {
      setLibraryUpdateOpen(false);
      setMenuOpen(false);
    }
    try {
      const blockedTags = blacklistedTags();
      const job = await fetchMorePublications({
        ...(blockedTags.length === 0 ? {} : {blockedTags}),
        limit: acquisitionLimit,
        maxSearchPages: searchPageLimit,
        providerId,
        ...(query ? {query} : {}),
      });
      monitorLibraryJob(job, options.automatic === true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The local acquisition service could not fetch more stock.";
      reportLibraryFailure("fetch-more", options.automatic === true, message);
      finishLibraryUpdate();
    }
  };

  const scanLibrary = async () => {
    if (libraryUpdating()) return;
    beginLibraryUpdate("scan");
    setLibraryUpdateNotice(undefined);
    try {
      const job = await scanLocalLibrary();
      monitorLibraryJob(job, false);
    } catch (error) {
      reportLibraryFailure(
        "scan",
        false,
        error instanceof Error
          ? error.message
          : "The local library could not be imported and scanned.",
      );
      finishLibraryUpdate();
    }
  };

  const importPastedPublication = async (text: string) => {
    let match;
    try {
      match = await resolvePastedLibraryImport(text);
    } catch (error) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(
        error instanceof Error
          ? `Could not resolve the pasted text: ${error.message}`
          : "Could not ask library providers about the pasted text.",
      );
      return false;
    }
    if (!match) return false;
    const importLabel =
      match.publicationId ?? `${match.providerId} publication`;
    if (
      match.publicationId &&
      activeLibrary().publications.some(
        (publication) => publication.id === match.publicationId,
      )
    ) {
      setLibraryUpdateFailed(false);
      setLibraryUpdateNotice(`${importLabel} is already imported.`);
      return true;
    }
    if (libraryUpdating()) {
      setLibraryUpdateNotice(
        `Could not import ${importLabel} because another library job is running.`,
      );
      return true;
    }
    if (unavailableBookPathCount() > 0) {
      setLibraryUpdateFailed(true);
      setLibraryUpdateNotice(
        `Could not import ${importLabel} until the configured book paths are remounted.`,
      );
      return true;
    }
    void fetchMoreLibrary({
      limit: 1,
      maxSearchPages: 1,
      providerId: match.providerId,
      query: match.query,
      transient: true,
    });
    return true;
  };

  let bootFetchStarted = false;
  const maybeFetchOnBoot = () => {
    if (!ageConfirmed() || !bootFetchWasEnabled || bootFetchStarted) return;
    bootFetchStarted = true;
    void fetchMoreLibrary({automatic: true});
  };

  const confirmAge = () => {
    sessionStorage.setItem("afterleaf-age-confirmed", "yes");
    setAgeConfirmed(true);
    maybeFetchOnBoot();
  };

  const closeLibraryUpdate = () => {
    setFetchOnBoot(loadBootFetchPreference()?.enabled === true);
    setLibraryUpdateOpen(false);
  };

  const discardPublication = async (publicationId: string) => {
    await blacklistPublication({publicationId});
    setBlacklistedPublications((current = []) => [
      ...new Set([...current, publicationId]),
    ]);
    return true;
  };

  const updateMouseSensitivity = (value: number) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: value,
      respectBookReadingDirection: respectBookReadingDirection(),
    });
    setMouseSensitivity(preferences.mouseSensitivity);
  };

  const updateDefaultReadingDirection = (value: ReadingDirection) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: value,
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: respectBookReadingDirection(),
    });
    setDefaultReadingDirection(preferences.defaultReadingDirection);
  };

  const updateRespectBookReadingDirection = (value: boolean) => {
    const preferences = saveControlPreferences({
      defaultReadingDirection: defaultReadingDirection(),
      mouseSensitivity: mouseSensitivity(),
      respectBookReadingDirection: value,
    });
    setRespectBookReadingDirection(preferences.respectBookReadingDirection);
  };

  const updateBlacklistedTags = (tags: readonly string[]) => {
    const nextTags = saveTagBlacklist(tags);
    setBlacklistedTags(nextTags);
    const selectedTag = tag();
    if (selectedTag && nextTags.includes(normalizeTag(selectedTag)))
      setTag(null);
  };

  onMount(() => {
    maybeFetchOnBoot();
    const abortController = new AbortController();
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (libraryUpdateOpen()) {
            if (!libraryUpdating()) closeLibraryUpdate();
            return;
          }
          if (mobileDetailOpen()) {
            setMobileDetailOpen(false);
            return;
          }
          setMenuOpen((current) => !current);
        }
      },
      {signal: abortController.signal},
    );
    onCleanup(() => abortController.abort());
  });
  onCleanup(() => {
    if (libraryUpdateTimer !== undefined)
      window.clearInterval(libraryUpdateTimer);
  });

  return (
    <main class="h-[100dvh] overflow-hidden bg-[#071010] text-[#d9d6cc]">
      <Show when={ageConfirmed()} fallback={<AdultGate onEnter={confirmAge} />}>
        <div class="fixed inset-0">
          <Suspense
            fallback={
              <div class="grid size-full place-items-center bg-[#071010]">
                <p class="text-[9px] font-semibold tracking-[0.2em] text-[#7e918b] uppercase">
                  Opening the shop floor…
                </p>
              </div>
            }
          >
            <Show when={resolvedRuntimeLibrary()}>
              {(runtime) => (
                <Show when={!blacklistedPublications.loading}>
                  <ShopViewport
                    catalogAtlases={() => runtime().atlases}
                    catalogIdentity={() => runtime().identity}
                    mouseSensitivity={mouseSensitivity}
                    newPublicationIds={newPublicationIds}
                    pageIndexForPublication={(publicationId) =>
                      bookmarks()[publicationId] ?? 0
                    }
                    pauseOnPointerUnlock={() => !unattendedProfiling}
                    publications={library}
                    selectedPublicationId={() => selectedItem()?.id}
                    unstuckRequest={unstuckRequest}
                    paused={menuOpen}
                    onOpenMenu={() => setMenuOpen(true)}
                    onPasteText={importPastedPublication}
                    onDiscardPublication={discardPublication}
                    onPageIndexChange={(publicationId, pageIndex) =>
                      setBookmarks((current) =>
                        saveReaderBookmark(current, publicationId, pageIndex),
                      )
                    }
                    onSelectPublication={(publicationId) => {
                      setSelectedId(publicationId);
                    }}
                  />
                </Show>
              )}
            </Show>
          </Suspense>

          <LibraryActivityToast
            busy={libraryUpdating()}
            completedSteps={libraryUpdateCompletedSteps()}
            elapsedSeconds={libraryUpdateElapsedSeconds()}
            failed={libraryUpdateFailed()}
            notice={libraryUpdateNotice()}
            status={libraryActivityStatus()}
            totalSteps={libraryUpdateTotalSteps()}
            onDismiss={() => {
              setLibraryUpdateFailed(false);
              setLibraryUpdateNotice(undefined);
            }}
          />

          <Show when={unavailableBookPathCount()}>
            {(count) => (
              <aside
                class="fixed top-4 left-1/2 z-40 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 border border-[#d94c3f]/60 bg-[#250d0b]/95 px-4 py-3 text-[#ff796c] shadow-[0_16px_50px_#000b] backdrop-blur-md"
                aria-live="assertive"
              >
                <FiAlertTriangle class="mt-0.5 shrink-0" size={16} />
                <p class="text-[11px] leading-5">
                  {count()} configured book{" "}
                  {count() === 1 ? "path is" : "paths are"}
                  unavailable. Library updates are locked so the current books
                  cannot be removed. Remount the missing storage to continue.
                </p>
              </aside>
            )}
          </Show>

          <Show when={menuOpen()}>
            <div
              class="fixed inset-0 z-30 overflow-hidden bg-[#080d0c]/80 p-0 backdrop-blur-sm sm:p-4 lg:p-7"
              role="dialog"
              aria-modal="true"
              aria-label="Afterleaf pause menu"
            >
              <div class="mx-auto flex size-full max-w-[1800px] flex-col overflow-hidden border-white/10 bg-[#101716]/98 shadow-[0_30px_120px_#000] sm:border">
                <header class="flex h-[72px] shrink-0 items-center border-b border-white/8 bg-[#121918]/95 px-4 sm:px-7 lg:px-9">
                  <div class="flex min-w-0 items-center gap-4">
                    <div class="brand-mark grid size-9 shrink-0 place-items-center bg-[#d94c3f] font-serif text-lg text-white">
                      葉
                    </div>
                    <div class="min-w-0">
                      <h1 class="truncate font-serif text-xl tracking-[-0.03em] text-[#f0ebdf]">
                        Afterleaf
                      </h1>
                      <p class="hidden text-[9px] font-semibold tracking-[0.22em] text-[#6f7a76] uppercase sm:block">
                        Closing shift · local library
                      </p>
                    </div>
                  </div>
                  <div class="ml-auto flex items-center gap-2 sm:gap-3">
                    <div class="mr-2 hidden items-center gap-2 text-[10px] text-[#6f7b76] md:flex">
                      <span class="size-1.5 rounded-full bg-[#75aa91] shadow-[0_0_8px_#75aa91]"></span>{" "}
                      Local library
                    </div>
                    <button
                      class="grid size-9 place-items-center text-[#8d9893] transition hover:bg-white/5 hover:text-white"
                      aria-label="Close menu and return to shop"
                      title="Return to shop (Escape)"
                      onClick={() => setMenuOpen(false)}
                    >
                      <FiX size={17} />
                    </button>
                    <button
                      class="flex h-9 items-center gap-2 border border-white/10 px-3 text-[11px] text-[#aab2ae] transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-50"
                      disabled={
                        runtimeLibrary.loading ||
                        libraryUpdating() ||
                        unavailableBookPathCount() > 0
                      }
                      onClick={() => void scanLibrary()}
                      title={
                        unavailableBookPathCount() > 0
                          ? "Remount the configured book paths before updating the library"
                          : "Import new CBZ/ZIP files and refresh the local library without contacting nHentai"
                      }
                    >
                      <FiRefreshCw
                        classList={{
                          "animate-spin":
                            runtimeLibrary.loading || libraryUpdating(),
                        }}
                        size={14}
                      />
                      <span class="hidden sm:inline">{scanButtonLabel()}</span>
                    </button>
                    <button
                      class="flex h-9 items-center gap-2 bg-[#ece6d8] px-3.5 text-[11px] font-bold text-[#1b2321] transition hover:bg-white disabled:cursor-wait"
                      disabled={
                        runtimeLibrary.loading ||
                        libraryUpdating() ||
                        unavailableBookPathCount() > 0
                      }
                      onClick={() => {
                        setFetchOnBoot(
                          loadBootFetchPreference()?.enabled === true,
                        );
                        setLibraryUpdateOpen(true);
                      }}
                    >
                      <FiDownload size={14} />
                      <span class="hidden sm:inline">{fetchButtonLabel()}</span>
                    </button>
                  </div>
                </header>

                <nav class="flex shrink-0 border-b border-white/8 bg-[#121918] p-2 xl:hidden">
                  <button
                    class="flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition"
                    classList={{
                      "bg-[#1c2523] text-[#ece8dd]": menuTab() === "library",
                      "text-[#78837e] hover:bg-white/[0.025] hover:text-white":
                        menuTab() !== "library",
                    }}
                    aria-pressed={menuTab() === "library"}
                    onClick={() => setMenuTab("library")}
                    type="button"
                  >
                    <FiGrid size={13} /> Library
                  </button>
                  <button
                    class="flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.08em] uppercase transition"
                    classList={{
                      "bg-[#1c2523] text-[#ece8dd]": menuTab() === "options",
                      "text-[#78837e] hover:bg-white/[0.025] hover:text-white":
                        menuTab() !== "options",
                    }}
                    aria-pressed={menuTab() === "options"}
                    onClick={() => setMenuTab("options")}
                    type="button"
                  >
                    <FiSettings size={13} /> Options
                  </button>
                </nav>

                <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)_330px]">
                  <nav class="hidden border-r border-white/8 bg-[#121918] px-5 py-7 xl:flex xl:flex-col">
                    <p class="px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                      Menu
                    </p>
                    <div class="mt-4 space-y-1">
                      <button
                        class="flex w-full items-center gap-3 px-3 py-2.5 text-xs transition"
                        classList={{
                          "bg-[#1c2523] font-semibold text-[#ece8dd]":
                            menuTab() === "library",
                          "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                            menuTab() !== "library",
                        }}
                        aria-pressed={menuTab() === "library"}
                        onClick={() => setMenuTab("library")}
                        type="button"
                      >
                        <FiGrid size={14} class="text-[#e25a4d]" /> Library{" "}
                        <span class="ml-auto text-[10px] text-[#7c8681]">
                          {String(library().length).padStart(2, "0")}
                        </span>
                      </button>
                      <button
                        class="flex w-full items-center gap-3 px-3 py-2.5 text-xs transition"
                        classList={{
                          "bg-[#1c2523] font-semibold text-[#ece8dd]":
                            menuTab() === "options",
                          "text-[#7d8883] hover:bg-white/[0.025] hover:text-[#cbd0cc]":
                            menuTab() !== "options",
                        }}
                        aria-pressed={menuTab() === "options"}
                        onClick={() => setMenuTab("options")}
                        type="button"
                      >
                        <FiSettings size={14} class="text-[#e25a4d]" /> Options
                      </button>
                    </div>

                    <p class="mt-9 px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                      Browse
                    </p>
                    <div class="mt-4 space-y-1">
                      <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                        <FiClock size={14} /> Recently added
                      </button>
                      <button class="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-[#7d8883] transition hover:bg-white/[0.025] hover:text-[#cbd0cc]">
                        <FiBookOpen size={14} /> Continue reading
                      </button>
                    </div>

                    <p class="mt-9 px-2 text-[9px] font-bold tracking-[0.2em] text-[#59645f] uppercase">
                      Collections
                    </p>
                    <div class="mt-4 space-y-1">
                      <For
                        each={[
                          {label: "Night shelves", color: "#d14d42"},
                          {label: "Office stories", color: "#cf8951"},
                          {label: "Supernatural", color: "#775e93"},
                          {label: "Unsorted", color: "#64736d"},
                        ]}
                      >
                        {(collection) => (
                          <button class="flex w-full items-center gap-3 px-3 py-2 text-left text-[11px] text-[#7e8984] hover:text-[#cbd0cc]">
                            <span
                              class="size-1.5 rounded-full"
                              style={{background: collection.color}}
                            ></span>
                            {collection.label}
                          </button>
                        )}
                      </For>
                    </div>

                    <div class="mt-auto border-t border-white/8 pt-5">
                      <div class="flex items-center gap-3 px-2">
                        <span class="grid size-8 place-items-center rounded-full bg-[#24312e] text-[#789488]">
                          <FiShield size={13} />
                        </span>
                        <div>
                          <p class="text-[10px] font-semibold text-[#9ca6a1]">
                            Local catalog
                          </p>
                          <p class="mt-0.5 text-[9px] text-[#56615c]">
                            Stored on this device
                          </p>
                        </div>
                      </div>
                    </div>
                  </nav>

                  <section
                    class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9"
                    classList={{hidden: menuTab() !== "library"}}
                  >
                    <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                      <div>
                        <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">
                          First floor · current stock
                        </p>
                        <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">
                          The night shelf
                        </h2>
                        <p class="mt-2 text-xs text-[#6e7974]">
                          {library().length} publications catalogued ·{" "}
                          {library().length > 0
                            ? "all covers verified"
                            : "ready for import"}
                        </p>
                      </div>
                      <div class="flex items-center gap-3 border border-white/8 bg-[#151e1c] px-4 py-3">
                        <span class="relative flex size-7 items-center justify-center">
                          <span class="absolute size-6 rounded-full border border-[#70a28b]/20"></span>
                          <span class="size-2 rounded-full bg-[#70a28b] shadow-[0_0_10px_#70a28b]"></span>
                        </span>
                        <div>
                          <p class="text-[10px] font-semibold text-[#b8c1bc]">
                            Library is current
                          </p>
                          <p class="mt-0.5 text-[9px] text-[#5f6b66]">
                            Last checked {lastChecked()}
                          </p>
                          <Show when={libraryUpdating()}>
                            <p class="mt-1 text-[9px] text-[#d66a60]">
                              {libraryActivityStatus()} ·{" "}
                              {libraryUpdateElapsedSeconds()}s
                            </p>
                          </Show>
                          <Show when={libraryUpdateNotice()}>
                            {(notice) => (
                              <p class="mt-1 text-[9px] text-[#7fa995]">
                                {notice()}
                              </p>
                            )}
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="mt-8 flex flex-col gap-3 border-y border-white/8 py-4 md:flex-row md:items-center">
                      <label class="flex h-10 flex-1 items-center gap-3 bg-[#19211f] px-3.5 text-[#7b8581] ring-[#d95145] focus-within:ring-1">
                        <FiSearch size={15} />
                        <input
                          class="min-w-0 flex-1 bg-transparent text-xs text-[#e2ded4] outline-none placeholder:text-[#65706c]"
                          value={query()}
                          onInput={(event) =>
                            setQuery(event.currentTarget.value)
                          }
                          placeholder="Search title, collection, or tag…"
                        />
                        <Show when={query()}>
                          <button
                            class="hover:text-white"
                            aria-label="Clear search"
                            onClick={() => setQuery("")}
                          >
                            <FiX size={13} />
                          </button>
                        </Show>
                      </label>
                      <div class="flex h-10 items-center gap-1 overflow-x-auto bg-[#19211f] p-1">
                        <FiSliders
                          class="mx-2 shrink-0 text-[#68736e]"
                          size={13}
                        />
                        <For
                          each={
                            Object.entries(languageLabels) as [
                              LanguageFilter,
                              string,
                            ][]
                          }
                        >
                          {(entry) => (
                            <button
                              class="h-8 shrink-0 px-3 text-[10px] font-semibold transition"
                              classList={{
                                "bg-[#ede7d9] text-[#18201f]":
                                  language() === entry[0],
                                "text-[#77827d] hover:text-white":
                                  language() !== entry[0],
                              }}
                              onClick={() => setLanguage(entry[0])}
                            >
                              {entry[1]}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>

                    <div class="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                      <button
                        class="shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition"
                        classList={{
                          "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]":
                            tag() === null,
                          "border-white/8 text-[#69746f] hover:border-white/15":
                            tag() !== null,
                        }}
                        onClick={() => setTag(null)}
                      >
                        All tags
                      </button>
                      <For each={visibleTags()}>
                        {(catalogTag) => (
                          <button
                            class="shrink-0 border px-3 py-1.5 text-[9px] font-semibold tracking-wide uppercase transition"
                            classList={{
                              "border-[#d64e42] bg-[#d64e42]/10 text-[#e46a60]":
                                tag() === catalogTag,
                              "border-white/8 text-[#69746f] hover:border-white/15 hover:text-[#aeb5b1]":
                                tag() !== catalogTag,
                            }}
                            onClick={() => setTag(catalogTag)}
                          >
                            {catalogTag}
                          </button>
                        )}
                      </For>
                    </div>

                    <div class="mt-5 flex items-center justify-between border-b border-white/8 pb-4">
                      <p class="text-[9px] leading-4 text-[#5f6a66]">
                        Inspect the catalog here, then press Escape to return to
                        the shop floor.
                      </p>
                      <span class="hidden items-center gap-2 border border-white/10 px-3 py-2 text-[9px] font-semibold tracking-[0.12em] text-[#7d8883] uppercase sm:flex">
                        <FiMenu size={12} /> Escape menu
                      </span>
                    </div>

                    <div class="mt-8">
                      <div class="mb-5 flex items-center justify-between">
                        <p class="text-[10px] font-semibold tracking-[0.17em] text-[#747f7a] uppercase">
                          Face-out rack{" "}
                          <span class="ml-2 text-[#4f5955]">
                            {filteredCatalog()
                              .length.toString()
                              .padStart(2, "0")}
                          </span>
                        </p>
                        <p class="text-[9px] text-[#515c57]">
                          Newest added first
                        </p>
                      </div>
                      <Show
                        when={filteredCatalog().length > 0}
                        fallback={
                          <div class="grid min-h-72 place-items-center border border-dashed border-white/10 text-center">
                            <div>
                              <FiSearch
                                class="mx-auto text-[#53605a]"
                                size={20}
                              />
                              <p class="mt-4 text-sm text-[#9ba49f]">
                                Nothing on this shelf
                              </p>
                              <button
                                class="mt-3 text-[10px] font-semibold text-[#d65a4f]"
                                onClick={() => {
                                  setQuery("");
                                  setTag(null);
                                  setLanguage("all");
                                }}
                              >
                                Clear filters
                              </button>
                            </div>
                          </div>
                        }
                      >
                        <div class="shelf-grid grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                          <For each={filteredCatalog()}>
                            {(item) => (
                              <LibraryCard
                                item={item}
                                active={selectedItem()?.id === item.id}
                                onSelect={() => {
                                  setSelectedId(item.id);
                                  setMobileDetailOpen(true);
                                }}
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </section>

                  <Show
                    when={menuTab() === "library" ? selectedItem() : undefined}
                    fallback={
                      <Show when={menuTab() === "library"}>
                        <aside class="hidden border-l border-white/8 bg-[#151c1b] xl:block" />
                      </Show>
                    }
                  >
                    {(item) => (
                      <div class="hidden xl:block">
                        <DetailPanel
                          item={item()}
                          onClose={() => setSelectedId("")}
                          onInspect={() => setMenuOpen(false)}
                        />
                      </div>
                    )}
                  </Show>

                  <Show when={menuTab() === "options"}>
                    <OptionsPanel
                      availableTags={availableTags()}
                      blacklistedTags={blacklistedTags()}
                      defaultReadingDirection={defaultReadingDirection()}
                      mouseSensitivity={mouseSensitivity()}
                      onBlacklistedTagsChange={updateBlacklistedTags}
                      onDefaultReadingDirectionChange={
                        updateDefaultReadingDirection
                      }
                      onMouseSensitivityChange={updateMouseSensitivity}
                      onUnstuck={() => {
                        setUnstuckRequest((request) => request + 1);
                        setMenuOpen(false);
                      }}
                      onRespectBookReadingDirectionChange={
                        updateRespectBookReadingDirection
                      }
                      respectBookReadingDirection={respectBookReadingDirection()}
                    />
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={mobileDetailOpen()}>
            <Show when={selectedItem()}>
              {(item) => (
                <div
                  class="fixed inset-0 z-40 bg-black/70 xl:hidden"
                  onClick={() => setMobileDetailOpen(false)}
                >
                  <div
                    class="absolute inset-y-0 right-0 w-full max-w-sm"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DetailPanel
                      item={item()}
                      onClose={() => setMobileDetailOpen(false)}
                      onInspect={() => {
                        setMobileDetailOpen(false);
                        setMenuOpen(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </Show>
          </Show>

          <Show when={libraryUpdateOpen()}>
            <LibraryUpdateDialog
              busy={libraryUpdating()}
              fetchOnBoot={fetchOnBoot()}
              fetchLimit={libraryFetchLimit()}
              maxSearchPages={librarySearchPageLimit()}
              providerId={selectedProviderId()}
              providers={availableLibraryProviders()}
              providerError={libraryProviderError()}
              onCancel={closeLibraryUpdate}
              onConfirm={(
                rememberBootFetch,
                providerId,
                query,
                fetchLimit,
                maxSearchPages,
              ) =>
                void fetchMoreLibrary({
                  limit: fetchLimit,
                  maxSearchPages,
                  rememberBootFetch,
                  providerId,
                  query,
                })
              }
              onFetchOnBootChange={setFetchOnBoot}
              onProviderChange={(providerId) => {
                setSelectedProviderId(providerId);
                saveLibraryProviderPreference(providerId);
              }}
            />
          </Show>
        </div>
      </Show>
    </main>
  );
};
