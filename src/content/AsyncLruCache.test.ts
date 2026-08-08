import {describe, expect, test} from "bun:test";

import {AsyncLruCache} from "~/content/AsyncLruCache";

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

describe("AsyncLruCache", () => {
  test("shares concurrent loads and reuses the resolved value", async () => {
    const pending = deferred<string>();
    let loadCount = 0;
    const cache = new AsyncLruCache({
      load: () => {
        loadCount += 1;
        return pending.promise;
      },
      maxEntries: 2,
    });

    const first = cache.get("gallery");
    const second = cache.get("gallery");
    expect(loadCount).toBe(0);

    pending.resolve("metadata");
    expect(await first).toBe("metadata");
    expect(await second).toBe("metadata");
    expect(await cache.get("gallery")).toBe("metadata");
    expect(loadCount).toBe(1);
  });

  test("evicts the least recently used value", async () => {
    const loadedKeys: string[] = [];
    const cache = new AsyncLruCache({
      load: async (key) => {
        loadedKeys.push(key);
        return key;
      },
      maxEntries: 2,
    });

    await cache.get("first");
    await cache.get("second");
    await cache.get("first");
    await cache.get("third");
    await cache.get("second");

    expect(loadedKeys).toEqual(["first", "second", "third", "second"]);
  });

  test("removes a failed load so a later call retries", async () => {
    const expectedError = new Error("metadata unavailable");
    let loadCount = 0;
    const cache = new AsyncLruCache({
      load: async () => {
        loadCount += 1;
        if (loadCount === 1) throw expectedError;
        return "metadata";
      },
      maxEntries: 2,
    });

    await expect(cache.get("gallery")).rejects.toBe(expectedError);
    expect(await cache.get("gallery")).toBe("metadata");
    expect(loadCount).toBe(2);
  });

  test("validates capacity", () => {
    expect(
      () =>
        new AsyncLruCache({
          load: async (key) => key,
          maxEntries: 0,
        }),
    ).toThrow("maxEntries must be a positive integer");
  });
});
