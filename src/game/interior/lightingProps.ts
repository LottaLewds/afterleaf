import {clone as cloneWithSkeleton} from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SpotLight,
  Vector3,
  type AnimationClip,
} from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {DEV} from "solid-js";
import lampModelUrl from "~/assets/models/lamp.glb?url";
import {disposeObject} from "~/game/threeDisposal";
import {BUILTIN_CEILING_LIGHT_ASSET_ID, BUILTIN_DESK_LAMP_ASSET_ID} from "~/game/propAssetIds";
import type {MovablePropRegistration} from "~/game/propRegistration";
import {INITIAL_WORLD_SEEDING_VERSION} from "~/game/worldSave";
import {DEFAULT_MODEL_SCALE} from "~/game/propTuning";
import {READING_TABLE_Z_POSITIONS} from "~/game/shopLayout";

const DESK_LAMP_HEIGHT = 0.64;
const DESK_LAMP_SPAWN_CLEARANCE = 0.015;
const CRT_TABLE_DESK_LAMP_SPAWN_CLEARANCE = 0.08;
const READING_TABLE_SURFACE_Y = 0.91;
const CEILING_LIGHT_BULB_DROP = 0.22;

/** Existing fixture power expressed using SpotLight's lumen-based API. */
export const CEILING_LIGHT_DEFAULT_POWER = 5.6 * Math.PI;
export const CEILING_LIGHT_MIN_POWER = 0;
export const CEILING_LIGHT_MAX_POWER = 10_000;
export const CEILING_LIGHT_POWER_STEP = 10;

/** Tuning for the ceiling-light fixture geometry. */
const CEILING_LIGHT_ORIGIN_Y = 4.47;

/**
 * Scene hooks the lighting prop builders need: the movable-prop registry,
 * the built-in template cache, and seeding/disposal state.
 */
export type LightingPropsHost = {
  cacheBuiltinPropTemplate: (registration: MovablePropRegistration) => void;
  isDisposed: () => boolean;
  modelMixers: Set<AnimationMixer>;
  needsSeedPass: (version: number) => boolean;
  registerMovableProp: (registration: MovablePropRegistration) => unknown;
};

export const playModelAnimations = (
  modelMixers: Set<AnimationMixer>,
  root: Object3D,
  clips: readonly AnimationClip[],
  clipIndex = 0,
) => {
  if (clips.length === 0) return undefined;
  const mixer = new AnimationMixer(root);
  const clip = clips[clipIndex];
  if (clip) mixer.clipAction(clip).play();
  modelMixers.add(mixer);
  return mixer;
};

export const clampCeilingLightPower = (power: number) => {
  if (!Number.isFinite(power)) return CEILING_LIGHT_DEFAULT_POWER;
  return Math.min(CEILING_LIGHT_MAX_POWER, Math.max(CEILING_LIGHT_MIN_POWER, power));
};

export const ceilingLightPowerLumens = ({light}: {light: SpotLight}) => Math.round(light.power);

export const createCeilingLightRig = (initialPower = CEILING_LIGHT_DEFAULT_POWER) => {
  // Keep the player-facing control to lumen output; the fixed inverse-square
  // curve provides intuitive physical falloff while the fixed range keeps
  // each fixture's coverage local.
  const light = new SpotLight("#f3e3cb", 1, 9, Math.PI / 2, 0.75, 2);
  light.power = clampCeilingLightPower(initialPower);
  light.position.set(0, -CEILING_LIGHT_BULB_DROP, 0);
  const target = new Object3D();
  target.position.set(0, -CEILING_LIGHT_ORIGIN_Y, 0);
  light.target = target;
  return [light, target] as const;
};

