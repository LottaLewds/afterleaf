import {type Group, MeshStandardMaterial, Quaternion, Vector3, type Object3D, type TextureLoader} from "three";
import {ShopTelevision, type ShopTelevisionOptions} from "~/game/ShopTelevision";
import {BUILTIN_CRT_TV_ASSET_ID} from "~/game/propAssetIds";
import {BUILTIN_SPAWNABLE_PROP_ASSETS} from "~/game/propTemplates";
import {DEFAULT_MODEL_SCALE} from "~/game/propTuning";
import {INITIAL_WORLD_SEEDING_VERSION} from "~/game/worldSave";
import type {WorldModelPropSave} from "~/game/worldSave";
import {SHOP_MODEL_TELEVISION_SIZE} from "~/game/shopLayout";
import {SHOP_THEATRE, SHOP_TV_CAVE, SHOP_TV_CAVE_SHELF_BOARD_Y_CENTERS} from "~/game/shopExpansionLayout";
import {SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";
import {loadUpholsteryTextures} from "~/game/upholsteryMaterials";
import {createUpholsteryMaterial} from "~/game/upholsteryMaterials";
import type {AddBox} from "~/game/interior/interiorPrimitives";
import type {BuiltinSpawnablePropAsset} from "~/game/propTemplates";

const UP_AXIS = new Vector3(0, 1, 0);

export type TelevisionRoomsDeps = {
  addBox: AddBox;
  createSpawnedCrtTelevision: (
    asset: BuiltinSpawnablePropAsset,
    id: string,
    scale: number,
    pose?: WorldModelPropSave["pose"],
  ) => unknown;
  needsSeedPass: (version: number) => boolean;
  registerPropPlacementSupport: (object: Object3D) => void;
  registerTelevision: (saveId: string, television: ShopTelevision) => void;
  sharedTelevisionOptions: (
    initialChannelId: string | undefined,
    initialVolume: number | undefined,
  ) => SharedTelevisionOptions;
  textureLoader: {loadAsync(url: string): Promise<unknown>};
  maxTextureAnisotropy: number;
};

export const FIXED_TELEVISION_SAVE_ID = "fixed";
export const THEATRE_TELEVISION_SAVE_ID = "moonlight-theatre";

export type SharedTelevisionOptions = Omit<
  ShopTelevisionOptions,
  "flatScreen" | "initialChannelId" | "initialVolume" | "model" | "parent" | "position" | "rotationY" | "tableMaterial"
> & {
  initialChannelId?: string;
  initialVolume?: number;
};

type TelevisionRoomsDependencies = TelevisionRoomsDeps & {
  televisionChannels?: Readonly<Record<string, string>> | undefined;
  televisionVolumes?: Readonly<Record<string, number>> | undefined;
};

const seedCaveCrtTelevisions = (rowYs: readonly number[], deps: TelevisionRoomsDependencies) => {
  const crtAsset = BUILTIN_SPAWNABLE_PROP_ASSETS.find((asset) => asset.id === BUILTIN_CRT_TV_ASSET_ID);
  if (!crtAsset) return;
  const addCrt = (
    wall: "east" | "north" | "south" | "west",
    row: number,
    column: number,
    position: readonly [x: number, y: number, z: number],
    rotationY: number,
  ) => {
    const id = `tv-cave-v6-${wall}-${row + 1}-${column + 1}`;
    const quaternion = new Quaternion().setFromAxisAngle(UP_AXIS, rotationY);
    deps.createSpawnedCrtTelevision(crtAsset, id, DEFAULT_MODEL_SCALE, {
      position: {x: position[0], y: position[1], z: position[2]},
      quaternion: {
        w: quaternion.w,
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
      },
    });
  };

  const eastColumnZs = [14.6, 16.3, 18, 19.7, 21.4] as const;
  const westColumnZs = [14.7, 16.3, 17.9] as const;
  const crossWallColumnXs = [17.5, 19.5, 21.5] as const;
  for (const [row, y] of rowYs.entries()) {
    for (const [column, z] of eastColumnZs.entries()) addCrt("east", row, column, [22.4, y, z], Math.PI / 2);
    for (const [column, z] of westColumnZs.entries()) addCrt("west", row, column, [17.6, y, z], -Math.PI / 2);
    for (const [column, x] of crossWallColumnXs.entries()) {
      addCrt("north", row, column, [x, y, 14.4], Math.PI);
      addCrt("south", row, column, [x, y, 22.2], 0);
    }
  }
};

const createTelevisionShelfBank = (
  parent: Group,
  shelfMaterial: MeshStandardMaterial,
  shelfYs: readonly number[],
  deps: TelevisionRoomsDependencies,
  axis: "x" | "z",
  backingPosition: readonly [x: number, y: number, z: number],
  shelfPosition: readonly [x: number, z: number],
  length: number,
) => {
  const alongX = axis === "x";
  deps.addBox(parent, alongX ? [length, 4.05, 0.34] : [0.34, 4.05, length], backingPosition, shelfMaterial, true);
  for (const y of shelfYs) {
    const shelf = deps.addBox(
      parent,
      alongX ? [length, 0.1, 1.2] : [1.2, 0.1, length],
      [shelfPosition[0], y, shelfPosition[1]],
      shelfMaterial,
      true,
    );
    deps.registerPropPlacementSupport(shelf);
  }
};

const televisionInitialState = (deps: TelevisionRoomsDependencies) => ({
  initialChannelId:
    deps.televisionChannels?.[THEATRE_TELEVISION_SAVE_ID] ?? deps.televisionChannels?.[FIXED_TELEVISION_SAVE_ID],
  initialVolume:
    deps.televisionVolumes?.[THEATRE_TELEVISION_SAVE_ID] ?? deps.televisionVolumes?.[FIXED_TELEVISION_SAVE_ID],
});

/**
 * Builds the moonlight-theatre flat screen and the TV-cave shelf banks
 * (seeding their CRT stock on first pass).
 */
export const createTelevisionRooms = (
  parent: Group,
  woodMaterial: MeshStandardMaterial,
  deps: TelevisionRoomsDependencies,
) => {
  const upholsteryTextures = loadUpholsteryTextures(deps.textureLoader as TextureLoader, deps.maxTextureAnisotropy);
  const acousticMaterial = createUpholsteryMaterial(upholsteryTextures);
  const initialState = televisionInitialState(deps);
  const theatreTelevision = new ShopTelevision({
    ...deps.sharedTelevisionOptions(initialState.initialChannelId, initialState.initialVolume),
    flatScreen: {height: 6.6, width: 11.75},
    parent,
    position: [-33.78, 9.75, SHOP_THEATRE.centerZ],
    rotationY: Math.PI / 2,
    tableMaterial: woodMaterial,
  });
  theatreTelevision.object.name = `${THEATRE_TELEVISION_SAVE_ID}-screen`;
  deps.registerTelevision(THEATRE_TELEVISION_SAVE_ID, theatreTelevision);

  const theatreTrimMaterial = new MeshStandardMaterial({
    color: "#120f17",
    metalness: 0.16,
    roughness: 0.86,
  });
  deps.addBox(
    parent,
    [1.45, 0.32, 14.5],
    [-33.05, SHOP_UPPER_FLOOR_Y + 0.16, SHOP_THEATRE.centerZ],
    theatreTrimMaterial,
  );
  for (const z of [12.35, 24.65]) deps.addBox(parent, [0.3, 7.35, 0.34], [-33.64, 9.78, z], theatreTrimMaterial);
  deps.addBox(parent, [0.3, 0.3, 12.65], [-33.64, 13.42, SHOP_THEATRE.centerZ], theatreTrimMaterial);
  for (const x of [-20, -24, -28, -32]) {
    for (const z of [10.68, 26.32]) deps.addBox(parent, [2.25, 2.2, 0.16], [x, 9.15, z], acousticMaterial);
    deps.addBox(parent, [2.6, 0.12, 12.5], [x, 15.38, SHOP_THEATRE.centerZ], acousticMaterial);
  }

  const shelfMaterial = woodMaterial.clone();
  shelfMaterial.color.set("#75665d");
  const shelfYs = SHOP_TV_CAVE_SHELF_BOARD_Y_CENTERS;
  createTelevisionShelfBank(parent, shelfMaterial, shelfYs, deps, "z", [23.03, 6.95, 18.3], [22.6, 18.3], 8.2);
  createTelevisionShelfBank(parent, shelfMaterial, shelfYs, deps, "z", [16.97, 6.95, 16.45], [17.4, 16.45], 4.7);
  createTelevisionShelfBank(
    parent,
    shelfMaterial,
    shelfYs,
    deps,
    "x",
    [SHOP_TV_CAVE.centerX, 6.95, 14.27],
    [SHOP_TV_CAVE.centerX, 14.7],
    6.45,
  );
  createTelevisionShelfBank(
    parent,
    shelfMaterial,
    shelfYs,
    deps,
    "x",
    [SHOP_TV_CAVE.centerX, 6.95, 22.33],
    [SHOP_TV_CAVE.centerX, 21.9],
    6.45,
  );

  const rowYs = shelfYs.slice(0, 3).map((y) => y + SHOP_MODEL_TELEVISION_SIZE.height / 2 + 0.04);
  // Cave CRTs are ordinary spawned televisions: seeded once onto the
  // shelf banks, then persisted through modelProps like any other prop.
  // Worlds that already seeded restore them from their saves instead of
  // re-spawning deleted or moved units.
  if (deps.needsSeedPass(INITIAL_WORLD_SEEDING_VERSION)) {
    seedCaveCrtTelevisions(rowYs, deps);
  }
};
