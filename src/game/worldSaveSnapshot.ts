import {Euler, Quaternion, Vector3, type Object3D, type PerspectiveCamera} from "three";
import type {CatalogIdentity} from "~/catalog";
import type {BookRecord} from "~/game/bookFactory";
import type {DiscardBin} from "~/game/discardBin";
import type {ArtFrameSystem} from "~/game/artFrameSystem";
import type {PosterSystem} from "~/game/posters/PosterSystem";
import type {ShopSignSystem} from "~/game/signs/ShopSignSystem";
import type {ShopTelevision} from "~/game/ShopTelevision";
import {
  WORLD_SAVE_SCHEMA_VERSION,
  WORLD_SEEDING_VERSION,
  type WorldBookSave,
  type WorldDigitalArtFrameSave,
  type WorldModelPropSave,
  type WorldPosterSave,
  type WorldSaveV1,
} from "~/game/worldSave";

/** Minimal movable-prop surface the snapshot builder needs. */
export type SnapshotMovableProp = {
  adjustableLight?: {light: {power: number}};
  id: string;
  locked?: boolean;
  modelAnimationIndex?: number;
  modelAnimations?: readonly {name: string}[];
  object: Object3D;
  modelScale?: number;
  spawnAssetId?: string;
};

/**
 * Everything the world-save snapshot builder reads. All collections are
 * owned by the scene or its extracted systems.
 */
export type WorldSaveSnapshotContext = {
  artFrames: ArtFrameSystem;
  books: ReadonlyMap<string, BookRecord>;
  camera: PerspectiveCamera;
  catalogIdentity: () => CatalogIdentity;
  discardedPublicationIds: ReadonlySet<string>;
  discardBin: DiscardBin;
  movableProps: ReadonlyMap<string, SnapshotMovableProp>;
  pendingModelPropSaves: readonly WorldModelPropSave[];
  posters: PosterSystem;
  signs: ShopSignSystem;
  televisionsBySaveId: ReadonlyMap<string, ShopTelevision>;
};

