import {SHOP_TV_CAVE, SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";
import {SHOP_PHYSICS_PLAYER_EYE_HEIGHT} from "~/game/ShopPhysicsWorld";
import {
  INITIAL_WORLD_SEEDING_VERSION,
  worldSaveSeedingVersion,
  type WorldModelPropSave,
  type WorldPropSave,
  type WorldSaveV1,
  type WorldVector3,
} from "~/game/worldSave";

const LEGACY_TV_CAVE_BOUNDS = Object.freeze({
  maxX: 23.5,
  maxZ: 11.5,
  minX: 16.5,
  minZ: 2.5,
});

export const migrateLegacyPropSaves = (savedProps: readonly WorldPropSave[]) => {
  const currentProps: WorldPropSave[] = [];
  let migrated = false;
  for (const savedProp of savedProps) {
    if (savedProp.id.startsWith("tv-cave-")) {
      migrated = true;
      continue;
    }
    currentProps.push(savedProp);
  }
  return {
    migrated,
    savedProps: currentProps,
  };
};

export const migrateLegacyTrashcanPosition = (save: WorldSaveV1): WorldVector3 | undefined => {
  // Legacy trashcan positions apply only while migrating worlds that never
  // ran a seeding pass; afterwards the bin's pose lives in modelProps.
  if (worldSaveSeedingVersion(save) < INITIAL_WORLD_SEEDING_VERSION && save.trashcan) return save.trashcan;
  // Legacy `television` pose fields are intentionally ignored: worlds saved
  // before default-prop seeding respawn the movable CRT television at its
  // designed spot through the prop lifecycle instead.
  return undefined;
};

export const migrateLegacyPlayerPosition = (position: WorldVector3) => {
  const inLegacyTvCave =
    position.y > SHOP_UPPER_FLOOR_Y &&
    position.x >= LEGACY_TV_CAVE_BOUNDS.minX &&
    position.x <= LEGACY_TV_CAVE_BOUNDS.maxX &&
    position.z >= LEGACY_TV_CAVE_BOUNDS.minZ &&
    position.z <= LEGACY_TV_CAVE_BOUNDS.maxZ;
  return {
    migrated: inLegacyTvCave,
    position: inLegacyTvCave
      ? {
          x: SHOP_TV_CAVE.centerX,
          y: SHOP_UPPER_FLOOR_Y + SHOP_PHYSICS_PLAYER_EYE_HEIGHT,
          z: SHOP_TV_CAVE.centerZ,
        }
      : position,
  };
};

export const adoptLegacyModelPropSaves = (
  savedProps: readonly WorldModelPropSave[],
  existingIds: ReadonlySet<string>,
) => {
  const adopted: WorldModelPropSave[] = [];
  for (const savedProp of savedProps) if (!existingIds.has(savedProp.id)) adopted.push(savedProp);
  return adopted;
};
