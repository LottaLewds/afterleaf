import {describe, expect, test} from "bun:test";

import {PageTextureCache} from "~/game/PageTextureCache";

type TestResource = {
  dispose: () => void;
  disposeCount: number;
  url: string;
};

const createResource = (url: string): TestResource => {
  const resource: TestResource = {
    dispose: () => {
      resource.disposeCount += 1;
    },
    disposeCount: 0,
    url,
  };
  return resource;
};

const deferred = <Value>() => {
  let resolvePromise: ((value: Value) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: (reason?: unknown) => rejectPromise?.(reason),
    resolve: (value: Value) => resolvePromise?.(value),
  };
};

describe("PageTextureCache", () => {
  test("deduplicates concurrent loads and reference-counts acquisitions", async () => {
    const pending = deferred<TestResource>();
    let loadCount = 0;
    const cache = new PageTextureCache({
      load: () => {
        loadCount += 1;
        return pending.promise;
      },
      maxEntries: 3,
    });

    const first = cache.acquire("page-1");
    const second = cache.acquire("page-1");
    const prefetched = cache.prefetch("page-1");

    expect(loadCount).toBe(0);
    expect(cache.inspect().entries).toEqual([
      {lastUsed: 3, refCount: 2, state: "loading", url: "page-1"},
    ]);

    const resource = createResource("page-1");
    pending.resolve(resource);
    expect(await first).toBe(resource);
    expect(await second).toBe(resource);
    await prefetched;
    expect(loadCount).toBe(1);

    cache.release("page-1");
    expect(cache.inspect().entries[0]?.refCount).toBe(1);
    cache.release("page-1");
    cache.release("page-1");
    expect(cache.inspect().entries[0]?.refCount).toBe(0);
  });

  test("prefetches at refcount zero and reuses the loaded resource", async () => {
    let loadCount = 0;
    const cache = new PageTextureCache({
      load: async (url) => {
        loadCount += 1;
        return createResource(url);
      },
      maxEntries: 2,
    });

    await cache.prefetch("page-1");
    expect(cache.inspect().entries[0]).toMatchObject({
      refCount: 0,
      state: "ready",
    });

    const resource = await cache.acquire("page-1");
    expect(resource.url).toBe("page-1");
    expect(loadCount).toBe(1);
  });

  test("evicts the least recently used unreferenced entry", async () => {
    const resources = new Map<string, TestResource>();
    const cache = new PageTextureCache({
      load: async (url) => {
        const resource = createResource(url);
        resources.set(url, resource);
        return resource;
      },
      maxEntries: 2,
    });

    await cache.prefetch("page-1");
    await cache.prefetch("page-2");
    await cache.acquire("page-1");
    cache.release("page-1");
    await cache.prefetch("page-3");

    expect(cache.inspect().entries.map((entry) => entry.url)).toEqual([
      "page-1",
      "page-3",
    ]);
    expect(resources.get("page-1")?.disposeCount).toBe(0);
    expect(resources.get("page-2")?.disposeCount).toBe(1);
  });

  test("allows referenced entries over capacity and trims after release", async () => {
    const first = createResource("page-1");
    const second = createResource("page-2");
    const cache = new PageTextureCache({
      load: async (url) => (url === "page-1" ? first : second),
      maxEntries: 1,
    });

    await cache.acquire("page-1");
    await cache.acquire("page-2");
    expect(cache.inspect().size).toBe(2);

    cache.release("page-1");
    expect(cache.inspect().entries.map((entry) => entry.url)).toEqual([
      "page-2",
    ]);
    expect(first.disposeCount).toBe(1);
    expect(second.disposeCount).toBe(0);
  });

  test("removes failed loads so a later acquisition can retry", async () => {
    const expectedError = new Error("network unavailable");
    let attempts = 0;
    const resource = createResource("page-1");
    const cache = new PageTextureCache({
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw expectedError;
        return resource;
      },
      maxEntries: 2,
    });

    await expect(cache.acquire("page-1")).rejects.toBe(expectedError);
    expect(cache.inspect().size).toBe(0);
    expect(await cache.acquire("page-1")).toBe(resource);
    expect(attempts).toBe(2);
  });

  test("disposes resolved and late-resolving resources exactly once", async () => {
    const lateLoad = deferred<TestResource>();
    const ready = createResource("ready");
    const late = createResource("late");
    const cache = new PageTextureCache({
      load: (url) =>
        url === "ready" ? Promise.resolve(ready) : lateLoad.promise,
      maxEntries: 2,
    });

    await cache.acquire("ready");
    const pending = cache.acquire("late");
    await Promise.resolve();
    cache.dispose();
    cache.dispose();

    expect(ready.disposeCount).toBe(1);
    expect(cache.inspect()).toMatchObject({disposed: true, size: 0});
    expect(() => cache.acquire("another")).toThrow(
      "PageTextureCache has been disposed",
    );

    lateLoad.resolve(late);
    expect(await pending).toBe(late);
    expect(late.disposeCount).toBe(1);
    cache.dispose();
    expect(ready.disposeCount).toBe(1);
    expect(late.disposeCount).toBe(1);
  });

  test("disposes a pending prefetch if LRU eviction wins its load race", async () => {
    const firstLoad = deferred<TestResource>();
    const second = createResource("page-2");
    const cache = new PageTextureCache({
      load: (url) =>
        url === "page-1" ? firstLoad.promise : Promise.resolve(second),
      maxEntries: 1,
    });

    const firstPrefetch = cache.prefetch("page-1");
    await cache.prefetch("page-2");
    expect(cache.inspect().entries.map((entry) => entry.url)).toEqual([
      "page-2",
    ]);

    const first = createResource("page-1");
    firstLoad.resolve(first);
    await firstPrefetch;
    expect(first.disposeCount).toBe(1);
    expect(second.disposeCount).toBe(0);
  });

  test("validates capacity", () => {
    expect(
      () =>
        new PageTextureCache({
          load: async (url) => createResource(url),
          maxEntries: 0,
        }),
    ).toThrow("maxEntries must be a positive integer");
  });

  test("reports unique in-flight page loads", async () => {
    const firstLoad = deferred<TestResource>();
    const secondLoad = deferred<TestResource>();
    const loadingCounts: number[] = [];
    const cache = new PageTextureCache({
      load: (url) =>
        url === "page-1" ? firstLoad.promise : secondLoad.promise,
      maxEntries: 3,
      onLoadingChange: (count) => loadingCounts.push(count),
    });

    const first = cache.acquire("page-1");
    const duplicate = cache.prefetch("page-1");
    const second = cache.prefetch("page-2");
    expect(loadingCounts).toEqual([1, 2]);

    firstLoad.resolve(createResource("page-1"));
    await first;
    await duplicate;
    expect(loadingCounts).toEqual([1, 2, 1]);

    secondLoad.resolve(createResource("page-2"));
    await second;
    expect(loadingCounts).toEqual([1, 2, 1, 0]);
  });
});
