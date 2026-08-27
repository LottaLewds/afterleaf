import {afterAll, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

import {discoverModels, resolveModelPath} from "~/models/catalog";
import {modelMediaUrl} from "~/models/protocol";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {recursive: true})));
});

describe("model catalog", () => {
  test("discovers nested GLBs and safely resolves them", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-models-"));
    temporaryDirectories.push(directory);
    const nestedDirectory = resolve(directory, "figures");
    await mkdir(nestedDirectory);
    const modelPath = resolve(nestedDirectory, "small_spider.GLB");
    await writeFile(modelPath, "glb");
    await writeFile(resolve(directory, "notes.txt"), "not a model");

    expect(await discoverModels([directory], modelMediaUrl)).toEqual([
      {
        filePath: modelPath,
        id: "figures/small_spider.GLB",
        label: "Small Spider",
        url: modelMediaUrl("figures/small_spider.GLB"),
      },
    ]);
    expect(await resolveModelPath([directory], "figures/small_spider.GLB")).toBe(modelPath);
    expect(await resolveModelPath([directory], "../notes.txt")).toBeUndefined();
  });
});
