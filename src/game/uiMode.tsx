import {
  createComponent,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js";

import type {ArcadeSessionStatus} from "~/game/ShopArcadeCabinet";

/**
 * Exclusive owner of global keyboard and pointer input. Exactly one mode is
 * active at a time; every window/canvas listener either belongs to the active
 * mode or must not act. Derived from the owning layers' own state instead of
 * duplicated flags, so it can also drive UI such as the interactions popper.
 */
export type UiMode =
  | /** World still loading; nothing owns input yet. */ "boot"
  | /** Free roam; click-to-pointer-lock applies. */ "walk"
  | /** In-scene spread reader. */ "book"
  | /** Viewport DOM dialogs (sign/channel editors). */ "dialog"
  | /** ROM picker owns the screen. */ "arcade-pick"
  | /** Emulator downloading/launching/playing owns the keys. */ "arcade-live"
  | /** Pause menu overlays the world. */ "menu"
  | /** Fatal overlay; input is inert. */ "error";

/** ShopViewport-reported half of the mode inputs; the pause menu comes separately. */
export type ViewportModeReport = {
  arcadeStatus: ArcadeSessionStatus | undefined;
  dialogOpen: boolean;
  error: boolean;
  inspectionSpread: boolean;
  ready: boolean;
};

const initialViewportModeReport: ViewportModeReport = {
  arcadeStatus: undefined,
  dialogOpen: false,
  error: false,
  inspectionSpread: false,
  ready: false,
};

/**
 * Resolves the exclusive input owner from the reporting layers' state.
 * Arcade outranks DOM dialogs because a session can outlive one opening an
 * editor is impossible, while a stale dialog report must never beat a live
 * emulator; boot/error short-circuit everything.
 */
export const deriveUiMode = (viewport: ViewportModeReport, menuOpen: boolean): UiMode => {
  if (viewport.error) return "error";
  if (!viewport.ready) return "boot";
  if (viewport.arcadeStatus === "browsing") return "arcade-pick";
  if (viewport.arcadeStatus) return "arcade-live";
  if (viewport.dialogOpen) return "dialog";
  if (viewport.inspectionSpread) return "book";
  if (menuOpen) return "menu";
  return "walk";
};

/**
 * Modes whose Escape may fall through the modal stack to the pause-menu
 * toggle. Exclusive surfaces (arcade, dialogs) unbind it entirely, so a late
 * or repeated Esc press can never leak into a menu invocation.
 */
export const ESCAPE_FALLBACK_MODES: ReadonlySet<UiMode> = new Set(["walk", "menu", "book"]);

/**
 * Modes whose surfaces may present interaction rows (the Interact popper):
 * free-roam targeting rows and live emulator control hints. Shared by the
 * scene's emitter and the viewport's renderer so both sides of the popper
 * agree by construction.
 */
export const INTERACTION_ROW_MODES: ReadonlySet<UiMode> = new Set([
  "walk",
  /** The spread reader owns input too; its page/return hints are rows. */
  "book",
  "arcade-live",
]);

type UiModeContextValue = {
  /** Currently active exclusive mode; the single source of truth. */
  readonly mode: Accessor<UiMode>;
  /** Whether the app-level Escape fallback (pause menu toggle) may act. */
  readonly escapeFallbackArmed: Accessor<boolean>;
  /** Pushes ShopViewport's slice of the mode inputs. */
  readonly reportViewport: (report: ViewportModeReport) => void;
};

const UiModeContext = createContext<UiModeContextValue>();

/**
 * Reactive root for input ownership. Owns the derived mode memo; layers
 * publish their slice (App the pause menu, ShopViewport the rest) and read
 * `mode` to gate shortcuts, overlays, and pointer-lock intent.
 */
export const UiModeProvider: ParentComponent<{
  paused?: Accessor<boolean>;
}> = (props) => {
  const [viewport, setViewport] = createSignal(initialViewportModeReport);
  const mode = createMemo(() => deriveUiMode(viewport(), props.paused?.() === true));
  const value: UiModeContextValue = {
    mode,
    escapeFallbackArmed: () => ESCAPE_FALLBACK_MODES.has(mode()),
    reportViewport: setViewport,
  };
  return createComponent(UiModeContext, {
    value,
    get children() {
      return props.children;
    },
  });
};

export const useUiMode = (): UiModeContextValue => {
  return useContext(UiModeContext);
};

/**
 * Runs `bind(signal)` exactly while `active()` is true, aborting the moment
 * the mode deactivates or the owner disposes. Each activation gets a fresh
 * AbortController, so a listener can never survive into a mode it does not
 * belong to.
 */
export const createModeListener = (active: Accessor<unknown>, bind: (signal: AbortSignal) => void) => {
  createEffect(
    () => Boolean(active()),
    (isActive) => {
      // The initial false run no-ops, mirroring createEscapeScope.
      if (!isActive) return;
      const abortController = new AbortController();
      bind(abortController.signal);
      return () => abortController.abort();
    },
  );
};
