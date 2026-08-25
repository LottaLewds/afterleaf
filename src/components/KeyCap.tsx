import type {ParentComponent} from "solid-js";

import {cn} from "~/lib/cn";

/**
 * Single source of truth for keycap visuals: every rendered "physical key"
 * chip in interaction hints must go through here so styling cannot drift
 * between call sites. `class` accepts overrides via cn().
 */
export const KeyCap: ParentComponent<{class?: string}> = (props) => (
  <span
    class={cn(
      "inline-flex min-h-5 min-w-6 items-center justify-center rounded-[3px] border border-b-2 border-[#52605b] bg-gradient-to-b from-[#394742] to-[#18211f] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-[#f1eadc] uppercase shadow-[0_1px_2px_rgb(0_0_0_/_0.65),inset_0_1px_0_rgb(255_255_255_/_0.16)]",
      props.class,
    )}
  >
    {props.children}
  </span>
);

/** Splits an interaction row's keyboard hint into individual keycap labels. */
export const keycapParts = (key: string): readonly string[] =>
  key
    .split(/\s*(?:\/|\+)\s*/)
    .flatMap((part) =>
      part.startsWith("Hold ") ? ["Hold", part.slice("Hold ".length)] : [part],
    );

/** Label span matching the text style of interaction rows. */
export const InteractionLabel: ParentComponent<{class?: string}> = (props) => (
  <span class={cn("text-[11px] text-[#c4cec8]", props.class)}>
    {props.children}
  </span>
);
