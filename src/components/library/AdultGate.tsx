import {FiChevronRight, FiLock, FiShield} from "solid-icons/fi";

export const AdultGate = (props: {onEnter: () => void}) => (
  <div class="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#111716] p-5 text-[#eee8d9]">
    <div class="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_50%_15%,#819895_0,transparent_30%),linear-gradient(115deg,transparent_0_49%,#ffffff08_50%,transparent_51%)]" />
    <div class="gate-card relative w-full max-w-[460px] border border-white/12 bg-[#18201f]/95 px-7 py-8 shadow-2xl sm:px-10 sm:py-10">
      <div class="mb-10 flex items-start justify-between">
        <div>
          <p class="font-serif text-3xl tracking-[-0.04em]">Afterleaf</p>
          <p class="mt-1 text-[10px] font-semibold tracking-[0.25em] text-[#b8aaa0] uppercase">
            After-hours library
          </p>
        </div>
        <span class="grid size-11 place-items-center rounded-full border border-[#cf4a3c]/45 bg-[#cf4a3c]/10 text-sm font-semibold text-[#ef796b]">
          18+
        </span>
      </div>

      <p class="font-serif text-[2rem] leading-[1.08] tracking-[-0.035em] text-[#f5f0e5]">
        The shop is closed.
        <br />
        Your library awaits.
      </p>
      <p class="mt-5 max-w-sm text-sm leading-6 text-[#aeb9b4]">
        This library contains adult-only publications. Confirm that you are of
        legal age in your region to continue.
      </p>

      <button
        class="mt-9 flex w-full items-center justify-between bg-[#d94c3f] px-5 py-4 text-left text-sm font-bold text-white shadow-[0_10px_35px_#d94c3f33] transition hover:bg-[#e45a4d]"
        onClick={() => props.onEnter?.()}
      >
        <span class="flex items-center gap-3">
          <FiLock size={16} /> I’m 18 or older
        </span>
        <FiChevronRight size={18} />
      </button>
      <p class="mt-5 flex items-center gap-2 text-[11px] leading-4 text-[#75827d]">
        <FiShield size={14} /> Age confirmation stays in this browser session.
      </p>
    </div>
  </div>
);
