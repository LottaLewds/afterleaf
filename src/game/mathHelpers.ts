import {type Quaternion} from "three";

/** Shared small math/string helpers used across the shop runtime. */

export const clampUnit = (value: number): number =>
  value > 1 ? 1 : value < -1 ? -1 : value;

export const hashString = (value: string) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Dot product against the physics world's plain quaternion record, avoiding a
 * Quaternion allocation that `Quaternion.dot` would otherwise require.
 */
export const dotWithPhysicsQuaternion = (
  quaternion: Quaternion,
  physicsRotation: {w: number; x: number; y: number; z: number},
) =>
  quaternion.x * physicsRotation.x +
  quaternion.y * physicsRotation.y +
  quaternion.z * physicsRotation.z +
  quaternion.w * physicsRotation.w;
