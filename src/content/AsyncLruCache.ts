type AsyncLruCacheEntry<Value> = {
  promise: Promise<Value>;
};

/**
 * A bounded LRU for immutable async lookups. Concurrent callers share the same
 * promise, while failed lookups are removed so the next caller can retry.
 */
export class AsyncLruCache<Value> {
  readonly #entries = new Map<string, AsyncLruCacheEntry<Value>>();
  readonly #load: (key: string) => Promise<Value>;
  readonly #maxEntries: number;

  constructor(options: {load: (key: string) => Promise<Value>; maxEntries: number}) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1)
      throw new RangeError("AsyncLruCache maxEntries must be a positive integer");

    this.#load = options.load;
    this.#maxEntries = options.maxEntries;
  }

  get(key: string): Promise<Value> {
    const cached = this.#entries.get(key);
    if (cached) {
      this.#touch(key, cached);
      return cached.promise;
    }

    const promise = Promise.resolve()
      .then(() => this.#load(key))
      .catch((error: unknown) => {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
        throw error;
      });
    const entry: AsyncLruCacheEntry<Value> = {promise};
    this.#entries.set(key, entry);
    this.#trim();
    return promise;
  }

  #touch(key: string, entry: AsyncLruCacheEntry<Value>) {
    this.#entries.delete(key);
    this.#entries.set(key, entry);
  }

  #trim() {
    while (this.#entries.size > this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.#entries.delete(oldestKey);
    }
  }
}
