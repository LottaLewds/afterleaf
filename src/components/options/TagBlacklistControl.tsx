import {FiPlus, FiSearch, FiTag, FiTrash2, FiX} from "solid-icons/fi";
import {createMemo, createSignal, For, Show} from "solid-js";
import {normalizeTag, normalizeTagBlacklist} from "~/content/tagBlacklistPreference";

export const TagBlacklistControl = (props: {
  availableTags: readonly string[];
  blacklistedTags: readonly string[];
  onChange: (tags: readonly string[]) => void;
  onPurge: () => void;
  purgeDisabled: boolean;
  purgeWorkCount: number;
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
        return !blacklistedTagSet().has(normalizedTag) && (!search || normalizedTag.includes(search));
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
    props.onChange(props.blacklistedTags.filter((blacklistedTag) => blacklistedTag !== tag));

  return (
    <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:px-5">
      <div class="flex items-start gap-4">
        <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
          <FiTag size={15} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">Blacklisted tags</p>
          <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
            Skip matching publications during future downloads. Books already in your library stay catalogued until
            purged.
          </p>
        </div>
        <button
          class="flex shrink-0 items-center gap-2 border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-3 py-2 text-[9px] font-semibold tracking-[0.12em] text-[#df776e] uppercase transition hover:border-[#d94c3f]/60 hover:bg-[#d94c3f]/20 hover:text-[#f3a098] disabled:cursor-not-allowed disabled:opacity-35"
          disabled={props.purgeDisabled}
          title={
            props.purgeWorkCount === 0
              ? "No catalogued works match the blacklisted tags"
              : `Purge ${props.purgeWorkCount} matching ${props.purgeWorkCount === 1 ? "work" : "works"}`
          }
          type="button"
          onClick={() => props.onPurge()}
        >
          <FiTrash2 size={12} /> Purge
        </button>
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
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setOpen(false);
        }}
      >
        <div class="flex min-h-11 items-center gap-2 border border-white/10 bg-[#0c1312] px-3 focus-within:border-[#d55247]/70">
          <FiSearch size={13} color="#65716c" style={{"flex-shrink": "0"}} />
          <input
            ref={(element) => {
              input = element;
            }}
            class="min-w-0 flex-1 bg-transparent py-3 text-xs text-[#eee8dc] outline-none placeholder:text-[#53605b]"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="tag-blacklist-options"
            aria-expanded={open() ? "true" : "false"}
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
                  <span class="text-[8px] tracking-[0.1em] text-[#59645f] uppercase">Library tag</span>
                </button>
              )}
            </For>
            <Show
              when={
                canAddCustomTag() && !suggestions().some((suggestion) => normalizeTag(suggestion) === normalizedQuery())
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
