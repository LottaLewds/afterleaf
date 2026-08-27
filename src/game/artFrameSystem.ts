import {
  Material,
  Mesh,
  Quaternion,
  Vector3,
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
  type Raycaster,
  type Scene,
} from "three";
import type {ArtFrameChannel, ArtFrameImage} from "~/artFrames/protocol";
import type {ArtFrameFit} from "~/artFrames/aspect";
import {DigitalArtFrame} from "~/game/DigitalArtFrame";
import type {WorldDigitalArtFrameSave} from "~/game/worldSave";
import type {ArtFrameTextureCache} from "~/game/artFrameTextureCache";
import {resolveWallPlacement, type PosterSurface} from "~/game/interior/interiorPrimitives";
import {POSTER_PLACEMENT_DISTANCE} from "~/game/wallDecorTuning";
import {
  DEFAULT_POSTER_HEIGHT,
  DIGITAL_ART_FRAME_BORDER,
  DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS,
  DIGITAL_ART_FRAME_INTERVALS,
} from "~/game/wallDecorTuning";

export type DigitalArtFrameRecord = {
  frame: DigitalArtFrame;
  height: number;
  id: string;
  rotation: number;
};

export type DigitalArtFramePlacementSession = {
  assetIndex: number;
  aspectRatio: number;
  channelId: string;
  desiredHeight: number;
  fit: ArtFrameFit;
  gridSnap: boolean;
  intervalSeconds: number;
  movingFrameId?: string;
  rotation: number;
};

export type DigitalArtFramePasteTarget =
  | {channelId: string; kind: "placement"}
  | {channelId: string; frameId: string; kind: "frame"};

/** Scene services the art-frame system needs. */
export type ArtFrameSystemHost = {
  abortSignal: AbortSignal;
  camera: PerspectiveCamera;
  emitGameState: () => void;
  getPosterSurface: (surfaceId: string) => PosterSurface | undefined;
  hasPosterPlacement: () => boolean;
  importArtFrameImage?: ((image: Blob, channelId: string, signal: AbortSignal) => Promise<ArtFrameImage>) | undefined;
  importPoster?: ((image: Blob, signal: AbortSignal) => Promise<PosterAssetLike>) | undefined;
  isDisposed: () => boolean;
  isPointerLocked: () => boolean;
  markWorldStateDirty: () => void;
  posterRaycastMeshes: Mesh[];
  raycaster: Raycaster;
  refreshMediaCatalog: () => Promise<void>;
  scene: Scene;
};
type PosterAssetLike = {id: string};

/**
 * Owns every placed digital art frame, its channel catalog, and the
 * placement session. The scene drives it from input handlers and the media
 * catalog refresh.
 */
