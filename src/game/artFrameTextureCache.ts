import {ImageBitmapLoader, LinearFilter, SRGBColorSpace, Texture} from "three";
import {DEV} from "solid-js";
import type {ArtFrameImage} from "~/artFrames/protocol";
import {ART_FRAME_TEXTURE_UPLOAD_IDLE_BUDGET_MS, MAX_UNUSED_ART_FRAME_TEXTURES} from "~/game/wallDecorTuning";

export type ArtFrameTextureCacheEntry = {
  lastUsed: number;
  loadState: ArtFrameTextureLoadState;
  promise: Promise<Texture>;
  references: number;
};

export type ArtFrameTextureLoadState = {
  // Explicitly nullable so queue removal can clear the back-reference.
  preparation?: ArtFrameTexturePreparation | undefined;
  priority: "display" | "preload";
};

export type ArtFrameTexturePreparation = {
  loadState: ArtFrameTextureLoadState;
  resolve: () => void;
  texture: Texture;
};

/** Host services the texture cache needs from the owning scene. */
export type ArtFrameTextureCacheHost = {
  isDisposed: () => boolean;
  renderer: {
    capabilities: {getMaxAnisotropy(): number};
    initTexture(texture: Texture): void;
  };
  textureLoader: {loadAsync(url: string): Promise<Texture>};
};

/**
 * Reference-counted texture cache for art-frame images with idle-time GPU
 * preparation: non-display loads upload lazily via requestIdleCallback and
 * are promoted to immediate upload when first displayed.
 */
export class ArtFrameTextureCache {
  readonly #entries = new Map<string, ArtFrameTextureCacheEntry>();
  readonly #queue: ArtFrameTexturePreparation[] = [];
  readonly #bitmapLoader = new ImageBitmapLoader().setOptions({
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  readonly #host: ArtFrameTextureCacheHost;
  #clock = 0;
  #handle: number | undefined;
  #usesIdleCallback = false;

  constructor(host: ArtFrameTextureCacheHost) {
    this.#host = host;
  }

  get(image: ArtFrameImage, priority: ArtFrameTextureLoadState["priority"]) {
    const cached = this.#entries.get(image.id);
    if (cached) {
      cached.references += 1;
      cached.lastUsed = this.#clock += 1;
      if (priority === "display") this.#promote(cached);
      return cached.promise;
    }
    this.#trim();
    const loadState: ArtFrameTextureLoadState = {priority};
    const pending = this.#load(image, loadState);
    const entry: ArtFrameTextureCacheEntry = {
      lastUsed: (this.#clock += 1),
      loadState,
      promise: pending,
      references: 1,
    };
    this.#entries.set(image.id, entry);
    void pending.catch(() => {
      if (this.#entries.get(image.id) === entry) this.#entries.delete(image.id);
    });
    return pending;
  }

  async #load(image: ArtFrameImage, loadState: ArtFrameTextureLoadState) {
    let texture: Texture;
    if (typeof globalThis.createImageBitmap === "function") {
      const bitmap = await this.#bitmapLoader.loadAsync(image.url);
      texture = new Texture(bitmap);
      texture.needsUpdate = true;
    } else texture = await this.#host.textureLoader.loadAsync(image.url);
    if (this.#host.isDisposed()) return texture;
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.anisotropy = Math.min(8, this.#host.renderer.capabilities.getMaxAnisotropy());
    if (loadState.priority === "display") this.#host.renderer.initTexture(texture);
    else await this.#prepare(texture, loadState);
    return texture;
  }

  #promote(entry: ArtFrameTextureCacheEntry) {
    entry.loadState.priority = "display";
    const preparation = entry.loadState.preparation;
    if (!preparation) return;
    const preparationIndex = this.#queue.indexOf(preparation);
    if (preparationIndex >= 0) this.#queue.splice(preparationIndex, 1);
    entry.loadState.preparation = undefined;
    try {
      this.#host.renderer.initTexture(preparation.texture);
    } catch (error) {
      if (DEV) console.warn("Afterleaf could not upload an art texture.", error);
    }
    preparation.resolve();
  }

  release(imageId: string) {
    const entry = this.#entries.get(imageId);
    if (!entry) return;
    entry.references = Math.max(0, entry.references - 1);
    entry.lastUsed = this.#clock += 1;
  }

  #trim() {
    const unusedEntries = [...this.#entries.entries()]
      .filter(([, entry]) => entry.references === 0)
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    const removalCount = unusedEntries.length - MAX_UNUSED_ART_FRAME_TEXTURES;
    if (removalCount <= 0) return;
    for (const [imageId, entry] of unusedEntries.slice(0, removalCount)) {
      if (this.#entries.get(imageId) !== entry) continue;
      this.#entries.delete(imageId);
      void entry.promise.then((texture) => this.#disposeTexture(texture)).catch(() => {});
    }
  }

  #disposeTexture(texture: Texture) {
    texture.dispose();
    const image = texture.image as {close?: () => void} | undefined;
    image?.close?.();
  }

  #prepare(texture: Texture, loadState: ArtFrameTextureLoadState) {
    if (this.#host.isDisposed()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const preparation = {loadState, resolve, texture};
      loadState.preparation = preparation;
      this.#queue.push(preparation);
      this.#schedule();
    });
  }

  #schedule() {
    if (this.#host.isDisposed() || this.#handle !== undefined || this.#queue.length === 0) return;
    const prepareNext = (deadline?: IdleDeadline) => {
      this.#handle = undefined;
      if (deadline && deadline.timeRemaining() < ART_FRAME_TEXTURE_UPLOAD_IDLE_BUDGET_MS) {
        this.#schedule();
        return;
      }
      const preparation = this.#queue.shift();
      if (!preparation) return;
      preparation.loadState.preparation = undefined;
      if (!this.#host.isDisposed()) {
        try {
          this.#host.renderer.initTexture(preparation.texture);
        } catch (error) {
          if (DEV) console.warn("Afterleaf could not pre-upload an art texture.", error);
        }
      }
      preparation.resolve();
      this.#schedule();
    };
    if (typeof window.requestIdleCallback === "function") {
      this.#usesIdleCallback = true;
      this.#handle = window.requestIdleCallback(prepareNext);
      return;
    }
    this.#usesIdleCallback = false;
    this.#handle = window.setTimeout(prepareNext, 0);
  }

  /** Cancels pending work and disposes every cached texture. */
  disposeAll(): void {
    this.cancelPreparation();
    for (const entry of this.#entries.values())
      void entry.promise.then((texture) => this.#disposeTexture(texture)).catch(() => {});
    this.#entries.clear();
  }

  cancelPreparation() {
    const handle = this.#handle;
    if (handle !== undefined) {
      if (this.#usesIdleCallback && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    }
    this.#handle = undefined;
    for (const preparation of this.#queue) {
      preparation.loadState.preparation = undefined;
      preparation.resolve();
    }
    this.#queue.length = 0;
  }
}
