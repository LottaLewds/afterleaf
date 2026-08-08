import {afterAll, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";

import {
  discoverArtFrameChannels,
  importArtFrameImage,
  renderArtFrameImage,
  resolveArtFrameImagePath,
} from "~/artFrames/catalog";
import {artFrameMediaUrl} from "~/artFrames/protocol";
import {createArtFrameImageDerivative} from "~/artFrames/image";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, {recursive: true})),
  );
});

describe("art frame catalog", () => {
  test("discovers direct images in named channel folders", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-art-frames-"));
    temporaryDirectories.push(directory);
    const channelDirectory = resolve(directory, "night-scenes");
    await mkdir(channelDirectory);
    const imagePath = resolve(channelDirectory, "rain.art");
    await writeFile(
      imagePath,
      await sharp({
        create: {background: "#345678", channels: 3, height: 80, width: 120},
      })
        .png()
        .toBuffer(),
    );
    await writeFile(resolve(channelDirectory, "notes.txt"), "not an image");
    await mkdir(resolve(channelDirectory, "nested"));

    const channels = await discoverArtFrameChannels(
      [directory],
      artFrameMediaUrl,
    );

    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({
      id: "night-scenes",
      label: "Night Scenes",
      images: [
        {
          aspectRatio: 1.5,
          filePath: imagePath,
          id: "night-scenes/rain.art",
          label: "Rain",
          url: artFrameMediaUrl("night-scenes/rain.art"),
        },
      ],
    });
    expect(
      await resolveArtFrameImagePath([directory], "../outside.png"),
    ).toBeUndefined();
    expect(
      await resolveArtFrameImagePath([directory], "night-scenes/rain.art"),
    ).toBe(imagePath);
    expect(
      await sharp(
        await renderArtFrameImage(imagePath, createArtFrameImageDerivative),
      ).metadata(),
    ).toMatchObject({format: "webp", height: 80, width: 120});

    const imported = await importArtFrameImage(
      directory,
      "after-hours",
      await sharp({
        create: {
          background: "#765432",
          channels: 3,
          height: 2_400,
          width: 1_200,
        },
      })
        .png()
        .toBuffer(),
      createArtFrameImageDerivative,
      artFrameMediaUrl,
    );
    expect(imported.image.id).toMatch(/^after-hours\/pasted-.*\.webp$/u);
    expect(imported.image.url).toBe(artFrameMediaUrl(imported.image.id));
    expect(
      await sharp(resolve(directory, imported.image.id)).metadata(),
    ).toMatchObject({format: "webp", height: 2_048, width: 1_024});
    expect(await sharp(imported.derivative).metadata()).toMatchObject({
      format: "webp",
      height: 2_048,
      width: 1_024,
    });
    await expect(
      importArtFrameImage(
        directory,
        "../outside",
        new Uint8Array([1]),
        createArtFrameImageDerivative,
        artFrameMediaUrl,
      ),
    ).rejects.toThrow("channel name is invalid");
  });

  test("merges optional roots and discovers a later mount", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-art-frames-"));
    temporaryDirectories.push(directory);
    const mountedDirectory = resolve(directory, "mounted-later");

    expect(
      await discoverArtFrameChannels([mountedDirectory], artFrameMediaUrl),
    ).toEqual([]);

    const imageDirectory = resolve(mountedDirectory, "external-channel");
    await mkdir(imageDirectory, {recursive: true});
    const imagePath = resolve(imageDirectory, "external.png");
    await sharp({
      create: {background: "#664488", channels: 3, height: 80, width: 120},
    })
      .png()
      .toFile(imagePath);
    expect(
      await discoverArtFrameChannels(
        [resolve(directory, "missing"), mountedDirectory],
        artFrameMediaUrl,
      ),
    ).toMatchObject([{id: "external-channel"}]);
    expect(
      await resolveArtFrameImagePath(
        [mountedDirectory],
        "external-channel/external.png",
      ),
    ).toBe(imagePath);
  });
});
