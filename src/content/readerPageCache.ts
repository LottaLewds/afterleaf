const MAX_READER_CACHE_BYTES = 128 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let cacheBytes = 0;

export const cachedReaderPage = (key: string) => {
  const page = cache.get(key);
  if (!page) return undefined;
  cache.delete(key);
  cache.set(key, page);
  return page;
};

export const cacheReaderPage = (key: string, page: Buffer) => {
  const existing = cache.get(key);
  if (existing) cacheBytes -= existing.byteLength;
  cache.delete(key);
  cache.set(key, page);
  cacheBytes += page.byteLength;
  while (cacheBytes > MAX_READER_CACHE_BYTES) {
    const oldest = cache.entries().next().value;
    if (!oldest) break;
    cache.delete(oldest[0]);
  }
};
