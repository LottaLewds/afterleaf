import {
  BatchedMesh,
  BufferAttribute,
  CanvasTexture,
  Color,
  LinearFilter,
  SRGBColorSpace,
  type Scene,
  type Texture,
} from "three";
import {type WebGLRenderer} from "three";
import {KTX2Loader} from "three/examples/jsm/loaders/KTX2Loader.js";
import {DEV} from "solid-js";
import type {CatalogItem} from "~/catalog";
import type {CatalogAtlases, CatalogShelfAtlas} from "~/catalog";
import {remapBookGeometryToAtlas} from "~/game/bookAtlasGeometry";
import {
  createBookExteriorMaterial,
  type BookAtlasBatch,
  type BookAtlasTextures,
} from "~/game/bookExteriorMaterial";
import type {BookRecord} from "~/game/bookFactory";

/** Standalone cover-texture LRU cap. */
export const STANDALONE_BOOK_TEXTURE_CACHE_SIZE = 24;

/** Scene services the book texture runtime needs. */
export type BookTextureRuntimeHost = {
  catalogAtlases: () => CatalogAtlases;
  getBooks: () => ReadonlyMap<string, BookRecord>;
  /** Cover-detail targets (hover/selection) that justify standalone textures. */
  isActiveDetailTarget: (publicationId: string) => boolean;
  /** Hover/selected/carried/inspecting/discard/shelve: never trimmed. */
  isPinnedOrInFlight: (publicationId: string) => boolean;
  isDisposed: () => boolean;
  /** Carried / inspecting / discard / shelve books render standalone. */
  isBookInFlight: (publicationId: string) => boolean;
  maxAnisotropy: () => number;
  nextFrame: () => Promise<void>;
  renderer: WebGLRenderer;
  scene: Scene;
  textureLoader: {
    load(
      url: string,
      onLoad: (texture: Texture) => void,
      onProgress?: undefined,
      onError?: () => void,
    ): Texture;
    loadAsync(url: string): Promise<Texture>;
  };
};

type BookAtlasResource = {
  coverAtlas: CatalogShelfAtlas;
  spineAtlas: CatalogShelfAtlas;
  textures: BookAtlasTextures;
};

/**
 * Owns the batched-atlas rendering path and the standalone cover/spine
 * texture pipeline for the shop's books. The scene drives it from
 * `syncBooks`; visibility decisions come in through the host predicates.
 */
export class BookTextureRuntime {
  readonly #batches: BookAtlasBatch[] = [];
  readonly #batchTextures: BookAtlasTextures[] = [];
  readonly #standaloneIds = new Set<string>();
  readonly #host: BookTextureRuntimeHost;
  #ktx2: KTX2Loader | undefined;
  #revision = 0;

  constructor(host: BookTextureRuntimeHost) {
    this.#host = host;
  }

  /** Disposes the lazily created KTX2 transcoder loader. */
  disposeKtx2(): void {
    this.#ktx2?.dispose();
  }

  /** Drops every standalone id (used on full disposal). */
  clearStandaloneIds(): void {
    this.#standaloneIds.clear();
  }

  forgetStandaloneId(publicationId: string): void {
    this.#standaloneIds.delete(publicationId);
  }

