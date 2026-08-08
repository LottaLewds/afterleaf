import {describe, expect, it} from "bun:test";
import {Texture} from "three";

import {createWoodMaterial} from "~/game/woodMaterials";

describe("wood material", () => {
  it("uses the complete metalness/roughness texture set", () => {
    const baseColor = new Texture();
    const normal = new Texture();
    const surface = new Texture();
    const material = createWoodMaterial({baseColor, normal, surface});

    expect(material.map).toBe(baseColor);
    expect(material.normalMap).toBe(normal);
    expect(material.aoMap).toBe(surface);
    expect(material.roughnessMap).toBe(surface);
    expect(material.metalnessMap).toBe(surface);
    expect(material.bumpMap).toBeNull();

    material.dispose();
    baseColor.dispose();
    normal.dispose();
    surface.dispose();
  });
});
