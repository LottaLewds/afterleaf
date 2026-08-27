import {
  Box3,
  BoxGeometry,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Material,
  type MeshStandardMaterial,
  type AnimationMixer,
} from "three";
import {MathUtils} from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {clone as cloneWithSkeleton} from "three/examples/jsm/utils/SkeletonUtils.js";
import {DEV} from "solid-js";
import crtTvModelUrl from "~/assets/models/crt-tv.glb?url";
import trashCanModelUrl from "~/assets/models/trash_can.glb?url";
import {createCeilingLightRig, playModelAnimations} from "~/game/interior/lightingProps";
import {findModelTelevisionScreen, getInitialModelAnimationIndex} from "~/game/modelTelevision";
import {normalizePosterRotation} from "~/game/wallDecorTuning";
import {ARCADE_CABINET_HEIGHT} from "~/game/ShopArcadeCabinet";
import {RARE_ROOM_CENTER_X, RARE_ROOM_CENTER_Z} from "~/game/shopLayout";
import {SHOP_MODEL_TELEVISION_SCALE, SHOP_MODEL_TELEVISION_SIZE} from "~/game/shopLayout";
import {
  BUILTIN_ARCADE_CABINET_ASSET_ID,
  BUILTIN_CEILING_LIGHT_ASSET_ID,
  BUILTIN_CRT_TV_ASSET_ID,
  BUILTIN_TRASH_CAN_ASSET_ID,
} from "~/game/propAssetIds";
import {
  DEFAULT_MODEL_SCALE,
  MAX_MODEL_SCALE,
  MIN_MODEL_SCALE,
  PROP_MAX_PROJECTION_DISTANCE,
  PROP_MIN_PROJECTION_DISTANCE,
} from "~/game/propTuning";
import type {MovablePropRegistration, PropMaterialSwap} from "~/game/propRegistration";
import {
  BUILTIN_SPAWNABLE_PROP_ASSETS,
  placeClonedTemplateObject,
  PropTemplateCache,
  TEMPLATE_SPAWNED_BUILTIN_ASSET_IDS,
  type BuiltinSpawnablePropAsset,
  type SpawnablePropAsset,
} from "~/game/propTemplates";
import {buildMergedStaticParts} from "~/game/staticModelBatching";
import {createMovablePropRecord} from "~/game/movablePropRegistry";
import {ShopArcadeCabinet} from "~/game/ShopArcadeCabinet";
import {ShopAudioManager} from "~/game/ShopAudioManager";
import type {BookPhysicsPose, ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import {CRT_TV_SAFE_AREA, ShopTelevision} from "~/game/ShopTelevision";
import type {ModelPlacementSession, ModelTemplate, MovablePropRecord} from "~/game/shopTypes";
import {disposeObject} from "~/game/threeDisposal";
import type {ModelAsset} from "~/models/protocol";
import {
  INITIAL_WORLD_SEEDING_VERSION,
  WORLD_SEEDING_VERSION,
  worldSaveSeedingVersion,
  type WorldModelPropSave,
  type WorldPropSave,
  type WorldQuaternion,
  type WorldSaveV1,
  type WorldTelevisionChannels,
  type WorldTelevisionVolumes,
} from "~/game/worldSave";
import type {DiscardBin} from "~/game/discardBin";
import type {TvChannel} from "~/tv/protocol";

const CARRIED_PROP_OPACITY = 0.32;
const PROP_SUPPORT_SNAP_DISTANCE = 0.65;
const MIN_MODEL_COLLIDER_DIMENSION = 0.02;
const MAX_USER_MODEL_PROP_COUNT = 512;
const MODEL_TELEVISION_PHYSICS_ID = "crt-television";
// A content model whose GLB contains a node with this name spawns as a
// television: the node's first mesh becomes the video screen.
const MODEL_TELEVISION_SCREEN_NODE_NAME = "TVScreen";
const MODEL_TELEVISION_DENSITY = 60;
const ARCADE_CABINET_DENSITY = 45;
const ARCADE_CABINET_HELD_LOCAL_POSITION = new Vector3(0, -0.42, -2.2);
/** Footprint box of the height-normalized cabinet model before scaling. */
const ARCADE_CABINET_BASE_SIZE = {
  depth: 0.7,
  height: ARCADE_CABINET_HEIGHT,
  width: 0.84,
} as const;
const IDENTITY_WORLD_QUATERNION: WorldQuaternion = Object.freeze({
  w: 1,
  x: 0,
  y: 0,
  z: 0,
});
const CEILING_LIGHT_COLUMNS = [-7, 0, 7] as const;
const CEILING_LIGHT_ROWS = [-7, -1.5, 4, 9.5, 15, 20.5, 26] as const;
/**
 * Where ceiling-light props hang: the prop origin sits at the housing
 * center, matching the pre-seeding hard-wired fixture height.
 */
const CEILING_LIGHT_ORIGIN_Y = 4.47;

type CeilingLightPlacement = {rotationY: number; x: number; z: number};

const CEILING_LIGHT_PLACEMENTS: readonly CeilingLightPlacement[] = [
  ...CEILING_LIGHT_COLUMNS.flatMap((x) =>
    CEILING_LIGHT_ROWS.filter((z) => !(x > 0 && z === -7)).map((z) => ({
      rotationY: 0,
      x,
      z,
    })),
  ),
  {
    rotationY: Math.PI / 2,
    x: RARE_ROOM_CENTER_X,
    z: RARE_ROOM_CENTER_Z,
  },
];

// Each entry places one cabinet (model screen faces +Z; rotationY flips it
// toward the shop interior). Add entries to open more arcade lanes. The
// origin is the model center, so the lane spawns half a height above floor.
const ARCADE_CABINET_PLACEMENTS: readonly {
  position: readonly [number, number, number];
  rotationY: number;
}[] = [{position: [2.7, ARCADE_CABINET_HEIGHT / 2, 16.2], rotationY: Math.PI}];

/**
 * Everything the movable-prop lifecycle reads from or writes to its host
 * scene, as live accessors so every read stays current.
 */
export type MovablePropLifecycleHost = {
  activeArcadeCabinet: () => ShopArcadeCabinet | undefined;
  arcadeCabinets: () => ShopArcadeCabinet[];
  audioManager: () => ShopAudioManager;
  camera: () => import("three").PerspectiveCamera;
  carriedPublicationId: () => string | undefined;
  discardBin: () => DiscardBin;
  disposed: () => boolean;
  emitGameState: () => void;
  enterArcadeBrowsing: (cabinet: ShopArcadeCabinet) => void;
  heldTargetPosition: () => Vector3;
  markTelevisionSettingChanged: () => void;
  markWorldStateDirty: () => void;
  pendingWorldSave: () => WorldSaveV1 | undefined;
  physicsPose: () => BookPhysicsPose;
  physicsPosePosition: () => Vector3;
  physicsPoseRotation: () => Quaternion;
  physicsWorld: () => ShopPhysicsWorld;
  playerVelocity: () => Vector3;
  savedTelevisionChannels: () => WorldTelevisionChannels;
  savedTelevisionVolumes: () => WorldTelevisionVolumes;
  scene: () => import("three").Scene;
  setActiveArcadeCabinet: (cabinet: ShopArcadeCabinet | undefined) => void;
  setArcadeTargeted: (cabinet: ShopArcadeCabinet | undefined) => void;
  setHoveredPublicationId: (publicationId: string | undefined) => void;
  setPropTargeted: (record: MovablePropRecord | undefined) => void;
  setTelevisionTargeted: (targeted: boolean) => void;
  targetedArcadeCabinet: () => ShopArcadeCabinet | undefined;
  targetedProp: () => MovablePropRecord | undefined;
  targetedTelevision: () => ShopTelevision | undefined;
  televisionTableMaterial: () => MeshStandardMaterial | undefined;
  televisions: () => ShopTelevision[];
  throwVelocity: () => Vector3;
  tvChannels: () => readonly TvChannel[];
  tvScreenLighting: () => boolean;
  updateHeldPhysicsTarget: () => void;
  upAxis: () => Vector3;
  viewDirection: () => Vector3;
};

/** Movable-prop registry, spawnable factories, seeding, and placement sessions. */
export class MovablePropLifecycle {
  static readonly #modelLoader = new GLTFLoader();

  readonly records = new Map<string, MovablePropRecord>();
  readonly targetMeshes: Mesh[] = [];
  readonly televisionProps = new Map<ShopTelevision, MovablePropRecord>();
  readonly televisionsBySaveId = new Map<string, ShopTelevision>();
  readonly arcadeProps = new Map<ShopArcadeCabinet, MovablePropRecord>();
  readonly modelMixers = new Set<AnimationMixer>();
  carriedProp: MovablePropRecord | undefined;
  modelPlacementRevision = 0;
  modelPlacement: ModelPlacementSession | undefined;
  modelImportError: string | undefined;
  spawnablePropAssets: readonly SpawnablePropAsset[] = BUILTIN_SPAWNABLE_PROP_ASSETS;
  spawnablePropAssetIndex = 0;
  pendingPropSaves = new Map<string, WorldPropSave>();
  pendingModelPropSaves: readonly WorldModelPropSave[] = [];
  propPlacementDistance = 2;
  propPlacementRotationSnapOrigin = 0;
  propPlacementSnapping = true;
  propPlacementYaw = 0;

  readonly #host: MovablePropLifecycleHost;
  #restoreActive = false;
  /** A builtin template landed while a restore pass was running. */
  #restoreRetry = false;
  /** Missing prop assets already reported so each warns only once. */
  readonly #missingPropAssetIds = new Set<string>();
  #customModelAssets: readonly ModelAsset[] = [];
  readonly #builtinPropTemplates = new PropTemplateCache();
  readonly #modelTemplatePromises = new Map<string, Promise<ModelTemplate>>();
  readonly #supportBounds = new Box3();
  readonly #placementSupports: {
    bounds?: Box3;
    object?: Object3D;
    owner?: MovablePropRecord;
  }[] = [];
  readonly #placementEuler = new Euler();
  readonly #placementQuaternion = new Quaternion();

  constructor(host: MovablePropLifecycleHost) {
    this.#host = host;
  }

  registerMovableProp(registration: MovablePropRegistration) {
    const host = this.#host;
    registration.object.updateWorldMatrix(true, false);
    const currentPosition = registration.object.getWorldPosition(new Vector3());
    const currentRotation = registration.object.getWorldQuaternion(new Quaternion());
    const record = createMovablePropRecord(registration, currentPosition, currentRotation);
    if (registration.targetable !== false)
      (registration.targetObject ?? registration.object).traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.userData.movablePropId = registration.id;
        this.targetMeshes.push(object);
      });
    this.records.set(record.id, record);
    this.#placementSupports.push({
      object: record.placementSupport,
      owner: record,
    });
    host.physicsWorld().addProp({
      ...(registration.colliderParts ? {colliderParts: registration.colliderParts} : {}),
      ...(registration.density !== undefined ? {density: registration.density} : {}),
      depth: registration.depth,
      ...(registration.staticWhenPlaced !== undefined ? {staticWhenPlaced: registration.staticWhenPlaced} : {}),
      height: registration.height,
      id: registration.id,
      pose: {position: currentPosition, rotation: currentRotation},
      width: registration.width,
    });
    const savedProp = this.pendingPropSaves.get(record.id);
    if (savedProp) {
      this.applySavedPropPose(record, savedProp);
      this.pendingPropSaves.delete(record.id);
    }
    if (record.locked) host.physicsWorld().setPropLocked(record.id, true);
    // Cache the spawn template before the discard volume joins the object
    // so cloned trash can templates stay volume-free.
    if (registration.templateForSpawning) this.cacheBuiltinPropTemplate(registration);
    if (registration.spawnAssetId === BUILTIN_TRASH_CAN_ASSET_ID) host.discardBin().attach(record);
    return record;
  }

  /**
   * Caches a spawnable prop's template so the generic builtin factory
   * (#createPropFromBuiltinTemplate) can recreate it later. Called from
   * prop registrations and from the furniture template bootstrap, which
   * runs even on worlds whose live defaults come from their saves.
   */
  cacheBuiltinPropTemplate(registration: MovablePropRegistration) {
    const cached = this.#builtinPropTemplates.cacheFromRegistration(registration);
    if (!cached) return;
    // Async builtin templates (the desk lamp GLB, for example) can land
    // after a restore pass already gave up on their saved props. Retry
    // those restores once the template exists.
    if (this.#restoreActive) this.#restoreRetry = true;
    else void this.restoreSavedModelProps();
  }

  registerPropPlacementSupport(object: Object3D) {
    object.updateWorldMatrix(true, false);
    this.#placementSupports.push({
      bounds: new Box3().setFromObject(object),
    });
  }

  applySavedPropPose(record: MovablePropRecord, savedProp: WorldPropSave) {
    const host = this.#host;
    host.scene().attach(record.object);
    record.object.position.copy(savedProp.pose.position);
    record.object.quaternion.copy(savedProp.pose.quaternion);
    record.currentPosition.copy(savedProp.pose.position);
    record.currentRotation.copy(savedProp.pose.quaternion);
    host.physicsWorld().updatePropPose(record.id, {
      position: savedProp.pose.position,
      rotation: savedProp.pose.quaternion,
    });
    if (savedProp.locked !== undefined) record.locked = savedProp.locked;
  }

  ghostObject(object: Object3D) {
    const swaps: PropMaterialSwap[] = [];
    object.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.movablePropTargetProxy === true) return;
      const material = child.material;
      const createGhostMaterial = (source: Material) => {
        const ghost = source.clone();
        ghost.alphaTest *= CARRIED_PROP_OPACITY;
        ghost.depthWrite = false;
        ghost.opacity = source.opacity * CARRIED_PROP_OPACITY;
        ghost.transparent = true;
        return ghost;
      };
      const ghostMaterial = Array.isArray(material) ? material.map(createGhostMaterial) : createGhostMaterial(material);
      swaps.push({material, mesh: child, renderOrder: child.renderOrder});
      child.material = ghostMaterial;
      child.renderOrder = 10;
    });
    return swaps;
  }

  restoreGhostedObject(swaps: PropMaterialSwap[]) {
    for (const swap of swaps) {
      const ghostMaterials = Array.isArray(swap.mesh.material) ? swap.mesh.material : [swap.mesh.material];
      swap.mesh.material = swap.material;
      swap.mesh.renderOrder = swap.renderOrder;
      for (const material of ghostMaterials) material.dispose();
    }
    swaps.length = 0;
  }

  beginPropPlacement(object: Object3D, projectionDistance: number, rotationSnapStep: number) {
    object.updateWorldMatrix(true, false);
    object.getWorldQuaternion(this.#placementQuaternion);
    this.#placementEuler.setFromQuaternion(this.#placementQuaternion, "YXZ");
    this.propPlacementDistance = MathUtils.clamp(
      projectionDistance,
      PROP_MIN_PROJECTION_DISTANCE,
      PROP_MAX_PROJECTION_DISTANCE,
    );
    this.propPlacementRotationSnapOrigin = 0;
    this.propPlacementYaw = normalizePosterRotation(
      Math.round(this.#placementEuler.y / rotationSnapStep) * rotationSnapStep,
    );
  }

  resolvedPropPlacementYaw(rotationSnapStep: number) {
    if (!this.propPlacementSnapping) return this.propPlacementYaw;
    return (
      this.propPlacementRotationSnapOrigin +
      Math.round((this.propPlacementYaw - this.propPlacementRotationSnapOrigin) / rotationSnapStep) * rotationSnapStep
    );
  }

  snapHeldPropToSupport(
    heldProp: MovablePropRecord | undefined,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    yaw: number,
  ) {
    const host = this.#host;
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    const extentX = cosine * halfWidth + sine * halfDepth;
    const extentZ = sine * halfWidth + cosine * halfDepth;
    const bottom = host.heldTargetPosition().y - halfHeight;
    let supportTop = 0;
    let supportX = host.heldTargetPosition().x;
    let supportZ = host.heldTargetPosition().z;
    for (const candidate of this.#placementSupports) {
      if (candidate.owner === heldProp) continue;
      const resolvedBounds =
        candidate.bounds ?? (candidate.object ? this.#supportBounds.setFromObject(candidate.object) : undefined);
      if (!resolvedBounds) continue;
      const supportWidth = resolvedBounds.max.x - resolvedBounds.min.x;
      const supportDepth = resolvedBounds.max.z - resolvedBounds.min.z;
      if (
        extentX * 2 > supportWidth ||
        extentZ * 2 > supportDepth ||
        host.heldTargetPosition().x + extentX < resolvedBounds.min.x ||
        host.heldTargetPosition().x - extentX > resolvedBounds.max.x ||
        host.heldTargetPosition().z + extentZ < resolvedBounds.min.z ||
        host.heldTargetPosition().z - extentZ > resolvedBounds.max.z ||
        Math.abs(bottom - resolvedBounds.max.y) > PROP_SUPPORT_SNAP_DISTANCE ||
        resolvedBounds.max.y <= supportTop
      )
        continue;
      supportTop = resolvedBounds.max.y;
      supportX = MathUtils.clamp(
        host.heldTargetPosition().x,
        resolvedBounds.min.x + extentX,
        resolvedBounds.max.x - extentX,
      );
      supportZ = MathUtils.clamp(
        host.heldTargetPosition().z,
        resolvedBounds.min.z + extentZ,
        resolvedBounds.max.z - extentZ,
      );
    }
    if (supportTop <= 0) return;
    host.heldTargetPosition().set(supportX, supportTop + halfHeight, supportZ);
  }

  pickUpProp(record: MovablePropRecord) {
    const host = this.#host;
    if (host.carriedPublicationId() || this.carriedProp) return;
    record.object.updateMatrixWorld(true);
    const placementStartPosition = record.object.getWorldPosition(new Vector3());
    const placementStartRotation = record.object.getWorldQuaternion(new Quaternion());
    if (!host.physicsWorld().holdProp(record.id)) return;
    record.placementStartPosition = placementStartPosition;
    record.placementStartRotation = placementStartRotation;
    record.placementStartScale = record.modelScale;
    this.beginPropPlacement(record.object, Math.abs(record.heldLocalPosition.z), record.rotationSnapStep);
    this.carriedProp = record;
    host.setPropTargeted(undefined);
    host.setHoveredPublicationId(undefined);
    record.ghostMaterialSwaps = this.ghostObject(record.object);
    if (host.physicsWorld().isReady) host.scene().attach(record.object);
    else {
      host.camera().add(record.object);
      record.object.position.copy(record.heldLocalPosition);
      record.object.quaternion.identity();
    }
    host.updateHeldPhysicsTarget();
    host.markWorldStateDirty();
    host.emitGameState();
  }

  dropCarriedProp(throwProp = false) {
    const host = this.#host;
    const record = this.carriedProp;
    if (!record) return;
    record.object.updateMatrixWorld(true);
    record.object.getWorldPosition(host.physicsPosePosition());
    record.object.getWorldQuaternion(host.physicsPoseRotation());
    host.scene().attach(record.object);
    host.camera().getWorldDirection(host.viewDirection());
    const linearVelocity = throwProp
      ? host
          .throwVelocity()
          .copy(host.viewDirection())
          .multiplyScalar(4.2)
          .add(host.playerVelocity())
          .setY(host.viewDirection().y * 4.2 + host.playerVelocity().y + 0.8)
      : host.playerVelocity();
    host.physicsWorld().dropProp(record.id, {
      ...(throwProp ? {angularVelocity: {x: 0.35, y: 0.6, z: 0.25}} : {}),
      linearVelocity,
      pose: host.physicsPose(),
    });
    this.restoreGhostedObject(record.ghostMaterialSwaps);
    this.carriedProp = undefined;
    if (this.modelPlacement?.id === record.id) this.modelPlacement = undefined;
    host.markWorldStateDirty();
    host.emitGameState();
  }

  cancelCarriedProp() {
    const host = this.#host;
    const record = this.carriedProp;
    if (record && this.modelPlacement?.id === record.id) {
      this.cancelModelPlacement();
      return;
    }
    const position = record?.placementStartPosition;
    const rotation = record?.placementStartRotation;
    if (!record || !position || !rotation) return;
    this.dropCarriedProp();
    host.physicsWorld().updatePropPose(record.id, {
      position: {x: position.x, y: position.y, z: position.z},
      rotation: {w: rotation.w, x: rotation.x, y: rotation.y, z: rotation.z},
    });
    record.placementStartPosition = undefined;
    record.placementStartRotation = undefined;
    if (record.placementStartScale !== undefined) this.setModelPropScale(record, record.placementStartScale);
    record.placementStartScale = undefined;
    host.markWorldStateDirty();
    host.emitGameState();
  }

  createSpawnedCeilingLight(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    locked = true,
  ) {
    const host = this.#host;
    const template = this.#builtinPropTemplates.get(asset.id);
    if (!template) throw new Error(`${asset.label} is not ready to be spawned.`);
    const object = placeClonedTemplateObject({
      assetId: asset.id,
      camera: host.camera(),
      id,
      pose,
      scale,
      template,
      viewDirection: host.viewDirection(),
    });
    object.add(...createCeilingLightRig());
    host.scene().add(object);
    return this.registerMovableProp({
      depth: template.depth * scale,
      height: template.height * scale,
      heldLocalPosition: template.heldLocalPosition.clone(),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(template.width, template.height, template.depth),
      modelScale: scale,
      object,
      ...(template.rotationSnapStep === undefined ? {} : {rotationSnapStep: template.rotationSnapStep}),
      spawnAssetId: asset.id,
      spawned: true,
      width: template.width * scale,
      ...(locked ? {locked: true} : {}),
    });
  }

  registerTelevision(saveId: string, television: ShopTelevision) {
    const host = this.#host;
    this.televisionsBySaveId.set(saveId, television);
    host.televisions().push(television);
    if (host.tvChannels().length > 0) television.setChannels(host.tvChannels());
  }

  // Shared ShopTelevision options for every set; saved tuning slots are only
  // spread when present so exactOptionalPropertyTypes stays honest.

  sharedTelevisionOptions(initialChannelId: string | undefined, initialVolume: number | undefined) {
    const host = this.#host;
    return {
      audioManager: host.audioManager(),
      onChannelChange: host.markTelevisionSettingChanged,
      onStateChange: () => host.emitGameState(),
      onVolumeChange: host.markTelevisionSettingChanged,
      tvScreenLighting: host.tvScreenLighting,
      ...(initialChannelId === undefined ? {} : {initialChannelId}),
      ...(initialVolume === undefined ? {} : {initialVolume}),
    };
  }

  modelCatalogMatches(assets: readonly ModelAsset[]) {
    return (
      assets.length === this.#customModelAssets.length &&
      assets.every((asset, index) => {
        const current = this.#customModelAssets[index];
        return current?.id === asset.id && current.label === asset.label && current.url === asset.url;
      })
    );
  }

  applyModelCatalog(assets: readonly ModelAsset[]) {
    const host = this.#host;
    if (this.modelCatalogMatches(assets)) return;
    const selectedAssetId = this.spawnablePropAssets[this.spawnablePropAssetIndex]?.id;
    const activeAssetId = this.modelPlacement
      ? this.spawnablePropAssets[this.modelPlacement.assetIndex]?.id
      : undefined;
    this.#customModelAssets = assets;
    this.spawnablePropAssets = [
      ...BUILTIN_SPAWNABLE_PROP_ASSETS,
      ...assets.map(
        (model): SpawnablePropAsset => ({
          id: model.id,
          kind: "model",
          label: model.label,
          model,
        }),
      ),
    ];
    const selectedIndex = selectedAssetId
      ? this.spawnablePropAssets.findIndex((asset) => asset.id === selectedAssetId)
      : -1;
    this.spawnablePropAssetIndex = Math.max(0, selectedIndex);
    if (this.modelPlacement && activeAssetId) {
      const activeIndex = this.spawnablePropAssets.findIndex((asset) => asset.id === activeAssetId);
      if (activeIndex < 0) this.cancelModelPlacement();
      else {
        this.modelPlacement.assetIndex = activeIndex;
        this.spawnablePropAssetIndex = activeIndex;
      }
    }
    host.emitGameState();
  }

  loadModelTemplate(asset: ModelAsset) {
    const host = this.#host;
    const cached = this.#modelTemplatePromises.get(asset.id);
    if (cached) return cached;
    const pending = MovablePropLifecycle.#modelLoader.loadAsync(asset.url).then((gltf) => {
      if (host.disposed()) {
        disposeObject(gltf.scene);
        throw new Error("The shop scene was disposed.");
      }
      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new Vector3());
      const maximumDimension = Math.max(size.x, size.y, size.z);
      if (bounds.isEmpty() || !Number.isFinite(maximumDimension) || maximumDimension <= 0) {
        disposeObject(gltf.scene);
        throw new Error("The model has no measurable bounds.");
      }
      return {
        animations: gltf.animations,
        center: bounds.getCenter(new Vector3()),
        normalizationScale: 1 / maximumDimension,
        scene: gltf.scene,
        size: size
          .multiplyScalar(1 / maximumDimension)
          .max(new Vector3(MIN_MODEL_COLLIDER_DIMENSION, MIN_MODEL_COLLIDER_DIMENSION, MIN_MODEL_COLLIDER_DIMENSION)),
      } satisfies ModelTemplate;
    });
    this.#modelTemplatePromises.set(asset.id, pending);
    void pending.catch(() => {
      if (this.#modelTemplatePromises.get(asset.id) === pending) this.#modelTemplatePromises.delete(asset.id);
    });
    return pending;
  }

  createModelPropFromTemplate(
    asset: ModelAsset,
    template: ModelTemplate,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    const host = this.#host;
    const model = cloneWithSkeleton(template.scene);
    model.name = `user-model-visual-${asset.id}`;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    // Static decoration models collapse into one draw call per material
    // signature; animated models keep their per-part nodes so mixers can
    // drive them.
    if (template.animations.length === 0) {
      const {consumed, parts} = buildMergedStaticParts(model);
      if (consumed.length > 1) {
        for (const original of consumed) original.removeFromParent();
        for (const {geometry, material} of parts) {
          const mesh = new Mesh(geometry, material);
          mesh.name = "user-model-static-parts";
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          model.add(mesh);
        }
      }
    }
    const normalizedModel = new Group();
    normalizedModel.position.copy(template.center).multiplyScalar(-template.normalizationScale);
    normalizedModel.scale.setScalar(template.normalizationScale);
    normalizedModel.add(model);
    const root = new Group();
    root.name = `user-model-${id}`;
    root.scale.setScalar(scale);
    root.add(normalizedModel);
    const targetProxy = new Mesh(
      new BoxGeometry(template.size.x, template.size.y, template.size.z),
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        opacity: 0,
        side: DoubleSide,
        transparent: true,
        visible: false,
      }),
    );
    targetProxy.name = `user-model-target-${id}`;
    targetProxy.userData.movablePropTargetProxy = true;
    root.add(targetProxy);
    if (pose) {
      root.position.copy(pose.position);
      root.quaternion.copy(pose.quaternion);
    } else {
      host.camera().getWorldDirection(host.viewDirection());
      root.position.copy(host.camera().position).addScaledVector(host.viewDirection(), 2);
    }
    host.scene().add(root);
    const modelAnimationIndex = getInitialModelAnimationIndex(template.animations, animationClip);
    const mixer = playModelAnimations(this.modelMixers, model, template.animations, modelAnimationIndex);
    return this.registerMovableProp({
      depth: template.size.z * scale,
      height: template.size.y * scale,
      heldLocalPosition: new Vector3(0, -0.18, -2),
      id,
      label: asset.label,
      ...(template.animations.length > 0
        ? {
            modelAnimationIndex,
            modelAnimations: template.animations,
          }
        : {}),
      modelAsset: asset,
      modelBaseSize: template.size.clone(),
      ...(mixer ? {modelMixer: mixer} : {}),
      modelScale: scale,
      object: root,
      spawnAssetId: asset.id,
      spawned: true,
      targetObject: targetProxy,
      width: template.size.x * scale,
    });
  }

  createPropFromBuiltinTemplate(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const host = this.#host;
    const template = this.#builtinPropTemplates.get(asset.id);
    if (!template) throw new Error(`${asset.label} is not ready to be spawned.`);
    const object = placeClonedTemplateObject({
      assetId: asset.id,
      camera: host.camera(),
      id,
      pose,
      scale,
      template,
      viewDirection: host.viewDirection(),
    });
    host.scene().add(object);
    return this.registerMovableProp({
      ...(template.density === undefined ? {} : {density: template.density}),
      // Part colliders are body-local, so they scale with the prop.
      ...(template.colliderParts
        ? {
            colliderParts: template.colliderParts.map((part) => ({
              halfExtents: {
                x: part.halfExtents.x * scale,
                y: part.halfExtents.y * scale,
                z: part.halfExtents.z * scale,
              },
              position: {
                x: part.position.x * scale,
                y: part.position.y * scale,
                z: part.position.z * scale,
              },
            })),
          }
        : {}),
      depth: template.depth * scale,
      height: template.height * scale,
      heldLocalPosition: template.heldLocalPosition.clone(),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(template.width, template.height, template.depth),
      modelScale: scale,
      object,
      ...(template.rotationSnapStep === undefined ? {} : {rotationSnapStep: template.rotationSnapStep}),
      spawnAssetId: asset.id,
      spawned: true,
      ...(template.staticWhenPlaced === undefined ? {} : {staticWhenPlaced: template.staticWhenPlaced}),
      width: template.width * scale,
    });
  }

  /**
   * True while the world has not yet absorbed the given default-prop
   * seeding pass. Passes are cumulative: a fresh world runs every pass,
   * while saves only run passes introduced after their recorded version.
   */
  needsSeedPass(version: number) {
    const host = this.#host;
    return worldSaveSeedingVersion(host.pendingWorldSave()) < version;
  }

  /**
   * Brings the world up to the current seeding version by running every
   * missing pass. Fresh worlds get each pass at its designed spots; older
   * saves migrate pass by pass. Worlds that already absorbed a pass are
   * authoritative: whatever the players kept, moved, or deleted stays
   * as-is.
   */
  seedDefaultProps() {
    if (this.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) this.seedInitialDefaults();
    if (this.needsSeedPass(WORLD_SEEDING_VERSION)) this.seedCeilingLights();
    else this.restoreSavedCeilingLights();
  }

  /**
   * Seeding pass 1: injects the shop's original movable defaults (lane
   * arcade cabinet(s), the shop's CRT television) as ordinary spawned
   * props. Legacy saves predate seeded props, so they migrate here too.
   */
  seedInitialDefaults() {
    const host = this.#host;
    try {
      const crtAsset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((asset) => asset.id === BUILTIN_CRT_TV_ASSET_ID);
      if (crtAsset) {
        // Menu-spawned CRTs default to 1x; the old hard-wired fixture was
        // 2x. Seed at player scale, resting on the television shelf.
        const seededScale = DEFAULT_MODEL_SCALE;
        const unitHalfHeight = SHOP_MODEL_TELEVISION_SIZE.height / (2 * SHOP_MODEL_TELEVISION_SCALE);
        this.createSpawnedCrtTelevision(crtAsset, MODEL_TELEVISION_PHYSICS_ID, seededScale, {
          position: {
            x: -0.72,
            y: 0.91 + unitHalfHeight * seededScale,
            z: 13.82 + 0.183 * seededScale,
          },
          quaternion: IDENTITY_WORLD_QUATERNION,
        });
      }
      const cabinetAsset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((asset) => asset.id === BUILTIN_ARCADE_CABINET_ASSET_ID);
      if (cabinetAsset)
        for (const [laneIndex, placement] of ARCADE_CABINET_PLACEMENTS.entries()) {
          const quaternion = new Quaternion().setFromAxisAngle(host.upAxis(), placement.rotationY);
          this.createSpawnedArcadeCabinet(cabinetAsset, `arcade-cabinet-${laneIndex + 1}`, DEFAULT_MODEL_SCALE, {
            position: {
              x: placement.position[0],
              y: placement.position[1],
              z: placement.position[2],
            },
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          });
        }
    } catch (error) {
      if (DEV && !host.disposed()) console.warn("Afterleaf could not seed its default props.", error);
    }
    // Persist promptly so legacy worlds migrate past pass 1 and later
    // deletions of the defaults stick across reloads.
    host.markWorldStateDirty();
  }

  /**
   * Seeding pass 2: the hard-wired ceiling light grid becomes ordinary
   * spawned props, deletable and movable like any other prop.
   */
  seedCeilingLights() {
    const host = this.#host;
    const asset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((candidate) => candidate.id === BUILTIN_CEILING_LIGHT_ASSET_ID);
    if (!asset) return;
    try {
      for (const [index, placement] of CEILING_LIGHT_PLACEMENTS.entries()) {
        const quaternion = new Quaternion().setFromAxisAngle(host.upAxis(), placement.rotationY);
        this.createSpawnedCeilingLight(asset, `ceiling-light-${index + 1}`, DEFAULT_MODEL_SCALE, {
          position: {
            x: placement.x,
            y: CEILING_LIGHT_ORIGIN_Y,
            z: placement.z,
          },
          quaternion: {
            w: quaternion.w,
            x: quaternion.x,
            y: quaternion.y,
            z: quaternion.z,
          },
        });
      }
    } catch (error) {
      if (DEV && !host.disposed()) console.warn("Afterleaf could not seed the ceiling lights.", error);
    }
    // Persist promptly so worlds migrate past pass 2 and light deletions
    // stay gone across reloads.
    host.markWorldStateDirty();
  }

  /**
   * Spawns saved ceiling-light props immediately on boot so the shop is
   * lit without waiting for the catalog-gated model-prop restore. Later,
   * #takeCompatibleWorldSave adopts these registrations in place of their
   * save entries; until then they simply render from the last save.
   */
  restoreSavedCeilingLights() {
    const host = this.#host;
    const save = host.pendingWorldSave();
    if (!save) return;
    const asset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((candidate) => candidate.id === BUILTIN_CEILING_LIGHT_ASSET_ID);
    if (!asset) return;
    for (const savedProp of save.modelProps ?? []) {
      if (savedProp.assetId !== BUILTIN_CEILING_LIGHT_ASSET_ID || this.records.has(savedProp.id)) continue;
      try {
        this.createSpawnedCeilingLight(asset, savedProp.id, savedProp.scale, savedProp.pose, savedProp.locked === true);
      } catch (error) {
        if (DEV && !host.disposed()) console.warn(`Afterleaf could not restore ceiling light ${savedProp.id}.`, error);
      }
    }
  }

  createSpawnedCrtTelevision(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const host = this.#host;
    const tableMaterial = host.televisionTableMaterial();
    if (!tableMaterial) throw new Error("CRT television materials are not ready.");
    const television = new ShopTelevision({
      ...this.sharedTelevisionOptions(host.savedTelevisionChannels()[id], host.savedTelevisionVolumes()[id]),
      model: {
        // The CRT GLB predates the control strip; invisible knob targets
        // would only cost draw calls, and screen clicks already drive power.
        controls: false,
        mergeStaticParts: true,
        screenAspect: 4 / 3,
        screenNodeName: "Screen",
        screenSafeArea: CRT_TV_SAFE_AREA,
        scale: SHOP_MODEL_TELEVISION_SCALE,
        url: crtTvModelUrl,
      },
      parent: host.scene(),
      tableMaterial,
    });
    television.object.name = id;
    television.object.scale.setScalar(scale);
    if (pose) {
      television.object.position.copy(pose.position);
      television.object.quaternion.copy(pose.quaternion);
    } else {
      host.camera().getWorldDirection(host.viewDirection());
      television.object.position.copy(host.camera().position).addScaledVector(host.viewDirection(), 2);
    }
    this.registerTelevision(id, television);
    const prop = this.registerMovableProp({
      density: 45,
      depth: SHOP_MODEL_TELEVISION_SIZE.depth * scale,
      height: SHOP_MODEL_TELEVISION_SIZE.height * scale,
      heldLocalPosition: new Vector3(0, -0.12, -1.45),
      id,
      label: asset.label,
      modelBaseSize: new Vector3(
        SHOP_MODEL_TELEVISION_SIZE.width,
        SHOP_MODEL_TELEVISION_SIZE.height,
        SHOP_MODEL_TELEVISION_SIZE.depth,
      ),
      modelScale: scale,
      object: television.object,
      spawnAssetId: asset.id,
      spawned: true,
      targetable: false,
      width: SHOP_MODEL_TELEVISION_SIZE.width * scale,
    });
    this.televisionProps.set(television, prop);
    return prop;
  }

  /**
   * Wraps a cabinet's scene object as a movable prop: released cabinets
   * simulate like the CRT televisions (gravity, tippable, bumpable) unless
   * the player pins them with the lock toggle. The cabinet stays fully
   * interactive while placed.
   */
  registerArcadeCabinetProp(
    cabinet: ShopArcadeCabinet,
    registration: {
      id: string;
      label: string;
      scale: number;
      spawnAssetId?: string;
      spawned: boolean;
    },
  ) {
    const host = this.#host;
    host.arcadeCabinets().push(cabinet);
    const size = ARCADE_CABINET_BASE_SIZE;
    const scale = registration.scale;
    const prop = this.registerMovableProp({
      density: ARCADE_CABINET_DENSITY,
      depth: size.depth * scale,
      height: size.height * scale,
      heldLocalPosition: ARCADE_CABINET_HELD_LOCAL_POSITION.clone(),
      id: registration.id,
      label: registration.label,
      modelBaseSize: new Vector3(size.width, size.height, size.depth),
      modelScale: scale,
      object: cabinet.object,
      ...(registration.spawnAssetId ? {spawnAssetId: registration.spawnAssetId} : {}),
      spawned: registration.spawned,
      // Cabinets simulate like the CRT televisions once released: gravity
      // applies and the player can bump them unless they are locked.
      targetable: false,
      width: size.width * scale,
    });
    this.arcadeProps.set(cabinet, prop);
    return prop;
  }

  createSpawnedArcadeCabinet(
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) {
    const host = this.#host;
    const cabinet = new ShopArcadeCabinet({
      parent: host.scene(),
      position: [0, 0, 0],
      audioManager: host.audioManager(),
      onInteractRequest: (target) => host.enterArcadeBrowsing(target),
      onStateChange: () => host.emitGameState(),
    });
    cabinet.object.name = id;
    if (pose) {
      cabinet.object.position.copy(pose.position);
      cabinet.object.quaternion.copy(pose.quaternion);
    } else {
      host.camera().getWorldDirection(host.viewDirection());
      cabinet.object.position.copy(host.camera().position).addScaledVector(host.viewDirection(), 2);
    }
    cabinet.object.scale.setScalar(scale);
    // Spawned cabinets persist through modelProps (asset id + scale + pose).
    return this.registerArcadeCabinetProp(cabinet, {
      id,
      label: asset.label,
      scale,
      spawnAssetId: BUILTIN_ARCADE_CABINET_ASSET_ID,
      spawned: true,
    });
  }

  createModelTelevisionProp(
    asset: ModelAsset,
    template: ModelTemplate,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    const host = this.#host;
    const tableMaterial = host.televisionTableMaterial();
    if (!tableMaterial) throw new Error("Television materials are not ready.");
    const {center, normalizationScale, size} = template;
    const model = cloneWithSkeleton(template.scene);
    model.name = `user-model-television-visual-${asset.id}`;
    const normalizedModel = new Group();
    normalizedModel.position.copy(center).multiplyScalar(-normalizationScale);
    normalizedModel.scale.setScalar(normalizationScale);
    normalizedModel.add(model);
    const television = new ShopTelevision({
      ...this.sharedTelevisionOptions(host.savedTelevisionChannels()[id], host.savedTelevisionVolumes()[id]),
      model: {
        audioPosition: [0, 0, 0],
        center: [0, 0, 0],
        controls: false,
        interactionRadius: Math.hypot(size.x, size.y, size.z) / 2,
        label: asset.label,
        object: normalizedModel,
        screenNodeName: MODEL_TELEVISION_SCREEN_NODE_NAME,
        screenSafeArea: {bottom: 0, left: 0, right: 0, top: 0},
        scale: 1,
      },
      parent: host.scene(),
      tableMaterial,
    });
    television.object.name = id;
    television.object.scale.setScalar(scale);
    if (pose) {
      television.object.position.copy(pose.position);
      television.object.quaternion.copy(pose.quaternion);
    } else {
      host.camera().getWorldDirection(host.viewDirection());
      television.object.position.copy(host.camera().position).addScaledVector(host.viewDirection(), 2);
    }
    this.registerTelevision(id, television);
    const modelAnimationIndex = getInitialModelAnimationIndex(template.animations, animationClip);
    const mixer = playModelAnimations(this.modelMixers, model, template.animations, modelAnimationIndex);
    const prop = this.registerMovableProp({
      density: MODEL_TELEVISION_DENSITY,
      depth: size.z * scale,
      height: size.y * scale,
      heldLocalPosition: new Vector3(0, -0.18, -2),
      id,
      label: asset.label,
      ...(template.animations.length > 0
        ? {
            modelAnimationIndex,
            modelAnimations: template.animations,
          }
        : {}),
      modelAsset: asset,
      modelBaseSize: size.clone(),
      ...(mixer ? {modelMixer: mixer} : {}),
      modelScale: scale,
      object: television.object,
      spawnAssetId: asset.id,
      spawned: true,
      targetable: false,
      width: size.x * scale,
    });
    this.televisionProps.set(television, prop);
    return prop;
  }

  async createSpawnableProp(
    asset: SpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
    animationClip?: string | null,
  ) {
    if (asset.kind === "model") {
      const template = await this.loadModelTemplate(asset.model);
      if (findModelTelevisionScreen(template.scene, MODEL_TELEVISION_SCREEN_NODE_NAME))
        return this.createModelTelevisionProp(asset.model, template, id, scale, pose, animationClip);
      return this.createModelPropFromTemplate(asset.model, template, id, scale, pose, animationClip);
    }
    if (asset.id === BUILTIN_CRT_TV_ASSET_ID) return this.createSpawnedCrtTelevision(asset, id, scale, pose);
    if (asset.id === BUILTIN_ARCADE_CABINET_ASSET_ID) return this.createSpawnedArcadeCabinet(asset, id, scale, pose);
    if (asset.id === BUILTIN_CEILING_LIGHT_ASSET_ID) return this.createSpawnedCeilingLight(asset, id, scale, pose);
    if (asset.id === BUILTIN_TRASH_CAN_ASSET_ID) {
      const modelAsset: ModelAsset = {
        id: asset.id,
        label: asset.label,
        url: trashCanModelUrl,
      };
      const template = await this.loadModelTemplate(modelAsset);
      return this.createModelPropFromTemplate(modelAsset, template, id, scale, pose, animationClip);
    }
    return this.createPropFromBuiltinTemplate(asset, id, scale, pose);
  }

  async #restoreSavedModelProp(
    savedProp: WorldModelPropSave,
    assetsById: ReadonlyMap<string, SpawnablePropAsset>,
    unresolved: WorldModelPropSave[],
  ) {
    const host = this.#host;
    if (this.records.has(savedProp.id)) return true;
    const asset = assetsById.get(savedProp.assetId);
    if (!asset) {
      // The content pack renamed or dropped this asset; the saved prop
      // cannot come back, but it must not block anything else either.
      if (DEV && !this.#missingPropAssetIds.has(savedProp.assetId)) {
        this.#missingPropAssetIds.add(savedProp.assetId);
        console.warn(
          `Afterleaf cannot restore prop ${savedProp.id}: its asset "${savedProp.assetId}" is no longer in the spawnable catalog.`,
        );
      }
      unresolved.push(savedProp);
      return true;
    }
    // A template-spawned builtin may still be loading its template;
    // defer quietly, #cacheBuiltinPropTemplate retries once it lands.
    if (
      TEMPLATE_SPAWNED_BUILTIN_ASSET_IDS.has(savedProp.assetId) &&
      !this.#builtinPropTemplates.has(savedProp.assetId)
    ) {
      unresolved.push(savedProp);
      return true;
    }
    try {
      const record = await this.createSpawnableProp(
        asset,
        savedProp.id,
        savedProp.scale,
        savedProp.pose,
        savedProp.animationClip,
      );
      if (host.disposed()) return false;
      if (this.records.get(savedProp.id) !== record) this.removeSpawnedProp(record);
      else if (savedProp.locked && !record.locked) {
        record.locked = true;
        host.physicsWorld().setPropLocked(record.id, true);
      }
    } catch (error) {
      if (host.disposed()) return false;
      unresolved.push(savedProp);
      if (DEV) console.warn(`Afterleaf could not restore prop ${asset.id}.`, error);
    }
    return true;
  }

  async restoreSavedModelProps() {
    const host = this.#host;
    if (this.#restoreActive || this.pendingModelPropSaves.length === 0) return;
    this.#restoreActive = true;
    const assetsById = new Map(this.spawnablePropAssets.map((asset) => [asset.id, asset]));
    const unresolved: WorldModelPropSave[] = [];
    const pending = this.pendingModelPropSaves;
    let restoreAgain = false;
    try {
      for (const savedProp of pending)
        if (!(await this.#restoreSavedModelProp(savedProp, assetsById, unresolved))) return;
      restoreAgain = this.pendingModelPropSaves !== pending;
      if (!restoreAgain) this.pendingModelPropSaves = unresolved;
      host.emitGameState();
    } finally {
      this.#restoreActive = false;
      const retryRequested = this.#restoreRetry;
      this.#restoreRetry = false;
      if (!host.disposed() && (retryRequested || restoreAgain)) void this.restoreSavedModelProps();
    }
  }

  async startModelPlacement(assetIndex: number) {
    const host = this.#host;
    if (this.spawnablePropAssets.length === 0) {
      this.modelImportError = "No movable prop assets are available.";
      host.emitGameState();
      return;
    }
    const modelPropCount =
      this.pendingModelPropSaves.length + [...this.records.values()].filter((record) => record.spawned).length;
    if (modelPropCount >= MAX_USER_MODEL_PROP_COUNT) {
      this.modelImportError = `The shop can contain at most ${MAX_USER_MODEL_PROP_COUNT} model props.`;
      host.emitGameState();
      return;
    }
    if (this.modelPlacement || host.carriedPublicationId() || this.carriedProp) return;
    const normalizedIndex = (assetIndex + this.spawnablePropAssets.length) % this.spawnablePropAssets.length;
    const asset = this.spawnablePropAssets[normalizedIndex];
    if (!asset) return;
    const revision = (this.modelPlacementRevision += 1);
    const placement: ModelPlacementSession = {
      assetIndex: normalizedIndex,
      id: crypto.randomUUID(),
      revision,
    };
    this.modelPlacement = placement;
    this.spawnablePropAssetIndex = normalizedIndex;
    this.modelImportError = undefined;
    host.emitGameState();
    try {
      const record = await this.createSpawnableProp(asset, placement.id, DEFAULT_MODEL_SCALE);
      if (host.disposed() || this.modelPlacement !== placement || placement.revision !== revision) {
        this.removeSpawnedProp(record);
        return;
      }
      this.pickUpProp(record);
    } catch (error) {
      if (host.disposed()) return;
      if (this.modelPlacement !== placement) return;
      this.modelPlacement = undefined;
      this.modelImportError = error instanceof Error ? error.message : "The prop could not be loaded.";
      host.emitGameState();
    }
  }

  cancelModelPlacement() {
    const host = this.#host;
    const placement = this.modelPlacement;
    if (!placement) return;
    this.modelPlacementRevision += 1;
    this.modelPlacement = undefined;
    const record = this.records.get(placement.id);
    if (record) this.removeSpawnedProp(record);
    else host.emitGameState();
  }

  cycleModelPlacement(direction: -1 | 1) {
    const placement = this.modelPlacement;
    if (!placement || this.spawnablePropAssets.length < 2) return;
    const nextIndex =
      (placement.assetIndex + direction + this.spawnablePropAssets.length) % this.spawnablePropAssets.length;
    this.cancelModelPlacement();
    void this.startModelPlacement(nextIndex);
  }

  setModelPropScale(record: MovablePropRecord, scale: number) {
    const host = this.#host;
    const baseSize = record.modelBaseSize;
    if (!baseSize) return;
    const nextScale = MathUtils.clamp(scale, MIN_MODEL_SCALE, MAX_MODEL_SCALE);
    if (nextScale === record.modelScale) return;
    record.modelScale = nextScale;
    record.object.scale.setScalar(nextScale);
    record.halfWidth = (baseSize.x * nextScale) / 2;
    record.halfHeight = (baseSize.y * nextScale) / 2;
    record.halfDepth = (baseSize.z * nextScale) / 2;
    host.physicsWorld().updatePropSize(record.id, {
      depth: record.halfDepth * 2,
      height: record.halfHeight * 2,
      width: record.halfWidth * 2,
    });
    host.updateHeldPhysicsTarget();
    host.markWorldStateDirty();
    host.emitGameState();
  }

  modelAnimationLabel(record: MovablePropRecord) {
    const animations = record.modelAnimations;
    const index = record.modelAnimationIndex;
    if (!animations || index === undefined) return;
    if (index < 0) return "Off";
    const name = animations[index]?.name.trim();
    if (!name) return `Clip ${index + 1}`;
    return name.split("|").at(-1) ?? name;
  }

  cycleModelAnimation(record: MovablePropRecord, direction: -1 | 1) {
    const host = this.#host;
    const animations = record.modelAnimations;
    const mixer = record.modelMixer;
    if (!animations || animations.length === 0 || !mixer) return;
    const currentSlot = (record.modelAnimationIndex ?? 0) + 1;
    const slotCount = animations.length + 1;
    const nextSlot = (currentSlot + direction + slotCount) % slotCount;
    const nextIndex = nextSlot - 1;
    mixer.stopAllAction();
    const clip = animations[nextIndex];
    if (clip) mixer.clipAction(clip).reset().play();
    record.modelAnimationIndex = nextIndex;
    host.markWorldStateDirty();
    host.emitGameState();
  }

  /** Drops the discard volume that lived inside a deleted trash can. */
  removeSpawnedProp(record: MovablePropRecord) {
    const host = this.#host;
    if (!record.spawned) return;
    if (this.carriedProp === record) {
      this.restoreGhostedObject(record.ghostMaterialSwaps);
      this.carriedProp = undefined;
    }
    if (host.targetedProp() === record) host.setPropTargeted(undefined);
    record.object.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const index = this.targetMeshes.indexOf(object);
      if (index >= 0) this.targetMeshes.splice(index, 1);
      delete object.userData.movablePropId;
      if (object.userData.movablePropTargetProxy !== true) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    const supportIndex = this.#placementSupports.findIndex((support) => support.owner === record);
    if (supportIndex >= 0) this.#placementSupports.splice(supportIndex, 1);
    record.modelMixer?.stopAllAction();
    if (record.modelMixer) this.modelMixers.delete(record.modelMixer);
    for (const [television, televisionProp] of this.televisionProps) {
      if (televisionProp !== record) continue;
      if (host.targetedTelevision() === television) host.setTelevisionTargeted(false);
      this.televisionProps.delete(television);
      const televisionIndex = host.televisions().indexOf(television);
      if (televisionIndex >= 0) host.televisions().splice(televisionIndex, 1);
      for (const [saveId, savedTelevision] of this.televisionsBySaveId) {
        if (savedTelevision === television) this.televisionsBySaveId.delete(saveId);
      }
      television.dispose();
      break;
    }
    for (const [cabinet, cabinetProp] of this.arcadeProps) {
      if (cabinetProp !== record) continue;
      if (host.targetedArcadeCabinet() === cabinet) host.setArcadeTargeted(undefined);
      if (host.activeArcadeCabinet() === cabinet) host.setActiveArcadeCabinet(undefined);
      this.arcadeProps.delete(cabinet);
      const cabinetIndex = host.arcadeCabinets().indexOf(cabinet);
      if (cabinetIndex >= 0) host.arcadeCabinets().splice(cabinetIndex, 1);
      // Disposing kills any emulator session attached to this cabinet.
      cabinet.dispose();
      break;
    }
    // The discard volume lives inside the bin; losing a bin loses its volume.
    host.discardBin().detach(record);
    host.physicsWorld().removeProp(record.id);
    if (this.records.get(record.id) === record) this.records.delete(record.id);
    record.object.removeFromParent();
    host.markWorldStateDirty();
    host.emitGameState();
  }
}
