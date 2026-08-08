import {describe, expect, test} from "bun:test";
import {ReaderPagePreloader} from "~/reader/ReaderPagePreloader";

describe("ReaderPagePreloader", () => {
  test("deduplicates page halves by their source URL", async () => {
    const loadedUrls: string[] = [];
    const preloader = new ReaderPagePreloader({
      load: async (url) => {
        loadedUrls.push(url);
      },
      maxEntries: 4,
    });

    await Promise.all([
      preloader.preload("/page.webp#afterleaf-page-half=left"),
      preloader.preload("/page.webp#afterleaf-page-half=right"),
      preloader.preload("/page.webp"),
    ]);

    expect(loadedUrls).toEqual(["/page.webp"]);
  });

  test("retries a failed page preload", async () => {
    let attempts = 0;
    const preloader = new ReaderPagePreloader({
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
      },
      maxEntries: 4,
    });

    await expect(preloader.preload("/page.webp")).rejects.toThrow(
      "temporary failure",
    );
    await preloader.preload("/page.webp");

    expect(attempts).toBe(2);
  });
});
