import {
  BoxGeometry,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
  type Texture,
  type TextureLoader,
} from "three";

import ceilingAlbedoUrl from "~/assets/materials/office-ceiling-albedo.webp";
import ceilingNormalUrl from "~/assets/materials/office-ceiling-normal.webp";
import ceilingSurfaceUrl from "~/assets/materials/office-ceiling-surface.webp";

const CEILING_TEXTURE_WORLD_SIZE = 4.8;

type BoxSize = readonly [width: number, height: number, depth: number];
type BoxPosition = readonly [x: number, y: number, z: number];

const configureTexture = (texture: Texture, anisotropy: number) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
};

export const createCeilingMaterial = (textureLoader: TextureLoader, maxAnisotropy: number) => {
  const anisotropy = Math.min(8, maxAnisotropy);
  const albedo = configureTexture(textureLoader.load(ceilingAlbedoUrl), anisotropy);
  albedo.colorSpace = SRGBColorSpace;
  const normal = configureTexture(textureLoader.load(ceilingNormalUrl), anisotropy);
  const surface = configureTexture(textureLoader.load(ceilingSurfaceUrl), anisotropy);
  surface.channel = 0;
  const material = new MeshStandardMaterial({
    aoMap: surface,
    aoMapIntensity: 0.72,
    map: albedo,
    metalness: 1,
    metalnessMap: surface,
    normalMap: normal,
    normalScale: new Vector2(0.4, 0.4),
    roughness: 0.9,
    roughnessMap: surface,
    // Ceilings are viewed from below, so the shared geometry needs both sides.
    side: DoubleSide,
  });
  material.userData.boxUvMode = "ceiling";
  return material;
};

/**
 * ShapeGeometry UVs equal raw shape coordinates (meters); rescale them so the
 * tile grid keeps one physical scale across every ceiling plane.
 */
export const applyCeilingShapeUv = (geometry: BufferGeometry) => {
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < uv.count; index += 1)
    uv.setXY(index, uv.getX(index) / CEILING_TEXTURE_WORLD_SIZE, uv.getY(index) / CEILING_TEXTURE_WORLD_SIZE);
  uv.needsUpdate = true;
};

/** Keeps the tile grid upright and at one physical scale across every slab. */
export const createCeilingBoxGeometry = (size: BoxSize, position: BoxPosition) => {
  const [width, height, depth] = size;
  const geometry = new BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv");
  // Anchor every face to its actual world-space minimum so split slabs share
  // one continuous tile grid.
  const faceMappings = [
    [depth, height, -position[2] - depth / 2, position[1] - height / 2],
    [depth, height, position[2] - depth / 2, position[1] - height / 2],
    [width, depth, position[0] - width / 2, -position[2] - depth / 2],
    [width, depth, position[0] - width / 2, position[2] - depth / 2],
    [width, height, position[0] - width / 2, position[1] - height / 2],
    [width, height, -position[0] - width / 2, position[1] - height / 2],
  ] as const;

  for (const [faceIndex, [faceWidth, faceHeight, offsetU, offsetV]] of faceMappings.entries()) {
    const vertexOffset = faceIndex * 4;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = vertexOffset + vertex;
      uv.setXY(
        index,
        (uv.getX(index) * faceWidth + offsetU) / CEILING_TEXTURE_WORLD_SIZE,
        (uv.getY(index) * faceHeight + offsetV) / CEILING_TEXTURE_WORLD_SIZE,
      );
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
