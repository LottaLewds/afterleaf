import {Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type AnimationMixer, type Object3D} from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {DEV} from "solid-js";
import trashCanModelUrl from "~/assets/models/trash_can.glb?url";
import {BUILTIN_TRASH_CAN_ASSET_ID} from "~/game/propAssetIds";
import {DEFAULT_MODEL_SCALE} from "~/game/propTuning";
import {createSignVisual, SIGN_TEXTURE_MAX_ANISOTROPY} from "~/game/signs/ShopSignSystem";
import {playModelAnimations} from "~/game/interior/lightingProps";
import {INITIAL_WORLD_SEEDING_VERSION} from "~/game/worldSave";
import {
  SHOP_PHYSICS_TRASH_HALF_EXTENT,
  SHOP_PHYSICS_TRASH_POSITION_X,
  SHOP_PHYSICS_TRASH_POSITION_Z,
} from "~/game/ShopPhysicsWorld";
import {disposeObject} from "~/game/threeDisposal";

export const TRASH_CAN_HEIGHT = 0.9;
export const TRASH_CAN_PROP_ID = "discard-trashcan";
export const TRASH_CAN_SIZE = SHOP_PHYSICS_TRASH_HALF_EXTENT * 2;

/** Minimal movable-prop surface the discard bin needs to inspect. */
export type DiscardBinTargetRecord = {
  halfWidth: number;
  halfHeight: number;
  id: string;
  object: Object3D;
};

type MovablePropLike = DiscardBinTargetRecord & {
  currentPosition: Vector3;
  ghostMaterialSwaps: unknown[];
};

/**
 * Scene services the discard bin needs while seeding its prop and syncing
 * its physics pose with the shop.
 */
export type DiscardBinHost = {
  ghostObject: (object: Object3D) => unknown[];
  /** Returns the movable-prop record for an id, if registered. */
  getMovableProp: (id: string) => MovablePropLike | undefined;
  isCarried: (record: DiscardBinTargetRecord) => boolean;
  isDisposed: () => boolean;
  modelMixers: Set<AnimationMixer>;
  needsSeedPass: (version: number) => boolean;
  registerMovableProp: (registration: unknown) => unknown;
  markWorldStateDirty: () => void;
  updatePropPose: (
    id: string,
    pose: {
      position: Vector3;
      rotation: {x: number; y: number; z: number; w: number};
    },
  ) => void;
};

/**
 * The discard bin: a seeded, deletable prop that accepts thrown-away books.
 * Owns the bin's group, saved position, and the invisible discard volumes
 * attached to every trash-can prop in the world.
 */
export class DiscardBin {
  readonly group = new Group();
  readonly position = new Vector3(SHOP_PHYSICS_TRASH_POSITION_X, TRASH_CAN_HEIGHT / 2, SHOP_PHYSICS_TRASH_POSITION_Z);
  /** Live raycast target list; treat as read-only outside the class. */
  volumeMeshes: Mesh[] = [];
  readonly #volumes = new Map<string, Mesh>();
  readonly #host: DiscardBinHost;

  constructor(host: DiscardBinHost) {
    this.#host = host;
  }

  /**
   * Seeds the discard bin as a spawned, deletable prop persisted through
   * modelProps. Worlds that already seeded skip straight to their saved
   * props; every trash can gets its invisible discard volume via attach().
   */
  async create(parent: Group) {
    if (!this.#host.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) return;
    const trashcan = this.group;
    trashcan.name = TRASH_CAN_PROP_ID;
    trashcan.position.copy(this.position);
    parent.add(trashcan);

    const sign = createSignVisual(
      "DISCARDS  /  廃棄",
      "REMOVE FROM LIBRARY",
      1.35,
      0.42,
      "#f3ecdc",
      "#7b302a",
      SIGN_TEXTURE_MAX_ANISOTROPY,
    );
    sign.position.set(0, 1.26 - TRASH_CAN_HEIGHT / 2, 0.025);
    trashcan.add(sign);
    this.#host.registerMovableProp({
      depth: TRASH_CAN_SIZE,
      height: TRASH_CAN_HEIGHT,
      heldLocalPosition: new Vector3(0, -0.65, -1.8),
      id: TRASH_CAN_PROP_ID,
      label: "trash can",
      modelBaseSize: new Vector3(TRASH_CAN_SIZE, TRASH_CAN_HEIGHT, TRASH_CAN_SIZE),
      modelScale: DEFAULT_MODEL_SCALE,
      object: trashcan,
      // Matches the spawn-menu trash can: a dynamic body that can be
      // bumped, tipped, locked, or deleted like any other prop.
      spawnAssetId: BUILTIN_TRASH_CAN_ASSET_ID,
      spawned: true,
      width: TRASH_CAN_SIZE,
    });

    try {
      const gltf = await new GLTFLoader().loadAsync(trashCanModelUrl);
      if (this.#host.isDisposed()) {
        disposeObject(gltf.scene);
        return;
      }

      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene);
      const height = bounds.max.y - bounds.min.y;
      if (!(height > 0)) {
        disposeObject(gltf.scene);
        throw new Error("The trash can model has no measurable height.");
      }

      const scale = TRASH_CAN_HEIGHT / height;
      const center = bounds.getCenter(new Vector3());
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale - TRASH_CAN_HEIGHT / 2, -center.z * scale);
      gltf.scene.name = "trash-can-model";
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      trashcan.add(gltf.scene);
      playModelAnimations(this.#host.modelMixers, gltf.scene, gltf.animations);
      const trashcanProp = this.#host.getMovableProp(TRASH_CAN_PROP_ID);
      if (trashcanProp && this.#host.isCarried(trashcanProp))
        trashcanProp.ghostMaterialSwaps.push(...this.#host.ghostObject(gltf.scene));
    } catch (error) {
      if (DEV && !this.#host.isDisposed()) console.warn("Afterleaf could not load the trash can model.", error);
    }
  }

  setPosition(x: number, z: number, markDirty = true) {
    this.position.set(x, TRASH_CAN_HEIGHT / 2, z);
    this.group.position.copy(this.position);
    this.#host.getMovableProp(TRASH_CAN_PROP_ID)?.currentPosition.copy(this.position);
    this.#host.updatePropPose(TRASH_CAN_PROP_ID, {
      position: this.position,
      rotation: this.group.quaternion,
    });
    if (markDirty) this.#host.markWorldStateDirty();
  }

  attach(record: DiscardBinTargetRecord) {
    if (this.#volumes.has(record.id)) return;
    const width = record.halfWidth * 2;
    const mesh = new Mesh(
      new BoxGeometry(width * 1.31, record.halfHeight * 3.22, width * 1.31),
      new MeshBasicMaterial({
        depthWrite: false,
        opacity: 0,
        transparent: true,
      }),
    );
    mesh.name = "discard-trashcan-target";
    mesh.userData.propId = record.id;
    mesh.position.set(0, record.halfHeight * 0.55, 0);
    record.object.add(mesh);
    this.#volumes.set(record.id, mesh);
    this.#refreshVolumeMeshes();
  }

  detach(record: DiscardBinTargetRecord) {
    const mesh = this.#volumes.get(record.id);
    if (!mesh) return;
    this.#volumes.delete(record.id);
    this.#refreshVolumeMeshes();
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }

  #refreshVolumeMeshes() {
    this.volumeMeshes = [...this.#volumes.values()];
  }
}
