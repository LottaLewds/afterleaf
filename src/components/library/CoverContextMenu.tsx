import {FiPlus, FiStar, FiTrash2} from "solid-icons/fi";
import {For, Show, createSignal, onCleanup, type Accessor} from "solid-js";
import type {CatalogItem} from "~/catalog";
import type {LibraryCollection} from "~/content/libraryUpdate/httpProtocol";

export type CoverContextMenuProps = {
  anchor: {x: number; y: number};
  collections: Accessor<readonly LibraryCollection[]>;
  item: CatalogItem;
  selectedCollectionId: Accessor<string | null>;
  selectedIds: Accessor<ReadonlySet<string>>;
  onAddToCollection: (publicationIds: readonly string[], collectionId: string) => void;
  onClose: () => void;
  onHighlight: (publicationIds: readonly string[]) => void;
  onNewCollection: (item: CatalogItem, publicationIds: readonly string[]) => void;
  onRemoveFromCollection?: (publicationIds: readonly string[], collectionId: string) => void;
};

export const CoverContextMenu = (props: CoverContextMenuProps) => {
  const [showAddSubmenu, setShowAddSubmenu] = createSignal(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
  };

  const abortController = new AbortController();
  document.addEventListener("keydown", handleKeyDown, {capture: true, signal: abortController.signal});
  document.addEventListener("contextmenu", handleContextMenu, {capture: true, signal: abortController.signal});
  onCleanup(() => abortController.abort());

  const targetIds = () => (props.selectedIds().has(props.item.id) ? [...props.selectedIds()] : [props.item.id]);

  const targetCount = () => targetIds().length;

  const selectedCollection = () =>
    props.collections().find((collection) => collection.id === props.selectedCollectionId());

  const allInCollection = (collection: LibraryCollection) =>
    targetIds().every((publicationId) => collection.publicationIds.includes(publicationId));

  const adjustedAnchor = () => {
    const menuWidth = 220;
    const menuHeight = 260;
    const x = Math.min(props.anchor.x, window.innerWidth - menuWidth - 8);
    const y = Math.min(props.anchor.y, window.innerHeight - menuHeight - 8);
    return {x, y};
  };

  return (
    <>
      <div
        class="fixed inset-0 z-40"
        onClick={(event) => {
          event.preventDefault();
          props.onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }}
      />
      <div
        ref={(element) => element?.focus()}
        class="fixed z-50 w-52 border border-white/10 bg-[#101716]/98 py-1.5 shadow-[0_16px_50px_#000] backdrop-blur-md outline-none"
        style={{
          left: `${adjustedAnchor().x}px`,
          top: `${adjustedAnchor().y}px`,
        }}
        role="menu"
        tabindex={0}
        onPointerDown={(event) => event.stopPropagation()}
        onFocusOut={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) props.onClose();
        }}
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#d9d6cc] transition hover:bg-white/5"
          onClick={() => {
            props.onNewCollection(props.item, targetIds());
            props.onClose();
          }}
          role="menuitem"
          type="button"
        >
          <FiPlus size={13} /> New collection
        </button>

        <Show when={selectedCollection()}>
          {(collection) => (
            <>
              <div class="my-1 h-px bg-white/8" />
              <button
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#d9d6cc] transition hover:bg-white/5"
                onClick={() => {
                  if (allInCollection(collection())) {
                    props.onRemoveFromCollection?.(targetIds(), collection().id);
                  } else {
                    props.onAddToCollection(targetIds(), collection().id);
                  }
                  props.onClose();
                }}
                role="menuitem"
                type="button"
              >
                {allInCollection(collection()) ? (
                  <>
                    <FiTrash2 size={13} /> Remove from &quot;{collection().name}&quot;
                  </>
                ) : (
                  <>
                    <FiPlus size={13} /> Add to &quot;{collection().name}&quot;
                  </>
                )}
              </button>
            </>
          )}
        </Show>

        <div class="my-1 h-px bg-white/8" />

        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#d9d6cc] transition hover:bg-white/5"
          onClick={() => setShowAddSubmenu((current) => !current)}
          aria-expanded={showAddSubmenu() ? "true" : "false"}
          role="menuitem"
          type="button"
        >
          <FiPlus size={13} /> Add to collection
        </button>

        <Show when={showAddSubmenu()}>
          <div class="max-h-32 overflow-y-auto border-y border-white/8 bg-[#0a1110]/50 py-1">
            <For
              each={props.collections().filter((collection) => collection.id !== props.selectedCollectionId())}
              fallback={<p class="px-3 py-2 text-[10px] text-[#5f6a66] italic">No other collections</p>}
            >
              {(collection) => (
                <button
                  class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-[#aab2ae] transition hover:bg-white/5 hover:text-white"
                  onClick={() => {
                    props.onAddToCollection(targetIds(), collection.id);
                    props.onClose();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span class="size-1.5 rounded-full" style={{"background-color": collection.color ?? "#d94c3f"}} />
                  {collection.name}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="my-1 h-px bg-white/8" />

        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#f5c542] transition hover:bg-white/5"
          onClick={() => {
            props.onHighlight(targetIds());
            props.onClose();
          }}
          role="menuitem"
          type="button"
        >
          <FiStar size={13} /> Highlight {targetCount()} book{targetCount() === 1 ? "" : "s"} in shop
        </button>
      </div>
    </>
  );
};
