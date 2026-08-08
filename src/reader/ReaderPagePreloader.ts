import {AsyncLruCache} from "~/content/AsyncLruCache";
import {readerPageSourceUrl} from "~/reader/pageSpreadDetection";

export type ReaderPageImageLoader = (url: string) => Promise<void>;

const loadReaderPageImage: ReaderPageImageLoader = (url) =>
  new Promise((resolvePromise, rejectPromise) => {
    const image = new Image();
    image.onload = () => resolvePromise();
    image.onerror = () =>
      rejectPromise(new Error(`Could not preload reader page ${url}`));
    image.src = url;
  });

/**
 * Warms the browser image cache without creating Three textures or triggering
 * spread detection. Texture creation can then remain owned by the active view.
 */
export class ReaderPagePreloader {
  readonly #images: AsyncLruCache<void>;

  constructor(options: {load?: ReaderPageImageLoader; maxEntries: number}) {
    this.#images = new AsyncLruCache({
      load: options.load ?? loadReaderPageImage,
      maxEntries: options.maxEntries,
    });
  }

  preload(url: string) {
    return this.#images.get(readerPageSourceUrl(url));
  }
}