export const createWorldSave = (ctx: WorldSaveSnapshotContext): WorldSaveV1 => {
  const books: WorldBookSave[] = [];
  for (const [publicationId, record] of ctx.books) {
    if (ctx.discardedPublicationIds.has(publicationId)) continue;
    let position: Vector3;
    let quaternion: Quaternion;
    if (record.state.status === "shelved") {
      position = record.basePosition;
      quaternion = new Quaternion().setFromEuler(
        new Euler(record.baseRotation.x, record.baseRotation.y, record.baseRotation.z, "XYZ"),
      );
    } else {
      record.mesh.updateWorldMatrix(true, false);
      position = record.mesh.getWorldPosition(new Vector3());
      quaternion = record.mesh.getWorldQuaternion(new Quaternion());
    }
    const base = {
      copyId: publicationId,
      pose: {
        position: {x: position.x, y: position.y, z: position.z},
        quaternion: {
          w: quaternion.w,
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
        },
      },
      publicationId,
    };
    if (record.state.status === "shelved") {
      books.push({
        ...base,
        shelf: {
          presentation: record.shelfPresentation,
          shelfId: record.state.shelfId,
          slotIndex: record.state.slotIndex,
        },
        state: "shelved",
      });
      continue;
    }
    books.push({...base, state: record.state.status});
  }
  const catalog = ctx.catalogIdentity();
  const playerQuaternion = ctx.camera.quaternion;
  const shelfSigns = [...ctx.signs.slots.values()].flatMap((slot) =>
    slot.kind === "shelf" && slot.column !== undefined && slot.title
      ? [
          {
            column: slot.column,
            ...(slot.subtitle ? {subtitle: slot.subtitle} : {}),
            text: slot.title,
          },
        ]
      : [],
  );
  const aisleSigns = [...ctx.signs.slots.values()].flatMap((slot) =>
    slot.kind === "aisle" && slot.title
      ? [
          {
            id: slot.id,
            ...(slot.subtitle ? {subtitle: slot.subtitle} : {}),
            title: slot.title,
          },
        ]
      : [],
  );
  const posters: WorldPosterSave[] = [
    ...ctx.posters.pendingSaves.filter((savedPoster) => !ctx.posters.records.has(savedPoster.id)),
    ...[...ctx.posters.records.values()]
      .sort((left, right) => left.depthLayer - right.depthLayer)
      .map((record) => {
        record.mesh.updateWorldMatrix(true, false);
        const position = record.mesh.getWorldPosition(new Vector3());
        const quaternion = record.mesh.getWorldQuaternion(new Quaternion());
        return {
          assetId: record.asset.id,
          height: record.height,
          id: record.id,
          pose: {
            position: {x: position.x, y: position.y, z: position.z},
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
          rotation: record.rotation,
        };
      }),
  ];
  const digitalArtFrames: WorldDigitalArtFrameSave[] = [
    ...(ctx.artFrames.pendingSaves as readonly WorldDigitalArtFrameSave[]).filter(
      (savedFrame) => !ctx.artFrames.records.has(savedFrame.id),
    ),
    ...[...ctx.artFrames.records.values()].map((record) => {
      record.frame.object.updateWorldMatrix(true, false);
      const position = record.frame.object.getWorldPosition(new Vector3());
      const quaternion = record.frame.object.getWorldQuaternion(new Quaternion());
      const currentImageId = record.frame.currentImageId();
      return Object.assign(
        {
          aspectRatio: record.frame.aspectRatio(),
          channelId: record.frame.channelId(),
          fit: record.frame.fit(),
          height: record.height,
          id: record.id,
          intervalSeconds: record.frame.intervalSeconds(),
          pose: {
            position: {x: position.x, y: position.y, z: position.z},
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
          rotation: record.rotation,
        },
        currentImageId ? {currentImageId} : {},
      );
    }),
  ];
  const televisionChannels: Record<string, string> = {};
  const televisionVolumes: Record<string, number> = {};
  for (const [saveId, savedTelevision] of ctx.televisionsBySaveId) {
    const channelId = savedTelevision.selectedChannelId();
    if (channelId) televisionChannels[saveId] = channelId;
    televisionVolumes[saveId] = savedTelevision.volumeLevel();
  }
  const modelProps: WorldModelPropSave[] = [
    ...ctx.pendingModelPropSaves.filter((savedProp) => !ctx.movableProps.has(savedProp.id)),
    ...[...ctx.movableProps.values()].flatMap((record) => {
      const assetId = record.spawnAssetId;
      if (!assetId) return [];
      const animationClip = record.modelAnimations
        ? (record.modelAnimations[record.modelAnimationIndex ?? 0]?.name ?? null)
        : undefined;
      record.object.updateWorldMatrix(true, false);
      const position = record.object.getWorldPosition(new Vector3());
      const quaternion = record.object.getWorldQuaternion(new Quaternion());
      return [
        {
          ...(animationClip === undefined ? {} : {animationClip}),
          assetId,
          id: record.id,
          ...(record.adjustableLight ? {lightPower: record.adjustableLight.light.power} : {}),
          ...(record.locked ? {locked: true} : {}),
          pose: {
            position: {x: position.x, y: position.y, z: position.z},
            quaternion: {
              w: quaternion.w,
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
            },
          },
          scale: record.modelScale ?? 1,
        },
      ];
    }),
  ];
  return {
    aisleSigns,
    books,
    catalog: {
      catalogContentHash: catalog.catalogContentHash,
      packId: catalog.packId,
      ...(catalog.snapshotId === undefined ? {} : {snapshotId: catalog.snapshotId}),
    },
    // From here on the world owns its default props: this version stops
    // the boot-time seed passes from re-creating deleted or moved
    // defaults.
    seedingVersion: WORLD_SEEDING_VERSION,
    ...(modelProps.length > 0 ? {modelProps} : {}),
    digitalArtFrames,
    player: {
      position: {
        x: ctx.camera.position.x,
        y: ctx.camera.position.y,
        z: ctx.camera.position.z,
      },
      quaternion: {
        w: playerQuaternion.w,
        x: playerQuaternion.x,
        y: playerQuaternion.y,
        z: playerQuaternion.z,
      },
    },
    posters,
    savedAt: new Date().toISOString(),
    schemaVersion: WORLD_SAVE_SCHEMA_VERSION,
    shelfSigns,
    // Default movable props live in modelProps; the top-level pose field
    // only existed for the pre-seeding movable television.
    televisionChannels,
    televisionModelVersion: 2,
    televisionVolumes,
    trashcan: {
      x: ctx.discardBin.position.x,
      y: 0,
      z: ctx.discardBin.position.z,
    },
  };
};
