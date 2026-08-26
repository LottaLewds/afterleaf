import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {createCachedTvVideoAnalyzer, type CachedTvVideoAnalyzerOptions} from "~/tv/channelAnalysis";
import {FULL_ACTIVE_PICTURE_RECT} from "~/tv/activePicture";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true})));
});

const createRoot = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "afterleaf-tv-analysis-"));
  roots.push(root);
  return root;
};

describe("TV channel analysis cache", () => {
  test("reuses analysis until the source video changes", async () => {
    const root = await createRoot();
    const filePath = resolve(root, "sample.mp4");
    const cachePath = resolve(root, "analysis.json");
    await writeFile(filePath, "video");
    let analysisCount = 0;
    const options: CachedTvVideoAnalyzerOptions = {
      analyzeFile: async () => {
        analysisCount += 1;
        return {height: 1, width: 0.75, x: 0.125, y: 0};
      },
      cachePath,
    };
    const analyze = createCachedTvVideoAnalyzer(options);

    await expect(analyze(filePath, "afterleaf/sample.mp4")).resolves.toEqual({
      height: 1,
      width: 0.75,
      x: 0.125,
      y: 0,
    });
    await analyze(filePath, "afterleaf/sample.mp4");
    expect(analysisCount).toBe(1);

    const fromDisk = createCachedTvVideoAnalyzer({
      analyzeFile: async () => {
        analysisCount += 1;
        return FULL_ACTIVE_PICTURE_RECT;
      },
      cachePath,
    });
    await fromDisk(filePath, "afterleaf/sample.mp4");
    expect(analysisCount).toBe(1);

    await writeFile(filePath, "changed video");
    await expect(fromDisk(filePath, "afterleaf/sample.mp4")).resolves.toEqual(FULL_ACTIVE_PICTURE_RECT);
    expect(analysisCount).toBe(2);
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({
      version: 1,
      videos: {
        "afterleaf/sample.mp4": {
          activePicture: FULL_ACTIVE_PICTURE_RECT,
          size: 13,
        },
      },
    });
  });
});
