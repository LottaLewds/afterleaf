import {
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  MathUtils,
  type PerspectiveCamera,
  type Raycaster,
  type Scene,
  type Texture,
} from "three";
import {DEV} from "solid-js";
import type {PosterAsset} from "~/posters/protocol";
import {
  DEFAULT_POSTER_HEIGHT,
  MAX_POSTER_HEIGHT,
  MIN_POSTER_HEIGHT,
  POSTER_ALPHA_TEST,
  POSTER_DEPTH_LAYER_SPACING,
  POSTER_PLACEMENT_DISTANCE,
  POSTER_POLYGON_OFFSET_FACTOR,
  POSTER_SURFACE_MARGIN,
  POSTER_SURFACE_OFFSET,
} from "~/game/wallDecorTuning";
import type {PosterSurface} from "~/game/interior/interiorPrimitives";
import type {WorldPosterSave} from "~/game/worldSave";

type PosterRecord = {
  asset: PosterAsset;
  depthLayer: number;
  height: number;
  id: string;
  mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  rotation: number;
};

type PosterPlacementSession = {
  assetIndex: number;
  depthLayer: number;
  desiredHeight: number;
  gridSnap: boolean;
  movingPosterId?: string;
  rotation: number;
};

type PosterPlacementSelection = {
  height: number;
};

/**
 * Scene services and shared registries the poster system needs. The
 * raycast-mesh registry is shared with interior builders; `surfaces` is
 * owned here but filled by the scene's poster-surface delegate.
 */
export type PosterSystemHost = {
  abortSignal: AbortSignal;
  camera: PerspectiveCamera;
  emitGameState: () => void;
  importPoster?: ((image: Blob, signal: AbortSignal) => Promise<PosterAsset>) | undefined;
  isDisposed: () => boolean;
  isPointerLocked: () => boolean;
  markWorldStateDirty: () => void;
  maxTextureAnisotropy: number;
  posterRaycastMeshes: Mesh[];
  raycaster: Raycaster;
  scene: Scene;
  textureLoader: {loadAsync(url: string): Promise<Texture>};
};

/**
 * Owns every placed poster, its textures, and the wall-placement session.
 * The scene drives it from input handlers and the media catalog.
 */
export class PosterSystem {
  readonly #scene: Scene;
  readonly #raycaster: Raycaster;
  readonly #raycastMeshes: Mesh[];
  readonly #surfaces = new Map<string, PosterSurface>();
  readonly #records = new Map<string, PosterRecord>();
  readonly #targetMeshes: Mesh[] = [];
  readonly #texturePromises = new Map<string, Promise<Texture>>();
  readonly #host: PosterSystemHost;
  readonly #importPosterFn: ((image: Blob, signal: AbortSignal) => Promise<PosterAsset>) | undefined;
  readonly #maxTextureAnisotropy: number;
  readonly #localPoint = new Vector3();
  readonly #placementPosition = new Vector3();
  readonly #placementRotation = new Quaternion();
  #assets: readonly PosterAsset[] = [];
  #assetIndex = 0;
  #nextDepthLayer = 1;
  #importCount = 0;
  #importError: string | undefined;
  #saveRestoreCompleted = false;
  #placement: PosterPlacementSession | undefined;
  #placementRevision = 0;
  #placementSelection: PosterPlacementSelection | undefined;
  #preview: Mesh<PlaneGeometry, MeshStandardMaterial> | undefined;
  #pendingSaves: readonly WorldPosterSave[] = [];
  #targetedId: string | undefined;

  constructor(host: PosterSystemHost) {
    this.#host = host;
    this.#scene = host.scene;
    this.#raycaster = host.raycaster;
    this.#raycastMeshes = host.posterRaycastMeshes;
    this.#importPosterFn = host.importPoster;
    this.#maxTextureAnisotropy = Math.min(8, host.maxTextureAnisotropy);
  }

