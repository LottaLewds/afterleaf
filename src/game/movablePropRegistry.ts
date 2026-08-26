import {MathUtils, type Quaternion, type Vector3} from "three";
import type {MovablePropRegistration} from "~/game/propRegistration";
import type {MovablePropRecord} from "~/game/shopTypes";

const PROP_ROTATION_SNAP_STEP = MathUtils.degToRad(15);

/** Builds the stable registry record shared by builtin and user props. */
export const createMovablePropRecord = (
  registration: MovablePropRegistration,
  currentPosition: Vector3,
  currentRotation: Quaternion,
): MovablePropRecord => ({
  currentPosition,
  currentRotation,
  ghostMaterialSwaps: [],
  halfDepth: registration.depth / 2,
  halfHeight: registration.height / 2,
  halfWidth: registration.width / 2,
  heldLocalPosition: registration.heldLocalPosition,
  id: registration.id,
  label: registration.label,
  locked: registration.locked ?? false,
  ...(registration.modelAnimationIndex === undefined
    ? {}
    : {modelAnimationIndex: registration.modelAnimationIndex}),
  ...(registration.modelAnimations
    ? {modelAnimations: registration.modelAnimations}
    : {}),
  ...(registration.modelAsset ? {modelAsset: registration.modelAsset} : {}),
  ...(registration.modelBaseSize
    ? {modelBaseSize: registration.modelBaseSize}
    : {}),
  ...(registration.modelMixer ? {modelMixer: registration.modelMixer} : {}),
  ...(registration.modelScale === undefined
    ? {}
    : {modelScale: registration.modelScale}),
  object: registration.object,
  placementSupport: registration.placementSupport ?? registration.object,
  rotationSnapStep: registration.rotationSnapStep ?? PROP_ROTATION_SNAP_STEP,
  ...(registration.spawnAssetId
    ? {spawnAssetId: registration.spawnAssetId}
    : {}),
  spawned: registration.spawned ?? false,
});
