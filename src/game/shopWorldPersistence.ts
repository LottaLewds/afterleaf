import {DEV} from "solid-js";
import type {PerspectiveCamera} from "three";

import type {CatalogIdentity} from "~/catalog";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {BookRecord} from "~/game/bookFactory";
import type {DiscardBin} from "~/game/discardBin";
import type {MovablePropLifecycle} from "~/game/movablePropSystem";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopPhysicsWorld} from "~/game/ShopPhysicsWorld";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import {shopSignKey} from "~/game/signs/ShopSignSystem";
import type {
  WorldBookSave,
  WorldModelPropSave,
  WorldPropSave,
  WorldSaveV1,
  WorldTelevisionChannels,
  WorldTelevisionVolumes,
} from "~/game/worldSave";
import {
  worldSaveCanReconcileCatalog,
  worldSaveMatchesCatalog,
} from "~/game/worldSave";
import {createWorldSave} from "~/game/worldSaveSnapshot";
import {
  adoptLegacyModelPropSaves,
  migrateLegacyPlayerPosition,
  migrateLegacyPropSaves,
  migrateLegacyTrashcanPosition,
} from "~/game/worldSaveMigration";

const WORLD_SAVE_INTERVAL_MS = 10_000;
const WORLD_SAVE_IDLE_TIMEOUT_MS = 250;

export type ShopWorldPersistenceHost = {
  applyPlayerPose: (
    position: WorldSaveV1["player"]["position"],
    quaternion: WorldSaveV1["player"]["quaternion"],
  ) => void;
  artFrames: () => ArtFrameSystem;
  booksById: () => ReadonlyMap<string, BookRecord>;
  camera: () => PerspectiveCamera;
  catalogAvailable: () => boolean;
  catalogIdentity: () => CatalogIdentity;
  discardedPublicationIds: () => ReadonlySet<string>;
  discardBin: () => DiscardBin;
  disposed: () => boolean;
  movableProps: () => MovablePropLifecycle;
  onWorldSave:
    | ((save: WorldSaveV1) => boolean | void | Promise<boolean | void>)
    | undefined;
  pendingSave: WorldSaveV1 | undefined;
  physicsWorld: () => ShopPhysicsWorld;
  posters: () => PosterSystem;
  signs: () => ShopSignSystem;
  worldSaveWritable: () => boolean;
};

export class ShopWorldPersistence {
  readonly #host: ShopWorldPersistenceHost;
  #idleHandle: number | undefined;
  #intervalHandle: number | undefined;
  #pendingSave: WorldSaveV1 | undefined;
  #pendingWrite: Promise<void> | undefined;
  readonly #savedTelevisionChannels: WorldTelevisionChannels;
  readonly #savedTelevisionVolumes: WorldTelevisionVolumes;
  #worldStateDirty = false;

  constructor(host: ShopWorldPersistenceHost) {
    this.#host = host;
    this.#pendingSave = host.pendingSave;
    this.#savedTelevisionChannels = host.pendingSave?.televisionChannels ?? {};
    this.#savedTelevisionVolumes = host.pendingSave?.televisionVolumes ?? {};
  }

  pendingWorldSave() {
    return this.#pendingSave;
  }

  savedTelevisionChannels() {
    return this.#savedTelevisionChannels;
  }

  savedTelevisionVolumes() {
    return this.#savedTelevisionVolumes;
  }

  markDirty() {
    this.#worldStateDirty = true;
  }

