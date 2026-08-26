import {FiCheck, FiRefreshCw, FiX} from "solid-icons/fi";
import {Show} from "solid-js";

export const LibraryActivityToast = (props: {
  busy: boolean;
  completedSteps: number;
  elapsedSeconds: number;
  failed: boolean;
  notice?: string | undefined;
  status: string;
  subProgress?: {completed: number; total: number} | undefined;
  totalSteps: number;
  onDismiss: () => void;
}) => {
  // Fractional progress within the current step (when reported) keeps the
  // bar advancing during long single-step phases such as provider syncs.
  const progressPercent = () => {
    const subFraction = props.subProgress
      ? Math.min(
          1,
          Math.max(0, props.subProgress.completed / props.subProgress.total),
        )
      : 0;
    return Math.min(
      100,
      ((props.completedSteps + subFraction) / Math.max(1, props.totalSteps)) *
        100,
    );
  };
  return (
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
                  {Math.round(progressPercent())}% · {props.elapsedSeconds}s
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
              style={{width: `${Math.max(8, progressPercent())}%`}}
            />
          </div>
        </Show>
      </aside>
    </Show>
  );
};