  get placement(): PosterPlacementSession | undefined {
    return this.#placement;
  }
  get placementSelection(): PosterPlacementSelection | undefined {
    return this.#placementSelection;
  }
  get assets(): readonly PosterAsset[] {
    return this.#assets;
  }
  get assetIndex(): number {
    return this.#assetIndex;
  }
  get records(): ReadonlyMap<string, PosterRecord> {
    return this.#records;
  }
  get targetMeshes(): Mesh[] {
    return this.#targetMeshes;
  }
  get surfaces(): Map<string, PosterSurface> {
    return this.#surfaces;
  }
  get preview(): Mesh<PlaneGeometry, MeshStandardMaterial> | undefined {
    return this.#preview;
  }
  get importCount(): number {
    return this.#importCount;
  }
  get importError(): string | undefined {
    return this.#importError;
  }
  get saveRestoreCompleted(): boolean {
    return this.#saveRestoreCompleted;
  }
  get pendingSaves(): readonly WorldPosterSave[] {
    return this.#pendingSaves;
  }
  set pendingSaves(saves: readonly WorldPosterSave[]) {
    this.#pendingSaves = saves;
  }
  get targetedId(): string | undefined {
    return this.#targetedId;
  }
  set targetedId(id: string | undefined) {
    this.#targetedId = id;
  }

  /** Disposes any textures whose loads were still in flight. */
  disposePendingTextures(): void {
    for (const pendingTexture of this.#texturePromises.values())
      void pendingTexture.then((texture) => texture.dispose()).catch(() => {});
    this.#texturePromises.clear();
  }

  #catalogMatches(assets: readonly PosterAsset[]) {
    return (
      assets.length === this.#assets.length &&
      assets.every((asset, index) => {
        const current = this.#assets[index];
        if (!current) return false;
        return (
          asset.aspectRatio === current.aspectRatio &&
          asset.hasAlpha === current.hasAlpha &&
          asset.id === current.id &&
          asset.label === current.label &&
          asset.url === current.url
        );
      })
    );
  }

