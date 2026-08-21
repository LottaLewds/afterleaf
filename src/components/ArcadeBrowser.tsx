import {
  FiDownload,
  FiHardDrive,
  FiLoader,
  FiPlay,
  FiTrash2,
  FiX,
} from "solid-icons/fi";
import {For, Show, createResource, createSignal} from "solid-js";

import {listArcadeSystemRoms, type ArcadeRomListing} from "~/arcade/romSources";
import {
  deleteSavedRom,
  getSavedRomUrl,
  listSavedRoms,
  saveRomBlob,
  type ArcadeRomSummary,
} from "~/arcade/romLibrary";
import {ARCADE_SYSTEMS, findArcadeSystem} from "~/arcade/systems";
import type {ShopArcadePlayRequest} from "~/game/ShopArcadeCabinet";

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export type ArcadeBrowserProps = {
  onClose: () => void;
  onPlay: (request: ShopArcadePlayRequest) => void;
};

/**
 * In-world ROM picker for the arcade cabinet. Lists freely redistributable
 * homebrew content discovered from the libretro content repository, caches
 * downloads locally, and also accepts sideloaded ROM files.
 */
export const ArcadeBrowser = (props: ArcadeBrowserProps) => {
  const defaultSystem = ARCADE_SYSTEMS[0]!;
  const [selectedSystemId, setSelectedSystemId] = createSignal(
    defaultSystem.id,
  );
  const [query, setQuery] = createSignal("");
  const [savedRoms, setSavedRoms] = createSignal<ArcadeRomSummary[]>([]);
  const [downloadName, setDownloadName] = createSignal<string>();
  const [downloadPercent, setDownloadPercent] = createSignal(0);
  const [error, setError] = createSignal<string>();
  let downloadAbortController: AbortController | undefined;

  void listSavedRoms()
    .then(setSavedRoms)
    .catch(() => {});

  const [listings, {refetch}] = createResource(
    selectedSystemId,
    async (systemId) => {
      const result = await listArcadeSystemRoms(systemId);
      return result.listings;
    },
  );

  const savedById = () => {
    const map = new Map<string, ArcadeRomSummary>();
    for (const rom of savedRoms()) map.set(rom.id, rom);
    return map;
  };

  const visibleListings = () => {
    const all = listings() ?? [];
    const needle = query().trim().toLowerCase();
    if (!needle) return all;
    return all.filter((listing) => listing.name.toLowerCase().includes(needle));
  };

  const refreshSaved = () => {
    void listSavedRoms()
      .then(setSavedRoms)
      .catch(() => {});
  };

  const playListing = async (listing: ArcadeRomListing) => {
    setError(undefined);
    try {
      const saved = savedById().get(listing.id);
      if (saved) {
        const romUrl = await getSavedRomUrl(listing.id);
        if (!romUrl) throw new Error("The saved ROM could not be opened.");
        props.onPlay({
          name: listing.name,
          romUrl,
          systemId: listing.systemId,
        });
        return;
      }
      downloadAbortController?.abort();
      downloadAbortController = new AbortController();
      setDownloadName(listing.name);
      setDownloadPercent(0);
      const response = await fetch(listing.downloadUrl, {
        signal: downloadAbortController.signal,
      });
      if (!response.ok)
        throw new Error(`The download failed with ${response.status}.`);
      const totalHeader = Number(response.headers.get("content-length"));
      const total =
        Number.isFinite(totalHeader) && totalHeader > 0
          ? totalHeader
          : listing.sizeBytes;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming downloads are unavailable.");
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0)
          setDownloadPercent(Math.min(100, (received / total) * 100));
      }
      const blob = new Blob(chunks as BlobPart[]);
      await saveRomBlob({
        blob,
        id: listing.id,
        name: listing.name,
        sizeBytes: blob.size,
        systemId: listing.systemId,
      });
      refreshSaved();
      setDownloadName(undefined);
      // Serve the freshly saved copy so replays hit the local library.
      const romUrl =
        (await getSavedRomUrl(listing.id)) ?? URL.createObjectURL(blob);
      props.onPlay({
        name: listing.name,
        romUrl,
        systemId: listing.systemId,
      });
    } catch (cause) {
      setDownloadName(undefined);
      if (downloadAbortController?.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "The download failed.");
    }
  };

  const removeListing = async (listing: ArcadeRomListing) => {
    setError(undefined);
    try {
      await deleteSavedRom(listing.id);
    } finally {
      refreshSaved();
    }
  };

  const playLocalFile = async (file: File) => {
    setError(undefined);
    const system = findArcadeSystem(selectedSystemId());
    if (!system || file.size === 0) return;
    const id = `local:${system.id}:${file.name}:${file.size}`;
    downloadAbortController?.abort();
    downloadAbortController = new AbortController();
    setDownloadName(file.name);
    setDownloadPercent(0);
    try {
      await saveRomBlob({
        blob: file,
        id,
        name: file.name,
        sizeBytes: file.size,
        systemId: system.id,
      });
      refreshSaved();
      setDownloadName(undefined);
      const romUrl = await getSavedRomUrl(id);
      if (!romUrl) throw new Error("The ROM could not be opened.");
      props.onPlay({name: file.name, romUrl, systemId: system.id});
    } catch (cause) {
      setDownloadName(undefined);
      setError(cause instanceof Error ? cause.message : "Import failed.");
    }
  };

  return (
    <div
      class="absolute inset-0 z-30 grid place-items-center bg-[#07100f]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Arcade ROM picker"
    >
      <div class="flex max-h-[92dvh] w-full max-w-3xl flex-col border border-white/12 bg-[#101716] shadow-[0_30px_100px_#000]">
        <header class="flex items-start gap-4 border-b border-white/8 px-5 py-4">
          <div class="min-w-0">
            <p class="text-[9px] font-bold tracking-[0.2em] text-[#d05b50] uppercase">
              Arcade cabinet
            </p>
            <h2 class="mt-1 font-serif text-xl text-[#eee8dc]">Pick a game</h2>
            <p class="mt-1 text-[10px] leading-4 text-[#8f9b96]">
              Freely redistributable homebrew, downloaded on demand and kept on
              this machine. Nothing ships inside the shop.
            </p>
          </div>
          <button
            class="ml-auto grid size-9 shrink-0 place-items-center text-[#87938e] transition hover:bg-white/5 hover:text-white"
            aria-label="Leave the arcade"
            type="button"
            onClick={props.onClose}
          >
            <FiX size={17} />
          </button>
        </header>

        <div class="grid min-h-0 flex-1 gap-0 sm:grid-cols-[10rem_1fr]">
          <nav
            class="flex gap-1 overflow-x-auto border-b border-white/8 p-2 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
            aria-label="Emulated systems"
          >
            <For each={ARCADE_SYSTEMS}>
              {(system) => (
                <button
                  classList={{
                    "flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-semibold transition": true,
                    "bg-white/8 text-[#f1eadc]":
                      selectedSystemId() === system.id,
                    "text-[#98a39e] hover:bg-white/4 hover:text-[#e5e0d5]":
                      selectedSystemId() !== system.id,
                  }}
                  type="button"
                  onClick={() => setSelectedSystemId(system.id)}
                >
                  <span class="truncate">{system.shortLabel}</span>
                </button>
              )}
            </For>
          </nav>

          <section class="flex min-h-0 flex-col">
            <div class="flex items-center gap-2 border-b border-white/8 px-4 py-3">
              <input
                class="h-9 w-full border border-white/12 bg-[#0a1110] px-3 text-sm text-[#f0ebdf] outline-none placeholder:text-[#4f5b57] focus:border-[#c7554b]"
                maxLength={64}
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder={`Search ${
                  findArcadeSystem(selectedSystemId())?.shortLabel ?? "system"
                }…`}
                value={query()}
              />
              <label class="flex h-9 shrink-0 cursor-pointer items-center gap-2 border border-white/12 px-3 text-[9px] font-bold tracking-[0.1em] text-[#98a39e] uppercase transition hover:bg-white/5 hover:text-white">
                <FiHardDrive size={13} />
                Own file
                <input
                  accept={findArcadeSystem(selectedSystemId())
                    ?.extensions.map((extension) => `.${extension}`)
                    .join(",")}
                  class="hidden"
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void playLocalFile(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div class="min-h-40 flex-1 overflow-y-auto p-2">
              <Show
                when={!listings.error}
                fallback={
                  <p
                    class="p-6 text-center text-xs text-[#dc7167]"
                    role="alert"
                  >
                    The catalog could not be reached. Check your connection and
                    reopen the picker.
                    <button
                      class="mt-3 block w-full border border-white/12 py-2 text-[9px] font-bold tracking-[0.14em] text-[#98a39e] uppercase transition hover:bg-white/5 hover:text-white"
                      type="button"
                      onClick={() => void refetch()}
                    >
                      Retry
                    </button>
                  </p>
                }
              >
                <Show
                  when={listings.loading}
                  fallback={
                    <div class="grid gap-1">
                      <For
                        each={visibleListings()}
                        fallback={
                          <p class="p-6 text-center text-xs text-[#8f9b96]">
                            No games match that search.
                          </p>
                        }
                      >
                        {(listing) => {
                          const saved = () => savedById().has(listing.id);
                          return (
                            <article class="group flex items-center gap-3 border border-transparent px-3 py-2 transition hover:border-white/10 hover:bg-white/4">
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm text-[#eee8dc]">
                                  {listing.name.replace(/\.[^.]+$/u, "")}
                                </p>
                                <p class="text-[9px] tracking-[0.08em] text-[#77857f] uppercase tabular-nums">
                                  {formatBytes(
                                    savedById().get(listing.id)?.sizeBytes ||
                                      listing.sizeBytes,
                                  )}
                                  {" · "}
                                  {listing.name.split(".").pop()?.toUpperCase()}
                                </p>
                              </div>
                              <Show when={saved()}>
                                <span class="border border-[#62b47c]/40 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.12em] text-[#62b47c] uppercase">
                                  Saved
                                </span>
                              </Show>
                              <Show
                                when={saved()}
                                fallback={
                                  <button
                                    class="flex h-8 items-center gap-1.5 bg-[#ece6d8] px-3 text-[9px] font-bold tracking-[0.08em] text-[#17201e] uppercase transition hover:bg-white disabled:opacity-40"
                                    disabled={downloadName() !== undefined}
                                    title="Download and play"
                                    type="button"
                                    onClick={() => void playListing(listing)}
                                  >
                                    <FiDownload size={12} />
                                    Play
                                  </button>
                                }
                              >
                                <button
                                  aria-label={`Remove ${listing.name}`}
                                  class="grid size-8 place-items-center text-[#77857f] transition hover:bg-[#a73b34]/10 hover:text-[#dc7167]"
                                  title="Remove from this machine"
                                  type="button"
                                  onClick={() => void removeListing(listing)}
                                >
                                  <FiTrash2 size={13} />
                                </button>
                                <button
                                  class="flex h-8 items-center gap-1.5 bg-[#ece6d8] px-3 text-[9px] font-bold tracking-[0.08em] text-[#17201e] uppercase transition hover:bg-white"
                                  title="Play from local library"
                                  type="button"
                                  onClick={() => void playListing(listing)}
                                >
                                  <FiPlay size={12} />
                                  Play
                                </button>
                              </Show>
                            </article>
                          );
                        }}
                      </For>
                    </div>
                  }
                >
                  <div class="space-y-2 p-6">
                    <span class="mx-auto block size-5 animate-spin rounded-full border-2 border-[#758b84] border-t-[#e55749]" />
                    <p class="text-center text-[9px] font-semibold tracking-[0.18em] text-[#7e918b] uppercase">
                      Reading the cartridge shelf…
                    </p>
                  </div>
                </Show>
              </Show>
            </div>

            <footer class="space-y-2 border-t border-white/8 px-4 py-3">
              <Show when={error()}>
                {(message) => (
                  <p class="text-xs leading-5 text-[#e47a70]" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
              <p class="text-[9px] leading-4 tracking-[0.06em] text-[#657a72] uppercase">
                Esc backs out of the arcade · Games run through EmulatorJS in a
                sandboxed frame · Sideloading your own ROMs is fine where you
                own them
              </p>
            </footer>
          </section>
        </div>
      </div>

      <Show when={downloadName()}>
        {(name) => (
          <div class="absolute bottom-6 left-1/2 z-10 w-[min(26rem,90vw)] -translate-x-1/2 border border-[#d9b96f]/35 bg-[#08100f]/92 p-3 shadow-lg backdrop-blur-sm">
            <div class="mb-1 flex items-center justify-between gap-2 text-[8px] font-bold tracking-[0.16em] text-[#d9cabd] uppercase">
              <span class="flex items-center gap-2">
                <FiLoader class="size-3 animate-spin text-[#d94c3f]" />
                Fetching {name()}
              </span>
              <span class="tabular-nums">{Math.round(downloadPercent())}%</span>
            </div>
            <div class="h-2 overflow-hidden bg-black/45">
              <div
                class="h-full bg-gradient-to-r from-[#b4483f] via-[#d9b96f] to-[#e9eee6] transition-[width] duration-150"
                style={{width: `${Math.round(downloadPercent())}%`}}
              />
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
