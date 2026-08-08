import {afterAll, describe, expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";

import {renderWebpImage} from "~/media/webp";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, {recursive: true})),
  );
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
    const marginalDerivative = Buffer.alloc(
      Math.ceil(source.byteLength * 0.95),
      2,
    );
    const smallerDerivative = Buffer.alloc(
      Math.floor(source.byteLength * 0.8),
      3,
    );

    expect(
      await renderWebpImage(imagePath, async () => marginalDerivative, 2_048),
    ).toEqual(source);
    expect(
      await renderWebpImage(imagePath, async () => smallerDerivative, 2_048),
    ).toEqual(smallerDerivative);
  });

  test("always optimizes oversized or mislabeled WebP files", async () => {
    const oversized = await sharp({
      create: {background: "#654321", channels: 3, height: 10, width: 3_000},
    })
      .webp()
      .toBuffer();
    const oversizedPath = await temporaryImage("oversized.webp", oversized);
    const oversizedDerivative = Buffer.alloc(oversized.byteLength, 4);
    expect(
      await renderWebpImage(
        oversizedPath,
        async () => oversizedDerivative,
        2_048,
      ),
    ).toEqual(oversizedDerivative);

    const png = await sharp({
      create: {background: "#abcdef", channels: 3, height: 10, width: 10},
    })
      .png()
      .toBuffer();
    const mislabeledPath = await temporaryImage("mislabeled.webp", png);
    const pngDerivative = Buffer.alloc(png.byteLength, 5);
    expect(
      await renderWebpImage(mislabeledPath, async () => pngDerivative, 2_048),
    ).toEqual(pngDerivative);
  });
});
