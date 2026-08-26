import {
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
  type ColorSpace,
  type Texture,
} from "three";

import floorAlbedoUrl from "~/assets/materials/laminate-floor-albedo.webp";
import floorNormalUrl from "~/assets/materials/laminate-floor-normal.webp";
import floorSurfaceUrl from "~/assets/materials/laminate-floor-surface.webp";
import moonriseSkyUrl from "~/assets/materials/qwantani-moonrise-sky.webp";
import type {MovablePropLifecycle} from "~/game/movablePropSystem";
import {addInteriorBox, createPosterSurface} from "~/game/interior/interiorPrimitives";
import {createDeskLamps} from "~/game/interior/lightingProps";
import {createReadingChairInstance} from "~/game/interior/readingFurniture";
import {READING_FURNITURE_BOXES} from "~/game/shopLayout";
import {SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";
import type {PosterSurface} from "~/game/interior/interiorPrimitives";
import type {ReadingFurnitureMaterials} from "~/game/propRegistration";

export type ShopInteriorAssetsHost = {
  disposed: () => boolean;
  posterRaycastMeshes: Mesh[];
  posterSurfaces: Map<string, PosterSurface>;
  props: () => MovablePropLifecycle;
  renderer: () => WebGLRenderer;
  textureLoader: () => TextureLoader;
};

export const cloneFloorMaterial = (source: MeshStandardMaterial, repeatX: number, repeatY: number) => {
  const material = source.clone();
  const clones = new Map<Texture, Texture>();
  const cloneTexture = (texture: Texture | null) => {
    if (!texture) return null;
    const existing = clones.get(texture);
    if (existing) return existing;
    const clone = texture.clone();
    clone.repeat.set(repeatX, repeatY);
    clone.needsUpdate = true;
    clones.set(texture, clone);
    return clone;
  };
  material.aoMap = cloneTexture(source.aoMap);
  material.map = cloneTexture(source.map);
  material.normalMap = cloneTexture(source.normalMap);
  material.roughnessMap = cloneTexture(source.roughnessMap);
  return material;
};

/** Creates the reusable materials and small fixture primitives used by the shop builder. */
export class ShopInteriorAssets {
  readonly #host: ShopInteriorAssetsHost;

  constructor(host: ShopInteriorAssetsHost) {
    this.#host = host;
  }

  createFloorMaterial() {
    const anisotropy = Math.min(8, this.#host.renderer().capabilities.getMaxAnisotropy());
    const loadTexture = (url: string, colorSpace: ColorSpace = NoColorSpace) => {
      const texture = this.#host.textureLoader().load(url);
      texture.colorSpace = colorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(6.5, 9.75);
      texture.anisotropy = anisotropy;
      return texture;
    };
    const surface = loadTexture(floorSurfaceUrl);
    surface.channel = 0;
    return new MeshStandardMaterial({
      aoMap: surface,
      aoMapIntensity: 0.72,
      map: loadTexture(floorAlbedoUrl, SRGBColorSpace),
      metalness: 0,
      normalMap: loadTexture(floorNormalUrl),
      normalScale: new Vector2(0.72, 0.72),
      roughness: 0.82,
      roughnessMap: surface,
    });
  }

  createMoonEnvironment() {
    const environment = this.#host.textureLoader().load(moonriseSkyUrl);
    environment.colorSpace = SRGBColorSpace;
    environment.mapping = EquirectangularReflectionMapping;
    return environment;
  }

  /** Builds the upper-floor reading tables and chairs. */
  createUpperReadingFurniture(
    parent: Group,
    woodMaterial: MeshStandardMaterial,
    furnitureMaterials: ReadingFurnitureMaterials,
  ) {
    const host = this.#host;
    const chairTemplate = READING_FURNITURE_BOXES.filter((box) => box.movableId === "reading-chair-1");
    const chairMinY = Math.min(...chairTemplate.map((box) => box.position.y - box.halfExtents.y));
    const chairMaxY = Math.max(...chairTemplate.map((box) => box.position.y + box.halfExtents.y));
    const chairCenterY = SHOP_UPPER_FLOOR_Y + (chairMinY + chairMaxY) / 2;
    for (const table of [
      {id: "west", x: -8.25},
      {id: "center", x: -3.5},
    ] as const) {
      const x = table.x;
      this.addBox(parent, [2.7, 0.14, 1.3], [x, 5.72, 23], woodMaterial, true);
      for (const offsetX of [-1.08, 1.08])
        for (const offsetZ of [-0.43, 0.43])
          this.addBox(parent, [0.09, 0.78, 0.09], [x + offsetX, 5.29, 23 + offsetZ], furnitureMaterials.leg, true);
      for (const z of [21.95, 24.05]) {
        createReadingChairInstance(
          parent,
          `upper-reading-chair-${table.id}-${z < 23 ? "north" : "south"}`,
          chairTemplate,
          furnitureMaterials,
          {
            addBox: (parent2, size, position2, material, castShadow) =>
              this.addBox(parent2, size, position2, material, castShadow),
            cacheBuiltinPropTemplate: (registration) => host.props().cacheBuiltinPropTemplate(registration),
            createDeskLamps: async (parent2) => {
              await createDeskLamps(parent2, {
                cacheBuiltinPropTemplate: (registration) => host.props().cacheBuiltinPropTemplate(registration),
                isDisposed: () => host.disposed(),
                modelMixers: host.props().modelMixers,
                needsSeedPass: (version) => host.props().needsSeedPass(version),
                registerMovableProp: (registration) => host.props().registerMovableProp(registration),
              });
            },
            needsSeedPass: (version) => host.props().needsSeedPass(version),
            registerMovableProp: (registration) => host.props().registerMovableProp(registration),
          },
          [x, chairCenterY, z],
          z < 23 ? -Math.PI / 2 : Math.PI / 2,
        );
      }
    }
  }

  addBox(
    parent: Group,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: MeshStandardMaterial,
    castShadow = false,
  ) {
    return addInteriorBox(parent, size, position, material, castShadow, this.#host.posterRaycastMeshes);
  }

  createPosterSurface(
    parent: Group,
    id: string,
    width: number,
    height: number,
    position: readonly [number, number, number],
    rotationY: number,
  ) {
    createPosterSurface(
      parent,
      id,
      width,
      height,
      position,
      rotationY,
      this.#host.posterRaycastMeshes,
      this.#host.posterSurfaces,
    );
  }
}
