import {For, type Accessor} from "solid-js";

import type {
  ArcadeConsoleControl,
  ControlDiagramPlacement,
} from "~/arcade/controllerMappings";

/**
 * Static diagram of an emulated console's controller.
 *
 * Purely presentational: each console control carries its own placement, so
 * adding a system's layout is data-only. Shapes bound to a gamepad button
 * render with the accent outline so users can see coverage at a glance.
 */

const ACCENT = "#d94c3f";
const STROKE_MUTED = "#39443f";
const FILL_DARK = "#1d2725";
const LABEL = "#b8c1bc";
const BODY_FILL = "#121918";
const BODY_STROKE = "#2a3531";

/** Deduplicated drawable element: directional groups collapse to one anchor. */
type DiagramElement = {
  key: string;
  controlIds: number[];
  placement: ControlDiagramPlacement;
  shortLabel: string;
};

const buildElements = (
  controls: readonly ArcadeConsoleControl[],
): DiagramElement[] => {
  const elements: DiagramElement[] = [];
  const byKey = new Map<string, DiagramElement>();
  for (const control of controls) {
    const placement = control.diagram;
    if (!placement) continue;
    const key =
      placement.shape === "dpad" || placement.shape === "stick"
        ? `${placement.shape}:${placement.x}:${placement.y}`
        : `control:${control.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.controlIds.push(control.id);
      continue;
    }
    const element: DiagramElement = {
      key,
      controlIds: [control.id],
      placement,
      shortLabel: control.shortLabel ?? control.label,
    };
    byKey.set(key, element);
    elements.push(element);
  }
  return elements;
};

const DiagramShape = (props: {element: DiagramElement; mapped: boolean}) => {
  const {placement} = props.element;
  const stroke = () => (props.mapped ? ACCENT : STROKE_MUTED);
  const outlineWidth = () => (props.mapped ? "2" : "1.5");
  // Element data is static per instance, so shape selection happens once;
  // the mapped flag flows through reactive attribute expressions.
  switch (placement.shape) {
    case "dpad":
      return (
        <g stroke={stroke()} fill={FILL_DARK}>
          <rect
            x={placement.x - 21}
            y={placement.y - 7}
            width="42"
            height="14"
            rx="4"
          />
          <rect
            x={placement.x - 7}
            y={placement.y - 21}
            width="14"
            height="42"
            rx="4"
          />
        </g>
      );
    case "stick":
      return (
        <g stroke={stroke()}>
          <circle
            cx={placement.x}
            cy={placement.y}
            r="18"
            fill={BODY_FILL}
            stroke-width={outlineWidth()}
          />
          <circle cx={placement.x} cy={placement.y} r="10" fill={FILL_DARK} />
        </g>
      );
    case "face": {
      const radius = placement.r ?? 12;
      return (
        <g stroke={stroke()}>
          <circle
            cx={placement.x}
            cy={placement.y}
            r={radius}
            fill={FILL_DARK}
            stroke-width={outlineWidth()}
          />
          {props.element.shortLabel.length > 0 && (
            <text
              x={placement.x}
              y={placement.y}
              fill={LABEL}
              font-size={String(radius > 13 ? 11 : 9)}
              font-weight="700"
              text-anchor="middle"
              dominant-baseline="central"
              stroke="none"
            >
              {props.element.shortLabel}
            </text>
          )}
        </g>
      );
    }
    case "pill":
      return (
        <g stroke={stroke()}>
          <rect
            x={placement.x - placement.w / 2}
            y={placement.y - 8}
            width={placement.w}
            height="16"
            rx="8"
            fill={FILL_DARK}
            stroke-width={outlineWidth()}
          />
          <text
            x={placement.x}
            y={placement.y}
            fill={LABEL}
            font-size="7.5"
            font-weight="700"
            letter-spacing="0.08em"
            text-anchor="middle"
            dominant-baseline="central"
            stroke="none"
          >
            {props.element.shortLabel.toUpperCase()}
          </text>
        </g>
      );
    case "rect":
      return (
        <g stroke={stroke()}>
          <rect
            x={placement.x}
            y={placement.y}
            width={placement.w}
            height={placement.h}
            rx="6"
            fill={FILL_DARK}
            stroke-width={outlineWidth()}
          />
          <text
            x={placement.x + placement.w / 2}
            y={placement.y + placement.h / 2}
            fill={LABEL}
            font-size="9"
            font-weight="700"
            text-anchor="middle"
            dominant-baseline="central"
            stroke="none"
          >
            {props.element.shortLabel}
          </text>
        </g>
      );
  }
};

export const ControllerDiagram = (props: {
  controls: readonly ArcadeConsoleControl[];
  /** Console-control ids currently bound to a gamepad button. */
  mappedIds: Accessor<ReadonlySet<number>>;
}) => {
  const elements = buildElements(props.controls);
  return (
    <svg
      viewBox="0 0 340 190"
      class="w-full max-w-md self-center"
      role="img"
      aria-label="Controller layout"
    >
      {/* Pad body; shoulders intentionally overlap its top edge. */}
      <rect
        x={30}
        y={54}
        width={280}
        height={110}
        rx={24}
        fill={BODY_FILL}
        stroke={BODY_STROKE}
        stroke-width={2}
      />
      <For each={elements}>
        {(element) => (
          <DiagramShape
            element={element}
            mapped={element.controlIds.some((id) => props.mappedIds().has(id))}
          />
        )}
      </For>
    </svg>
  );
};
