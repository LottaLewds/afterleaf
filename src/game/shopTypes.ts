import type {AnimationClip, Object3D, Quaternion, Vector3} from "three";

import type {InteractionPromptToken} from "~/game/input/hints";
import type {ShortcutAction} from "~/game/input/bindings";
import type {ShelfPresentation, SpineShelfPlacement} from "~/game/shelfPlacement";
import type {ArcadeSessionStatus} from "~/game/ShopArcadeCabinet";
import type {PropMaterialSwap} from "~/game/propRegistration";
import type {ModelAsset} from "~/models/protocol";

export type SpineShelfDefinition = {
  axis: Vector3;
  backInset: number;
  faceInset: number;
  faceTilt: number;
  frontCenter: Vector3;
  halfWidth: number;
  id: string;
  normal: Vector3;
  signKey?: string;
};

export type ShelfTargetSelection = {
  offset: number;
  placements?: readonly SpineShelfPlacement[];
  presentation: ShelfPresentation;
  shelfId: string;
  slotIndex: number;
};

export type MovablePropRecord = {
  currentPosition: Vector3;
  currentRotation: Quaternion;
  /** Pinned in place: fixed body, immune to bumps, still collides. */
  locked: boolean;
  // Explicitly cleared back to undefined on cancel, so these slots honestly
  // admit undefined under exactOptionalPropertyTypes.
  placementStartPosition?: Vector3 | undefined;
  placementStartRotation?: Quaternion | undefined;
  placementStartScale?: number | undefined;
  ghostMaterialSwaps: PropMaterialSwap[];
  halfDepth: number;
  halfHeight: number;
  halfWidth: number;
  heldLocalPosition: Vector3;
  id: string;
  label: string;
  modelAnimationIndex?: number;
  modelAnimations?: readonly AnimationClip[];
  modelAsset?: ModelAsset;
  modelBaseSize?: Vector3;
  modelMixer?: import("three").AnimationMixer;
  modelScale?: number;
  object: Object3D;
  placementSupport: Object3D;
  rotationSnapStep: number;
  spawnAssetId?: string;
  spawned: boolean;
};

export type ModelTemplate = {
  animations: readonly AnimationClip[];
  center: Vector3;
  normalizationScale: number;
  scene: Object3D;
  size: Vector3;
};

export type ModelPlacementSession = {
  assetIndex: number;
  id: string;
  revision: number;
};

export type InspectionCloseAction = "drop" | "return" | "throw";
export type InspectionMode = "closing" | "none" | "spread";

export type ShopInteraction = {
  /** Display string for keyboard users; also used as the aria label. */
  key: string;
  label: string;
  /**
   * Action refs aligned with the " / " alternatives of `key`. While a
   * controller is active, prompts are derived from their pad bindings.
   */
  actions?: readonly (ShortcutAction | undefined)[];
  /**
   * Pad prompt tokens present only while a controller is active; renderers
   * fall back to plain keycaps when omitted.
   */
  prompts?: readonly InteractionPromptToken[];
};

export type ShopGameSnapshot = {
  interactionContext?: string;
  interactions?: readonly ShopInteraction[];
  carriedBookCount?: number;
  carriedPublicationId?: string;
  discardBusy?: boolean;
  discardError?: string;
  inspectionBookOpen?: boolean;
  inspectionCanTurnBackward?: boolean;
  inspectionCanTurnForward?: boolean;
  inspectionPageCount?: number;
  inspectionPageIndex?: number;
  inspectionPagesLoading?: boolean;
  looseCount: number;
  inspectionMode: InspectionMode;
  physicsReady: boolean;
  pointerLocked: boolean;
  modelCount?: number;
  modelImportError?: string;
  modelPlacementActive?: boolean;
  posterCount: number;
  posterImportError?: string;
  posterImporting?: boolean;
  posterPlacementActive?: boolean;
  digitalArtFrameCount?: number;
  digitalArtFrameImportError?: string;
  digitalArtFrameImporting?: boolean;
  digitalArtFramePlacementActive?: boolean;
  tvVideoImportError?: string;
  tvVideoImporting?: boolean;
  tvVideoImportMessage?: string;
  /** Session state of the cabinet driving the arcade UI; absent when idle. */
  arcadeStatus?: ArcadeSessionStatus;
  arcadeCabinetId?: string;
  arcadeSystemId?: string;
  arcadeDetail?: string;
  arcadeRomName?: string;
  prompt?: string;
  shelvedCount: number;
  throwCharge?: number;
};
