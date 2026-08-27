import {
  BoxGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type Texture,
  type TextureLoader,
} from "three";

import wallpaperAlbedoUrl from "~/assets/materials/art-deco-wallpaper-albedo.webp";
import wallpaperNormalUrl from "~/assets/materials/art-deco-wallpaper-normal.webp";
import wallpaperSurfaceUrl from "~/assets/materials/art-deco-wallpaper-surface.webp";

const WALLPAPER_TEXTURE_WORLD_SIZE = 2.4;

type BoxSize = readonly [width: number, height: number, depth: number];
type BoxPosition = readonly [x: number, y: number, z: number];

const configureTexture = (texture: Texture, anisotropy: number) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
};

export const createWallpaperMaterial = (textureLoader: TextureLoader, maxAnisotropy: number) => {
  const anisotropy = Math.min(8, maxAnisotropy);
  const albedo = configureTexture(textureLoader.load(wallpaperAlbedoUrl), anisotropy);
  albedo.colorSpace = SRGBColorSpace;
  const normal = configureTexture(textureLoader.load(wallpaperNormalUrl), anisotropy);
  const surface = configureTexture(textureLoader.load(wallpaperSurfaceUrl), anisotropy);
  surface.channel = 0;
  const material = new MeshStandardMaterial({
    aoMap: surface,
    aoMapIntensity: 0.7,
    map: albedo,
    metalness: 1,
    metalnessMap: surface,
    normalMap: normal,
    normalScale: new Vector2(0.48, 0.48),
    roughness: 0.86,
    roughnessMap: surface,
  });
  material.userData.boxUvMode = "wallpaper";
  return material;
};

/** Keeps the pattern upright and at one physical scale across every wall. */
export const createWallpaperBoxGeometry = (size: BoxSize, position: BoxPosition) => {
  const [width, height, depth] = size;
  const [x, y, z] = position;
  const geometry = new BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv");
  // BoxGeometry restarts UVs on every box. Anchor every face to its actual
  // world-space minimum so split walls and doorway headers share one pattern.
  const faceMappings = [
    [depth, height, -z - depth / 2, y - height / 2],
    [depth, height, z - depth / 2, y - height / 2],
    [width, depth, x - width / 2, -z - depth / 2],
    [width, depth, x - width / 2, z - depth / 2],
    [width, height, x - width / 2, y - height / 2],
    [width, height, -x - width / 2, y - height / 2],
  ] as const;

  for (const [faceIndex, [faceWidth, faceHeight, offsetU, offsetV]] of faceMappings.entries()) {
    const vertexOffset = faceIndex * 4;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = vertexOffset + vertex;
      uv.setXY(
        index,
        (uv.getX(index) * faceWidth + offsetU) / WALLPAPER_TEXTURE_WORLD_SIZE,
        (uv.getY(index) * faceHeight + offsetV) / WALLPAPER_TEXTURE_WORLD_SIZE,
      );
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
