import {describe, expect, test} from "bun:test";

import {
  adoptLegacyModelPropSaves,
  migrateLegacyPlayerPosition,
  migrateLegacyTrashcanPosition,
} from "~/game/worldSaveMigration";
import type {WorldModelPropSave, WorldSaveV1} from "~/game/worldSave";

const pose = (position: {x: number; y: number; z: number}) => ({
  position,
  quaternion: {w: 1, x: 0, y: 0, z: 0},
});

describe("world save migrations", () => {
  test("applies legacy trash and player migrations only to pre-seeded saves", () => {
    const save = {
      player: pose({x: 20, y: 6, z: 6}),
      seedingVersion: undefined,
      trashcan: {x: 1, y: 0, z: 2},
    } as unknown as WorldSaveV1;
    expect(migrateLegacyTrashcanPosition(save)).toEqual(save.trashcan);
    const migratedPlayer = migrateLegacyPlayerPosition(save.player.position);
    expect(migratedPlayer.migrated).toBe(true);
    expect(migratedPlayer.position).not.toEqual(save.player.position);

    const seededSave = {...save, seedingVersion: 1} as WorldSaveV1;
    expect(migrateLegacyTrashcanPosition(seededSave)).toBeUndefined();
    expect(migrateLegacyPlayerPosition({x: 0, y: 0, z: 0}).migrated).toBe(false);
  });

  test("keeps model prop saves that have not been registered yet", () => {
    const modelProp = {id: "unloaded", scale: 1} as WorldModelPropSave;

    expect(adoptLegacyModelPropSaves([modelProp], new Set())).toEqual([modelProp]);
    expect(adoptLegacyModelPropSaves([modelProp], new Set(["unloaded"]))).toEqual([]);
  });
});
