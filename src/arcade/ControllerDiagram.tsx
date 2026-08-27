import {For, Match, Show, Switch, createMemo, type Accessor} from "solid-js";

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
  const points = createMemo(() => {
    const {placement} = props.element;
    return quadrantPoints(placement.x, placement.y);
  });
  return (
    <g>
      <For each={props.element.controlIds}>
        {(controlId, index) => (
          <polygon
            points={points()[index()]}
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
          cx={props.element.placement.x}
          cy={props.element.placement.y}
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
  const placement = () => props.element.placement;
  const shape = () => placement().shape;
  const x = () => placement().x;
  const y = () => placement().y;
  const width = () => {
    const current = placement();
    return "w" in current ? current.w : 0;
  };
  const height = () => {
    const current = placement();
    return "h" in current ? current.h : 0;
  };
  const radius = () => {
    const current = placement();
    return current.shape === "face" ? (current.r ?? 12) : 12;
  };
  const stroke = () => (props.mapped || props.capturingId !== undefined ? ACCENT : STROKE_MUTED);
  const outlineWidth = () => (props.capturingId !== undefined ? "2.5" : props.mapped ? "2" : "1.5");
  const clickable = {
    onClick: () => props.onSelect(props.element.controlIds[0] as number),
  } as const;
  // Element data normally stays stable per instance; shape selection lives in
  // JSX so reactive updates are reconciled without re-running component setup.
  return (
    <Switch fallback={null}>
      <Match when={shape() === "dpad"}>
        <g>
          <g stroke={stroke()} fill={FILL_DARK} class={{"animate-pulse": props.capturingId !== undefined}}>
            <rect x={x() - 21} y={y() - 7} width="42" height="14" rx="4" />
            <rect x={x() - 7} y={y() - 21} width="14" height="42" rx="4" />
          </g>
          <DirectionHitZones {...props} />
        </g>
      </Match>
      <Match when={shape() === "stick"}>
        <g>
          <g
            stroke={stroke()}
            class={["cursor-pointer", {"animate-pulse": props.capturingId !== undefined}]}
            {...clickable}
          >
            <circle cx={x()} cy={y()} r="18" fill={BODY_FILL} stroke-width={outlineWidth()} />
            <circle cx={x()} cy={y()} r="10" fill={FILL_DARK} />
          </g>
          <DirectionHitZones {...props} />
        </g>
      </Match>
      <Match when={shape() === "face"}>
        <g
          stroke={stroke()}
          class={{
            "cursor-pointer": true,
            "animate-pulse": props.capturingId !== undefined,
          }}
          onClick={() => props.onSelect(props.element.controlIds[0] as number)}
        >
          <title>{`Remap ${props.element.label}`}</title>
          <circle cx={x()} cy={y()} r={radius()} fill={FILL_DARK} stroke-width={outlineWidth()} />
          <Show when={props.element.shortLabel.length > 0}>
            <text
              x={x()}
              y={y()}
              fill={LABEL}
              font-size={String(radius() > 13 ? 11 : 9)}
              font-weight="700"
              text-anchor="middle"
              dominant-baseline="central"
              stroke="none"
              pointer-events="none"
            >
              {props.element.shortLabel}
            </text>
          </Show>
        </g>
      </Match>
      <Match when={shape() === "pill"}>
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
            x={x() - width() / 2}
            y={y() - 8}
            width={width()}
            height="16"
            rx="8"
            fill={FILL_DARK}
            stroke-width={outlineWidth()}
          />
          <text
            x={x()}
            y={y()}
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
      </Match>
      <Match when={shape() === "rect"}>
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
            x={x()}
            y={y()}
            width={width()}
            height={height()}
            rx="6"
            fill={FILL_DARK}
            stroke-width={outlineWidth()}
          />
          <text
            x={x() + width() / 2}
            y={y() + height() / 2}
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
      </Match>
    </Switch>
  );
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
