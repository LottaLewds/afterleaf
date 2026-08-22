import {FiHardDrive, FiPlay, FiTrash2, FiX} from "solid-icons/fi";
import {For, Show, createResource, createSignal} from "solid-js";

import {arcadeFolderRomUrl, listArcadeFolderRoms} from "~/arcade/romFolders";
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

const stripExtension = (fileName: string) => fileName.replace(/\.[^.]+$/u, "");

const extensionOf = (fileName: string) =>
  fileName.split(".").pop()?.toUpperCase() ?? "";

type ArcadeRomRow = {
  key: string;
  kind: "folder" | "sideloaded";
  name: string;
  sizeBytes: number;
  /** Folder ROMs stream straight from disk; sideloaded ones carry their library id. */
  savedId?: string;
};

export type ArcadeBrowserProps = {
  onClose: () => void;
  onPlay: (request: ShopArcadePlayRequest) => void;
};

/**
 * In-world ROM picker for the arcade cabinet. Lists games from the folder
 * configured for each emulated system in the Options menu and streams them
 * into the emulator straight from disk. Also accepts sideloaded ROM files,
 * which are kept in this machine's local library.
 */
export const ArcadeBrowser = (props: ArcadeBrowserProps) => {
  const defaultSystem = ARCADE_SYSTEMS[0]!;
  const [selectedSystemId, setSelectedSystemId] = createSignal(
    defaultSystem.id,
  );
  const [query, setQuery] = createSignal("");
  const [savedRoms, setSavedRoms] = createSignal<ArcadeRomSummary[]>([]);
  const [error, setError] = createSignal<string>();

  void listSavedRoms()
    .then(setSavedRoms)
    .catch(() => {});

  const [folder, {refetch}] = createResource(selectedSystemId, (systemId) =>
    listArcadeFolderRoms(systemId),
  );

  const readyFolder = () => {
    const current = folder();
    return current?.state === "ready" ? current : undefined;
  };

  const matchesQuery = (...names: readonly string[]) => {
    const needle = query().trim().toLowerCase();
    if (!needle) return true;
    return names.some((name) => name.toLowerCase().includes(needle));
  };

  const refreshSaved = () => {
    void listSavedRoms()
      .then(setSavedRoms)
      .catch(() => {});
  };

  const visibleRows = (): ArcadeRomRow[] => [
    ...(readyFolder()?.roms ?? [])
      .filter((rom) => matchesQuery(stripExtension(rom.name), rom.name))
      .map((rom) => ({
        key: `folder:${rom.name}`,
        kind: "folder" as const,
        name: rom.name,
        sizeBytes: rom.sizeBytes,
      })),
    ...savedRoms()
      .filter(
        (rom) =>
          rom.systemId === selectedSystemId() &&
          matchesQuery(stripExtension(rom.name), rom.name),
      )
      .map((rom) => ({
        key: rom.id,
        kind: "sideloaded" as const,
        name: rom.name,
        sizeBytes: rom.sizeBytes,
        savedId: rom.id,
      })),
  ];

  const playRow = async (row: ArcadeRomRow) => {
    setError(undefined);
    if (!row.savedId) {
      props.onPlay({
        name: row.name,
        romUrl: arcadeFolderRomUrl(selectedSystemId(), row.name),
        systemId: selectedSystemId(),
      });
      return;
    }
    try {
      const romUrl = await getSavedRomUrl(row.savedId);
      if (!romUrl) throw new Error("The saved ROM could not be opened.");
      props.onPlay({name: row.name, romUrl, systemId: selectedSystemId()});
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The ROM could not be opened.",
      );
    }
  };

  const removeRow = async (row: ArcadeRomRow) => {
    if (!row.savedId) return;
    setError(undefined);
    try {
      await deleteSavedRom(row.savedId);
    } finally {
      refreshSaved();
    }
  };

  const playLocalFile = async (file: File) => {
    setError(undefined);
    const system = findArcadeSystem(selectedSystemId());
    if (!system || file.size === 0) return;
    const id = `local:${system.id}:${file.name}:${file.size}`;
    try {
      await saveRomBlob({
        blob: file,
        id,
        name: file.name,
        sizeBytes: file.size,
        systemId: system.id,
      });
      refreshSaved();
      const romUrl = await getSavedRomUrl(id);
      if (!romUrl) throw new Error("The ROM could not be opened.");
      props.onPlay({name: file.name, romUrl, systemId: system.id});
    } catch (cause) {
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
              Games stream from your own cartridge folders, one per system in
              Options. Nothing ships inside the shop.
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
                when={!folder.error}
                fallback={
                  <p
                    class="p-6 text-center text-xs leading-5 text-[#dc7167]"
                    role="alert"
                  >
                    The ROM folder could not be read. Check that Afterleaf's
                    server is still running, then retry.
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
                  when={!folder.loading}
                  fallback={
                    <div class="space-y-2 p-6">
                      <span class="mx-auto block size-5 animate-spin rounded-full border-2 border-[#758b84] border-t-[#e55749]" />
                      <p class="text-center text-[9px] font-semibold tracking-[0.18em] text-[#7e918b] uppercase">
                        Reading the cartridge shelf…
                      </p>
                    </div>
                  }
                >
                  <Show
                    when={readyFolder()}
                    fallback={
                      <p class="p-6 text-center text-xs leading-5 text-[#8f9b96]">
                        No ROM folder is set for{" "}
                        {findArcadeSystem(selectedSystemId())?.label ??
                          "this system"}{" "}
                        yet. Configure one in the Options menu under ROM
                        folders, then reopen this picker.
                      </p>
                    }
                  >
                    <div class="grid gap-1">
                      <For
                        each={visibleRows()}
                        fallback={
                          <p class="p-6 text-center text-xs text-[#8f9b96]">
                            {query().trim()
                              ? "No games match that search."
                              : "This folder has no supported game files yet."}
                          </p>
                        }
                      >
                        {(row) => (
                          <article class="group flex items-center gap-3 border border-transparent px-3 py-2 transition hover:border-white/10 hover:bg-white/4">
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-sm text-[#eee8dc]">
                                {stripExtension(row.name)}
                              </p>
                              <p class="text-[9px] tracking-[0.08em] text-[#77857f] uppercase tabular-nums">
                                {formatBytes(row.sizeBytes)}
                                {" · "}
                                {extensionOf(row.name)}
                                <Show when={row.savedId}>
                                  {" · sideloaded"}
                                </Show>
                              </p>
                            </div>
                            <Show when={row.savedId}>
                              <button
                                aria-label={`Remove ${row.name}`}
                                class="grid size-8 place-items-center text-[#77857f] transition hover:bg-[#a73b34]/10 hover:text-[#dc7167]"
                                title="Remove from this machine"
                                type="button"
                                onClick={() => void removeRow(row)}
                              >
                                <FiTrash2 size={13} />
                              </button>
                            </Show>
                            <button
                              class="flex h-8 items-center gap-1.5 bg-[#ece6d8] px-3 text-[9px] font-bold tracking-[0.08em] text-[#17201e] uppercase transition hover:bg-white"
                              title={
                                row.savedId
                                  ? "Play from this machine's library"
                                  : "Stream from your ROM folder"
                              }
                              type="button"
                              onClick={() => void playRow(row)}
                            >
                              <FiPlay size={12} />
                              Play
                            </button>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
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
    </div>
  );
};
