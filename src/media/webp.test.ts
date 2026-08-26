import {afterAll, describe, expect, test} from "bun:test";
import {mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";

import {renderCachedWebpImage, renderWebpImage} from "~/media/webp";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {recursive: true})));
});

const temporaryImage = async (name: string, source: Buffer) => {
  const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-webp-"));
  temporaryDirectories.push(directory);
  const imagePath = resolve(directory, name);
  await writeFile(imagePath, source);
  return imagePath;
};

describe("shared WebP rendering", () => {
  test("only reoptimizes conforming WebP images when meaningfully smaller", async () => {
    const source = await sharp({
      create: {background: "#123456", channels: 3, height: 100, width: 100},
    })
      .webp()
      .toBuffer();
    const imagePath = await temporaryImage("existing.webp", source);
    const marginalDerivative = Buffer.alloc(Math.ceil(source.byteLength * 0.95), 2);
    const smallerDerivative = Buffer.alloc(Math.floor(source.byteLength * 0.8), 3);

    expect(await renderWebpImage(imagePath, async () => marginalDerivative, 2_048)).toEqual(source);
    expect(await renderWebpImage(imagePath, async () => smallerDerivative, 2_048)).toEqual(smallerDerivative);
  });

  test("always optimizes oversized or mislabeled WebP files", async () => {
    const oversized = await sharp({
      create: {background: "#654321", channels: 3, height: 10, width: 3_000},
    })
      .webp()
      .toBuffer();
    const oversizedPath = await temporaryImage("oversized.webp", oversized);
    const oversizedDerivative = Buffer.alloc(oversized.byteLength, 4);
    expect(await renderWebpImage(oversizedPath, async () => oversizedDerivative, 2_048)).toEqual(oversizedDerivative);

    const png = await sharp({
      create: {background: "#abcdef", channels: 3, height: 10, width: 10},
    })
      .png()
      .toBuffer();
    const mislabeledPath = await temporaryImage("mislabeled.webp", png);
    const pngDerivative = Buffer.alloc(png.byteLength, 5);
    expect(await renderWebpImage(mislabeledPath, async () => pngDerivative, 2_048)).toEqual(pngDerivative);
  });

  test("persists derivatives and reuses them across calls", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-webp-"));
    temporaryDirectories.push(directory);
    const imagePath = await temporaryImage(
      "cached.png",
      await sharp({
        create: {background: "#abcdef", channels: 3, height: 10, width: 10},
      })
        .png()
        .toBuffer(),
    );
    const cacheDirectory = resolve(directory, "cache");
    let derivativeCalls = 0;
    const createDerivative = async () => {
      derivativeCalls += 1;
      return Buffer.from([1, 2, 3]);
    };

    await expect(renderCachedWebpImage(imagePath, createDerivative, 2_048, cacheDirectory, "test-v1")).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    await expect(renderCachedWebpImage(imagePath, createDerivative, 2_048, cacheDirectory, "test-v1")).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(derivativeCalls).toBe(1);
  });

  test("marks pass-through sources without duplicating their bytes", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-webp-"));
    temporaryDirectories.push(directory);
    const source = await sharp({
      create: {background: "#abcdef", channels: 3, height: 10, width: 10},
    })
      .webp()
      .toBuffer();
    const imagePath = await temporaryImage("pass-through.webp", source);
    const cacheDirectory = resolve(directory, "cache");
    let derivativeCalls = 0;
    const createDerivative = async (input: Uint8Array) => {
      derivativeCalls += 1;
      return Buffer.from(input);
    };

    await renderCachedWebpImage(imagePath, createDerivative, 2_048, cacheDirectory, "test-v1");
    await renderCachedWebpImage(imagePath, createDerivative, 2_048, cacheDirectory, "test-v1");

    expect(derivativeCalls).toBe(1);
    expect(await readdir(cacheDirectory)).toEqual([expect.stringMatching(/\.source$/u)]);
  });
});
