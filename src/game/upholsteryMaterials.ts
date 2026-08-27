import {
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type Texture,
  type TextureLoader,
} from "three";
import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import upholsteryAlbedoUrl from "~/assets/materials/grey-upholstery-albedo.webp";
import upholsteryNormalUrl from "~/assets/materials/grey-upholstery-normal.webp";
import upholsterySurfaceUrl from "~/assets/materials/grey-upholstery-surface.webp";

const UPHOLSTERY_TEXTURE_WORLD_SIZE = 1.2;
const UPHOLSTERY_EDGE_RADIUS = 0.035;

type BoxSize = readonly [width: number, height: number, depth: number];
type BoxPosition = readonly [x: number, y: number, z: number];

export type UpholsteryTextures = {
  albedo: Texture;
  normal: Texture;
  surface: Texture;
};

const configureTexture = (texture: Texture, anisotropy: number) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
};

export const loadUpholsteryTextures = (textureLoader: TextureLoader, maxAnisotropy: number): UpholsteryTextures => {
  const anisotropy = Math.min(16, maxAnisotropy);
  const albedo = configureTexture(textureLoader.load(upholsteryAlbedoUrl), anisotropy);
  albedo.colorSpace = SRGBColorSpace;
  const surface = configureTexture(textureLoader.load(upholsterySurfaceUrl), anisotropy);
  surface.channel = 0;

  return {
    albedo,
    normal: configureTexture(textureLoader.load(upholsteryNormalUrl), anisotropy),
    surface,
  };
};

export const createUpholsteryMaterial = (textures: UpholsteryTextures) => {
  const material = new MeshStandardMaterial({
    aoMap: textures.surface,
    aoMapIntensity: 0.58,
    map: textures.albedo,
    metalness: 0,
    metalnessMap: textures.surface,
    normalMap: textures.normal,
    normalScale: new Vector2(0.28, 0.28),
    roughness: 0.96,
    roughnessMap: textures.surface,
  });
  material.userData.boxUvMode = "upholstery";
  return material;
};

/** Keeps the upholstery weave at a stable physical scale on every panel. */
export const createUpholsteryBoxGeometry = (size: BoxSize, position: BoxPosition) => {
  const [width, height, depth] = size;
  const geometry = new RoundedBoxGeometry(width, height, depth, 2, UPHOLSTERY_EDGE_RADIUS);
  const uv = geometry.getAttribute("uv");
  const faceDimensions = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ] as const;
  const offsetU = Math.abs(position[0] * 0.173 + position[2] * 0.137) % 1;
  const offsetV = Math.abs(position[1] * 0.193 + position[2] * 0.283) % 1;

  const verticesPerFace = uv.count / faceDimensions.length;
  for (const [faceIndex, [faceWidth, faceHeight]] of faceDimensions.entries()) {
    const vertexOffset = faceIndex * verticesPerFace;
    for (let vertex = 0; vertex < verticesPerFace; vertex += 1) {
      const index = vertexOffset + vertex;
      uv.setXY(
        index,
        (uv.getX(index) * faceWidth) / UPHOLSTERY_TEXTURE_WORLD_SIZE + offsetU,
        (uv.getY(index) * faceHeight) / UPHOLSTERY_TEXTURE_WORLD_SIZE + offsetV,
      );
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
