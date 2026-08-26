import {clone as cloneWithSkeleton} from "three/examples/jsm/utils/SkeletonUtils.js";
import {type Object3D, type PerspectiveCamera, Vector3} from "three";
import type {ModelAsset} from "~/models/protocol";
import {
  BUILTIN_ARCADE_CABINET_ASSET_ID,
  BUILTIN_CEILING_LIGHT_ASSET_ID,
  BUILTIN_CRT_TV_ASSET_ID,
  BUILTIN_DESK_LAMP_ASSET_ID,
  BUILTIN_READING_CHAIR_ASSET_ID,
  BUILTIN_READING_TABLE_ASSET_ID,
  BUILTIN_TRASH_CAN_ASSET_ID,
} from "~/game/propAssetIds";
import type {PhysicsPropColliderDefinition} from "~/game/ShopPhysicsWorld";
import type {WorldModelPropSave} from "~/game/worldSave";

export type BuiltinSpawnablePropAsset = {
  id:
    | typeof BUILTIN_CRT_TV_ASSET_ID
    | typeof BUILTIN_READING_TABLE_ASSET_ID
    | typeof BUILTIN_READING_CHAIR_ASSET_ID
    | typeof BUILTIN_TRASH_CAN_ASSET_ID
    | typeof BUILTIN_DESK_LAMP_ASSET_ID
    | typeof BUILTIN_ARCADE_CABINET_ASSET_ID
    | typeof BUILTIN_CEILING_LIGHT_ASSET_ID;
  kind: "builtin";
  label: string;
};

export type SpawnablePropAsset =
  | BuiltinSpawnablePropAsset
  | {id: string; kind: "model"; label: string; model: ModelAsset};

/** Cached template snapshot used to clone-spawn builtin props later. */
export type BuiltinPropTemplate = {
  colliderParts?: readonly PhysicsPropColliderDefinition[];
  density?: number;
  depth: number;
  height: number;
  heldLocalPosition: Vector3;
  object: Object3D;
  rotationSnapStep?: number;
  staticWhenPlaced?: boolean;
  width: number;
};

export const BUILTIN_SPAWNABLE_PROP_ASSETS: readonly BuiltinSpawnablePropAsset[] =
  [
    {id: BUILTIN_CRT_TV_ASSET_ID, kind: "builtin", label: "CRT television"},
    {
      id: BUILTIN_READING_TABLE_ASSET_ID,
      kind: "builtin",
      label: "reading table",
    },
    {
      id: BUILTIN_READING_CHAIR_ASSET_ID,
      kind: "builtin",
      label: "reading chair",
    },
    {id: BUILTIN_TRASH_CAN_ASSET_ID, kind: "builtin", label: "trash can"},
    {id: BUILTIN_DESK_LAMP_ASSET_ID, kind: "builtin", label: "desk lamp"},
    {
      id: BUILTIN_ARCADE_CABINET_ASSET_ID,
      kind: "builtin",
      label: "arcade cabinet",
    },
    {
      id: BUILTIN_CEILING_LIGHT_ASSET_ID,
      kind: "builtin",
      label: "ceiling light",
    },
  ];

/**
 * Builtin props that spawn through cached templates instead of dedicated
 * factories. Their templates can load asynchronously (the desk lamp GLB),
 * so saved restores defer quietly until their template lands and kicks a
 * retry.
 */
export const TEMPLATE_SPAWNED_BUILTIN_ASSET_IDS: ReadonlySet<string> = new Set([
  BUILTIN_READING_TABLE_ASSET_ID,
  BUILTIN_READING_CHAIR_ASSET_ID,
  BUILTIN_DESK_LAMP_ASSET_ID,
  BUILTIN_CEILING_LIGHT_ASSET_ID,
]);

/**
 * Clones a builtin template object, scales and names it, then places it at
 * the saved pose or two meters in front of the camera (writing the camera's
 * forward direction into the caller's scratch vector). Returns the placed
 * root ready for movable-prop registration.
 */
export const placeClonedTemplateObject = ({
  assetId,
  camera,
  id,
  pose,
  scale,
  template,
  viewDirection,
}: {
  assetId: string;
  camera: PerspectiveCamera;
  id: string;
  pose: WorldModelPropSave["pose"] | undefined;
  scale: number;
  template: BuiltinPropTemplate;
  viewDirection: Vector3;
}) => {
  const object = cloneWithSkeleton(template.object);
  object.name = `${assetId}-${id}`;
  object.scale.setScalar(scale);
  if (pose) {
    object.position.copy(pose.position);
    object.quaternion.copy(pose.quaternion);
  } else {
    camera.getWorldDirection(viewDirection);
    object.position.copy(camera.position).addScaledVector(viewDirection, 2);
  }
  return object;
};
