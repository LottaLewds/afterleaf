import type {AnimationClip, AnimationMixer, Material, Mesh, MeshStandardMaterial, Object3D, Vector3} from "three";
import type {ModelAsset} from "~/models/protocol";
import type {PhysicsPropColliderDefinition} from "~/game/ShopPhysicsWorld";
import type {ReadingFurnitureMaterial} from "~/game/shopLayout";

/**
 * A prop offered to the scene's movable-prop registry. Registrations back
 * both hand-placed props and the built-in templates used for seeding and
 * player spawning.
 */
export type MovablePropRegistration = {
  colliderParts?: readonly PhysicsPropColliderDefinition[];
  density?: number;
  depth: number;
  staticWhenPlaced?: boolean;
  heldLocalPosition: Vector3;
  height: number;
  id: string;
  label: string;
  locked?: boolean;
  modelAnimationIndex?: number;
  modelAnimations?: readonly AnimationClip[];
  modelAsset?: ModelAsset;
  modelBaseSize?: Vector3;
  modelMixer?: AnimationMixer;
  modelScale?: number;
  object: Object3D;
  placementSupport?: Object3D;
  rotationSnapStep?: number;
  spawnAssetId?: string;
  spawned?: boolean;
  targetable?: boolean;
  targetObject?: Object3D;
  templateForSpawning?: boolean;
  width: number;
};

/** A temporary material swap applied while a prop is carried (ghosted). */
export type PropMaterialSwap = {
  material: Material | Material[];
  mesh: Mesh;
  renderOrder: number;
};

/** Material set shared by reading tables and chairs. */
export type ReadingFurnitureMaterials = Record<ReadingFurnitureMaterial, MeshStandardMaterial>;