export class ArtFrameSystem {
  readonly #scene: Scene;
  readonly #camera: PerspectiveCamera;
  readonly #raycaster: Raycaster;
  readonly #raycastMeshes: Mesh[];
  readonly #textures: ArtFrameTextureCache;
  readonly #records = new Map<string, DigitalArtFrameRecord>();
  readonly #targetMeshes: Mesh[] = [];
  readonly #host: ArtFrameSystemHost;
  readonly #localPoint = new Vector3();
  readonly #placementPosition = new Vector3();
  readonly #placementRotation = new Quaternion();
  #previewMaterialStates: {
    depthWrite: boolean;
    material: Material;
    opacity: number;
    transparent: boolean;
  }[] = [];
  #assets: readonly ArtFrameImage[] = [];
  #assetIndex = 0;
  #channels: readonly ArtFrameChannel[] = [];
  #importCount = 0;
  #importError: string | undefined;
  #saveRestoreCompleted = false;
  #placement: DigitalArtFramePlacementSession | undefined;
  #placementRevision = 0;
  #placementSelection: {height: number} | undefined;
  #preview: DigitalArtFrame | undefined;
  #targetImportChannel: {channelId: string; frameId: string} | undefined;
  #pendingSaves: readonly WorldDigitalArtFrameSave[] = [];
  #targetedId: string | undefined;

  constructor(host: ArtFrameSystemHost, textures: ArtFrameTextureCache) {
    this.#host = host;
    this.#scene = host.scene;
    this.#camera = host.camera;
    this.#raycaster = host.raycaster;
    this.#raycastMeshes = host.posterRaycastMeshes;
    this.#textures = textures;
  }

  get assets(): readonly ArtFrameImage[] {
    return this.#assets;
  }
  get assetIndex(): number {
    return this.#assetIndex;
  }
  get channels(): readonly ArtFrameChannel[] {
    return this.#channels;
  }
  get records(): ReadonlyMap<string, DigitalArtFrameRecord> {
    return this.#records;
  }
  get targetMeshes(): Mesh[] {
    return this.#targetMeshes;
  }
  get placement(): DigitalArtFramePlacementSession | undefined {
    return this.#placement;
  }
  get placementSelection(): {height: number} | undefined {
    return this.#placementSelection;
  }
  get preview(): DigitalArtFrame | undefined {
    return this.#preview;
  }
  get importCount(): number {
    return this.#importCount;
  }
  get importError(): string | undefined {
    return this.#importError;
  }
  set importError(value: string | undefined) {
    this.#importError = value;
  }
  set preview(frame: DigitalArtFrame | undefined) {
    this.#preview = frame;
  }
  set targetImportChannel(value: {channelId: string; frameId: string} | undefined) {
    this.#targetImportChannel = value;
  }
  clearRecords(): void {
    this.#records.clear();
  }
  get saveRestoreCompleted(): boolean {
    return this.#saveRestoreCompleted;
  }
  get pendingSaves(): readonly WorldDigitalArtFrameSave[] {
    return this.#pendingSaves;
  }
  set pendingSaves(saves: readonly WorldDigitalArtFrameSave[]) {
    this.#pendingSaves = saves;
  }
  get targetedId(): string | undefined {
    return this.#targetedId;
  }
  set targetedId(id: string | undefined) {
    this.#targetedId = id;
  }
  set importErrorPublic(value: string | undefined) {
    this.#importError = value;
  }
  get targetImportChannel(): {channelId: string; frameId: string} | undefined {
    return this.#targetImportChannel;
  }

  #artFrameCatalogMatches(channels: readonly ArtFrameChannel[]) {
    return JSON.stringify(channels) === JSON.stringify(this.#channels);
  }

  applyArtFrameCatalog(channels: readonly ArtFrameChannel[]) {
    if (this.#artFrameCatalogMatches(channels)) return;
    const selectedAssetId = this.#assets[this.#assetIndex]?.id;
    const activeAssetId = this.#placement ? this.#assets[this.#placement.assetIndex]?.id : undefined;
    this.#channels = channels;
    this.#assets = channels.flatMap((channel) => channel.images);
    const selectedIndex = selectedAssetId ? this.#assets.findIndex((asset) => asset.id === selectedAssetId) : -1;
    this.#assetIndex = Math.max(0, selectedIndex);
    for (const record of this.#records.values()) record.frame.setChannels(channels);
    if (this.#placement && activeAssetId) {
      const activeIndex = this.#assets.findIndex((asset) => asset.id === activeAssetId);
      if (activeIndex < 0) this.cancelDigitalArtFramePlacement();
      else {
        this.#placement.assetIndex = activeIndex;
        this.#assetIndex = activeIndex;
      }
    }
    this.#host.emitGameState();
  }

  async restoreSavedDigitalArtFrames(channels: readonly ArtFrameChannel[]) {
    const channelIds = new Set(channels.map((channel) => channel.id));
    const restoredIds = new Set<string>();
    await Promise.all(
      this.#pendingSaves.map(async (savedFrame) => {
        if (!channelIds.has(savedFrame.channelId)) return;
        const frame = new DigitalArtFrame({
          aspectRatio: savedFrame.aspectRatio,
          channelId: savedFrame.channelId,
          channels,
          fit: savedFrame.fit,
          ...(savedFrame.currentImageId ? {imageId: savedFrame.currentImageId} : {}),
          intervalSeconds: savedFrame.intervalSeconds,
          loadTexture: (image, priority) => this.#textures.get(image, priority),
          onImageChange: () => {
            this.#host.markWorldStateDirty();
          },
          releaseTexture: (imageId) => this.#textures.release(imageId),
        });
        if (this.#host.isDisposed()) {
          frame.dispose();
          return;
        }
        frame.object.position.copy(savedFrame.pose.position);
        frame.object.quaternion.copy(savedFrame.pose.quaternion);
        frame.object.scale.setScalar(savedFrame.height);
        frame.target.userData.digitalArtFrameId = savedFrame.id;
        this.#scene.add(frame.object);
        this.#records.set(savedFrame.id, {
          frame,
          height: savedFrame.height,
          id: savedFrame.id,
          rotation: savedFrame.rotation ?? 0,
        });
        this.#targetMeshes.push(frame.target);
        restoredIds.add(savedFrame.id);
      }),
    );
    if (restoredIds.size !== this.#pendingSaves.length) this.#host.markWorldStateDirty();
    this.#pendingSaves = [];
    this.#saveRestoreCompleted = true;
  }

  createDigitalArtFrame(
    asset: ArtFrameImage,
    aspectRatio: number,
    channelId: string,
    fit: ArtFrameFit,
    intervalSeconds: number,
  ) {
    return new DigitalArtFrame({
      aspectRatio,
      channelId,
      channels: this.#channels,
      fit,
      imageId: asset.id,
      intervalSeconds,
      loadTexture: (image, priority) => this.#textures.get(image, priority),
      onImageChange: () => {
        this.#host.markWorldStateDirty();
      },
      releaseTexture: (imageId) => this.#textures.release(imageId),
    });
  }

  #setupDigitalArtFramePlacement(
    asset: ArtFrameImage,
    normalizedIndex: number,
    movingFrameId: string | undefined,
    desiredHeight: number,
    rotation: number,
    lockedAspectRatio: number | undefined,
    fit: ArtFrameFit,
    intervalSeconds: number,
  ) {
    const channelId = asset.id.split("/")[0];
    if (!channelId) return;
    const revision = (this.#placementRevision += 1);
    this.#disposeDigitalArtFramePreview();
    const aspectRatio = lockedAspectRatio ?? asset.aspectRatio;
    this.#placement = {
      aspectRatio,
      assetIndex: normalizedIndex,
      channelId,
      desiredHeight,
      fit,
      gridSnap: true,
      intervalSeconds,
      ...(movingFrameId ? {movingFrameId} : {}),
      rotation,
    };
    this.#assetIndex = normalizedIndex;
    const movingFrame = this.#records.get(movingFrameId ?? "");
    if (movingFrame) movingFrame.frame.object.visible = false;
    this.#placementSelection = undefined;
    this.setDigitalArtFrameTargeted();
    const preview = this.createDigitalArtFrame(asset, aspectRatio, channelId, fit, 0);
    if (
      this.#host.isDisposed() ||
      revision !== this.#placementRevision ||
      this.#placement?.assetIndex !== normalizedIndex
    ) {
      preview.dispose();
      return;
    }
    preview.object.name = `digital-art-frame-preview-${asset.id}`;
    this.#ghostDigitalArtFramePreview(preview);
    preview.object.visible = false;
    this.#preview = preview;
    this.#scene.add(preview.object);
    this.updateDigitalArtFramePlacementTarget();
    this.#host.emitGameState();
  }

  startDigitalArtFramePlacement(
    assetIndex: number,
    movingFrameId?: string,
    desiredHeight = DEFAULT_POSTER_HEIGHT,
    rotation = 0,
    lockedAspectRatio?: number,
    fit: ArtFrameFit = "contain",
    intervalSeconds = DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS,
  ) {
    if (this.#assets.length === 0) return;
    const normalizedIndex = (assetIndex + this.#assets.length) % this.#assets.length;
    const asset = this.#assets[normalizedIndex];
    if (!asset) return;
    this.#setupDigitalArtFramePlacement(
      asset,
      normalizedIndex,
      movingFrameId,
      desiredHeight,
      rotation,
      lockedAspectRatio,
      fit,
      intervalSeconds,
    );
  }

  startEmptyDigitalArtFramePlacement() {
    this.#placementRevision += 1;
    this.#disposeDigitalArtFramePreview();
    this.#placement = {
      aspectRatio: 1.5,
      assetIndex: -1,
      channelId: "pasted",
      desiredHeight: DEFAULT_POSTER_HEIGHT,
      fit: "contain",
      gridSnap: true,
      intervalSeconds: DIGITAL_ART_FRAME_DEFAULT_INTERVAL_SECONDS,
      rotation: 0,
    };
    this.#placementSelection = undefined;
    this.setDigitalArtFrameTargeted();
    this.#host.emitGameState();
  }

  #selectDigitalArtFramePlacementAsset(assetIndex: number) {
    const placement = this.#placement;
    if (!placement) return;
    this.startDigitalArtFramePlacement(
      assetIndex,
      placement.movingFrameId,
      placement.desiredHeight,
      placement.rotation,
      placement.movingFrameId ? placement.aspectRatio : undefined,
      placement.fit,
      placement.intervalSeconds,
    );
  }

  cycleDigitalArtFramePlacementChannel(direction: -1 | 1) {
    const placement = this.#placement;
    if (!placement || this.#channels.length <= 1) return;
    const channelIndex = this.#channels.findIndex((channel) => channel.id === placement.channelId);
    const nextChannel =
      this.#channels[
        ((channelIndex >= 0 ? channelIndex : -1) + direction + this.#channels.length) % this.#channels.length
      ];
    const image = nextChannel?.images[0];
    if (!image) return;
    const assetIndex = this.#assets.findIndex((asset) => asset.id === image.id);
    if (assetIndex >= 0) this.#selectDigitalArtFramePlacementAsset(assetIndex);
  }

  cycleDigitalArtFramePlacementImage(direction: -1 | 1) {
    const placement = this.#placement;
    if (!placement) return;
    const channel = this.#channels.find((candidate) => candidate.id === placement.channelId);
    if (!channel || channel.images.length <= 1) return;
    const currentAsset = this.#assets[placement.assetIndex];
    const imageIndex = channel.images.findIndex((image) => image.id === currentAsset?.id);
    const image =
      channel.images[((imageIndex >= 0 ? imageIndex : -1) + direction + channel.images.length) % channel.images.length];
    if (!image) return;
    const assetIndex = this.#assets.findIndex((asset) => asset.id === image.id);
    if (assetIndex >= 0) this.#selectDigitalArtFramePlacementAsset(assetIndex);
  }

  #disposeDigitalArtFramePreview() {
    const preview = this.#preview;
    if (!preview) return;
    this.#restoreDigitalArtFramePreview();
    this.#preview = undefined;
    preview.dispose();
  }

  cancelDigitalArtFramePlacement() {
    const movingFrameId = this.#placement?.movingFrameId;
    this.#placementRevision += 1;
    this.#disposeDigitalArtFramePreview();
    const movingFrame = this.#records.get(movingFrameId ?? "");
    if (movingFrame) movingFrame.frame.object.visible = true;
    this.#placement = undefined;
    this.#placementSelection = undefined;
    this.#host.emitGameState();
  }

  #setDigitalArtFramePlacementSelection(height?: number) {
    if (height === this.#placementSelection?.height) return;
    this.#placementSelection = height === undefined ? undefined : {height};
    this.#host.emitGameState();
  }

  #ghostDigitalArtFramePreview(preview: DigitalArtFrame) {
    this.#previewMaterialStates = [];
    preview.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        this.#previewMaterialStates.push({
          depthWrite: material.depthWrite,
          material,
          opacity: material.opacity,
          transparent: material.transparent,
        });
        material.transparent = true;
        material.opacity *= 0.62;
        material.depthWrite = false;
      }
    });
  }

  #restoreDigitalArtFramePreview() {
    for (const state of this.#previewMaterialStates) {
      state.material.depthWrite = state.depthWrite;
      state.material.opacity = state.opacity;
      state.material.transparent = state.transparent;
    }
    this.#previewMaterialStates = [];
  }

  #showDigitalArtFramePlacementGhost(preview: DigitalArtFrame, placement: DigitalArtFramePlacementSession) {
    this.#camera.add(preview.object);
    preview.object.position.set(0, -0.1, -1.5);
    preview.object.quaternion.identity();
    preview.object.scale.setScalar(placement.desiredHeight);
    preview.object.visible = true;
  }

  #clearDigitalArtFramePlacementTarget(preview: DigitalArtFrame | undefined) {
    if (preview) preview.object.visible = false;
    this.#setDigitalArtFramePlacementSelection();
  }

  #placementSurface(intersection: Intersection<Object3D> | undefined) {
    const surfaceId = intersection?.object.userData.posterSurfaceId;
    return typeof surfaceId === "string" ? this.#host.getPosterSurface(surfaceId) : undefined;
  }

  updateDigitalArtFramePlacementTarget() {
    const placement = this.#placement;
    const preview = this.#preview;
    if (!placement || !preview) {
      this.#clearDigitalArtFramePlacementTarget(preview);
      return;
    }
    if (!this.#host.isPointerLocked()) {
      this.#clearDigitalArtFramePlacementTarget(preview);
      return;
    }
    const intersection = this.#raycaster.intersectObjects(this.#raycastMeshes, false)[0];
    const surface = this.#placementSurface(intersection);
    if (!intersection || intersection.distance > POSTER_PLACEMENT_DISTANCE || !surface) {
      this.#showDigitalArtFramePlacementGhost(preview, placement);
      this.#setDigitalArtFramePlacementSelection();
      return;
    }
    const height = resolveWallPlacement(
      surface,
      intersection.point,
      placement.aspectRatio,
      placement.desiredHeight,
      placement.rotation,
      this.#placementPosition,
      this.#placementRotation,
      this.#localPoint,
      DIGITAL_ART_FRAME_BORDER,
      placement.gridSnap,
    );
    if (height === undefined) {
      this.#showDigitalArtFramePlacementGhost(preview, placement);
      this.#setDigitalArtFramePlacementSelection();
      return;
    }
    this.#scene.attach(preview.object);
    preview.object.position.copy(this.#placementPosition);
    preview.object.quaternion.copy(this.#placementRotation);
    preview.object.rotateZ(placement.rotation);
    preview.object.scale.setScalar(height);
    preview.object.visible = true;
    this.#setDigitalArtFramePlacementSelection(height);
  }

  placeDigitalArtFrame() {
    const placement = this.#placement;
    const selection = this.#placementSelection;
    const preview = this.#preview;
    if (!placement || !selection || !preview || !preview.object.visible) return;
    this.#restoreDigitalArtFramePreview();
    preview.setIntervalSeconds(placement.intervalSeconds);
    const existing = placement.movingFrameId ? this.#records.get(placement.movingFrameId) : undefined;
    if (existing) {
      const targetIndex = this.#targetMeshes.indexOf(existing.frame.target);
      existing.frame.dispose();
      existing.frame = preview;
      existing.height = selection.height;
      existing.rotation = placement.rotation;
      preview.target.userData.digitalArtFrameId = existing.id;
      if (targetIndex >= 0) this.#targetMeshes[targetIndex] = preview.target;
      else this.#targetMeshes.push(preview.target);
    } else {
      const id = globalThis.crypto.randomUUID();
      preview.target.userData.digitalArtFrameId = id;
      this.#records.set(id, {
        frame: preview,
        height: selection.height,
        id,
        rotation: placement.rotation,
      });
      this.#targetMeshes.push(preview.target);
    }
    this.#preview = undefined;
    this.#placement = undefined;
    this.#placementSelection = undefined;
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  removeTargetedDigitalArtFrame() {
    const frameId = this.#targetedId;
    if (!frameId) return;
    const record = this.#records.get(frameId);
    if (!record) return;
    record.frame.dispose();
    this.#records.delete(frameId);
    const targetIndex = this.#targetMeshes.indexOf(record.frame.target);
    if (targetIndex >= 0) this.#targetMeshes.splice(targetIndex, 1);
    if (this.#targetImportChannel?.frameId === frameId) this.#targetImportChannel = undefined;
    this.#targetedId = undefined;
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  cycleTargetedDigitalArtFrameFit() {
    const record = this.#targetedId ? this.#records.get(this.#targetedId) : undefined;
    if (!record) return;
    record.frame.setFit(record.frame.fit() === "contain" ? "cover" : "contain");
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  cycleTargetedDigitalArtFrameInterval() {
    const record = this.#targetedId ? this.#records.get(this.#targetedId) : undefined;
    if (!record) return;
    const intervalIndex = DIGITAL_ART_FRAME_INTERVALS.indexOf(
      record.frame.intervalSeconds() as (typeof DIGITAL_ART_FRAME_INTERVALS)[number],
    );
    const nextInterval =
      DIGITAL_ART_FRAME_INTERVALS[(Math.max(0, intervalIndex) + 1) % DIGITAL_ART_FRAME_INTERVALS.length];
    if (nextInterval === undefined) return;
    record.frame.setIntervalSeconds(nextInterval);
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  digitalArtFramePasteTarget(): DigitalArtFramePasteTarget | undefined {
    const placement = this.#placement;
    if (placement) return {channelId: placement.channelId, kind: "placement"};
    if (this.#host.hasPosterPlacement()) return;
    const frameId = this.#targetedId;
    const frame = frameId ? this.#records.get(frameId)?.frame : undefined;
    if (!frameId || !frame) return;
    const pendingChannel = this.#targetImportChannel;
    return {
      channelId: pendingChannel?.frameId === frameId ? pendingChannel.channelId : frame.channelId(),
      frameId,
      kind: "frame",
    };
  }

  setDigitalArtFrameTargeted(frameId?: string) {
    if (frameId === this.#targetedId) return;
    if (this.#targetedId) this.#records.get(this.#targetedId)?.frame.setTargeted(false);
    this.#targetedId = frameId;
    if (frameId) this.#records.get(frameId)?.frame.setTargeted(true);
    this.#host.emitGameState();
  }

  #applyImportedImage(importChannelId: string, asset: ArtFrameImage) {
    const existingChannel = this.#channels.find((channel) => channel.id === importChannelId);
    const channel: ArtFrameChannel = {
      id: importChannelId,
      images: [...(existingChannel?.images.filter((candidate) => candidate.id !== asset.id) ?? []), asset].sort(
        (left, right) => left.id.localeCompare(right.id),
      ),
      label:
        existingChannel?.label ??
        importChannelId
          .split("-")
          .filter(Boolean)
          .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
          .join(" "),
    };
    this.applyArtFrameCatalog(
      [...this.#channels.filter((candidate) => candidate.id !== importChannelId), channel].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );
    return this.#assets.findIndex((candidate) => candidate.id === asset.id);
  }

  #applyPastedArtFrameAsset(
    importChannelId: string,
    asset: ArtFrameImage,
    assetIndex: number,
    target: DigitalArtFramePasteTarget,
  ) {
    if (target.kind === "frame") {
      const record = this.#records.get(target.frameId);
      if (!record) return false;
      record.frame.setChannel(importChannelId, asset.id);
      if (
        this.#targetImportChannel?.frameId === target.frameId &&
        this.#targetImportChannel.channelId === importChannelId
      )
        this.#targetImportChannel = undefined;
      this.#host.markWorldStateDirty();
      this.#host.emitGameState();
      return true;
    }
    const placement = this.#placement;
    if (!placement) return false;
    const {desiredHeight, fit, intervalSeconds, movingFrameId, rotation} = placement;
    const aspectRatio = movingFrameId ? placement.aspectRatio : asset.aspectRatio;
    this.cancelDigitalArtFramePlacement();
    if (assetIndex >= 0)
      this.startDigitalArtFramePlacement(
        assetIndex,
        movingFrameId,
        desiredHeight,
        rotation,
        aspectRatio,
        fit,
        intervalSeconds,
      );
    return true;
  }

  async importPastedArtFrameImage(image: Blob, target: DigitalArtFramePasteTarget) {
    const importImage = this.#host.importArtFrameImage;
    if (!importImage) return false;
    const importChannelId = target.channelId;
    this.#importCount += 1;
    this.#importError = undefined;
    this.#host.emitGameState();
    try {
      const asset = await importImage(image, importChannelId, this.#host.abortSignal);
      if (this.#host.isDisposed()) return false;
      const assetIndex = this.#applyImportedImage(importChannelId, asset);
      if (assetIndex >= 0) this.#assetIndex = assetIndex;
      return this.#applyPastedArtFrameAsset(importChannelId, asset, assetIndex, target);
    } catch (error) {
      if (this.#host.abortSignal.aborted) return false;
      this.#importError =
        error instanceof Error && error.message ? error.message : "Pasted art frame image could not be imported";
      return false;
    } finally {
      this.#importCount = Math.max(0, this.#importCount - 1);
      if (!this.#host.isDisposed()) this.#host.emitGameState();
    }
  }
}
