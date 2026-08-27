import {FiRefreshCw} from "solid-icons/fi";
import {createEffect, createSignal, For, on, Show, untrack} from "solid-js";
import type {LibraryProviderDescriptor} from "~/content/providers/types";
import {
  MAX_LIBRARY_FETCH_LIMIT,
  MAX_LIBRARY_SEARCH_PAGE_LIMIT,
  MIN_LIBRARY_FETCH_LIMIT,
  MIN_LIBRARY_SEARCH_PAGE_LIMIT,
} from "~/content/libraryUpdate/httpProtocol";

export const LibraryUpdateDialog = (props: {
  busy: boolean;
  fetchOnBoot: boolean;
  fetchLimit: number;
  maxSearchPages: number;
  providerId: string;
  providers: readonly LibraryProviderDescriptor[];
  providerError?: string | undefined;
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
  const provider = () => props.providers.find((candidate) => candidate.id === props.providerId);
  const [query, setQuery] = createSignal(untrack(() => provider()?.defaultQuery ?? ""));
  const [fetchLimit, setFetchLimit] = createSignal(untrack(() => props.fetchLimit));
  const [maxSearchPages, setMaxSearchPages] = createSignal(untrack(() => props.maxSearchPages));
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
  const canUpdate = () => Boolean(provider()) && fetchLimitIsValid() && searchPageLimitIsValid() && !props.busy;

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
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d55247] uppercase">Provider acquisition</p>
            <h2 class="mt-2 font-serif text-2xl text-[#f0ebdf]">Fetch more stock</h2>
          </div>
          <span class="grid size-10 shrink-0 place-items-center border border-[#d55247]/35 bg-[#d55247]/10 text-[#e16458]">
            <FiRefreshCw size={16} />
          </span>
        </div>
        <p class="mt-5 text-xs leading-5 text-[#929e99]">
          {provider()?.summary ?? "Choose a provider to fetch local stock."} This downloads a small preview and lazily
          caches later pages as you read.
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
                onChange={(event) => props.onProviderChange(event.currentTarget.value)}
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
          <div class="border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-[#b7c0bb]">
            <label>
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
              <span class="mt-2 block text-[9px] leading-4 text-[#65716c]">{provider()?.queryHelp}</span>
            </label>
            <Show when={provider()?.queryGuide}>
              {(guide) => (
                <details class="group mt-3 border-t border-white/8 pt-3">
                  <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[9px] font-bold tracking-[0.16em] text-[#8e9b96] uppercase transition hover:text-[#d5d9d6]">
                    <span>{provider()?.name} search syntax</span>
                    <span class="text-[#d55247] group-open:hidden">Show</span>
                    <span class="hidden text-[#d55247] group-open:inline">Hide</span>
                  </summary>
                  <div class="pt-4">
                    <p class="text-[10px] leading-4 text-[#77837e]">{guide().introduction}</p>
                    <div class="mt-4">
                      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)] gap-x-3 gap-y-2 text-[10px]">
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">Filter</span>
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">Include</span>
                        <span class="font-bold tracking-[0.1em] text-[#5f6c67] uppercase">Exclude</span>
                        <For each={guide().entries}>
                          {(entry) => (
                            <>
                              <span class="text-[#919c97]">{entry.description}</span>
                              <code class="break-words text-[#d7d1c6]">{entry.expression}</code>
                              <code class="break-words text-[#c7837c]">{entry.exclusion}</code>
                            </>
                          )}
                        </For>
                      </div>
                    </div>
                    <Show when={guide().examples.length > 0}>
                      <div class="mt-4 border-t border-white/8 pt-4">
                        <p class="text-[9px] font-bold tracking-[0.12em] text-[#68746f] uppercase">Examples</p>
                        <div class="mt-2 flex flex-col gap-1.5">
                          <For each={guide().examples}>
                            {(example) => (
                              <code class="bg-[#0c1312] px-2.5 py-2 text-[10px] break-words text-[#bfc8c3]">
                                {example}
                              </code>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </details>
              )}
            </Show>
          </div>
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
                onInput={(event) => setFetchLimit(Number(event.currentTarget.value))}
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
                onInput={(event) => setMaxSearchPages(Number(event.currentTarget.value))}
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
              onInput={(event) => props.onFetchOnBootChange(event.currentTarget.checked)}
            />
            <span>
              Try to fetch more unique stock whenever Afterleaf boots. This choice is remembered on this device and can
              be disabled here.
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
              props.onConfirm?.(props.fetchOnBoot, props.providerId, query().trim(), fetchLimit(), maxSearchPages())
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
