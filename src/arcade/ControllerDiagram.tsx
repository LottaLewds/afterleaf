import {For, Show, createMemo, type Accessor} from "solid-js";

import type {ArcadeConsoleControl, ControlDiagramPlacement} from "~/arcade/controllerMappings";

/**
 * Clickable diagram of an emulated console's controller.
 *
 * Each console control carries its own placement, so adding a system's
 * layout is data-only. Shapes bound to a gamepad button render with the
 * accent outline; clicking any shape starts capture for that control, and
 * directional groups (d-pad, analog stick) expose one hit zone per
 * direction so every control stays individually assignable.
 */

const ACCENT = "#d94c3f";
const STROKE_MUTED = "#39443f";
const FILL_DARK = "#1d2725";
const LABEL = "#b8c1bc";
const BODY_FILL = "#121918";
const BODY_STROKE = "#2a3531";

/**
 * Deduplicated drawable element: directional groups collapse to one anchor.
 * `controlIds` preserves declaration order (up, down, left, right) so each
 * hit zone can map back to its exact control.
 */
type DiagramElement = {
  key: string;
  controlIds: number[];
  placement: ControlDiagramPlacement;
  label: string;
  shortLabel: string;
};

const buildElements = (controls: readonly ArcadeConsoleControl[]): DiagramElement[] => {
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
      label: control.label,
      shortLabel: control.shortLabel ?? control.label,
    };
    byKey.set(key, element);
    elements.push(element);
  }
  return elements;
};

/** Quadrant triangle corners around an anchor, in up/down/left/right order. */
const HIT_RADIUS = 27;
const quadrantPoints = (x: number, y: number): readonly [string, string, string, string] => [
  `${x - HIT_RADIUS},${y - HIT_RADIUS} ${x + HIT_RADIUS},${y - HIT_RADIUS} ${x},${y}`,
  `${x - HIT_RADIUS},${y + HIT_RADIUS} ${x + HIT_RADIUS},${y + HIT_RADIUS} ${x},${y}`,
  `${x - HIT_RADIUS},${y - HIT_RADIUS} ${x - HIT_RADIUS},${y + HIT_RADIUS} ${x},${y}`,
  `${x + HIT_RADIUS},${y - HIT_RADIUS} ${x + HIT_RADIUS},${y + HIT_RADIUS} ${x},${y}`,
];

const DirectionHitZones = (props: {
  element: DiagramElement;
  capturingId: number | undefined;
  onSelect: (controlId: number) => void;
}) => {
  const {placement} = props.element;
  const points = quadrantPoints(placement.x, placement.y);
  return (
    <g>
      <For each={props.element.controlIds}>
        {(controlId, index) => (
          <polygon
            points={points[index()]}
            fill="transparent"
            class="cursor-pointer"
            onClick={() => props.onSelect(controlId)}
          >
            <title>{`Remap ${props.element.shortLabel}`}</title>
          </polygon>
        )}
      </For>
      {/* Ring highlight while this group is being captured. */}
      <Show when={props.capturingId !== undefined && props.element.controlIds.includes(props.capturingId)}>
        <circle
          cx={placement.x}
          cy={placement.y}
          r={HIT_RADIUS}
          fill="none"
          stroke={ACCENT}
          stroke-width="2"
          class="animate-pulse"
          pointer-events="none"
        />
      </Show>
    </g>
  );
};

const DiagramShape = (props: {
  element: DiagramElement;
  mapped: boolean;
  capturingId: number | undefined;
  onSelect: (controlId: number) => void;
}) => {
  const {placement} = props.element;
  const stroke = () => (props.mapped || props.capturingId !== undefined ? ACCENT : STROKE_MUTED);
  const outlineWidth = () => (props.capturingId !== undefined ? "2.5" : props.mapped ? "2" : "1.5");
  const clickable = {
    onClick: () => props.onSelect(props.element.controlIds[0] as number),
  } as const;
  // Element data is static per instance, so shape selection happens once;
  // state flows through reactive attribute expressions.
  switch (placement.shape) {
    case "dpad":
      return (
        <g>
          <g stroke={stroke()} fill={FILL_DARK} class={{"animate-pulse": props.capturingId !== undefined}}>
            <rect x={placement.x - 21} y={placement.y - 7} width="42" height="14" rx="4" />
            <rect x={placement.x - 7} y={placement.y - 21} width="14" height="42" rx="4" />
          </g>
          <DirectionHitZones {...props} />
        </g>
      );
    case "stick":
      return (
        <g>
          <g
            stroke={stroke()}
            class={["cursor-pointer", {"animate-pulse": props.capturingId !== undefined}]}
            {...clickable}
          >
            <circle cx={placement.x} cy={placement.y} r="18" fill={BODY_FILL} stroke-width={outlineWidth()} />
            <circle cx={placement.x} cy={placement.y} r="10" fill={FILL_DARK} />
          </g>
          <DirectionHitZones {...props} />
        </g>
      );
    case "face": {
      const radius = placement.r ?? 12;
      return (
        <g
          stroke={stroke()}
          class={{
            "cursor-pointer": true,
            "animate-pulse": props.capturingId !== undefined,
          }}
          onClick={() => props.onSelect(props.element.controlIds[0] as number)}
        >
          <title>{`Remap ${props.element.label}`}</title>
          <circle cx={placement.x} cy={placement.y} r={radius} fill={FILL_DARK} stroke-width={outlineWidth()} />
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
              pointer-events="none"
            >
              {props.element.shortLabel}
            </text>
          )}
        </g>
      );
    }
    case "pill":
      return (
        <g
          stroke={stroke()}
          class={{
            "cursor-pointer": true,
            "animate-pulse": props.capturingId !== undefined,
          }}
          onClick={() => props.onSelect(props.element.controlIds[0] as number)}
        >
          <title>{`Remap ${props.element.label}`}</title>
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
            pointer-events="none"
          >
            {props.element.shortLabel.toUpperCase()}
          </text>
        </g>
      );
    case "rect":
      return (
        <g
          stroke={stroke()}
          class={{
            "cursor-pointer": true,
            "animate-pulse": props.capturingId !== undefined,
          }}
          onClick={() => props.onSelect(props.element.controlIds[0] as number)}
        >
          <title>{`Remap ${props.element.label}`}</title>
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
            pointer-events="none"
          >
            {props.element.shortLabel}
          </text>
        </g>
      );
  }
};

export const ControllerDiagram = (props: {
  controls: Accessor<readonly ArcadeConsoleControl[]>;
  /** Console-control ids currently bound to a gamepad button. */
  mappedIds: Accessor<ReadonlySet<number>>;
  /** Control waiting for capture, if any; drawn with a pulsing outline. */
  capturingControlId?: Accessor<number | undefined>;
  /** Starts capture for a control when its shape is clicked. */
  onSelect?: (controlId: number) => void;
}) => {
  // Rebuilt whenever the selected system's control list changes.
  const elements = createMemo(() => buildElements(props.controls()));
  return (
    <svg
      viewBox="0 0 340 190"
      class="w-full max-w-md self-center"
      role="group"
      aria-label="Controller layout; click a button to remap it"
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
        pointer-events="none"
      />
      <For each={elements()}>
        {(element) => (
          <DiagramShape
            element={element}
            mapped={element.controlIds.some((id) => props.mappedIds().has(id))}
            capturingId={props.capturingControlId?.()}
            onSelect={(controlId) => props.onSelect?.(controlId)}
          />
        )}
      </For>
    </svg>
  );
};