  startScheduler() {
    this.#intervalHandle = window.setInterval(
      this.#scheduleSave,
      WORLD_SAVE_INTERVAL_MS,
    );
  }

  stopScheduler() {
    if (this.#intervalHandle !== undefined) {
      window.clearInterval(this.#intervalHandle);
      this.#intervalHandle = undefined;
    }
    if (this.#idleHandle === undefined) return;
    window.cancelIdleCallback(this.#idleHandle);
    this.#idleHandle = undefined;
  }

  flush() {
    if (
      !this.#host.catalogAvailable() ||
      !this.#worldSaveWritable() ||
      !this.#worldStateDirty ||
      !this.#host.onWorldSave ||
      this.#pendingWrite
    )
      return;
    this.#worldStateDirty = false;
    try {
      const persisted = this.#host.onWorldSave(
        createWorldSave({
          artFrames: this.#host.artFrames(),
          books: this.#host.booksById(),
          camera: this.#host.camera(),
          catalogIdentity: () => this.#host.catalogIdentity(),
          discardedPublicationIds: this.#host.discardedPublicationIds(),
          discardBin: this.#host.discardBin(),
          movableProps: this.#host.movableProps().records,
          pendingModelPropSaves:
            this.#host.movableProps().pendingModelPropSaves,
          pendingPropSaves: this.#host.movableProps().pendingPropSaves,
          posters: this.#host.posters(),
          signs: this.#host.signs(),
          televisionsBySaveId: this.#host.movableProps().televisionsBySaveId,
        }),
      );
      if (!(persisted instanceof Promise)) {
        if (persisted === false) this.markDirty();
        return;
      }
      this.#pendingWrite = persisted
        .then((didPersist) => {
          if (didPersist === false) this.markDirty();
        })
        .catch((error: unknown) => {
          this.markDirty();
          if (DEV)
            console.warn("Afterleaf could not persist the shop state.", error);
        })
        .finally(() => {
          this.#pendingWrite = undefined;
        });
    } catch (error) {
      this.markDirty();
      if (DEV)
        console.warn("Afterleaf could not persist the shop state.", error);
    }
  }

  takeCompatibleWorldSave(): Map<string, WorldBookSave> | undefined {
    const save = this.#pendingSave;
    if (!save) return;
    const catalog = this.#host.catalogIdentity();
    const exactMatch = worldSaveMatchesCatalog(save, catalog);
    if (!exactMatch && !worldSaveCanReconcileCatalog(save, catalog)) return;
    this.#pendingSave = undefined;
    if (!exactMatch) this.markDirty();

    this.#restoreSigns(save);
    const legacyTrashcanPosition = migrateLegacyTrashcanPosition(save);
    if (legacyTrashcanPosition)
      this.#host
        .discardBin()
        .setPosition(legacyTrashcanPosition.x, legacyTrashcanPosition.z, false);

    const propMigration = migrateLegacyPropSaves(save.props ?? []);
    if (propMigration.migrated) this.markDirty();
    this.#restoreProps(propMigration.savedProps, save.modelProps ?? []);
    this.#host.posters().pendingSaves = save.posters ?? [];
    this.#host.artFrames().pendingSaves = save.digitalArtFrames ?? [];
    const playerMigration = migrateLegacyPlayerPosition(save.player.position);
    if (playerMigration.migrated) this.markDirty();
    this.#host.applyPlayerPose(
      playerMigration.position,
      save.player.quaternion,
    );
    return new Map(
      save.books
        .filter(
          (book) =>
            !this.#host.discardedPublicationIds().has(book.publicationId),
        )
        .map((book) => [book.publicationId, book]),
    );
  }

  readonly #scheduleSave = () => {
    if (
      this.#host.disposed() ||
      !this.#host.catalogAvailable() ||
      !this.#worldSaveWritable() ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      !this.#worldStateDirty ||
      !this.#host.onWorldSave ||
      this.#idleHandle !== undefined
    )
      return;

    if (typeof window.requestIdleCallback !== "function") {
      this.flush();
      return;
    }
    this.#idleHandle = window.requestIdleCallback(
      () => {
        this.#idleHandle = undefined;
        if (
          !this.#host.disposed() &&
          document.visibilityState === "visible" &&
          document.hasFocus()
        )
          this.flush();
      },
      {timeout: WORLD_SAVE_IDLE_TIMEOUT_MS},
    );
  };

  #restoreSigns(save: WorldSaveV1) {
    const signs = this.#host.signs();
    if (save.shelfSigns) {
      for (const slot of signs.slots.values()) {
        if (slot.kind === "shelf" && slot.column !== undefined)
          signs.setShelfSign(slot.column, "");
      }
      for (const sign of save.shelfSigns)
        signs.setShelfSign(sign.column, sign.text, sign.subtitle);
    }
    if (!save.aisleSigns) return;
    for (const [key, slot] of signs.slots) {
      if (slot.kind === "aisle") signs.setSign(key, "", "");
    }
    for (const sign of save.aisleSigns)
      signs.setSign(
        shopSignKey("aisle", sign.id),
        sign.title,
        sign.subtitle ?? "",
      );
  }

  #restoreProps(
    savedProps: readonly WorldPropSave[],
    savedModelProps: readonly WorldModelPropSave[],
  ) {
    const props = this.#host.movableProps();
    props.pendingPropSaves = new Map(
      savedProps.map((savedProp) => [savedProp.id, savedProp]),
    );
    for (const [id, record] of props.records) {
      const savedProp = props.pendingPropSaves.get(id);
      if (!savedProp) continue;
      props.applySavedPropPose(record, savedProp);
      props.pendingPropSaves.delete(id);
    }
    const existingModelPropIds = new Set(props.records.keys());
    for (const savedProp of savedModelProps) {
      const record = props.records.get(savedProp.id);
      if (!record) continue;
      props.applySavedPropPose(record, savedProp);
      // Boot-registered defaults spawn at seed scale; without this, a
      // player-scaled default would silently revert and the next save would
      // overwrite the stored scale with the reverted value.
      if (savedProp.scale !== record.modelScale)
        props.setModelPropScale(record, savedProp.scale);
      if (savedProp.locked && !record.locked) {
        record.locked = true;
        this.#host.physicsWorld().setPropLocked(record.id, true);
      }
    }
    props.pendingModelPropSaves = adoptLegacyModelPropSaves(
      savedModelProps,
      existingModelPropIds,
    );
    void props.restoreSavedModelProps();
  }

  #worldSaveWritable() {
    return this.#host.worldSaveWritable();
  }
}
