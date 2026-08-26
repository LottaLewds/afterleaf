import {MathUtils} from "three";

export const POSTER_INTERACTION_DISTANCE = 4;

export const POSTER_PLACEMENT_DISTANCE = POSTER_INTERACTION_DISTANCE * 2;

export const DEFAULT_POSTER_HEIGHT = 1.15;

export const MIN_POSTER_HEIGHT = 0.2;

export const MAX_POSTER_HEIGHT = 3.8;

export const POSTER_SURFACE_MARGIN = 0.08;

export const POSTER_SURFACE_OFFSET = 0.012;

export const POSTER_ALPHA_TEST = 0.01;

export const POSTER_DEPTH_LAYER_SPACING = 0.0005;

export const POSTER_POLYGON_OFFSET_FACTOR = -1;

export const POSTER_WHEEL_ROTATION_STEP = MathUtils.degToRad(1);

export const DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS = 30;

export const ART_FRAME_TEXTURE_UPLOAD_IDLE_BUDGET_MS = 6;

export const MAX_UNUSED_ART_FRAME_TEXTURES = 8;

export const DIGITAL_ART_FRAME_INTERVALS = [0, 10, 30, 60, 300] as const;

export const DIGITAL_ART_FRAME_BORDER = 0.09;

export const normalizePosterRotation = (rotation: number) =>
  MathUtils.euclideanModulo(rotation + Math.PI, Math.PI * 2) - Math.PI;