export const createCeilingLightTemplate = (host: LightingPropsHost) => {
  const housing = new Mesh(
    new BoxGeometry(2.15, 0.05, 0.25),
    new MeshStandardMaterial({
      color: "#525c58",
      metalness: 0.6,
      roughness: 0.42,
    }),
  );
  const panel = new Mesh(
    new BoxGeometry(1.92, 0.025, 0.12),
    new MeshStandardMaterial({
      color: "#dce9e2",
      emissive: "#dff9ed",
      emissiveIntensity: 3.8,
      roughness: 0.28,
    }),
  );
  panel.position.y = -0.04;
  const group = new Group();
  group.add(housing, panel);
  host.cacheBuiltinPropTemplate({
    depth: 0.25,
    height: 0.075,
    heldLocalPosition: new Vector3(0, -0.35, -2.4),
    id: BUILTIN_CEILING_LIGHT_ASSET_ID,
    label: "ceiling light",
    object: group,
    rotationSnapStep: Math.PI / 2,
    spawnAssetId: BUILTIN_CEILING_LIGHT_ASSET_ID,
    templateForSpawning: true,
    width: 2.15,
  });
};

export const createDeskLamps = async (parent: Group, host: LightingPropsHost) => {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(lampModelUrl);
    if (host.isDisposed()) {
      disposeObject(gltf.scene);
      return;
    }

    gltf.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(gltf.scene);
    const height = bounds.max.y - bounds.min.y;
    if (!(height > 0)) {
      disposeObject(gltf.scene);
      throw new Error("The lamp model has no measurable height.");
    }

    const scale = DESK_LAMP_HEIGHT / height;
    const center = bounds.getCenter(new Vector3());
    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    gltf.scene.name = "reading-table-lamp";
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    const seedDeskLamps = () => {
      // The model is always loaded and always becomes the spawn template;
      // seeding only decides whether default-positioned copies are placed.
      for (const [index, z] of READING_TABLE_Z_POSITIONS.entries()) {
        if (index > 0 && !host.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) break;
        const lamp = index === 0 ? gltf.scene : cloneWithSkeleton(gltf.scene);
        const spawnClearance = index === 1 ? CRT_TABLE_DESK_LAMP_SPAWN_CLEARANCE : DESK_LAMP_SPAWN_CLEARANCE;
        lamp.position.y = READING_TABLE_SURFACE_Y + spawnClearance - bounds.min.y * scale;
        lamp.position.z = z - center.z * scale;
        const lampBounds = new Box3().setFromObject(lamp);
        const lampSize = lampBounds.getSize(new Vector3());
        const lampRoot = new Group();
        lampRoot.name = `desk-lamp-${index + 1}`;
        lampRoot.position.copy(lampBounds.getCenter(new Vector3()));
        lampRoot.attach(lamp);
        if (index === 0)
          host.cacheBuiltinPropTemplate({
            density: 8,
            depth: lampSize.z,
            heldLocalPosition: new Vector3(0, -0.12, -1.6),
            height: lampSize.y,
            id: BUILTIN_DESK_LAMP_ASSET_ID,
            label: "desk lamp",
            object: lampRoot,
            rotationSnapStep: Math.PI / 2,
            spawnAssetId: BUILTIN_DESK_LAMP_ASSET_ID,
            templateForSpawning: true,
            width: lampSize.x,
          });
        if (!host.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) continue;
        parent.add(lampRoot);
        playModelAnimations(host.modelMixers, lamp, gltf.animations);
        host.registerMovableProp({
          density: 8,
          depth: lampSize.z,
          heldLocalPosition: new Vector3(0, -0.12, -1.6),
          height: lampSize.y,
          id: `desk-lamp-${index + 1}`,
          label: `desk lamp ${index + 1}`,
          modelBaseSize: new Vector3(lampSize.x, lampSize.y, lampSize.z),
          modelScale: DEFAULT_MODEL_SCALE,
          object: lampRoot,
          rotationSnapStep: Math.PI / 2,
          spawnAssetId: BUILTIN_DESK_LAMP_ASSET_ID,
          spawned: true,
          width: lampSize.x,
        });
      }
    };
    seedDeskLamps();
  } catch (error) {
    if (DEV && !host.isDisposed()) console.warn("Afterleaf could not load the desk lamp model.", error);
  }
};