  applyPosterCatalog(assets: readonly PosterAsset[]) {
    if (this.#catalogMatches(assets)) return;
    const activeAssetId = this.#placement ? this.#assets[this.#placement.assetIndex]?.id : undefined;
    const selectedAssetId = this.#assets[this.#assetIndex]?.id;
    this.#assets = assets;
    const selectedIndex = selectedAssetId ? assets.findIndex((asset) => asset.id === selectedAssetId) : -1;
    this.#assetIndex = Math.max(0, selectedIndex);
    if (this.#placement && activeAssetId) {
      const activeIndex = assets.findIndex((asset) => asset.id === activeAssetId);
      if (activeIndex < 0) this.cancelPosterPlacement();
      else {
        this.#placement.assetIndex = activeIndex;
        this.#assetIndex = activeIndex;
      }
    }
    this.#host.emitGameState();
  }

  async restoreSavedPosters(assets: readonly PosterAsset[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const restoredIds = new Set<string>();
    this.#nextDepthLayer = Math.max(this.#nextDepthLayer, this.#pendingSaves.length + 1);
    await Promise.all(
      this.#pendingSaves.map(async (savedPoster, index) => {
        const asset = assetsById.get(savedPoster.assetId);
        if (!asset) return;
        try {
          const depthLayer = index + 1;
          const mesh = await this.#createPosterMesh(asset, savedPoster.height, depthLayer);
          if (this.#host.isDisposed()) {
            this.#disposePosterMesh(mesh);
            return;
          }
          mesh.position.copy(savedPoster.pose.position);
          mesh.quaternion.copy(savedPoster.pose.quaternion);
          this.#scene.add(mesh);
          this.#records.set(savedPoster.id, {
            asset,
            depthLayer,
            height: savedPoster.height,
            id: savedPoster.id,
            mesh,
            rotation: savedPoster.rotation ?? 0,
          });
          mesh.userData.posterId = savedPoster.id;
          this.#targetMeshes.push(mesh);
          restoredIds.add(savedPoster.id);
        } catch (error) {
          if (DEV) console.warn(`Afterleaf could not restore poster ${savedPoster.assetId}.`, error);
        }
      }),
    );
    if (restoredIds.size !== this.#pendingSaves.length) this.#host.markWorldStateDirty();
    this.#pendingSaves = [];
    this.#saveRestoreCompleted = true;
  }

  #posterTexture(asset: PosterAsset) {
    const cached = this.#texturePromises.get(asset.id);
    if (cached) return cached;
    const pending = this.#host.textureLoader.loadAsync(asset.url).then((texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.#maxTextureAnisotropy);
      return texture;
    });
    this.#texturePromises.set(asset.id, pending);
    void pending.catch(() => this.#texturePromises.delete(asset.id));
    return pending;
  }

  #setPosterDepthLayer(mesh: Mesh<PlaneGeometry, MeshStandardMaterial>, depthLayer: number) {
    const previousOffset = mesh.userData.posterDepthOffset;
    const localOffset = (depthLayer * POSTER_DEPTH_LAYER_SPACING) / mesh.scale.z;
    mesh.geometry.translate(0, 0, localOffset - (typeof previousOffset === "number" ? previousOffset : 0));
    mesh.userData.posterDepthOffset = localOffset;
    mesh.userData.posterDepthLayer = depthLayer;
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = POSTER_POLYGON_OFFSET_FACTOR;
    mesh.material.polygonOffsetUnits = -depthLayer;
    mesh.renderOrder = depthLayer;
  }

  #compactPosterDepthLayers() {
    const records = [...this.#records.values()].sort((left, right) => left.depthLayer - right.depthLayer);
    for (const [index, record] of records.entries()) {
      record.depthLayer = index + 1;
      this.#setPosterDepthLayer(record.mesh, record.depthLayer);
    }
    this.#nextDepthLayer = records.length + 1;
  }

  async #createPosterMesh(asset: PosterAsset, height: number, depthLayer: number) {
    const texture = await this.#posterTexture(asset);
    const mesh = new Mesh(
      new PlaneGeometry(asset.aspectRatio, 1),
      new MeshStandardMaterial({
        alphaTest: asset.hasAlpha ? POSTER_ALPHA_TEST : 0,
        map: texture,
        metalness: 0,
        roughness: 0.84,
        transparent: asset.hasAlpha,
      }),
    );
    mesh.name = `poster-${asset.id}`;
    mesh.scale.setScalar(height);
    mesh.userData.posterAssetId = asset.id;
    this.#setPosterDepthLayer(mesh, depthLayer);
    return mesh;
  }

  #disposePosterMesh(mesh: Mesh<PlaneGeometry, MeshStandardMaterial>) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  async startPosterPlacement(
    assetIndex: number,
    movingPosterId?: string,
    desiredHeight = DEFAULT_POSTER_HEIGHT,
    rotation = 0,
  ) {
    if (this.#assets.length === 0) return;
    const normalizedIndex = (assetIndex + this.#assets.length) % this.#assets.length;
    const asset = this.#assets[normalizedIndex];
    if (!asset) return;
    const revision = (this.#placementRevision += 1);
    this.#disposePosterPreview();
    const movingPoster = this.#records.get(movingPosterId ?? "");
    const depthLayer = this.#nextDepthLayer;
    this.#placement = {
      assetIndex: normalizedIndex,
      depthLayer,
      desiredHeight,
      gridSnap: true,
      ...(movingPosterId ? {movingPosterId} : {}),
      rotation,
    };
    this.#assetIndex = normalizedIndex;
    if (movingPoster) movingPoster.mesh.visible = false;
    this.#placementSelection = undefined;
    this.#targetedId = undefined;
    this.#host.emitGameState();
    try {
      const preview = await this.#createPosterMesh(asset, desiredHeight, depthLayer);
      if (
        this.#host.isDisposed() ||
        revision !== this.#placementRevision ||
        this.#placement?.assetIndex !== normalizedIndex
      ) {
        this.#disposePosterMesh(preview);
        return;
      }
      preview.name = `poster-placement-preview-${asset.id}`;
      preview.material.depthWrite = false;
      preview.material.opacity = 0.72;
      preview.material.transparent = true;
      preview.visible = false;
      this.#preview = preview;
      this.#scene.add(preview);
      this.updatePosterPlacementTarget();
    } catch (error) {
      if (DEV) console.warn(`Afterleaf could not load poster ${asset.id}.`, error);
      if (revision === this.#placementRevision) this.cancelPosterPlacement();
    }
  }

  startEmptyPosterPlacement() {
    this.#placementRevision += 1;
    this.#disposePosterPreview();
    this.#placement = {
      assetIndex: -1,
      depthLayer: this.#nextDepthLayer,
      desiredHeight: DEFAULT_POSTER_HEIGHT,
      gridSnap: true,
      rotation: 0,
    };
    this.#placementSelection = undefined;
    this.#targetedId = undefined;
    this.#host.emitGameState();
  }

  cyclePoster(direction: number) {
    const placement = this.#placement;
    if (!placement || direction === 0) return;
    void this.startPosterPlacement(
      placement.assetIndex + direction,
      placement.movingPosterId,
      placement.desiredHeight,
      placement.rotation,
    );
  }

  #disposePosterPreview() {
    const preview = this.#preview;
    if (!preview) return;
    this.#preview = undefined;
    this.#disposePosterMesh(preview);
  }

  cancelPosterPlacement() {
    const movingPosterId = this.#placement?.movingPosterId;
    this.#placementRevision += 1;
    this.#disposePosterPreview();
    const movingPoster = this.#records.get(movingPosterId ?? "");
    if (movingPoster) movingPoster.mesh.visible = true;
    this.#placement = undefined;
    this.#placementSelection = undefined;
    this.#host.emitGameState();
  }

  #setPosterPlacementSelection(height?: number) {
    if (height === this.#placementSelection?.height) return;
    this.#placementSelection = height === undefined ? undefined : {height};
    this.#host.emitGameState();
  }

  #resolveWallPlacement(
    surface: PosterSurface,
    worldPoint: Vector3,
    aspectRatio: number,
    desiredHeight: number,
    rotation: number,
    border = 0,
    gridSnap = true,
  ) {
    const framedAspectRatio = aspectRatio + border;
    const framedHeight = 1 + border;
    const cosine = Math.abs(Math.cos(rotation));
    const sine = Math.abs(Math.sin(rotation));
    const boundingWidthPerHeight = cosine * framedAspectRatio + sine * framedHeight;
    const boundingHeightPerHeight = sine * framedAspectRatio + cosine * framedHeight;
    const maximumHeight = Math.min(
      MAX_POSTER_HEIGHT,
      (surface.height - POSTER_SURFACE_MARGIN) / boundingHeightPerHeight,
      (surface.width - POSTER_SURFACE_MARGIN) / boundingWidthPerHeight,
    );
    if (maximumHeight < MIN_POSTER_HEIGHT) return;
    const height = MathUtils.clamp(desiredHeight, MIN_POSTER_HEIGHT, maximumHeight);
    const halfWidth = (boundingWidthPerHeight * height) / 2;
    const halfHeight = (boundingHeightPerHeight * height) / 2;
    const point = this.#localPoint.copy(worldPoint);
    surface.target.worldToLocal(point);
    point.x = MathUtils.clamp(
      point.x,
      -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
      surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
    );
    if (gridSnap)
      point.x = MathUtils.clamp(
        Math.round(point.x / 0.25) * 0.25,
        -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
        surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
      );
    point.y = MathUtils.clamp(
      point.y,
      -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
      surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
    );
    if (gridSnap)
      point.y = MathUtils.clamp(
        Math.round(point.y / 0.25) * 0.25,
        -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
        surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
      );
    point.z = POSTER_SURFACE_OFFSET + (border > 0 ? 0.025 : 0);
    surface.target.localToWorld(this.#placementPosition.copy(point));
    surface.target.getWorldQuaternion(this.#placementRotation);
    return height;
  }

  updatePosterPlacementTarget() {
    const placement = this.#placement;
    const preview = this.#preview;
    if (!placement || !preview || !this.#host.isPointerLocked()) {
      if (preview) preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    const asset = this.#assets[placement.assetIndex];
    if (!asset) return;
    const intersection = this.#raycaster.intersectObjects(this.#raycastMeshes, false)[0];
    const surfaceId = intersection?.object.userData.posterSurfaceId;
    const surface = typeof surfaceId === "string" ? this.#surfaces.get(surfaceId) : undefined;
    if (!intersection || intersection.distance > POSTER_PLACEMENT_DISTANCE || !surface) {
      preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    const height = this.#resolveWallPlacement(
      surface,
      intersection.point,
      asset.aspectRatio,
      placement.desiredHeight,
      placement.rotation,
      0,
      placement.gridSnap,
    );
    if (height === undefined) {
      preview.visible = false;
      this.#setPosterPlacementSelection();
      return;
    }
    preview.position.copy(this.#placementPosition);
    preview.quaternion.copy(this.#placementRotation);
    preview.rotateZ(placement.rotation);
    preview.scale.setScalar(height);
    this.#setPosterDepthLayer(preview, placement.depthLayer);
    preview.visible = true;
    this.#setPosterPlacementSelection(height);
  }

  placePoster() {
    const placement = this.#placement;
    const selection = this.#placementSelection;
    const preview = this.#preview;
    const asset = placement ? this.#assets[placement.assetIndex] : undefined;
    if (!placement || !selection || !preview || !asset || !preview.visible) return;
    preview.material.opacity = 1;
    preview.material.transparent = asset.hasAlpha;
    preview.material.depthWrite = true;
    const existing = placement.movingPosterId ? this.#records.get(placement.movingPosterId) : undefined;
    if (existing) {
      const targetIndex = this.#targetMeshes.indexOf(existing.mesh);
      this.#disposePosterMesh(existing.mesh);
      existing.asset = asset;
      existing.depthLayer = placement.depthLayer;
      existing.height = selection.height;
      existing.mesh = preview;
      existing.rotation = placement.rotation;
      existing.mesh.material.depthWrite = true;
      existing.mesh.material.opacity = 1;
      existing.mesh.material.transparent = asset.hasAlpha;
      existing.mesh.userData.posterId = existing.id;
      if (targetIndex >= 0) this.#targetMeshes[targetIndex] = preview;
      else this.#targetMeshes.push(preview);
      this.#preview = undefined;
    } else {
      const id = globalThis.crypto.randomUUID();
      preview.material.depthWrite = true;
      preview.material.opacity = 1;
      preview.material.transparent = asset.hasAlpha;
      preview.userData.posterId = id;
      this.#records.set(id, {
        asset,
        depthLayer: placement.depthLayer,
        height: selection.height,
        id,
        mesh: preview,
        rotation: placement.rotation,
      });
      this.#targetMeshes.push(preview);
      this.#preview = undefined;
    }
    this.#compactPosterDepthLayers();
    this.#placement = undefined;
    this.#placementSelection = undefined;
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  removeTargetedPoster() {
    const posterId = this.#targetedId;
    if (!posterId) return;
    const record = this.#records.get(posterId);
    if (!record) return;
    this.#disposePosterMesh(record.mesh);
    this.#records.delete(posterId);
    this.#compactPosterDepthLayers();
    const targetIndex = this.#targetMeshes.indexOf(record.mesh);
    if (targetIndex >= 0) this.#targetMeshes.splice(targetIndex, 1);
    this.#targetedId = undefined;
    this.#host.markWorldStateDirty();
    this.#host.emitGameState();
  }

  async importPastedPoster(image: Blob) {
    const importPoster = this.#importPosterFn;
    if (!importPoster) return;
    this.#importCount += 1;
    this.#importError = undefined;
    this.#host.emitGameState();
    try {
      const asset = await importPoster(image, this.#host.abortSignal);
      if (this.#host.isDisposed()) return;
      this.applyPosterCatalog(
        [...this.#assets.filter((candidate) => candidate.id !== asset.id), asset].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      );
      const assetIndex = this.#assets.findIndex((candidate) => candidate.id === asset.id);
      if (assetIndex >= 0) this.#assetIndex = assetIndex;
      const placement = this.#placement;
      if (!placement) return;
      const desiredHeight = placement.desiredHeight;
      const rotation = placement.rotation;
      this.cancelPosterPlacement();
      if (assetIndex >= 0) void this.startPosterPlacement(assetIndex, undefined, desiredHeight, rotation);
    } catch (error) {
      if (this.#host.abortSignal.aborted) return;
      this.#importError =
        error instanceof Error && error.message ? error.message : "Pasted poster could not be imported";
    } finally {
      this.#importCount = Math.max(0, this.#importCount - 1);
      if (!this.#host.isDisposed()) this.#host.emitGameState();
    }
  }
}
