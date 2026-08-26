import {Color} from "three";
import {easeTurnProgress} from "~/game/PageTurnGeometry";

export const INSPECTION_PAGE_GUTTER = 0;

export const INSPECTION_SURFACE_GAP = 0.001;

export const INSPECTION_FRAME_FILL = 0.88;

export const INSPECTION_OPEN_ANGLE = Math.PI;

export const INSPECTION_COVER_ANIMATION_SPEED = 7.5;

export const INSPECTION_ACTION_CLOSE_SPEED = 18;

export const INSPECTION_OPENING_DELAY_SECONDS = 0.22;

export const INSPECTION_READER_COLOR = "#f6f2e8";

export const INSPECTION_LIGHTING_BLEND_SPEED = 8;

export const INSPECTION_READER_EMISSIVE = new Color("#fff0d8");

export const INSPECTION_READER_EMISSIVE_INTENSITY = 0.62;

export const INSPECTION_PAGE_DRAG_FOLLOW_SPEED = 26;

export const INSPECTION_PAGE_SEGMENTS_X = 20;

export const INSPECTION_PAGE_SEGMENTS_Y = 12;

export const INSPECTION_PAGE_TURN_SPEED = 12;

export const INSPECTION_TRANSITION_SPEED = 12;

export const INSPECTION_TRANSITION_POSITION_EPSILON_SQ = 1e-6;

export const INSPECTION_TRANSITION_ROTATION_EPSILON = 1e-6;

export const SHELF_PREVIEW_PULL_END = 0.58;

export const SHELF_PREVIEW_ROTATION_START = 0.64;

export const SHELF_PREVIEW_FOCUS_HANDOFF_PROGRESS = 0.96;

export const SHELF_BROWSE_INTERVAL_MS = 140;

export const invertPageTurnEasing = (easedProgress: number) => {
  if (easedProgress <= 0) return 0;
  if (easedProgress >= 1) return 1;
  let minimum = 0;
  let maximum = 1;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const midpoint = (minimum + maximum) / 2;
    if (easeTurnProgress(midpoint) < easedProgress) minimum = midpoint;
    else maximum = midpoint;
  }
  return (minimum + maximum) / 2;
};

export const INSPECTION_PAGE_DEFORMATION = {
  maxCurl: 0.1,
  maxTorsion: 0.008,
} as const;

export const SHELF_PREVIEW_SPEED = 10;

export const SHELF_PREVIEW_TRANSLATION_SPEED =
  SHELF_PREVIEW_SPEED / SHELF_PREVIEW_PULL_END;

export const SHELF_PREVIEW_ROTATION_SPEED =
  SHELF_PREVIEW_SPEED / (1 - SHELF_PREVIEW_ROTATION_START);

export const SHELF_RETURN_CLOSE_HANDOFF_ANGLE = 0.03;

export const SHELF_RETURN_ROTATION_HANDOFF_EPSILON = 1e-4;
