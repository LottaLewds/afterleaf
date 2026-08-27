export type DisposableResource = {
  dispose: () => void;
};

export type PageTextureCacheOptions<Resource extends DisposableResource> = {
  load: (url: string) => Promise<Resource>;
  maxEntries: number;
  onLoadingChange?: (loadingCount: number) => void;
};

export type PageTextureCacheEntrySnapshot = {
  lastUsed: number;
  refCount: number;
  state: "loading" | "ready";
  url: string;
};

export type PageTextureCacheSnapshot = {
  disposed: boolean;
  entries: readonly PageTextureCacheEntrySnapshot[];
  maxEntries: number;
  size: number;
};

type CacheEntry<Resource extends DisposableResource> = {
  active: boolean;
  lastUsed: number;
  promise: Promise<Resource>;
  refCount: number;
  resource: Resource | undefined;
  url: string;
};

/**
 * A bounded cache for asynchronously loaded, explicitly disposable resources.
 * Referenced entries are never evicted, so the cache can temporarily exceed its
 * limit until a caller releases an entry.
 */
export class PageTextureCache<Resource extends DisposableResource> {
  readonly #disposedResources = new WeakSet<Resource>();
  readonly #entries = new Map<string, CacheEntry<Resource>>();
  readonly #load: (url: string) => Promise<Resource>;
  readonly #maxEntries: number;
  readonly #onLoadingChange: ((loadingCount: number) => void) | undefined;

  #clock = 0;
  #disposed = false;
  #loadingCount = 0;

  constructor(options: PageTextureCacheOptions<Resource>) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1)
      throw new RangeError("PageTextureCache maxEntries must be a positive integer");

    this.#load = options.load;
    this.#maxEntries = options.maxEntries;
    this.#onLoadingChange = options.onLoadingChange;
  }

  acquire(url: string): Promise<Resource> {
    this.#assertActive();
    const entry = this.#getOrCreateEntry(url);
    entry.refCount += 1;
    this.#touch(entry);
    this.#trim();
    return entry.promise;
  }

  release(url: string) {
    const entry = this.#entries.get(url);
    if (!entry || entry.refCount === 0) return;

    entry.refCount -= 1;
    this.#touch(entry);
    this.#trim();
  }

  async prefetch(url: string): Promise<void> {
    this.#assertActive();
    const entry = this.#getOrCreateEntry(url);
    this.#touch(entry);
    this.#trim();
    await entry.promise;
  }

  inspect(): PageTextureCacheSnapshot {
    const entries = [...this.#entries.values()]
      .sort((left, right) => left.lastUsed - right.lastUsed)
      .map<PageTextureCacheEntrySnapshot>((entry) => ({
        lastUsed: entry.lastUsed,
        refCount: entry.refCount,
        state: entry.resource ? "ready" : "loading",
        url: entry.url,
      }));

    return {
      disposed: this.#disposed,
      entries,
      maxEntries: this.#maxEntries,
      size: entries.length,
    };
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    for (const entry of this.#entries.values()) this.#evict(entry);
    this.#entries.clear();
  }

  #assertActive() {
    if (this.#disposed) throw new Error("PageTextureCache has been disposed");
  }

  #disposeResource(resource: Resource) {
    if (this.#disposedResources.has(resource)) return;
    this.#disposedResources.add(resource);
    resource.dispose();
  }

  #evict(entry: CacheEntry<Resource>) {
    if (!entry.active) return;
    entry.active = false;
    if (this.#entries.get(entry.url) === entry) this.#entries.delete(entry.url);
    if (entry.resource) this.#disposeResource(entry.resource);
  }

  #getOrCreateEntry(url: string): CacheEntry<Resource> {
    const cached = this.#entries.get(url);
    if (cached) return cached;

    this.#loadingCount += 1;
    this.#onLoadingChange?.(this.#loadingCount);
    const entry: CacheEntry<Resource> = {
      active: true,
      lastUsed: 0,
      promise: new Promise<Resource>((resolvePromise, rejectPromise) => {
        void Promise.resolve()
          .then(() => this.#load(url))
          .then((resource) => {
            entry.resource = resource;
            if (!entry.active || this.#disposed) this.#disposeResource(resource);
            return resource;
          })
          .catch((error: unknown) => {
            if (entry.active) this.#evict(entry);
            throw error;
          })
          .finally(() => {
            this.#loadingCount -= 1;
            this.#onLoadingChange?.(this.#loadingCount);
          })
          .then(resolvePromise, rejectPromise);
      }),
      refCount: 0,
      resource: undefined,
      url,
    };

    this.#entries.set(url, entry);
    return entry;
  }

  #touch(entry: CacheEntry<Resource>) {
    this.#clock += 1;
    entry.lastUsed = this.#clock;
  }

  #trim() {
    while (this.#entries.size > this.#maxEntries) {
      let oldest: CacheEntry<Resource> | undefined;

      for (const entry of this.#entries.values()) {
        if (entry.refCount > 0) continue;
        if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry;
      }

      if (!oldest) return;
      this.#evict(oldest);
    }
  }
}