  get revision(): number {
    return this.#revision;
  }
  bumpRevision(): number {
    return (this.#revision += 1);
  }

  async #loadShelfAtlasTexture(url: string): Promise<Texture> {
    // Catalog asset URLs carry a cache-busting query; test the pathname.
    const pathname = url.split(/[?#]/u, 1)[0] ?? url;
    if (!pathname.endsWith(".ktx2"))
      return this.#host.textureLoader.loadAsync(url);
    this.#ktx2 ??= new KTX2Loader()
      .setTranscoderPath("/api/runtime/basis/")
      .detectSupport(this.#host.renderer);
    const texture = await this.#ktx2.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    return texture;
  }

  async #loadBookAtlasResources(
    atlases: CatalogAtlases,
    atlasIndexes: readonly number[],
  ): Promise<Map<number, BookAtlasResource> | undefined> {
    const atlasResources = new Map<number, BookAtlasResource>();
    try {
      const loadedResources = await Promise.all(
        atlasIndexes.map(async (atlasIndex) => {
          const front = atlases.front[atlasIndex];
          const back = atlases.back[atlasIndex];
          const spine = atlases.spine[atlasIndex];
          if (
            !front ||
            !back ||
            !spine ||
            front.columns !== back.columns ||
            front.rows !== back.rows ||
            front.firstPublicationIndex !== back.firstPublicationIndex ||
            front.firstPublicationIndex !== spine.firstPublicationIndex ||
            front.publicationCount !== back.publicationCount ||
            front.publicationCount !== spine.publicationCount
          )
            return;
          const [frontTexture, backTexture, spineTexture] = await Promise.all([
            this.#loadShelfAtlasTexture(front.url),
            this.#loadShelfAtlasTexture(back.url),
            this.#loadShelfAtlasTexture(spine.url),
          ]);
          const textures = {
            back: backTexture,
            front: frontTexture,
            spine: spineTexture,
          };
          for (const texture of Object.values(textures)) {
            texture.colorSpace = SRGBColorSpace;
            texture.generateMipmaps = false;
            texture.minFilter = LinearFilter;
          }
          return [
            atlasIndex,
            {coverAtlas: front, spineAtlas: spine, textures},
          ] as const;
        }),
      );
      for (const resource of loadedResources) {
        if (!resource) continue;
        atlasResources.set(...resource);
      }
    } catch (error) {
      for (const resource of atlasResources.values())
        for (const texture of Object.values(resource.textures))
          texture.dispose();
      if (DEV && !this.#host.isDisposed())
        console.warn(
          "Afterleaf could not load the book texture atlases.",
          error,
        );
      return;
    }
    return atlasResources;
  }

  async initializeBookAtlasBatches(
    items: readonly CatalogItem[],
    revision: number,
  ) {
    const atlases = this.#host.catalogAtlases();
    const atlasIndexes = [
      ...new Set(
        items.flatMap((item) =>
          item.shelfAtlas === undefined ? [] : [item.shelfAtlas.index],
        ),
      ),
    ];
    const atlasResources = await this.#loadBookAtlasResources(
      atlases,
      atlasIndexes,
    );
    if (!atlasResources) return;
    if (this.#host.isDisposed() || revision !== this.#revision) {
      for (const resource of atlasResources.values())
        for (const texture of Object.values(resource.textures))
          texture.dispose();
      return;
    }

    const groups = new Map<
      string,
      {
        coverAtlas: CatalogShelfAtlas;
        entries: {item: CatalogItem; record: BookRecord}[];
        spineAtlas: CatalogShelfAtlas;
        textures: BookAtlasTextures;
      }
    >();
    for (const item of items) {
      const shelfAtlas = item.shelfAtlas;
      const record = this.#host.getBooks().get(item.id);
      if (!shelfAtlas || !record) continue;
      const resource = atlasResources.get(shelfAtlas.index);
      if (
        !resource ||
        shelfAtlas.cellIndex < 0 ||
        shelfAtlas.cellIndex >= resource.coverAtlas.publicationCount
      )
        continue;
      // Accent and reading direction ride on per-instance geometry
      // attributes now, so one atlas index forms one draw call.
      const key = `${shelfAtlas.index}`;
      const group = groups.get(key);
      if (group) group.entries.push({item, record});
      else
        groups.set(key, {
          coverAtlas: resource.coverAtlas,
          entries: [{item, record}],
          spineAtlas: resource.spineAtlas,
          textures: resource.textures,
        });
    }

    const builtIndexes = new Set<number>();
    for (const [key, group] of groups) {
      // Building a batch attaches fresh atlas textures; uploading the whole
      // set inside one frame stalls the main thread behind the driver for
      // seconds. Yield so each atlas trio lands in its own frame instead.
      if (this.#host.isDisposed() || revision !== this.#revision) break;
      await this.#host.nextFrame();
      const {material, uniforms} = createBookExteriorMaterial(
        new Color("#ffffff"),
        -1,
        true,
        true,
      );
      uniforms.coverMap.value = group.textures.front;
      uniforms.backMap.value = group.textures.back;
      uniforms.backMapEnabled.value = true;
      uniforms.spineMap.value = group.textures.spine;
      uniforms.spineMapEnabled.value = true;
      const vertexCount = group.entries.reduce(
        (total, entry) =>
          total +
          (entry.record.mesh.geometry.getAttribute("position")?.count ?? 0),
        0,
      );
      const indexCount = group.entries.reduce(
        (total, entry) =>
          total + (entry.record.mesh.geometry.getIndex()?.count ?? 0),
        0,
      );
      const mesh = new BatchedMesh(
        group.entries.length,
        vertexCount,
        indexCount,
        material,
      );
      mesh.name = "book-atlas-batch";
      mesh.userData.publicationIds = group.entries.map(({item}) => item.id);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // Three's per-object BatchedMesh culling incorrectly drops thin,
      // spine-facing books at some camera angles. The whole library is only a
      // few thousand triangles, so drawing every batched book is cheaper than
      // falling back to hundreds of standalone meshes.
      mesh.perObjectFrustumCulled = false;
      mesh.sortObjects = false;
      const batch = {material, mesh};
      for (const {item, record} of group.entries) {
        const shelfAtlas = item.shelfAtlas;
        if (!shelfAtlas) continue;
        const geometry = remapBookGeometryToAtlas(
          record.mesh.geometry,
          group.coverAtlas,
          group.spineAtlas,
          shelfAtlas.cellIndex,
          item.aspectRatio,
          item.thicknessMm,
        );
        // Per-instance accent and spine direction, consumed by the merged
        // book shader in place of uniforms.
        const positionCount = geometry.getAttribute("position")?.count ?? 0;
        const accent = new Color(item.accent);
        const accentArray = new Float32Array(positionCount * 3);
        for (let index = 0; index < positionCount; index += 1) {
          accentArray[index * 3] = accent.r;
          accentArray[index * 3 + 1] = accent.g;
          accentArray[index * 3 + 2] = accent.b;
        }
        geometry.setAttribute(
          "bookAccent",
          new BufferAttribute(accentArray, 3),
        );
        const sign = item.direction === "LTR" ? -1 : 1;
        const signArray = new Float32Array(positionCount).fill(sign);
        geometry.setAttribute(
          "bookSpineSign",
          new BufferAttribute(signArray, 1),
        );
        const geometryId = mesh.addGeometry(geometry);
        geometry.dispose();
        const instanceId = mesh.addInstance(geometryId);
        record.mesh.updateMatrix();
        mesh.setMatrixAt(instanceId, record.mesh.matrix);
        record.atlasPlacement = {
          batch,
          instanceId,
          lastMatrix: record.mesh.matrix.clone(),
          visible: true,
          detached: false,
        };
      }
      this.#host.scene.add(mesh);
      this.#batches.push(batch);
      builtIndexes.add(Number(key));
    }
    if (builtIndexes.size < atlasResources.size) {
      // Either boot was aborted mid-build or a resource matched no entries;
      // dispose textures for every atlas that never built a batch.
      for (const [index, resource] of atlasResources) {
        if (builtIndexes.has(index)) continue;
        for (const texture of Object.values(resource.textures))
          texture.dispose();
      }
    }
    this.#batchTextures.push(
      ...[...atlasResources.entries()]
        .filter(([index]) => builtIndexes.has(index))
        .map(([, resource]) => resource.textures),
    );
    this.syncBookAtlasBatches();
  }

  syncBookAtlasBatches() {
    for (const [publicationId, record] of this.#host.getBooks()) {
      const placement = record.atlasPlacement;
      if (!placement) {
        record.mesh.visible = true;
        continue;
      }
      const forcedStandalone =
        record.state.status === "carried" ||
        this.#host.isBookInFlight(publicationId);
      // A mesh some other system reparented (carry handoff, restore) cannot
      // render as a batch instance; fall back to standalone.
      const externallyOwned =
        record.mesh.parent !== this.#host.scene &&
        !(record.mesh.parent === null && placement.detached);
      const readyStandalone =
        record.standaloneTexturesReady &&
        this.#host.isActiveDetailTarget(publicationId);
      const standalone = forcedStandalone || readyStandalone || externallyOwned;
      const batchVisible = record.exteriorMaterial.visible && !standalone;
      if (batchVisible !== placement.visible) {
        placement.batch.mesh.setVisibleAt(placement.instanceId, batchVisible);
        placement.visible = batchVisible;
      }
      // Dormant batched books leave the scene graph entirely: their subtree
      // (inspection assembly included) then skips per-frame traversal.
      // Detached meshes keep world-space local transforms, so re-adding
      // restores the exact pose.
      if (batchVisible) {
        if (!placement.detached && record.mesh.parent === this.#host.scene) {
          record.mesh.removeFromParent();
          placement.detached = true;
        } else if (record.mesh.parent !== null) placement.detached = false;
      } else if (placement.detached && record.mesh.parent === null) {
        this.#host.scene.add(record.mesh);
        placement.detached = false;
      }
      record.mesh.visible = standalone;
      if (!batchVisible) continue;
      record.mesh.updateMatrix();
      if (placement.lastMatrix.equals(record.mesh.matrix)) continue;
      placement.lastMatrix.copy(record.mesh.matrix);
      placement.batch.mesh.setMatrixAt(
        placement.instanceId,
        record.mesh.matrix,
      );
    }
  }

  disposeBookAtlasBatches() {
    for (const record of this.#host.getBooks().values()) {
      const placement = record.atlasPlacement;
      if (placement) {
        placement.batch.mesh.setVisibleAt(placement.instanceId, false);
        // Return detached meshes to the graph; they render standalone now.
        if (placement.detached && record.mesh.parent === null)
          this.#host.scene.add(record.mesh);
      }
      record.atlasPlacement = undefined;
      record.mesh.visible = true;
    }
    for (const batch of this.#batches) {
      batch.mesh.removeFromParent();
      batch.mesh.dispose();
      batch.material.dispose();
    }
    this.#batches.length = 0;
    for (const textures of this.#batchTextures)
      for (const texture of Object.values(textures)) texture.dispose();
    this.#batchTextures.length = 0;
  }

  #createBookSpineTexture(
    title: string,
    language: CatalogItem["language"],
    accent: string,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    const background = new Color(accent).multiplyScalar(0.42).getStyle();
    const border = new Color(accent).multiplyScalar(0.88).getStyle();
    const characters = Array.from(title.trim().replace(/\s+/g, " "));
    const label =
      characters.length > 54
        ? `${characters.slice(0, 53).join("")}…`
        : characters.join("");

    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(5, 8, 7, 0.48)");
    gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.03)");
    gradient.addColorStop(0.86, "rgba(255, 255, 255, 0.03)");
    gradient.addColorStop(1, "rgba(255, 245, 220, 0.14)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = border;
    context.globalAlpha = 0.8;
    context.lineWidth = 3;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.globalAlpha = 1;
    context.fillStyle = "#efe6d5";
    context.font = '700 20px Inter, "Yu Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(language === "japanese" ? "JP" : "EN", 64, 52);
    context.strokeStyle = border;
    context.beginPath();
    context.moveTo(20, 88);
    context.lineTo(108, 88);
    context.moveTo(20, 680);
    context.lineTo(108, 680);
    context.stroke();
    context.save();
    context.translate(66, 650);
    context.rotate(-Math.PI / 2);
    context.font = '600 38px Inter, "Yu Gothic", sans-serif';
    context.textAlign = "left";
    context.fillText(label || "Untitled edition", 0, 0, 530);
    context.restore();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(
      4,
      this.#host.renderer.capabilities.getMaxAnisotropy(),
    );
    return texture;
  }

  ensureStandaloneBookTextures(publicationId: string, record: BookRecord) {
    this.#standaloneIds.delete(publicationId);
    this.#standaloneIds.add(publicationId);
    const anisotropy = Math.min(
      4,
      this.#host.renderer.capabilities.getMaxAnisotropy(),
    );
    if (!record.texture) {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#host.textureLoader.load(
        record.coverTextureUrl,
        (loadedTexture) => {
          if (
            this.#host.isDisposed() ||
            this.#host.getBooks().get(publicationId) !== record ||
            record.texture !== loadedTexture
          ) {
            loadedTexture.dispose();
            return;
          }
          loadedTexture.colorSpace = SRGBColorSpace;
          loadedTexture.anisotropy = anisotropy;
          record.coverTextureReady = true;
          if (!record.detailTextureReady)
            this.#setBookCoverTexture(record, loadedTexture);
          this.#syncStandaloneBookTextureReadiness(record);
        },
        undefined,
        () => {
          if (record.texture !== requestedTexture) return;
          requestedTexture?.dispose();
          record.texture = undefined;
          record.coverTextureReady = false;
          record.exteriorUniforms.coverMap.value = null;
          this.#syncStandaloneBookTextureReadiness(record);
        },
      );
      requestedTexture.colorSpace = SRGBColorSpace;
      requestedTexture.anisotropy = anisotropy;
      record.texture = requestedTexture;
      if (!record.detailTextureReady)
        this.#setBookCoverTexture(record, requestedTexture);
    }
    if (record.backTextureUrl && !record.backTexture) {
      let requestedTexture: Texture | undefined;
      requestedTexture = this.#host.textureLoader.load(
        record.backTextureUrl,
        (loadedTexture) => {
          if (
            this.#host.isDisposed() ||
            this.#host.getBooks().get(publicationId) !== record ||
            record.backTexture !== loadedTexture
          ) {
            loadedTexture.dispose();
            return;
          }
          loadedTexture.colorSpace = SRGBColorSpace;
          loadedTexture.anisotropy = anisotropy;
          record.backTextureReady = true;
          record.exteriorUniforms.backMap.value = loadedTexture;
          record.exteriorUniforms.backMapEnabled.value = true;
          record.inspectionBackCoverMaterial.color.set("#ffffff");
          record.inspectionBackCoverMaterial.map = loadedTexture;
          record.inspectionBackCoverMaterial.emissiveMap = loadedTexture;
          record.inspectionBackCoverMaterial.needsUpdate = true;
          this.#syncStandaloneBookTextureReadiness(record);
        },
        undefined,
        () => {
          if (record.backTexture !== requestedTexture) return;
          requestedTexture?.dispose();
          record.backTexture = undefined;
          record.backTextureReady = true;
          record.exteriorUniforms.backMap.value = null;
          record.exteriorUniforms.backMapEnabled.value = false;
          this.#syncStandaloneBookTextureReadiness(record);
        },
      );
      requestedTexture.colorSpace = SRGBColorSpace;
      requestedTexture.anisotropy = anisotropy;
      record.backTexture = requestedTexture;
    }
    if (!record.spineTexture) {
      const spineTextureUrl = record.spineTextureUrl;
      if (spineTextureUrl) {
        let requestedTexture: Texture | undefined;
        requestedTexture = this.#host.textureLoader.load(
          spineTextureUrl,
          (loadedTexture) => {
            if (
              this.#host.isDisposed() ||
              this.#host.getBooks().get(publicationId) !== record ||
              record.spineTexture !== loadedTexture
            ) {
              loadedTexture.dispose();
              return;
            }
            loadedTexture.colorSpace = SRGBColorSpace;
            loadedTexture.anisotropy = anisotropy;
            record.spineTextureReady = true;
            record.exteriorUniforms.spineMap.value = loadedTexture;
            record.exteriorUniforms.spineMapEnabled.value = true;
            this.#syncStandaloneBookTextureReadiness(record);
          },
          undefined,
          () => {
            if (record.spineTexture !== requestedTexture) return;
            requestedTexture?.dispose();
            const fallbackTexture = this.#createBookSpineTexture(
              record.publicationTitle,
              record.publicationLanguage,
              record.publicationAccent,
            );
            record.spineTexture = fallbackTexture;
            record.spineTextureReady = true;
            record.exteriorUniforms.spineMap.value = fallbackTexture ?? null;
            record.exteriorUniforms.spineMapEnabled.value =
              fallbackTexture !== undefined;
            this.#syncStandaloneBookTextureReadiness(record);
          },
        );
        requestedTexture.colorSpace = SRGBColorSpace;
        requestedTexture.anisotropy = anisotropy;
        record.spineTexture = requestedTexture;
      } else {
        const fallbackTexture = this.#createBookSpineTexture(
          record.publicationTitle,
          record.publicationLanguage,
          record.publicationAccent,
        );
        record.spineTexture = fallbackTexture;
        record.spineTextureReady = true;
        record.exteriorUniforms.spineMap.value = fallbackTexture ?? null;
        record.exteriorUniforms.spineMapEnabled.value =
          fallbackTexture !== undefined;
        this.#syncStandaloneBookTextureReadiness(record);
      }
    }
    this.#trimStandaloneBookTextures();
  }

  #trimStandaloneBookTextures() {
    if (this.#standaloneIds.size <= STANDALONE_BOOK_TEXTURE_CACHE_SIZE) return;
    for (const publicationId of this.#standaloneIds) {
      if (this.#host.isPinnedOrInFlight(publicationId)) continue;
      const record = this.#host.getBooks().get(publicationId);
      if (record) this.releaseStandaloneBookTextures(publicationId, record);
      else this.#standaloneIds.delete(publicationId);
      if (this.#standaloneIds.size <= STANDALONE_BOOK_TEXTURE_CACHE_SIZE)
        return;
    }
  }

  releaseStandaloneBookTextures(publicationId: string, record: BookRecord) {
    this.#standaloneIds.delete(publicationId);
    record.texture?.dispose();
    record.texture = undefined;
    record.coverTextureReady = false;
    record.backTexture?.dispose();
    record.backTexture = undefined;
    record.backTextureReady = record.backTextureUrl === undefined;
    record.spineTexture?.dispose();
    record.spineTexture = undefined;
    record.spineTextureReady = false;
    record.standaloneTexturesReady = false;
    record.exteriorUniforms.coverMap.value = null;
    record.exteriorUniforms.backMap.value = null;
    record.exteriorUniforms.backMapEnabled.value = false;
    record.exteriorUniforms.spineMap.value = null;
    record.exteriorUniforms.spineMapEnabled.value = false;
    record.inspectionFrontCoverMaterial.map = null;
    record.inspectionFrontCoverMaterial.emissiveMap = null;
    record.inspectionFrontCoverMaterial.needsUpdate = true;
    record.inspectionBackCoverMaterial.map = null;
    record.inspectionBackCoverMaterial.emissiveMap = null;
    record.inspectionBackCoverMaterial.color
      .set(record.publicationAccent)
      .multiplyScalar(0.76);
    record.inspectionBackCoverMaterial.needsUpdate = true;
  }

  promoteBookCoverTexture(publicationId: string, record: BookRecord) {
    this.ensureStandaloneBookTextures(publicationId, record);
    if (record.detailTextureReady && record.detailTexture) {
      this.#setBookCoverTexture(record, record.detailTexture);
      return;
    }
    const detailCoverUrl = record.detailCoverUrl;
    if (!detailCoverUrl || record.detailTextureLoading) return;
    record.detailTextureLoading = true;
    const detailTexture = this.#host.textureLoader.load(
      detailCoverUrl,
      (loadedTexture) => {
        if (
          this.#host.isDisposed() ||
          this.#host.getBooks().get(publicationId) !== record
        ) {
          loadedTexture.dispose();
          return;
        }
        loadedTexture.colorSpace = SRGBColorSpace;
        loadedTexture.anisotropy = Math.min(
          8,
          this.#host.renderer.capabilities.getMaxAnisotropy(),
        );
        record.detailTexture = loadedTexture;
        record.detailTextureLoading = false;
        if (
          record.state.status !== "carried" &&
          !this.#host.isBookInFlight(publicationId)
        ) {
          loadedTexture.dispose();
          record.detailTexture = undefined;
          record.detailTextureReady = false;
          return;
        }
        record.detailTextureReady = true;
        this.#setBookCoverTexture(record, loadedTexture);
      },
      undefined,
      () => {
        if (this.#host.getBooks().get(publicationId) !== record) return;
        record.detailTexture?.dispose();
        record.detailTexture = undefined;
        record.detailTextureLoading = false;
      },
    );
    record.detailTexture = detailTexture;
  }

  #setBookCoverTexture(record: BookRecord, texture: Texture) {
    record.exteriorUniforms.coverMap.value = texture;
    record.inspectionFrontCoverMaterial.map = texture;
    record.inspectionFrontCoverMaterial.emissiveMap = texture;
    record.inspectionFrontCoverMaterial.needsUpdate = true;
  }

  restoreCompactBookCoverTexture(record: BookRecord) {
    if (record.texture) this.#setBookCoverTexture(record, record.texture);
    if (!record.detailTextureReady) return;
    record.detailTexture?.dispose();
    record.detailTexture = undefined;
    record.detailTextureReady = false;
  }

  #syncStandaloneBookTextureReadiness(record: BookRecord) {
    const ready =
      record.coverTextureReady &&
      record.backTextureReady &&
      record.spineTextureReady;
    if (ready === record.standaloneTexturesReady) return;
    record.standaloneTexturesReady = ready;
    this.syncBookAtlasBatches();
  }
}
