import {afterEach, describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {
  importTvVideoToChannel,
  TvVideoImportInputError,
  type TvVideoDownloader,
} from "~/tv/videoImport";

const roots: string[] = [];

const createRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-tv-import-"));
  roots.push(root);
  await mkdir(resolve(root, "late-night"));
  return root;
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, {force: true, recursive: true})),
  );
});

describe("TV video URL import", () => {
  test("atomically publishes a downloaded video into the selected channel", async () => {
    const root = await createRoot();
    const download: TvVideoDownloader = async (_url, stagingDirectory) => {
      const outputPath = resolve(stagingDirectory, "Night_Show_[42].mp4");
      await writeFile(outputPath, "video-content");
      return outputPath;
    };

    const video = await importTvVideoToChannel({
      channelId: "late-night",
      channelsDirectory: root,
      download,
      url: " https://example.com/watch/42 ",
    });

    expect(video).toEqual({
      id: "Night_Show_[42].mp4",
      url: "/__afterleaf/tv/channels/late-night/Night_Show_%5B42%5D.mp4",
    });
    expect(await readFile(resolve(root, "late-night", video.id), "utf8")).toBe(
      "video-content",
    );
  });

  test("preserves existing programs when a filename collides", async () => {
    const root = await createRoot();
    await writeFile(resolve(root, "late-night", "Show.mp4"), "existing");
    const download: TvVideoDownloader = async (_url, stagingDirectory) => {
      const outputPath = resolve(stagingDirectory, "Show.mp4");
      await writeFile(outputPath, "new");
      return outputPath;
    };

    const video = await importTvVideoToChannel({
      channelId: "late-night",
      channelsDirectory: root,
      download,
      url: "https://example.com/show",
    });

    expect(video.id).toBe("Show (2).mp4");
    expect(
      await readFile(resolve(root, "late-night", "Show.mp4"), "utf8"),
    ).toBe("existing");
  });

  test("creates a missing channel from its first imported video", async () => {
    const root = await createRoot();
    const download: TvVideoDownloader = async (_url, stagingDirectory) => {
      const outputPath = resolve(stagingDirectory, "Pilot.mp4");
      await writeFile(outputPath, "new-channel-video");
      return outputPath;
    };

    const video = await importTvVideoToChannel({
      channelId: "documentaries",
      channelsDirectory: root,
      download,
      url: "https://example.com/pilot",
    });

    expect(
      await readFile(resolve(root, "documentaries", video.id), "utf8"),
    ).toBe("new-channel-video");
  });

  test("rejects invalid URLs, channel IDs, and escaped output paths", async () => {
    const root = await createRoot();
    await expect(
      importTvVideoToChannel({
        channelId: "late-night",
        channelsDirectory: root,
        url: "file:///tmp/video.mp4",
      }),
    ).rejects.toBeInstanceOf(TvVideoImportInputError);
    await expect(
      importTvVideoToChannel({
        channelId: "../missing",
        channelsDirectory: root,
        url: "https://example.com/video",
      }),
    ).rejects.toBeInstanceOf(TvVideoImportInputError);
    await expect(
      importTvVideoToChannel({
        channelId: "late-night",
        channelsDirectory: root,
        download: async () => resolve(root, "outside.mp4"),
        url: "https://example.com/video",
      }),
    ).rejects.toThrow("outside its staging directory");
  });
});
