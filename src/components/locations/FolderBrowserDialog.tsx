import {FiFolder} from "solid-icons/fi";
import {For, Show, type JSX} from "solid-js";
import type {LibraryDirectoryEntry} from "~/content/libraryUpdate/browserClient";
import type {FolderBrowser} from "~/components/locations/createFolderBrowser";

/**
 * The directory browser panel shared by every location-style control. The
 * caller decides what "choosing" means via `onChoose` and can slot extra
 * controls (such as a media-type picker) next to the confirm button.
 */
export const FolderBrowserDialog = (props: {
  browser: FolderBrowser;
  onChoose: (path: string) => void;
  /** Overrides the raw directory entries, e.g. with a ranked view. */
  entries?: () => readonly LibraryDirectoryEntry[];
  trailingControls?: JSX.Element;
}) => (
  <Show when={props.browser.browserOpen() && props.browser.listing()}>
    {(current) => (
      <div class="mt-4 border border-white/10 bg-[#0c1312] p-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="h-8 px-2 text-[10px] text-[#d9b9a9] disabled:opacity-30"
            disabled={!current().parent}
            onClick={() => void props.browser.openBrowser(current().parent)}
            type="button"
          >
            ← Up
          </button>
          <Show when={current().drives.length > 1}>
            <select
              aria-label="Drive"
              class="h-8 bg-[#1b2422] px-2 text-[10px] text-[#c5cec9] [color-scheme:dark]"
              value={current().drives.find((drive) => current().path.startsWith(drive.path))?.path}
              onChange={(event) => void props.browser.openBrowser(event.currentTarget.value)}
            >
              <For each={current().drives}>
                {(drive) => (
                  <option class="bg-[#1b2422] text-[#f0ecdf]" value={drive.path}>
                    {drive.name}
                  </option>
                )}
              </For>
            </select>
          </Show>
          <form
            class="h-8 min-w-48 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              props.browser.navigateToPath();
            }}
          >
            <input
              aria-label="Folder path"
              autocomplete="off"
              class="h-8 w-full border border-white/8 bg-[#151e1c] px-3 text-[10px] text-[#c5cec9] outline-none focus:border-[#d94c3f]/70"
              spellcheck={false}
              value={props.browser.pathInput()}
              onInput={(event) => {
                props.browser.setPathInput(event.currentTarget.value);
                props.browser.schedulePathNavigation();
              }}
            />
          </form>
          <Show when={props.trailingControls}>{props.trailingControls}</Show>
          <button
            class="h-8 bg-[#d94c3f] px-3 text-[9px] font-semibold text-white uppercase disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!props.browser.canChooseCurrentFolder()}
            onClick={() => props.onChoose(current().path)}
            type="button"
          >
            Choose this folder
          </button>
        </div>
        <div class="mt-3 max-h-56 overflow-y-auto border-t border-white/8 pt-2">
          <For each={props.entries ? props.entries() : current().entries}>
            {(entry) => (
              <button
                class="flex w-full items-center gap-2 px-2 py-2 text-left text-[10px] text-[#aeb8b3] hover:bg-white/5 hover:text-white"
                onClick={() => void props.browser.openBrowser(entry.path)}
                type="button"
              >
                <FiFolder class="shrink-0" size={12} />
                <span class="truncate">{entry.name}</span>
              </button>
            )}
          </For>
          <Show when={props.browser.browserPending()}>
            <p class="px-2 py-2 text-[9px] text-[#65716c]">Opening folder…</p>
          </Show>
        </div>
      </div>
    )}
  </Show>
);
