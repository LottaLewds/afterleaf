import {FiCrosshair, FiEdit3, FiTrash2} from "solid-icons/fi";
import {onCleanup} from "solid-js";
import type {LibraryCollection} from "~/content/libraryUpdate/httpProtocol";

export const CollectionContextMenu = (props: {
  anchor: {x: number; y: number};
  collection: LibraryCollection;
  onClose: () => void;
  onDelete: () => void;
  onHighlight: () => void;
  onRename: () => void;
}) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" && event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
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

  const adjustedAnchor = () => {
    const menuWidth = 192;
    const menuHeight = 136;
    const x = Math.max(8, Math.min(props.anchor.x, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(props.anchor.y, window.innerHeight - menuHeight - 8));
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
        ref={(element) => queueMicrotask(() => element?.focus())}
        class="fixed z-50 w-48 border border-white/10 bg-[#101716]/98 py-1.5 shadow-[0_16px_50px_#000] backdrop-blur-md outline-none"
        style={{
          left: `${adjustedAnchor().x}px`,
          top: `${adjustedAnchor().y}px`,
        }}
        role="menu"
        tabindex={0}
        aria-label={`${props.collection.name} actions`}
        onPointerDown={(event) => event.stopPropagation()}
        onFocusOut={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) props.onClose();
        }}
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#f5c542] transition hover:bg-white/5"
          onClick={() => {
            props.onHighlight();
            props.onClose();
          }}
          role="menuitem"
          type="button"
        >
          <FiCrosshair size={13} /> Highlight in shop
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#d9d6cc] transition hover:bg-white/5"
          onClick={() => {
            props.onRename();
            props.onClose();
          }}
          role="menuitem"
          type="button"
        >
          <FiEdit3 size={13} /> Rename
        </button>
        <div class="my-1 h-px bg-white/8" />
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#d94c3f] transition hover:bg-white/5"
          onClick={() => {
            props.onDelete();
            props.onClose();
          }}
          role="menuitem"
          type="button"
        >
          <FiTrash2 size={13} /> Delete
        </button>
      </div>
    </>
  );
};
