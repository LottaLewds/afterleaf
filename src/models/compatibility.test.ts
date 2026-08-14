import {Document, NodeIO} from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRMaterialsPBRSpecularGlossiness,
} from "@gltf-transform/extensions";
import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  modelNeedsSpecGlossConversion,
  prepareModelForThree,
} from "~/models/compatibility";

const temporaryDirectories: string[] = [];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

const createLegacySpecGlossGlb = async () => {
  const document = new Document();
  const extension = document.createExtension(KHRMaterialsPBRSpecularGlossiness);
  const specGloss = extension
    .createPBRSpecularGlossiness()
    .setDiffuseFactor([0.2, 0.4, 0.8, 1])
    .setGlossinessFactor(0.35);
  document
    .createMaterial("legacy-material")
    .setExtension("KHR_materials_pbrSpecularGlossiness", specGloss);
  return io.writeBinary(document);
};

describe("model compatibility", () => {
  test("detects and converts legacy specular-glossiness materials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "afterleaf-model-"));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, "legacy.glb");
    await writeFile(sourcePath, await createLegacySpecGlossGlb());

    expect(await modelNeedsSpecGlossConversion(sourcePath)).toBe(true);
    const prepared = await prepareModelForThree(
      sourcePath,
      join(directory, ".cache"),
    );
    expect(prepared.filePath).not.toBe(sourcePath);
    expect(prepared.byteLength).toBeGreaterThan(0);

    const converted = await io.read(prepared.filePath);
    expect(
      converted
        .getRoot()
        .listExtensionsUsed()
        .some(
          (extension) =>
            extension.extensionName === "KHR_materials_pbrSpecularGlossiness",
        ),
    ).toBe(false);
  });

  test("serves compatible models without creating a derivative", async () => {
    const directory = await mkdtemp(join(tmpdir(), "afterleaf-model-"));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, "compatible.glb");
    await writeFile(sourcePath, await io.writeBinary(new Document()));

    expect(await modelNeedsSpecGlossConversion(sourcePath)).toBe(false);
    const prepared = await prepareModelForThree(
      sourcePath,
      join(directory, ".cache"),
    );
    expect(prepared.filePath).toBe(sourcePath);
  });
});
