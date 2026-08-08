import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {discoverTvChannels, resolveTvVideoPath} from "~/tv/channelCatalog";
import {tvMediaUrl} from "~/tv/protocol";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true})));
});

const createRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-tv-"));
  roots.push(root);
  return root;
};

describe("TV channel catalog", () => {
  test("discovers stable nonempty channel manifests", async () => {
    const root = await createRoot();
    await mkdir(resolve(root, "shop_ads"));
    await mkdir(resolve(root, "empty"));
    await writeFile(resolve(root, "shop_ads", "b.WEBM"), "video");
    await writeFile(resolve(root, "shop_ads", "a.mp4"), "video");
    await writeFile(resolve(root, "shop_ads", "notes.txt"), "ignore");

    expect(await discoverTvChannels([root], tvMediaUrl)).toEqual({
      channels: [
        {
          id: "shop_ads",
          label: "Shop Ads",
          videos: [
            {
              id: "a.mp4",
              url: "/__afterleaf/tv/channels/shop_ads/a.mp4",
            },
            {
              id: "b.WEBM",
              url: "/__afterleaf/tv/channels/shop_ads/b.WEBM",
            },
          ],
        },
      ],
    });
  });

  test("returns an empty manifest when the channel root is absent", async () => {
    const root = await createRoot();
    expect(
      await discoverTvChannels([resolve(root, "missing")], tvMediaUrl),
    ).toEqual({channels: []});
  });

  test("discovers videos added after the first scan", async () => {
    const root = await createRoot();
    await mkdir(resolve(root, "afterleaf"));
    await writeFile(resolve(root, "afterleaf", "first.webm"), "video");

    expect(
      (await discoverTvChannels([root], tvMediaUrl)).channels[0]?.videos.map(
        (video) => video.id,
      ),
    ).toEqual(["first.webm"]);

    await writeFile(resolve(root, "afterleaf", "second.mp4"), "video");
    expect(
      (await discoverTvChannels([root], tvMediaUrl)).channels[0]?.videos.map(
        (video) => video.id,
      ),
    ).toEqual(["first.webm", "second.mp4"]);
  });

  test("includes analyzed active-picture metadata", async () => {
    const root = await createRoot();
    await mkdir(resolve(root, "afterleaf"));
    await writeFile(resolve(root, "afterleaf", "sample.mp4"), "video");
    const analyzedPaths: string[] = [];

    const manifest = await discoverTvChannels(
      [root],
      tvMediaUrl,
      async (filePath, cacheKey) => {
        analyzedPaths.push(filePath, cacheKey);
        return {height: 1, width: 0.75, x: 0.125, y: 0};
      },
    );

    expect(analyzedPaths).toEqual([
      resolve(root, "afterleaf", "sample.mp4"),
      resolve(root, "afterleaf", "sample.mp4"),
    ]);
    expect(manifest.channels[0]?.videos[0]?.activePicture).toEqual({
      height: 1,
      width: 0.75,
      x: 0.125,
      y: 0,
    });
  });

  test("resolves regular channel files but rejects symlinks and traversal", async () => {
    const root = await createRoot();
    await mkdir(resolve(root, "afterleaf"));
    await writeFile(resolve(root, "afterleaf", "sample.mp4"), "video");
    await symlink(
      resolve(root, "afterleaf", "sample.mp4"),
      resolve(root, "afterleaf", "linked.mp4"),
    );

    expect(
      await resolveTvVideoPath([root], "afterleaf", "sample.mp4"),
    ).toMatchObject({size: 5});
    expect(await resolveTvVideoPath([root], "afterleaf", "linked.mp4")).toBe(
      undefined,
    );
    expect(await resolveTvVideoPath([root], "..", "sample.mp4")).toBe(
      undefined,
    );
  });

  test("merges channels across optional roots and sees a later mount", async () => {
    const root = await createRoot();
    const mountedRoot = resolve(root, "mounted-later");
    await mkdir(resolve(root, "default-channel"));
    await writeFile(resolve(root, "default-channel", "default.mp4"), "video");

    expect(
      (await discoverTvChannels([root, mountedRoot], tvMediaUrl)).channels.map(
        (channel) => channel.id,
      ),
    ).toEqual(["default-channel"]);

    await mkdir(resolve(mountedRoot, "external-channel"), {recursive: true});
    await writeFile(
      resolve(mountedRoot, "external-channel", "external.webm"),
      "video",
    );
    expect(
      (await discoverTvChannels([root, mountedRoot], tvMediaUrl)).channels.map(
        (channel) => channel.id,
      ),
    ).toEqual(["default-channel", "external-channel"]);
    expect(
      await resolveTvVideoPath(
        [root, mountedRoot],
        "external-channel",
        "external.webm",
      ),
    ).toMatchObject({size: 5});
  });
});
