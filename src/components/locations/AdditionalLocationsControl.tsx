import {FiSettings, FiX} from "solid-icons/fi";
import {createMemo, createSignal, For, Show} from "solid-js";
import {ARCADE_SYSTEMS, findArcadeSystem} from "~/arcade/systems";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";
import {createFolderBrowser} from "~/components/locations/createFolderBrowser";
import {FolderBrowserDialog} from "~/components/locations/FolderBrowserDialog";
import {
  bookLocationKeys,
  isBookLocationKind,
  romSystemOfKind,
  withRomFolders,
  type AdditionalLocationKind,
  type ArrayLocationKind,
} from "~/components/locations/locationKinds";

export const AdditionalLocationsControl = (props: {
  config: AfterleafLibraryConfig;
  onChange: (config: AfterleafLibraryConfig) => void;
  onReenroll: (path: string) => Promise<void>;
  reenrollableBookPaths: ReadonlySet<string>;
}) => {
  const [kind, setKind] = createSignal<AdditionalLocationKind>("comicPaths");
  const [reenrollingPath, setReenrollingPath] = createSignal("");
  const browser = createFolderBrowser();
  const arrayLabels: Record<ArrayLocationKind, string> = {
    artFramePaths: "Art frames",
    comicPaths: "Comics",
    mangaPaths: "Manga",
    mediaPaths: "Books (legacy)",
    posterPaths: "Posters",
    tvChannelPaths: "TV",
  };
  const labelFor = (key: AdditionalLocationKind): string => {
    if (isBookLocationKind(key)) return arrayLabels[key];
    const system = key.slice(4);
    return findArcadeSystem(system)?.label ?? system;
  };
  const locationKeys: readonly AdditionalLocationKind[] = [
    ...(Object.keys(arrayLabels) as ArrayLocationKind[]),
    ...ARCADE_SYSTEMS.map((system): AdditionalLocationKind => `rom:${system.id}`),
  ];
  const selectableLocationKeys = locationKeys.filter((key) => key !== "mediaPaths");
  const locationsFor = (key: AdditionalLocationKind): readonly string[] => {
    if (isBookLocationKind(key)) return props.config[key] ?? [];
    const system = romSystemOfKind(key);
    if (!system) return [];
    return props.config.romPaths?.[system] ?? [];
  };
  const withBookLocation = (config: AfterleafLibraryConfig, key: ArrayLocationKind, path: string) => {
    if (!bookLocationKeys.includes(key as (typeof bookLocationKeys)[number])) return config;
    const nextConfig = {...config};
    for (const bookKey of bookLocationKeys)
      if (bookKey !== key) nextConfig[bookKey] = (config[bookKey] ?? []).filter((entry) => entry !== path);
    return nextConfig;
  };
  const matchingEntries = createMemo(() => {
    const current = browser.listing();
    if (!current) return [];
    const input = browser.pathInput().trim();
    if (input === current.path || /[\\/]$/u.test(input)) return current.entries;
    const separatorIndex = Math.max(input.lastIndexOf("/"), input.lastIndexOf("\\"));
    const fragment = input.slice(separatorIndex + 1).toLocaleLowerCase();
    if (!fragment) return current.entries;
    const rank = (entry: (typeof current.entries)[number]) => {
      const name = entry.name.toLocaleLowerCase();
      if (name.startsWith(fragment)) return 0;
      if (name.includes(fragment)) return 1;
      return 2;
    };
    return current.entries.toSorted((left, right) => rank(left) - rank(right));
  });
  const moveLocation = (from: AdditionalLocationKind, path: string, to: AdditionalLocationKind) => {
    if (from === to) return;
    let nextConfig = props.config;
    if (isBookLocationKind(from)) {
      // Detach the path from its current slot first.
      const detached = {...props.config};
      detached[from] = locationsFor(from).filter((entry) => entry !== path);
      nextConfig = detached;
    } else {
      const fromSystem = romSystemOfKind(from);
      if (!fromSystem) return;
      nextConfig = withRomFolders(
        props.config,
        fromSystem,
        locationsFor(from).filter((entry) => entry !== path),
      );
    }
    const toSystem = romSystemOfKind(to);
    if (toSystem) {
      const targetFolders = locationsFor(to);
      nextConfig = withRomFolders(nextConfig, toSystem, [...targetFolders.filter((entry) => entry !== path), path]);
    } else if (isBookLocationKind(to)) {
      const targetLocations = locationsFor(to);
      const merged = withBookLocation(nextConfig, to, path);
      merged[to] = targetLocations.includes(path) ? targetLocations : [...targetLocations, path];
      nextConfig = merged;
    }
    props.onChange(nextConfig);
  };
  const choose = (path: string) => {
    const key = kind();
    const system = romSystemOfKind(key);
    if (system) {
      const folders = locationsFor(key);
      if (!folders.includes(path)) props.onChange(withRomFolders(props.config, system, [...folders, path]));
      browser.close();
      return;
    }
    if (!isBookLocationKind(key)) return;
    const locations = locationsFor(key);
    if (!locations.includes(path)) {
      const merged = withBookLocation(props.config, key, path);
      merged[key] = [...locations, path];
      props.onChange(merged);
    }
    browser.close();
  };
  const remove = (key: AdditionalLocationKind, path: string) => {
    const system = romSystemOfKind(key);
    if (system) {
      props.onChange(
        withRomFolders(
          props.config,
          system,
          locationsFor(key).filter((entry) => entry !== path),
        ),
      );
      return;
    }
    if (!isBookLocationKind(key)) return;
    const next = {...props.config};
    next[key] = locationsFor(key).filter((entry) => entry !== path);
    props.onChange(next);
  };
  const reenroll = async (path: string) => {
    if (
      !window.confirm(
        "Re-enroll this book root only if it is the intended mounted library. Re-enrolling an empty unmounted mountpoint can make missing books count as deletions.",
      )
    )
      return;
    browser.setBrowserError("");
    setReenrollingPath(path);
    try {
      await props.onReenroll(path);
    } catch (error) {
      browser.setBrowserError(error instanceof Error ? error.message : "Could not re-enroll that library root");
    } finally {
      setReenrollingPath("");
    }
  };
  return (
    <div class="border border-white/8 bg-[#151e1c] px-4 py-4 sm:px-5">
      <div class="flex flex-wrap items-start gap-4">
        <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
          <FiSettings size={15} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">
            Additional content locations
          </p>
          <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
            Book locations apply on the next Scan new. TV, poster, art frame, and ROM folder locations apply
            immediately.
          </p>
        </div>
        <button
          class="bg-[#ece6d8] px-3 py-2 text-[9px] font-semibold text-[#1b2321] uppercase"
          type="button"
          onClick={() => void browser.openBrowser()}
        >
          Browse folders
        </button>
      </div>
      <div class="mt-4 space-y-2">
        <For each={locationKeys}>
          {(key) => (
            <For each={locationsFor(key)}>
              {(location) => (
                <div class="flex items-center gap-3 bg-[#0c1312] px-3 py-2">
                  <select
                    aria-label={`Media type for ${location}`}
                    class="h-8 shrink-0 border border-white/8 bg-[#1b2422] px-2 text-[9px] text-[#c5cec9] [color-scheme:dark]"
                    onChange={(event) =>
                      moveLocation(key, location, event.currentTarget.value as AdditionalLocationKind)
                    }
                  >
                    <For each={key === "mediaPaths" ? locationKeys : selectableLocationKeys}>
                      {(locationKind) => (
                        <option
                          class="bg-[#1b2422] text-[#f0ecdf]"
                          selected={locationKind === key}
                          value={locationKind}
                        >
                          {labelFor(locationKind)}
                        </option>
                      )}
                    </For>
                  </select>
                  <span class="min-w-0 flex-1 truncate text-[10px] text-[#aeb8b3]" title={location}>
                    {location}
                  </span>
                  <Show when={bookLocationKeys.includes(key as (typeof bookLocationKeys)[number])}>
                    <button
                      class="shrink-0 text-[9px] text-[#b9a28f] transition hover:text-white disabled:cursor-wait disabled:opacity-40"
                      disabled={reenrollingPath() === location || !props.reenrollableBookPaths.has(location)}
                      title={
                        props.reenrollableBookPaths.has(location)
                          ? "Replace this root's missing or mismatched Afterleaf mount marker"
                          : "Re-enrollment is available only when an unavailable root contains supported books"
                      }
                      type="button"
                      onClick={() => void reenroll(location)}
                    >
                      {reenrollingPath() === location ? "Enrolling…" : "Re-enroll"}
                    </button>
                  </Show>
                  <button
                    class="text-[#df776e]"
                    type="button"
                    aria-label={`Remove ${location}`}
                    onClick={() => remove(key, location)}
                  >
                    <FiX size={13} />
                  </button>
                </div>
              )}
            </For>
          )}
        </For>
      </div>
      <Show when={browser.browserError()}>
        <p class="mt-3 text-[10px] text-[#df776e]">{browser.browserError()}</p>
      </Show>
      <FolderBrowserDialog
        browser={browser}
        entries={matchingEntries}
        onChoose={choose}
        trailingControls={
          <select
            aria-label="Media type"
            class="h-8 border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-3 text-[9px] font-semibold text-[#e4a098] uppercase [color-scheme:dark] outline-none"
            onChange={(event) => setKind(event.currentTarget.value as AdditionalLocationKind)}
          >
            <For each={selectableLocationKeys}>
              {(key) => (
                <option class="bg-[#1b2422] text-[#f0ecdf]" selected={key === kind()} value={key}>
                  {labelFor(key)}
                </option>
              )}
            </For>
          </select>
        }
      />
    </div>
  );
};
