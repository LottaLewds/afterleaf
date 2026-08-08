import {afterAll, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import sharp from "sharp";

import {createPosterImageDerivative} from "~/posters/image";
import {
  discoverPosters,
  importPosterImage,
  renderPoster,
  resolvePosterPath,
} from "~/posters/catalog";
import {posterMediaUrl} from "~/posters/protocol";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, {recursive: true})),
  );
});

describe("poster catalog", () => {
  test("discovers valid nested images by content rather than extension", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-posters-"));
    temporaryDirectories.push(directory);
    const nestedDirectory = resolve(directory, "seasonal");
    await mkdir(nestedDirectory);
    const imagePath = resolve(nestedDirectory, "summer_festival.art");
    await writeFile(
      imagePath,
      await sharp({
        create: {
          background: "#cc5544",
          channels: 3,
          height: 80,
          width: 120,
        },
      })
        .png()
        .toBuffer(),
    );
    await writeFile(resolve(directory, "notes.txt"), "not an image");

    const posters = await discoverPosters([directory], posterMediaUrl);

    expect(posters).toHaveLength(1);
    expect(posters[0]).toMatchObject({
      aspectRatio: 1.5,
      filePath: imagePath,
      id: "seasonal/summer_festival.art",
      label: "Summer Festival",
      url: posterMediaUrl("seasonal/summer_festival.art"),
    });
    expect(
      await resolvePosterPath([directory], "seasonal/summer_festival.art"),
    ).toBe(imagePath);
    expect(
      await resolvePosterPath([directory], "../notes.txt"),
    ).toBeUndefined();
    expect(
      await sharp(
        await renderPoster(imagePath, createPosterImageDerivative),
      ).metadata(),
    ).toMatchObject({format: "webp", height: 80, width: 120});

    const imported = await importPosterImage(
      directory,
      await sharp({
        create: {
          background: "#4477aa",
          channels: 3,
          height: 2_400,
          width: 1_200,
        },
      })
        .png()
        .toBuffer(),
      createPosterImageDerivative,
      posterMediaUrl,
    );
    expect(imported.id).toMatch(/^pasted-.*\.webp$/u);
    expect(imported.url).toBe(posterMediaUrl(imported.id));
    expect(
      await sharp(resolve(directory, imported.id)).metadata(),
    ).toMatchObject({format: "webp", height: 2_048, width: 1_024});
  });

  test("merges optional roots and discovers a later mount", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "afterleaf-posters-"));
    temporaryDirectories.push(directory);
    const mountedDirectory = resolve(directory, "mounted-later");

    expect(await discoverPosters([mountedDirectory], posterMediaUrl)).toEqual(
      [],
    );

    await mkdir(mountedDirectory);
    const imagePath = resolve(mountedDirectory, "external.png");
    await sharp({
      create: {background: "#446688", channels: 3, height: 80, width: 120},
    })
      .png()
      .toFile(imagePath);
    expect(
      await discoverPosters(
        [resolve(directory, "missing"), mountedDirectory],
        posterMediaUrl,
      ),
    ).toMatchObject([{id: "external.png"}]);
    expect(await resolvePosterPath([mountedDirectory], "external.png")).toBe(
      imagePath,
    );
  });
});
