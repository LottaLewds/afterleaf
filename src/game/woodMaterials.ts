import {
  BoxGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type ColorRepresentation,
  type Texture,
  type TextureLoader,
} from "three";

import darkWoodAlbedoUrl from "~/assets/materials/dark-wood-albedo.webp";
import darkWoodNormalUrl from "~/assets/materials/dark-wood-normal.webp";
import darkWoodSurfaceUrl from "~/assets/materials/dark-wood-surface.webp";

const WOOD_TEXTURE_WORLD_SIZE = 1.4;

type BoxSize = readonly [width: number, height: number, depth: number];
type BoxPosition = readonly [x: number, y: number, z: number];

export type WoodTextures = {
  baseColor: Texture;
  normal: Texture;
  surface: Texture;
};

export type WoodMaterialOptions = {
  color?: ColorRepresentation;
  metalness?: number;
  roughness?: number;
};

const configureTexture = (texture: Texture, anisotropy: number) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
};

export const loadWoodTextures = (
  textureLoader: TextureLoader,
  maxAnisotropy: number,
): WoodTextures => {
  const anisotropy = Math.min(8, maxAnisotropy);
  const baseColor = configureTexture(
    textureLoader.load(darkWoodAlbedoUrl),
    anisotropy,
  );
  baseColor.colorSpace = SRGBColorSpace;
  const surface = configureTexture(
    textureLoader.load(darkWoodSurfaceUrl),
    anisotropy,
  );
  surface.channel = 0;
  return {
    baseColor,
    normal: configureTexture(textureLoader.load(darkWoodNormalUrl), anisotropy),
    surface,
  };
};

export const createWoodMaterial = (
  textures: WoodTextures,
  options: WoodMaterialOptions = {},
) =>
  new MeshStandardMaterial({
    aoMap: textures.surface,
    aoMapIntensity: 0.65,
    color: options.color ?? "#ffffff",
    map: textures.baseColor,
    metalness: options.metalness ?? 1,
    metalnessMap: textures.surface,
    normalMap: textures.normal,
    normalScale: new Vector2(0.55, 0.55),
    roughness: options.roughness ?? 1,
    roughnessMap: textures.surface,
  });

const textureOffset = (position: BoxPosition) => {
  const [x, y, z] = position;
  return [
    Math.abs(x * 0.173 + y * 0.311 + z * 0.137) % 1,
    Math.abs(x * 0.107 + y * 0.193 + z * 0.283) % 1,
  ] as const;
};

/** Keeps a shared wood map at a stable physical scale on every side of a box. */
export const createWoodBoxGeometry = (size: BoxSize, position: BoxPosition) => {
  const [width, height, depth] = size;
  const geometry = new BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv");
  const [offsetU, offsetV] = textureOffset(position);
  const faceDimensions = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ] as const;

  for (const [faceIndex, [faceWidth, faceHeight]] of faceDimensions.entries()) {
    const grainLength =
      Math.max(faceWidth, faceHeight) / WOOD_TEXTURE_WORLD_SIZE;
    const grainWidth =
      Math.min(faceWidth, faceHeight) / WOOD_TEXTURE_WORLD_SIZE;
    const rotate = faceHeight > faceWidth;
    const vertexOffset = faceIndex * 4;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = vertexOffset + vertex;
      const sourceU = uv.getX(index);
      const sourceV = uv.getY(index);
      uv.setXY(
        index,
        (rotate ? sourceV : sourceU) * grainLength + offsetU,
        (rotate ? sourceU : sourceV) * grainWidth + offsetV,
      );
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
